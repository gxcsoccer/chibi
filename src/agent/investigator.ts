/**
 * Investigator Agent
 *
 * Specialized agent for searching and gathering information
 * Returns raw findings without formatting
 */

import type {
  AgentState,
  AgentLoopConfig,
  AgentDecision,
  InvestigationResult,
  IterationResult,
} from './types.js';
import type { LLMClient, ToolCall } from '../llm/types.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
import type { ContextManager } from '../context/manager.js';
import type { LLMTurn, ChatMessage } from '../context/types.js';
import type { EventEmitter } from '../events/emitter.js';
import { ToolRegistry } from '../tools/registry.js';
import { toolToLLMFormat } from '../tools/types.js';
import { buildInvestigatorPrompt, buildToolResultPrompt } from './prompt-builder.js';
import { AgentError } from '../errors/types.js';
import { getLogger } from '../utils/logger.js';
import { estimateTokens } from '../utils/tokens.js';

const logger = getLogger();

/**
 * Investigator Agent - focused on gathering information
 */
export class InvestigatorAgent {
  private state: AgentState;
  private config: AgentLoopConfig;
  private abortController: AbortController;
  private keyFiles: string[] = [];

  constructor(
    private llmClient: LLMClient,
    private contextManager: ContextManager,
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter,
    config?: Partial<AgentLoopConfig>
  ) {
    this.config = {
      maxIterations: config?.maxIterations ?? 20,
      stuckThreshold: config?.stuckThreshold ?? 3,
      enableThinking: config?.enableThinking ?? false,
      thinkingBudget: config?.thinkingBudget ?? 32768,
    };

    this.state = {
      iteration: 0,
      maxIterations: this.config.maxIterations,
      decisions: [],
      thinking: [],
      status: 'running',
      stuckCount: 0,
      lastToolResults: new Map(),
    };

    this.abortController = new AbortController();
  }

