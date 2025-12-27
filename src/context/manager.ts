/**
 * Context Manager
 *
 * Manages messages and compression:
 * - Messages: Active conversation with LLM
 * - L0 (disk): Original content for recall
 */

import { nanoid } from 'nanoid';
import type {
  ChatMessage,
  Session,
  BudgetConfig,
  BudgetState,
  RecallRequest,
  RecallResult,
  LLMTurn,
  CompressionROI,
  SynthesisMessage,
} from './types.js';
import { COMPRESSION_THRESHOLDS } from './types.js';
import { ContextStorage } from './storage.js';
import { estimateTokens } from '../utils/tokens.js';
import { getLogger } from '../utils/logger.js';
import type { EventEmitter } from '../events/emitter.js';
import { DOUBAO_SEED_CODE_LIMITS } from '../llm/types.js';

const logger = getLogger();

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  contextWindow: DOUBAO_SEED_CODE_LIMITS.contextWindow,
  reservedForSynthesis: 30000,
  reservedForRecalls: 20000,
  reservedForNextSteps: 15000,
};

/**
 * Context Manager options
 */
export interface ContextManagerOptions {
  budgetConfig?: BudgetConfig;
  systemPrompt?: string;
  eventEmitter?: EventEmitter;
}

/**
 * Context Manager
 */
export class ContextManager {
  private storage: ContextStorage;
  private session: Session | null = null;
  private budgetConfig: BudgetConfig;
  private systemPromptTokens: number = 0;
  private eventEmitter?: EventEmitter;

  constructor(options: ContextManagerOptions = {}) {
    this.storage = new ContextStorage();
    this.budgetConfig = options.budgetConfig ?? DEFAULT_BUDGET_CONFIG;
    this.eventEmitter = options.eventEmitter;

    if (options.systemPrompt) {
      this.systemPromptTokens = estimateTokens(options.systemPrompt);
    }
  }

  /**
   * Initialize a new session
   */
  async initSession(query: string, workingDir: string): Promise<Session> {
    this.session = await this.storage.createSession(query, workingDir);
    this.session.budget = this.calculateBudget();

    logger.debug({ sessionId: this.session.id, query }, 'Session initialized');
    return this.session;
  }

  /**
   * Get current session
   */
  getSession(): Session | null {
    return this.session;
  }

  /**
   * Add a message to the conversation
   */
  async addMessage(params: {
    role: 'user' | 'assistant';
    content: string;
    metadata?: ChatMessage['metadata'];
  }): Promise<ChatMessage> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const tokens = estimateTokens(params.content);
    const message: ChatMessage = {
      key: `msg_${nanoid(8)}`,
      role: params.role,
      content: params.content,
      tokens,
      compressed: false,
      timestamp: Date.now(),
      metadata: params.metadata,
    };

    // Save original content to L0 (disk) for potential recall
    if (this.isCompressible(message)) {
      const filePath = await this.storage.saveMessageContent(this.session.id, message);
      this.session.storage.messages.set(message.key, filePath);
    }

    // Add to messages
    this.session.messages.push(message);
    this.session.totalTokens += tokens;

    // Update budget
    this.session.budget = this.calculateBudget();

    // Check if compression needed
    if (this.needsCompression()) {
      await this.compress();
    }

    // Persist session state
    await this.storage.saveSession(this.session);

