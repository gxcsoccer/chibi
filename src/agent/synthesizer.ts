/**
 * Synthesizer Agent
 *
 * Specialized agent for producing well-structured reports from findings
 * Supports recall_detail tool to fetch compressed content
 */

import type { LLMClient, LLMMessage, ToolCall, ToolDefinition } from '../llm/types.js';
import type { EventEmitter } from '../events/emitter.js';
import type { ContextManager } from '../context/manager.js';
import type { LLMTurn, SynthesisMessage } from '../context/types.js';
import { buildSynthesizerPrompt, buildToolResultPrompt } from './prompt-builder.js';
import { recallDetailTool } from '../tools/builtin/recall-detail.js';
import { toolToLLMFormat } from '../tools/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Synthesis result
 */
export interface SynthesisResult {
  success: boolean;
  report: string;
  tokensUsed: number;
  error?: string;
}

/**
 * Synthesizer configuration
 */
export interface SynthesizerConfig {
  enableThinking?: boolean;
  thinkingBudget?: number;
  maxRecallIterations?: number;
}

/**
 * Synthesizer Agent - focused on producing structured output
 */
export class SynthesizerAgent {
  private config: SynthesizerConfig;
  private turnNumber: number = 0;

  constructor(
    private llmClient: LLMClient,
    private eventEmitter: EventEmitter,
    private contextManager: ContextManager,
    config?: Partial<SynthesizerConfig>
  ) {
    this.config = {
      enableThinking: config?.enableThinking ?? false,
      thinkingBudget: config?.thinkingBudget ?? 16384,
      maxRecallIterations: config?.maxRecallIterations ?? 3, // Allow up to 3 recall calls
    };
  }