  /**
   * Run investigation with a query
   */
  async investigate(query: string): Promise<InvestigationResult> {
    const session = this.contextManager.getSession();
    if (!session) {
      throw new AgentError('No active session', 'unknown');
    }

    let totalTokensUsed = 0;

    // Emit session start
    this.eventEmitter.emit({
      type: 'session_start',
      sessionId: session.id,
      query,
      timestamp: Date.now(),
    });

    // Add initial user query to messages
    await this.contextManager.addMessage({
      role: 'user',
      content: query,
      metadata: { compressible: false }, // Don't compress the original query
    });

    try {
      while (this.state.iteration < this.config.maxIterations) {
        if (this.abortController.signal.aborted) {
          break;
        }

        this.state.iteration++;

        // Emit iteration start
        this.eventEmitter.emit({
          type: 'iteration_start',
          iteration: this.state.iteration,
          maxIterations: this.config.maxIterations,
          budget: this.contextManager.getBudget(),
        });

        // Run one iteration
        const result = await this.runIteration();
        totalTokensUsed += result.tokensUsed;

        // Emit iteration end
        this.eventEmitter.emit({
          type: 'iteration_end',
          iteration: this.state.iteration,
          decision: result.decision,
          tokensUsed: result.tokensUsed,
        });

        // Handle decision
        if (result.decision.type === 'done') {
          this.state.status = 'completed';

          // Extract findings from the completion
          const findings = this.extractFindings(result.decision.result);

          this.eventEmitter.emit({
            type: 'done',
            result: findings,
          });

          return {
            success: true,
            findings,
            keyFiles: this.keyFiles,
            messages: this.contextManager.getMessagesForSynthesis(),
            iterations: this.state.iteration,
            totalTokensUsed,
            decisions: this.state.decisions,
          };
        }

        // Check for stuck state - feedback to model instead of stopping
        if (this.isStuck()) {
          const lastDecision = this.state.decisions[this.state.decisions.length - 1];
          const stuckInfo = lastDecision.type === 'tool_call'
            ? `工具 "${lastDecision.name}"，参数: ${JSON.stringify(lastDecision.arguments)}`
            : '相同的操作';

          // Add warning message to context
          await this.contextManager.addMessage({
            role: 'user',
            content: `⚠️ **检测到循环**: 你已经连续 ${this.config.stuckThreshold} 次执行相同的操作（${stuckInfo}）。

这通常意味着：
1. 该文件可能不存在或路径错误
2. 你可能需要尝试不同的搜索策略
3. 你可能需要换一个方向继续调查

请调整你的策略，尝试不同的方法。`,
            metadata: { compressible: false },
          });

          // Clear recent decisions to allow model to try again
          // Keep only decisions before the stuck sequence
          this.state.decisions = this.state.decisions.slice(0, -this.config.stuckThreshold);
        }
      }

      // Max iterations reached - return what we have
      this.state.status = 'completed';
      const partialFindings = this.gatherPartialFindings();

      return {
        success: true,
        findings: partialFindings,
        keyFiles: this.keyFiles,
        messages: this.contextManager.getMessagesForSynthesis(),
        iterations: this.state.iteration,
        totalTokensUsed,
        decisions: this.state.decisions,
      };
    } catch (error) {
      const isRecoverable = error instanceof AgentError && error.recoverable;

      this.eventEmitter.emit({
        type: 'error',
        error: error as Error,
        recoverable: isRecoverable,
        retrying: false,
      });

      return {
        success: false,
        findings: '',
        keyFiles: this.keyFiles,
        messages: [],
        iterations: this.state.iteration,
        totalTokensUsed,
        decisions: this.state.decisions,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Run a single iteration
   */
  private async runIteration(): Promise<IterationResult> {
    const tools = this.toolRegistry.getAll();
    const turnStartTime = Date.now();

    // Build STATIC investigator system prompt
    // This enables prompt caching since the system prompt doesn't change
    const systemPrompt = buildInvestigatorPrompt(tools);

    // Update system prompt tokens in context manager
    this.contextManager.setSystemPromptTokens(estimateTokens(systemPrompt));

    // Get messages for LLM
    const messages = this.contextManager.getMessagesForLLM();

    // Capture messages for persistence (with metadata)
    const inputMessages = this.contextManager.getMessages();

    // Get LLM response
    const llmStartTime = Date.now();
    const response = await this.llmClient.complete(messages, {
      tools: tools.map(t => toolToLLMFormat(t)),
      systemPrompt,
    });
    const llmDuration = Date.now() - llmStartTime;

    const tokensUsed = (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);

    // Parse decision from response
    const decision = this.parseDecision(response.content, response.toolCalls);
    this.state.decisions.push(decision);

    // Handle thinking
    if (response.thinking) {
      this.state.thinking.push(response.thinking);
      this.eventEmitter.emit({
        type: 'thinking',
        content: response.thinking,
        streaming: false,
      });
    }

    // Execute decision
    let toolResult: IterationResult['toolResult'];
    let toolExecutionResult: { name: string; success: boolean; output: string; duration: number } | undefined;

    if (decision.type === 'tool_call') {
      const toolStartTime = Date.now();
      const result = await this.executeTool(decision.name, decision.arguments);
      const toolDuration = Date.now() - toolStartTime;

      toolResult = {
        name: decision.name,
        output: result.output,
        success: result.success,
      };

      toolExecutionResult = {
        name: decision.name,
        success: result.success,
        output: result.output,
        duration: toolDuration,
      };

      // Track key files from tool results
      this.trackKeyFiles(decision.name, decision.arguments, result.output);

      // Add assistant message (tool call description)
      // Clean any hallucinated content before saving to conversation history
      const rawContent = response.content || `调用 ${decision.name} 工具`;
      const { cleaned: toolCallDescription } = this.cleanHallucinatedContent(rawContent);
      await this.contextManager.addMessage({
        role: 'assistant',
        content: toolCallDescription || `调用 ${decision.name} 工具`,
      });

      // Add tool result as user message
      await this.contextManager.addMessage({
        role: 'user',
        content: buildToolResultPrompt(decision.name, result.output, result.success),
        metadata: {
          toolName: decision.name,
          source: this.getToolSource(decision.name, decision.arguments),
          compressible: true,
        },
      });

      // Store result hash to detect true stuck
      const resultHash = `${decision.name}:${JSON.stringify(decision.arguments)}:${result.output.slice(0, 100)}`;
      this.state.lastToolResults.set(decision.name, resultHash);
    } else if (decision.type === 'invalid_tool_call') {
      await this.contextManager.addMessage({
        role: 'assistant',
        content: decision.content,
      });
      await this.contextManager.addMessage({
        role: 'user',
        content: '请使用 function calling API 调用工具。如果信息已收集完成，请输出 "[INVESTIGATION_COMPLETE]" 并列出发现。',
      });
    } else if (decision.type === 'thinking') {
      await this.contextManager.addMessage({
        role: 'assistant',
        content: decision.content,
      });
      await this.contextManager.addMessage({
        role: 'user',
        content: '请通过 function call 调用工具继续调查。如果信息已收集完成，请输出 "[INVESTIGATION_COMPLETE]" 并列出发现。',
      });
    } else if (decision.type === 'requires_self_check') {
      await this.contextManager.addMessage({
        role: 'assistant',
        content: decision.content,
      });
      await this.contextManager.addMessage({
        role: 'user',
        content: `⚠️ **必须先完成自检才能结束调查**

你输出了 [INVESTIGATION_COMPLETE]，但在此之前没有使用 think 工具进行自检。

请立即使用 think 工具完成自检清单：
1. 用户问题回答情况
2. 文件读取记录（区分 read_file vs ripgrep）
3. 调用链验证（每个环节的证据来源）
4. 缺失的环节
5. 结论

只有自检通过后，才能再次输出 [INVESTIGATION_COMPLETE]。`,
        metadata: { compressible: false },
      });
    } else if (decision.type === 'hallucination_detected') {
      // Only save the cleaned content (before hallucination started)
      // This prevents fake tool results from polluting the conversation history
      if (decision.cleanedContent) {
        await this.contextManager.addMessage({
          role: 'assistant',
          content: decision.cleanedContent,
        });
      }
      await this.contextManager.addMessage({
        role: 'user',
        content: `⚠️ **检测到幻觉内容**

你的回复中包含了虚假的工具执行结果。你不能在文本中"想象"工具的执行结果！

**重要规则**：
1. 必须通过 function calling API 调用工具
2. 只有工具真正执行后返回的结果才是有效的
3. 不要在回复中编造 "工具执行成功" 或文件内容

请使用正确的 function call 格式调用工具继续调查。`,
        metadata: { compressible: false },
      });
    } else if (decision.type === 'done') {
      await this.contextManager.addMessage({
        role: 'assistant',
        content: decision.result,
      });
    }

    // Persist LLM turn for debugging
    await this.saveLLMTurn({
      turn: this.state.iteration,
      timestamp: turnStartTime,
      duration: llmDuration,
      inputMessages,
      systemPrompt,
      tools,
      response,
      decision,
      toolExecutionResult,
    });

    return {
      decision,
      thinking: response.thinking,
      toolResult,
      tokensUsed,
    };
  }

  /**
   * Get source from tool arguments
   */
  private getToolSource(toolName: string, args: Record<string, unknown>): string | undefined {
    if (toolName === 'read_file' && args.path) {
      return String(args.path);
    }
    if (toolName === 'ripgrep' && args.pattern) {
      return `search: ${args.pattern}`;
    }
    return undefined;
  }

  /**
   * Track key files discovered during investigation
   */
  private trackKeyFiles(toolName: string, args: Record<string, unknown>, output: string): void {
    // Extract file paths from read_file calls
    if (toolName === 'read_file' && args.path) {
      const path = String(args.path);
      if (!this.keyFiles.includes(path)) {
        this.keyFiles.push(path);
      }
    }

    // Extract files from search results
    const fileMatches = output.match(/[\w\-./]+\.(ts|js|go|py|java|rs|rb|cpp|c|h|tsx|jsx|vue|svelte)/g);
    if (fileMatches) {
      for (const file of fileMatches.slice(0, 10)) { // Limit to 10 per result
        if (!this.keyFiles.includes(file)) {
          this.keyFiles.push(file);
        }
      }
    }
  }

  /**
   * Extract findings from completion text
   */
  private extractFindings(content: string): string {
    // Remove the [INVESTIGATION_COMPLETE] marker and return the rest
    const marker = '[INVESTIGATION_COMPLETE]';
    const markerIndex = content.indexOf(marker);
    if (markerIndex !== -1) {
      return content.slice(markerIndex + marker.length).trim();
    }
    return content;
  }

  /**
   * Gather partial findings from conversation history
   */
  private gatherPartialFindings(): string {
    const messages = this.contextManager.getMessages();
    const findings: string[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && message.content) {
        // Extract bullet points or structured findings
        const lines = message.content.split('\n');
        for (const line of lines) {
          if (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./)) {
            findings.push(line);
          }
        }
      }
    }

    if (findings.length > 0) {
      return findings.join('\n');
    }

    // Fallback: return the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].content;
      }
    }

