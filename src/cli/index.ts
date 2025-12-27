/**
 * CLI Entry Point
 */

import 'dotenv/config';
import path from 'node:path';
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { App } from '../ui/App.js';
import { createLLMClient } from '../llm/client.js';
import { ContextManager } from '../context/manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { builtinTools } from '../tools/builtin/index.js';
import { Orchestrator } from '../agent/orchestrator.js';
import { EventEmitter } from '../events/emitter.js';
import { loadConfig } from '../utils/config.js';
import { initLogger, getLogger } from '../utils/logger.js';

const VERSION = '0.1.0';

export async function main() {
  const program = new Command();

  // Common options helper
  const addCommonOptions = (cmd: Command) => {
    return cmd
      .option('--cwd <path>', 'Working directory (default: current directory)')
      .option('-c, --config <path>', 'Path to config file')
      .option('-v, --verbose', 'Verbose output')
      .option('-q, --quiet', 'Quiet mode (non-interactive)')
      .option('--json', 'Output as JSON');
  };

  program
    .name('chibi')
    .description('Another Code Agent')
    .version(VERSION);

  // Ask command - main code search
  addCommonOptions(
    program
      .command('ask')
      .description('Ask a question about the codebase')
      .argument('<query>', 'Your question or search query')
  ).action(async (query: string, options) => {
    await runAsk(query, options);
  });

  // Plan command - generate implementation plan
  addCommonOptions(
    program
      .command('plan')
      .description('Generate an implementation plan')
      .argument('<task>', 'Task to plan')
  ).action(async (task: string, options) => {
    await runAsk(`Create an implementation plan for: ${task}`, options);
  });

  // Explain command - explain code
  addCommonOptions(
    program
      .command('explain')
      .description('Explain a piece of code or concept')
      .argument('<target>', 'File path or concept to explain')
  ).action(async (target: string, options) => {
    await runAsk(`Explain: ${target}`, options);
  });

  // Default: if no command, show help
  program.action(() => {
    program.help();
  });

  await program.parseAsync();
}

async function runAsk(
  query: string,
  options: { cwd?: string; config?: string; verbose?: boolean; json?: boolean; quiet?: boolean }
) {
  try {
    // Resolve working directory
    const workingDir = options.cwd ? path.resolve(options.cwd) : process.cwd();

    // Load config
    const config = await loadConfig(options.config);

    // Initialize logger (silent by default, info/debug with -v)
    initLogger({
      level: options.verbose ? 'debug' : 'silent',
      pretty: config.log.pretty,
      destination: config.log.file,
    });

    const logger = getLogger();
    logger.debug({ query, workingDir }, 'Starting chibi');

    // Create event emitter
    const eventEmitter = new EventEmitter();

    // Create LLM client
    const llmClient = createLLMClient(config.llm);

    // Create context manager
    const contextManager = new ContextManager({
      budgetConfig: config.budget,
      eventEmitter,
    });

    // Initialize session
    const session = await contextManager.initSession(query, workingDir);
    logger.debug({ sessionId: session.id }, 'Session initialized');

    // Create tool registry
    const toolRegistry = new ToolRegistry(config.tools);
    toolRegistry.registerAll(builtinTools);

    // Create orchestrator (coordinates investigation + synthesis)
    const orchestrator = new Orchestrator(
      llmClient,
      contextManager,
      toolRegistry,
      eventEmitter,
      {
        maxInvestigationIterations: config.agent.maxIterations,
        language: config.output.language,
        enableThinking: config.agent.enableThinking,
        thinkingBudget: config.agent.thinkingBudget,
      }
    );

    // JSON output mode
    if (options.json) {
      eventEmitter.enableBuffering();
      const result = await orchestrator.run(query);
      const events = eventEmitter.disableBuffering();

      console.log(JSON.stringify({
        success: result.success,
        result: result.result,
        iterations: result.iterations,
        tokensUsed: result.totalTokensUsed,
        events,
      }, null, 2));

      process.exit(result.success ? 0 : 1);
      return;
    }

    // Interactive mode with Ink (unless --quiet is set)
    if (!options.quiet && process.stdout.isTTY) {
      const { waitUntilExit } = render(
        React.createElement(App, {
          query,
          eventEmitter,
          verbose: options.verbose,
          onComplete: (_result) => {
            logger.debug('Completed successfully');
          },
          onError: (error) => {
            logger.error({ error }, 'Agent error');
          },
        })
      );

      // Run orchestrator in background
      orchestrator.run(query).catch(error => {
        logger.error({ error }, 'Orchestrator failed');
      });

      await waitUntilExit();
    } else {
      // Non-interactive mode
      eventEmitter.subscribe(event => {
        if (event.type === 'phase_start') {
          if (options.verbose) {
            console.log(`\n[${event.phase.toUpperCase()}]`);
          }
        } else if (event.type === 'tool_call') {
          if (options.verbose) {
            console.log(`> ${event.name}`);
            // Show key arguments
            const args = event.arguments;
            for (const [key, value] of Object.entries(args)) {
              const valueStr = typeof value === 'string'
                ? (value.length > 60 ? value.slice(0, 60) + '...' : value)
                : JSON.stringify(value).slice(0, 60);
              console.log(`  ${key}: ${valueStr}`);
            }
          } else {
            console.log(`> ${event.name}`);
          }
        } else if (event.type === 'tool_result' && options.verbose) {
          const status = event.result.success ? '✓' : '✗';
          console.log(`  ${status} ${event.duration}ms`);
        } else if (event.type === 'done') {
          console.log('\n' + event.result);
        } else if (event.type === 'error') {
          console.error(`Error: ${event.error.message}`);
        }
      });

      const result = await orchestrator.run(query);
      process.exit(result.success ? 0 : 1);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}
