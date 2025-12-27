/**
 * Orchestrator
 *
 * Coordinates the investigation and synthesis phases
 * Investigator -> Synthesizer pipeline
 */

import type { LLMClient } from '../llm/types.js';
import type { ContextManager } from '../context/manager.js';
import type { EventEmitter } from '../events/emitter.js';
import type { AgentRunResult, OrchestratorConfig } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { InvestigatorAgent } from './investigator.js';
import { SynthesizerAgent } from './synthesizer.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxInvestigationIterations: 20,
  enableThinking: false,
  thinkingBudget: 32768,
};

/**
 * Orchestrator coordinates the two-phase agent execution
 */
export class Orchestrator {
  private config: OrchestratorConfig;
  private aborted = false;

  constructor(
    private llmClient: LLMClient,
    private contextManager: ContextManager,
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter,
    config?: Partial<OrchestratorConfig>
  ) {
    this.config = {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      ...config,
    };
  }

  /**
   * Run the orchestrated agent pipeline
   */
  async run(query: string): Promise<AgentRunResult> {
    const startTime = Date.now();
    let totalTokensUsed = 0;
    let totalIterations = 0;

    logger.info({ query }, 'Orchestrator starting');

    // Emit orchestrator start
    this.eventEmitter.emit({
      type: 'orchestrator_start',
      query,
      timestamp: startTime,
    });

    try {
      // Phase 1: Investigation
      logger.info('Starting investigation phase');
      this.eventEmitter.emit({
        type: 'phase_start',
        phase: 'investigation',
        timestamp: Date.now(),
      });

      const investigator = new InvestigatorAgent(
        this.llmClient,
        this.contextManager,
        this.toolRegistry,
        this.eventEmitter,
        {
          maxIterations: this.config.maxInvestigationIterations,
          enableThinking: this.config.enableThinking,
          thinkingBudget: this.config.thinkingBudget,
          stuckThreshold: 3,
        }
      );

      const investigationResult = await investigator.investigate(query);

      totalTokensUsed += investigationResult.totalTokensUsed;
      totalIterations += investigationResult.iterations;

      this.eventEmitter.emit({
        type: 'phase_end',
        phase: 'investigation',
        success: investigationResult.success,
        iterations: investigationResult.iterations,
        tokensUsed: investigationResult.totalTokensUsed,
      });

      if (!investigationResult.success) {
        logger.error({ error: investigationResult.error }, 'Investigation failed');
        return {
          success: false,
          result: '',
          iterations: totalIterations,
          totalTokensUsed,
          decisions: investigationResult.decisions,
          error: investigationResult.error,
        };
      }

      if (this.aborted) {
        return {
          success: false,
          result: '',
          iterations: totalIterations,
          totalTokensUsed,
          decisions: investigationResult.decisions,
          error: 'Aborted',
        };
      }

      logger.info(
        {
          messagesCount: investigationResult.messages.length,
          keyFilesCount: investigationResult.keyFiles.length,
        },
        'Investigation complete, starting synthesis'
      );

      // Phase 2: Synthesis
      this.eventEmitter.emit({
        type: 'phase_start',
        phase: 'synthesis',
        timestamp: Date.now(),
      });

      const synthesizer = new SynthesizerAgent(
        this.llmClient,
        this.eventEmitter,
        this.contextManager,
        {
          enableThinking: this.config.enableThinking,
          thinkingBudget: Math.floor(this.config.thinkingBudget / 2), // Less thinking for synthesis
        }
      );

      const synthesisResult = await synthesizer.synthesize(
        query,
        investigationResult.messages,
        investigationResult.keyFiles
      );

      totalTokensUsed += synthesisResult.tokensUsed;
      totalIterations += 1; // Synthesis counts as one iteration

      this.eventEmitter.emit({
        type: 'phase_end',
        phase: 'synthesis',
        success: synthesisResult.success,
        tokensUsed: synthesisResult.tokensUsed,
      });

      if (!synthesisResult.success) {
        logger.error({ error: synthesisResult.error }, 'Synthesis failed');

        // Fallback: return raw findings if synthesis fails
        return {
          success: true, // Still consider it a success with raw findings
          result: investigationResult.findings,
          iterations: totalIterations,
          totalTokensUsed,
          decisions: investigationResult.decisions,
        };
      }

      const duration = Date.now() - startTime;
      logger.info({ duration, totalIterations, totalTokensUsed }, 'Orchestrator completed');

      // Emit orchestrator complete
      this.eventEmitter.emit({
        type: 'orchestrator_complete',
        duration,
        iterations: totalIterations,
        tokensUsed: totalTokensUsed,
      });

      // Emit done event with the final result
      this.eventEmitter.emit({
        type: 'done',
        result: synthesisResult.report,
      });

      return {
        success: true,
        result: synthesisResult.report,
        iterations: totalIterations,
        totalTokensUsed,
        decisions: investigationResult.decisions,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'Orchestrator failed');

      this.eventEmitter.emit({
        type: 'orchestrator_error',
        error: error as Error,
        duration,
      });

      return {
        success: false,
        result: '',
        iterations: totalIterations,
        totalTokensUsed,
        decisions: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Abort the orchestration
   */
  abort(): void {
    this.aborted = true;
  }
}