  /**
   * Synthesize investigation messages into a structured report
   */
  async synthesize(
    originalQuery: string,
    investigationMessages: SynthesisMessage[],
    keyFiles?: string[]
  ): Promise<SynthesisResult> {
    const startTime = Date.now();
    let totalTokensUsed = 0;

    // Emit synthesis start event
    this.eventEmitter.emit({
      type: 'synthesis_start',
      timestamp: startTime,
    });

    try {
      // Build prompts
      const systemPrompt = buildSynthesizerPrompt();

      // Check if messages contain compressed content
      const hasCompressedContent = investigationMessages.some(m => m.compressed);

      // Prepare tools (only recall_detail if there's compressed content)
      const tools: ToolDefinition[] = hasCompressedContent
        ? [toolToLLMFormat(recallDetailTool)]
        : [];

      // Build messages from investigation history
      // Include key files info in the final user message
      const keyFilesInfo = keyFiles && keyFiles.length > 0
        ? `\n\n关键文件: ${keyFiles.slice(0, 20).join(', ')}${keyFiles.length > 20 ? ` 等${keyFiles.length}个文件` : ''}`
        : '';

      const messages: LLMMessage[] = [
        // Original query
        { role: 'user', content: `用户问题: ${originalQuery}` },
        // Investigation messages (tool results and assistant thoughts)
        ...investigationMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        // Final instruction
        {
          role: 'user',
          content: `---\n\n以上是调查过程中收集的信息。${keyFilesInfo}\n\n请根据这些信息，生成一份结构良好的报告来回答用户问题。直接以标题开始，不要有任何前言。`,
        },
      ];

      // Iterative loop to handle potential recall_detail calls
      let iteration = 0;
      const maxIterations = hasCompressedContent ? this.config.maxRecallIterations! : 1;

      while (iteration < maxIterations) {
        iteration++;

        const llmStartTime = Date.now();
        const response = await this.llmClient.complete(messages, {
          systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
        });
        const llmDuration = Date.now() - llmStartTime;

        const iterationTokens = (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);
        totalTokensUsed += iterationTokens;

        // Save LLM turn for debugging
        this.turnNumber++;
        await this.saveLLMTurn({
          turn: this.turnNumber,
          timestamp: llmStartTime,
          duration: llmDuration,
          systemPrompt,
          messages: [...messages],
          response: {
            content: response.content,
            thinking: response.thinking,
            toolCalls: response.toolCalls,
          },
          usage: response.usage,
        });

        // Check if there's a tool call
        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolCall = response.toolCalls[0];

          if (toolCall.name === 'recall_detail') {
            // Execute recall
            const key = toolCall.arguments.key as string;
            const recallResult = await this.contextManager.recall({ key });

            // Add assistant message and tool result
            messages.push({ role: 'assistant', content: response.content || `调用 recall_detail(key="${key}")` });
            messages.push({
              role: 'user',
              content: buildToolResultPrompt('recall_detail', recallResult.content, recallResult.success)
            });

            // Continue to next iteration
            continue;
          }
        }

        // No tool call or unknown tool - treat as final response
        const duration = Date.now() - startTime;
        const report = this.ensureProperFormat(response.content);

        logger.info({ duration, tokensUsed: totalTokensUsed, iterations: iteration }, 'Synthesis completed');

        // Emit synthesis complete event
        this.eventEmitter.emit({
          type: 'synthesis_complete',
          duration,
          tokensUsed: totalTokensUsed,
        });

        return {
          success: true,
          report,
          tokensUsed: totalTokensUsed,
        };
      }

      // Max iterations reached
      const duration = Date.now() - startTime;
      logger.warn({ duration, iterations: maxIterations }, 'Synthesis reached max recall iterations');

      return {
        success: true,
        report: '## 分析结果\n\n达到最大召回次数限制，无法生成完整报告。',
        tokensUsed: totalTokensUsed,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({ error, duration }, 'Synthesis failed');

      this.eventEmitter.emit({
        type: 'synthesis_error',
        error: error as Error,
        duration,
      });

      return {
        success: false,
        report: '',
        tokensUsed: totalTokensUsed,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Ensure the report starts with a proper header
   */
  private ensureProperFormat(content: string): string {
    // Check if content already starts with a header
    const trimmed = content.trim();
    if (trimmed.startsWith('#')) {
      return trimmed;
    }

    // Try to find the first header and remove everything before it
    const headerMatch = trimmed.match(/^[\s\S]*?(##?\s+.+)/m);
    if (headerMatch) {
      const headerIndex = trimmed.indexOf(headerMatch[1]);
      if (headerIndex > 0) {
        // Log the removed preamble for debugging
        const preamble = trimmed.slice(0, headerIndex).trim();
        if (preamble) {
          logger.debug({ preamble: preamble.slice(0, 100) }, 'Removed preamble from synthesis output');
        }
        return trimmed.slice(headerIndex);
      }
    }

    // If no header found, add a default one
    return `## 分析结果\n\n${trimmed}`;
  }

  /**
   * Save LLM turn to disk for debugging
   */
  private async saveLLMTurn(params: {
    turn: number;
    timestamp: number;
    duration: number;
    systemPrompt: string;
    messages: LLMMessage[];
    response: { content: string; thinking?: string; toolCalls?: ToolCall[] };
    usage?: { inputTokens: number; outputTokens: number; cacheHit?: boolean; cachedTokens?: number };
  }): Promise<void> {
    const llmTurn: LLMTurn = {
      agent: 'synthesizer',
      turn: params.turn,
      timestamp: params.timestamp,
      duration: params.duration,
      input: {
        systemPrompt: params.systemPrompt,
        messages: params.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      },
      output: {
        content: params.response.content,
        thinking: params.response.thinking,
        toolCalls: params.response.toolCalls,
      },
      usage: params.usage,
      decision: {
        type: params.response.toolCalls?.length ? 'tool_call' : 'done',
        ...(params.response.toolCalls?.length && {
          name: params.response.toolCalls[0].name,
          arguments: params.response.toolCalls[0].arguments,
        }),
        ...(!params.response.toolCalls?.length && {
          result: params.response.content,
        }),
      },
    };

    try {
      await this.contextManager.saveLLMTurn(llmTurn);
    } catch (error) {
      logger.warn({ error, turn: params.turn }, 'Failed to save synthesizer LLM turn');
    }
  }
}
