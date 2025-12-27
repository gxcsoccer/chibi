/**
 * LLM Client Types
 */

export type LLMProvider = 'anthropic' | 'openai' | 'volcengine';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;

  // Volcengine specific config
  volcengine?: {
    enablePrefixCache: boolean;
    cacheMinTokens: number;
    enableThinking: boolean;
    maxThinkingTokens: number;
  };

  // Common config
  temperature?: number;
  maxTokens?: number;
  maxInputTokens?: number;
  contextWindow?: number;
  timeout?: number;
}

// Doubao-Seed-Code model limits
export const DOUBAO_SEED_CODE_LIMITS = {
  contextWindow: 256 * 1024, // 256k
  maxOutputTokens: 32 * 1024, // 32k
  maxInputTokens: 224 * 1024, // 224k
  maxThinkingTokens: 32 * 1024, // 32k
  minPrefixCacheTokens: 1024,
};

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHit?: boolean;
    cachedTokens?: number;
  };
  thinking?: string; // Thinking content when enabled
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponseWithTools {
  content: string;
  toolCalls?: ToolCall[];
  usage?: LLMResponse['usage'];
  thinking?: string;
}

/**
 * LLM Client interface
 */
export interface LLMClient {
  readonly provider: LLMProvider;
  readonly model: string;

  /**
   * Complete a prompt with optional tool support
   */
  complete(
    messages: LLMMessage[],
    options?: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): Promise<LLMResponseWithTools>;

  /**
   * Stream a completion
   */
  stream(
    messages: LLMMessage[],
    options?: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): AsyncIterable<StreamEvent>;
}

export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'done'; usage?: LLMResponse['usage'] };
