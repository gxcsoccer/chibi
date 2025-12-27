/**
 * Context Management Types
 */

/**
 * Chat message with compression support
 * Extends LLMMessage with key, compression state, and metadata
 */
export interface ChatMessage {
  /** Unique identifier for this message */
  key: string;
  /** Message role */
  role: 'user' | 'assistant';
  /** Current content (may be compressed) */
  content: string;
  /** Current token count */
  tokens: number;
  /** Whether this message has been compressed */
  compressed: boolean;
  /** Original token count before compression */
  originalTokens?: number;
  /** Timestamp when message was created */
  timestamp: number;
  /** Message metadata for compression decisions */
  metadata?: {
    /** Tool name if this is a tool result */
    toolName?: string;
    /** Source (file path, search query, etc.) */
    source?: string;
    /** Whether this message can be compressed */
    compressible?: boolean;
  };
}

/**
 * Compression ROI (Return on Investment) for prioritizing compression
 */
export interface CompressionROI {
  messageKey: string;
  currentTokens: number;
  estimatedCompressedTokens: number;
  savings: number;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Storage layer (L0 - disk persistence)
 */
export interface StorageLayer {
  /** Session directory path */
  sessionDir: string;
  /** Message key -> file path mapping */
  messages: Map<string, string>;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  contextWindow: number; // Total available tokens
  reservedForSynthesis: number; // Reserved for final response
  reservedForRecalls: number; // Reserved for recall operations
  reservedForNextSteps: number; // Reserved for next iteration planning
}

/**
 * Budget state
 */
export interface BudgetState {
  total: number;
  used: number;
  available: number;
  breakdown: {
    systemPrompt: number;
    messages: number;
    reserved: number;
  };
}

/**
 * Session state
 */
export interface Session {
  id: string;
  query: string;
  startedAt: number;
  workingDir: string;
  /** L0 storage layer (disk persistence) */
  storage: StorageLayer;
  /** Current messages in conversation */
  messages: ChatMessage[];
  /** Total tokens in messages */
  totalTokens: number;
  /** Budget state */
  budget: BudgetState;
}

/**
 * Recall request - recall original content by message key
 */
export interface RecallRequest {
  /** Message key to recall */
  key: string;
}

/**
 * Message for synthesis (filtered from investigation)
 * Only contains successful read_file results and assistant messages
 */
export interface SynthesisMessage {
  /** Message key for recall */
  key: string;
  /** Message role */
  role: 'user' | 'assistant';
  /** Content (may be compressed) */
  content: string;
  /** Tool name if this is a tool result */
  toolName?: string;
  /** Source (file path, etc.) */
  source?: string;
  /** Whether content is compressed */
  compressed: boolean;
}

/**
 * Recall result
 */
export interface RecallResult {
  /** Whether recall was successful */
  success: boolean;
  /** Original content */
  content: string;
  /** Token count of original content */
  tokens: number;
  /** Source metadata */
  source?: string;
}

/**
 * Compression thresholds
 */
export const COMPRESSION_THRESHOLDS = {
  /** Minimum tokens for a message to be compressible */
  minTokensToCompress: 200,
  /** Trigger compression when usage exceeds this ratio */
  triggerRatio: 0.8,
  /** Target usage ratio after compression */
  targetRatio: 0.6,
  /** Number of recent messages to protect from compression */
  protectedRecentMessages: 4,
};

/**
 * LLM interaction turn for debugging and analysis
 */
export interface LLMTurn {
  /** Agent that produced this turn */
  agent?: 'investigator' | 'synthesizer' | 'main';
  /** Turn number (1, 2, 3, ...) */
  turn: number;
  /** Timestamp when the turn started */
  timestamp: number;
  /** Duration of the LLM call in milliseconds */
  duration: number;
  /** Input to LLM */
  input: {
    systemPrompt: string;
    messages: Array<{
      key?: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      compressed?: boolean;
    }>;
    tools?: Array<{
      name: string;
      description: string;
    }>;
  };
  /** Output from LLM */
  output: {
    content: string;
    thinking?: string;
    toolCalls?: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }>;
  };
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHit?: boolean;
    cachedTokens?: number;
  };
  /** Decision made based on this turn */
  decision: {
    type: 'tool_call' | 'delegate' | 'done' | 'thinking' | 'invalid_tool_call' | 'requires_self_check';
    name?: string;
    arguments?: Record<string, unknown>;
    result?: string;
  };
  /** Tool execution result (if applicable) */
  toolResult?: {
    name: string;
    success: boolean;
    output: string;
    duration: number;
  };
}