    return '';
  }

  /**
   * Hallucination patterns to detect fake tool results in LLM content
   */
  private static readonly HALLUCINATION_PATTERNS = [
    /<\/user>/,                                    // Fake </user> tag
    /工具\s*"[^"]+"\s*执行(成功|失败)/,              // Chinese: Tool "xxx" executed successfully/failed
    /Tool\s*"[^"]+"\s*(executed|completed|failed)/i, // English variant
    /^File:\s+[^\n]+\nLines:\s+\d+-\d+/m,          // Fake file content header
  ];

  /**
   * Clean hallucinated content from text
   * Returns the cleaned text with hallucinations removed
   */
  private cleanHallucinatedContent(content: string): { cleaned: string; hasHallucination: boolean } {
    const patterns = InvestigatorAgent.HALLUCINATION_PATTERNS;
    const hasHallucination = patterns.some(pattern => pattern.test(content));

    if (!hasHallucination) {
      return { cleaned: content, hasHallucination: false };
    }

    // Find the position of first hallucination marker
    let cleanEndIndex = content.length;
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined && match.index < cleanEndIndex) {
        cleanEndIndex = match.index;
      }
    }

    const cleaned = content.slice(0, cleanEndIndex).trim();
    logger.warn(
      {
        originalLength: content.length,
        cleanedLength: cleaned.length,
        hallucinationStart: cleanEndIndex,
      },
      'Cleaned hallucinated content from LLM response'
    );

    return { cleaned, hasHallucination: true };
  }

  /**
   * Parse decision from LLM response
   */
  private parseDecision(content: string, toolCalls?: ToolCall[]): AgentDecision {
    // Layer 1: Proper tool calls from API
    if (toolCalls && toolCalls.length > 0) {
      const tc = toolCalls[0];
      return {
        type: 'tool_call',
        name: tc.name,
        arguments: tc.arguments,
      };
    }

    // Layer 2: Try to rescue tool calls from content text
    const rescuedToolCall = this.rescueToolCallFromContent(content);
    if (rescuedToolCall) {
      return {
        type: 'tool_call',
        name: rescuedToolCall.name,
        arguments: rescuedToolCall.arguments,
      };
    }

    // Layer 3: Detect hallucinated tool results in content
    // LLM sometimes "hallucinates" tool execution results instead of using function calling API
    const { cleaned: cleanedContent, hasHallucination } = this.cleanHallucinatedContent(content);
    if (hasHallucination) {
      return {
        type: 'hallucination_detected',
        content,
        cleanedContent,
      };
    }

    // Check for investigation complete marker
    if (content.includes('[INVESTIGATION_COMPLETE]')) {
      // Check if the last tool call was 'think' (self-check)
      const lastToolCall = this.state.decisions
        .filter(d => d.type === 'tool_call')
        .pop();

      if (!lastToolCall || lastToolCall.name !== 'think') {
        // Force self-check before completing
        return {
          type: 'requires_self_check',
          content,
        };
      }

      return {
        type: 'done',
        result: content,
      };
    }

    // Check for text-based tool call patterns
    const textToolCallPatterns = [
      /我将使用\s*(\w+)\s*工具/,
      /I(?:'ll| will) use (?:the )?(\w+) tool/i,
      /使用\s*(\w+)\s*工具/,
    ];

    for (const pattern of textToolCallPatterns) {
      const match = content.match(pattern);
      if (match) {
        return {
          type: 'invalid_tool_call',
          content,
          detectedToolName: match[1],
        };
      }
    }

    // Check for thinking patterns
    const thinkingPatterns = [
      /let me (check|look|search|find|read|examine|analyze)/i,
      /I('ll| will| should| need to) (use|check|look|search|find|read|analyze)/i,
      /需要(查看|检查|搜索|查找|读取|分析)/,
      /让我(查看|检查|搜索|查找|读取|分析)/,
      /我(来|需要|应该)(查看|检查|搜索|查找|读取|分析)/,
    ];

    const isThinking = thinkingPatterns.some(pattern => pattern.test(content));
    if (isThinking) {
      return {
        type: 'thinking',
        content,
      };
    }

    // Default: treat as done (investigation complete)
    return {
      type: 'done',
      result: content,
    };
  }

  /**
   * Try to rescue tool calls from content text
   */
  private rescueToolCallFromContent(content: string): ToolCall | null {
    const zhPattern = /我将使用\s*(\w+)\s*工具[：:]\s*(\{[\s\S]*\})/;
    const enPattern = /I(?:'ll| will) use (?:the )?(\w+) tool[：:]?\s*(\{[\s\S]*\})/i;
    const codeBlockPattern = /(\w+).*```(?:json)?\s*(\{[\s\S]*?\})\s*```/;

    for (const pattern of [zhPattern, enPattern, codeBlockPattern]) {
      const match = content.match(pattern);
      if (match) {
        const toolName = match[1];
        const argsStr = match[2];

        try {
          const fixedJson = this.tryFixJson(argsStr);
          if (fixedJson) {
            logger.debug({ toolName, args: fixedJson }, 'Rescued tool call from content');
            return {
              name: toolName,
              arguments: fixedJson,
            };
          }
        } catch (e) {
          logger.warn({ toolName, error: e }, 'Failed to parse rescued tool call');
        }
      }
    }

    return null;
  }

  /**
   * Try to fix common JSON formatting issues
   */
  private tryFixJson(malformed: string): Record<string, unknown> | null {
    const fixed = malformed
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":')
      .replace(/：/g, ':')
      .replace(/\}[\s\S]*$/, '}');

    try {
      return JSON.parse(fixed);
    } catch {
      const jsonMatch = fixed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Execute a tool
   */
  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const session = this.contextManager.getSession()!;

    this.eventEmitter.emit({
      type: 'tool_call',
      name,
      arguments: args,
    });

    const startTime = Date.now();

    // Handle special recall_detail tool
    if (name === 'recall_detail') {
      const key = args.key as string;
      const recallResult = await this.contextManager.recall({ key });

      // Always return the content from recall (it contains error messages if failed)
      const result: ToolResult = {
        success: recallResult.success,
        output: recallResult.content,
        metadata: {
          duration: Date.now() - startTime,
          source: recallResult.source,
          tokens: recallResult.tokens,
        },
      };

      this.eventEmitter.emit({
        type: 'tool_result',
        name,
        result,
        duration: Date.now() - startTime,
      });

      return result;
    }

    // Get tool from registry
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      // Provide helpful feedback with available tools
      const availableTools = this.toolRegistry.getNames();
      const errorMessage = `未知工具: "${name}"。可用工具: ${availableTools.join(', ')}。请使用正确的工具名称重试。`;

      const result: ToolResult = {
        success: false,
        output: '',
        error: errorMessage,
      };

      this.eventEmitter.emit({
        type: 'tool_result',
        name,
        result,
        duration: Date.now() - startTime,
      });

      logger.warn({ requestedTool: name, availableTools }, 'Tool hallucination detected');

      return result;
    }

    // Create tool context
    const context: ToolContext = {
      workingDir: session.workingDir,
      sessionId: session.id,
      abortSignal: this.abortController.signal,
      onProgress: progress => {
        logger.debug({ tool: name, progress }, 'Tool progress');
      },
    };

    try {
      const result = await tool.execute(args, context);

      this.state.lastToolResults.set(name, result.output);

      this.eventEmitter.emit({
        type: 'tool_result',
        name,
        result,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const result: ToolResult = {
        success: false,
        output: '',
        error: (error as Error).message,
      };

      this.eventEmitter.emit({
        type: 'tool_result',
        name,
        result,
        duration: Date.now() - startTime,
      });

      return result;
    }
  }

  /**
   * Save LLM turn to disk for debugging
   */
  private async saveLLMTurn(params: {
    turn: number;
    timestamp: number;
    duration: number;
    inputMessages: ChatMessage[];
    systemPrompt: string;
    tools: Tool[];
    response: { content: string; thinking?: string; toolCalls?: ToolCall[]; usage?: { inputTokens: number; outputTokens: number; cacheHit?: boolean; cachedTokens?: number } };
    decision: AgentDecision;
    toolExecutionResult?: { name: string; success: boolean; output: string; duration: number };
  }): Promise<void> {
    const llmTurn: LLMTurn = {
      agent: 'investigator',
      turn: params.turn,
      timestamp: params.timestamp,
      duration: params.duration,
      input: {
        systemPrompt: params.systemPrompt,
        messages: params.inputMessages.map(m => ({
          key: m.key,
          role: m.role,
          content: m.content,
          compressed: m.compressed,
        })),
        tools: params.tools.map(t => ({
          name: t.name,
          description: t.description,
        })),
      },
      output: {
        content: params.response.content,
        thinking: params.response.thinking,
        toolCalls: params.response.toolCalls,
      },
      usage: params.response.usage,
      decision: {
        type: params.decision.type,
        ...(params.decision.type === 'tool_call' && {
          name: params.decision.name,
          arguments: params.decision.arguments,
        }),
        ...(params.decision.type === 'done' && {
          result: params.decision.result,
        }),
        ...(params.decision.type === 'thinking' && {
          result: params.decision.content,
        }),
        ...(params.decision.type === 'invalid_tool_call' && {
          result: params.decision.content,
          name: params.decision.detectedToolName,
        }),
        ...(params.decision.type === 'requires_self_check' && {
          result: params.decision.content,
        }),
        ...(params.decision.type === 'hallucination_detected' && {
          result: params.decision.content,
          cleanedContent: params.decision.cleanedContent,
        }),
      },
      toolResult: params.toolExecutionResult,
    };

    try {
      await this.contextManager.saveLLMTurn(llmTurn);
    } catch (error) {
      logger.warn({ error, turn: params.turn }, 'Failed to save LLM turn');
    }
  }

  /**
   * Check if agent is stuck
   */
  private isStuck(): boolean {
    const recentDecisions = this.state.decisions.slice(-this.config.stuckThreshold);
    if (recentDecisions.length < this.config.stuckThreshold) {
      return false;
    }

    const first = recentDecisions[0];
    if (first.type !== 'tool_call') {
      return false;
    }

    const firstArgs = first.type === 'tool_call' ? first.arguments : null;
    return recentDecisions.every(
      d =>
        d.type === 'tool_call' &&
        d.name === first.name &&
        JSON.stringify(d.arguments) === JSON.stringify(firstArgs)
    );
  }

  /**
   * Abort the investigation
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return { ...this.state };
  }
}