    logger.debug({ messageKey: message.key, role: params.role, tokens }, 'Message added');
    return message;
  }

  /**
   * Get messages formatted for LLM (without metadata)
   */
  getMessagesForLLM(): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (!this.session) return [];

    return this.session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Get all messages with full metadata
   */
  getMessages(): ChatMessage[] {
    return this.session?.messages ?? [];
  }

  /**
   * Get messages filtered for synthesis
   * Filters out:
   * - Failed tool calls (error messages)
   * - list_dir results (directory listings)
   * - ripgrep results (search results, keep file paths only)
   */
  getMessagesForSynthesis(): SynthesisMessage[] {
    if (!this.session) return [];

    const result: SynthesisMessage[] = [];
    const messages = this.session.messages;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Always include assistant messages (LLM thoughts/conclusions)
      if (msg.role === 'assistant') {
        result.push({
          key: msg.key,
          role: msg.role,
          content: msg.content,
          compressed: msg.compressed,
        });
        continue;
      }

      // For user messages (tool results)
      const toolName = msg.metadata?.toolName;

      // Skip if no tool name (original query is always included)
      if (!toolName) {
        result.push({
          key: msg.key,
          role: msg.role,
          content: msg.content,
          compressed: msg.compressed,
        });
        continue;
      }

      // Skip failed tool calls
      if (msg.content.includes('执行失败') || msg.content.includes('错误:')) {
        continue;
      }

      // Skip list_dir results
      if (toolName === 'list_dir') {
        continue;
      }

      // Skip ripgrep results (search results are for finding files, not for synthesis)
      if (toolName === 'ripgrep') {
        continue;
      }

      // Include read_file results (the actual file content)
      if (toolName === 'read_file') {
        result.push({
          key: msg.key,
          role: msg.role,
          content: msg.content,
          toolName: msg.metadata?.toolName,
          source: msg.metadata?.source,
          compressed: msg.compressed,
        });
        continue;
      }

      // Include other tool results
      result.push({
        key: msg.key,
        role: msg.role,
        content: msg.content,
        toolName: msg.metadata?.toolName,
        source: msg.metadata?.source,
        compressed: msg.compressed,
      });
    }

    return result;
  }

  /**
   * Check if compression is needed
   */
  needsCompression(): boolean {
    if (!this.session) return false;

    const usage = this.session.budget.used / this.session.budget.total;
    return usage >= COMPRESSION_THRESHOLDS.triggerRatio;
  }

  /**
   * Compress messages to reduce token usage
   */
  async compress(): Promise<void> {
    if (!this.session) return;

    const tokensToFree = this.calculateTokensToFree();
    if (tokensToFree <= 0) return;

    logger.debug({ tokensToFree }, 'Starting compression');

    // Get compression candidates with ROI
    const candidates = this.getCompressionCandidates();
    if (candidates.length === 0) {
      // No compressible messages, try discarding oldest
      await this.discardOldestMessages(tokensToFree);
      return;
    }

    // Sort by priority and savings
    candidates.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.savings - a.savings;
    });

    // Compress messages until we've freed enough tokens
    let freedTokens = 0;
    for (const candidate of candidates) {
      if (freedTokens >= tokensToFree) break;

      const message = this.session.messages.find(m => m.key === candidate.messageKey);
      if (!message || message.compressed) continue;

      // Compress this message
      const compressedContent = this.createCompressedContent(message);
      const compressedTokens = estimateTokens(compressedContent);
      const savings = message.tokens - compressedTokens;

      // Update message
      message.originalTokens = message.tokens;
      message.content = compressedContent;
      message.tokens = compressedTokens;
      message.compressed = true;

      // Update total tokens
      this.session.totalTokens -= savings;
      freedTokens += savings;

      logger.debug({
        messageKey: message.key,
        originalTokens: message.originalTokens,
        compressedTokens,
        savings,
      }, 'Message compressed');
    }

    // If still need to free more, discard oldest compressed messages
    if (freedTokens < tokensToFree) {
      await this.discardOldestMessages(tokensToFree - freedTokens);
    }

    // Emit compression event
    this.eventEmitter?.emit({
      type: 'compression',
      originalTokens: this.session.totalTokens + freedTokens,
      compressedTokens: this.session.totalTokens,
      ratio: freedTokens / (this.session.totalTokens + freedTokens),
    });

    // Update budget
    this.session.budget = this.calculateBudget();

    // Persist session state
    await this.storage.saveSession(this.session);

    logger.debug({ freedTokens, totalTokens: this.session.totalTokens }, 'Compression completed');
  }

  /**
   * Recall original content for a compressed message
   */
  async recall(request: RecallRequest): Promise<RecallResult> {
    if (!this.session) {
      return {
        success: false,
        content: '错误: 没有活跃的会话',
        tokens: 0,
      };
    }

    if (!request.key) {
      return {
        success: false,
        content: '错误: 缺少 key 参数。请提供要召回的消息 key，格式如 msg_xxxxxxxx',
        tokens: 0,
      };
    }

    // Find the message
    const message = this.session.messages.find(m => m.key === request.key);
    if (!message) {
      // List available compressed messages to help the model
      const compressedMessages = this.session.messages
        .filter(m => m.compressed)
        .map(m => m.key)
        .slice(0, 5);

      let hint = '';
      if (compressedMessages.length > 0) {
        hint = `\n可用的压缩消息 key: ${compressedMessages.join(', ')}`;
      } else {
        hint = '\n当前没有被压缩的消息。';
      }

      return {
        success: false,
        content: `错误: 未找到 key 为 "${request.key}" 的消息。${hint}`,
        tokens: 0,
      };
    }

    // If not compressed, return current content with hint
    if (!message.compressed) {
      return {
        success: true,
        content: `注意: 该消息未被压缩，以下是当前内容:\n\n${message.content}`,
        tokens: message.tokens,
        source: message.metadata?.source,
      };
    }

    // Load original from L0
    try {
      const original = await this.storage.loadMessageContent(this.session.id, message.key);
      if (!original) {
        return {
          success: false,
          content: `错误: 无法从存储中加载 key "${request.key}" 的原始内容。存储文件可能已丢失。`,
          tokens: 0,
        };
      }

      logger.debug({ messageKey: request.key, tokens: original.tokens }, 'Content recalled');

      return {
        success: true,
        content: original.content,
        tokens: original.tokens,
        source: original.metadata?.source,
      };
    } catch (error) {
      logger.error({ error, key: request.key }, 'Failed to recall content');
      return {
        success: false,
        content: `错误: 召回失败 - ${(error as Error).message}`,
        tokens: 0,
      };
    }
  }

  /**
   * Get current budget state
   */
  getBudget(): BudgetState {
    return this.session?.budget ?? {
      total: 0,
      used: 0,
      available: 0,
      breakdown: { systemPrompt: 0, messages: 0, reserved: 0 },
    };
  }

  /**
   * Set system prompt tokens
   */
  setSystemPromptTokens(tokens: number): void {
    this.systemPromptTokens = tokens;
    if (this.session) {
      this.session.budget = this.calculateBudget();
    }
  }

  /**
   * Save current session
   */
  async save(): Promise<void> {
    if (this.session) {
      await this.storage.saveSession(this.session);
    }
  }

  /**
   * Save LLM turn for debugging
   */
  async saveLLMTurn(turn: LLMTurn): Promise<void> {
    if (!this.session) {
      throw new Error('No active session');
    }
    await this.storage.saveLLMTurn(this.session.id, turn);
  }

  // ============ Private Methods ============

  /**
   * Calculate current budget
   */
  private calculateBudget(): BudgetState {
    const reserved =
      this.budgetConfig.reservedForSynthesis +
      this.budgetConfig.reservedForRecalls +
      this.budgetConfig.reservedForNextSteps;

    const messagesTokens = this.session?.totalTokens ?? 0;
    const used = this.systemPromptTokens + messagesTokens;
    const available = this.budgetConfig.contextWindow - used - reserved;

    return {
      total: this.budgetConfig.contextWindow,
      used,
      available: Math.max(0, available),
      breakdown: {
        systemPrompt: this.systemPromptTokens,
        messages: messagesTokens,
        reserved,
      },
    };
  }

  /**
   * Calculate tokens to free to reach target usage
   */
  private calculateTokensToFree(): number {
    if (!this.session) return 0;

    const targetTokens = this.session.budget.total * COMPRESSION_THRESHOLDS.targetRatio;
    const toFree = this.session.budget.used - targetTokens;
    return Math.max(0, Math.ceil(toFree));
  }

  /**
   * Check if a message is compressible
   */
  private isCompressible(message: ChatMessage): boolean {
    // Already compressed
    if (message.compressed) return false;

    // Too short to compress
    if (message.tokens < COMPRESSION_THRESHOLDS.minTokensToCompress) return false;

    // Explicitly marked as not compressible
    if (message.metadata?.compressible === false) return false;

    // Tool results are highly compressible
    if (message.metadata?.toolName) return true;

    // Long messages are compressible
    return message.tokens >= COMPRESSION_THRESHOLDS.minTokensToCompress;
  }

  /**
   * Get compression candidates with ROI analysis
   */
  private getCompressionCandidates(): CompressionROI[] {
    if (!this.session) return [];

    const candidates: CompressionROI[] = [];
    const messages = this.session.messages;
    const protectedCount = COMPRESSION_THRESHOLDS.protectedRecentMessages;

    // Skip the most recent N messages
    const compressibleMessages = messages.slice(0, -protectedCount);

    for (const message of compressibleMessages) {
      if (!this.isCompressible(message)) continue;

      // Estimate compressed size (rough estimate: 5-10% of original for tool results)
      const compressionRatio = message.metadata?.toolName ? 0.05 : 0.2;
      const estimatedCompressedTokens = Math.max(50, Math.ceil(message.tokens * compressionRatio));
      const savings = message.tokens - estimatedCompressedTokens;

      // Determine priority based on tool type
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (message.metadata?.toolName === 'read_file') {
        priority = 'high'; // File contents are highly compressible
      } else if (message.metadata?.toolName === 'ripgrep') {
        priority = 'high'; // Search results are highly compressible
      } else if (message.role === 'assistant') {
        priority = 'low'; // Assistant responses are less compressible
      }

      candidates.push({
        messageKey: message.key,
        currentTokens: message.tokens,
        estimatedCompressedTokens,
        savings,
        priority,
      });
    }

    return candidates;
  }

  /**
   * Create compressed content for a message
   */
  private createCompressedContent(message: ChatMessage): string {
    const toolName = message.metadata?.toolName;
    const source = message.metadata?.source;

    if (toolName === 'read_file' && source) {
      // Extract key information from file content
      const summary = this.summarizeFileContent(message.content, source);
      return `[COMPRESSED:${message.key}] 文件 ${source}\n${summary}\n如需完整内容，使用 recall_detail(key="${message.key}")`;
    }

    if (toolName === 'ripgrep') {
      // Summarize search results
      const matchCount = (message.content.match(/\n/g) || []).length;
      return `[COMPRESSED:${message.key}] 搜索结果 (${matchCount}个匹配)\n如需完整结果，使用 recall_detail(key="${message.key}")`;
    }

    // Generic compression
    const preview = message.content.slice(0, 200).replace(/\n/g, ' ');
    return `[COMPRESSED:${message.key}] ${preview}...\n如需完整内容，使用 recall_detail(key="${message.key}")`;
  }

  /**
   * Summarize file content
   */
  private summarizeFileContent(content: string, _source: string): string {
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Extract function/class names (simple heuristic)
    const functionMatches = content.match(/(?:func|function|def|class|interface|type)\s+(\w+)/g) || [];
    const symbols = functionMatches.slice(0, 5).map(m => m.split(/\s+/)[1]);

    let summary = `(${lineCount}行)`;
    if (symbols.length > 0) {
      summary += ` 包含: ${symbols.join(', ')}`;
      if (functionMatches.length > 5) {
        summary += ` 等${functionMatches.length}个符号`;
      }
    }

    return summary;
  }

  /**
   * Discard oldest messages when compression is not enough
   */
  private async discardOldestMessages(tokensToFree: number): Promise<void> {
    if (!this.session) return;

    let freedTokens = 0;
    const protectedCount = COMPRESSION_THRESHOLDS.protectedRecentMessages;
    const discardableMessages = this.session.messages.slice(0, -protectedCount);

    // Find messages to discard
    const toDiscard: string[] = [];
    for (const message of discardableMessages) {
      if (freedTokens >= tokensToFree) break;
      toDiscard.push(message.key);
      freedTokens += message.tokens;
    }

    // Remove messages
    this.session.messages = this.session.messages.filter(m => !toDiscard.includes(m.key));
    this.session.totalTokens -= freedTokens;

    if (toDiscard.length > 0) {
      logger.debug({ discarded: toDiscard.length, freedTokens }, 'Oldest messages discarded');

      this.eventEmitter?.emit({
        type: 'messages_discarded',
        count: toDiscard.length,
        tokensFreed: freedTokens,
      });
    }
  }
}
