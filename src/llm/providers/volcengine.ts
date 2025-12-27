/**
 * Volcengine Ark Client
 *
 * Uses OpenAI-compatible Chat Completions API with:
 * - Prefix Cache (context caching)
 * - Thinking (deep reasoning)
 * - Function Call (tool calling)
 */

import OpenAI from 'openai';
import type {
  LLMConfig,
  LLMClient,
  LLMMessage,
  LLMProvider,
  LLMResponseWithTools,
  StreamEvent,
  ToolDefinition,
  ToolCall,
} from '../types.js';
import { LLMError } from '../../errors/types.js';

// OpenAI function parameters type
type FunctionParameters = OpenAI.FunctionParameters;

// Volcengine usage with cache fields
interface VolcengineUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

// Content part type for thinking mode
interface ContentPart {
  type: string;
  text?: string;
}

export class VolcengineClient implements LLMClient {
  readonly provider: LLMProvider = 'volcengine';
  readonly model: string;

  private client: OpenAI;
  private enablePrefixCache: boolean;
  private cacheMinTokens: number;
  private enableThinking: boolean;
  private maxThinkingTokens: number;
  private maxTokens: number;
  private timeout: number;

  constructor(private config: LLMConfig) {
    this.model = config.model;
    this.enablePrefixCache = config.volcengine?.enablePrefixCache ?? true;
    this.cacheMinTokens = config.volcengine?.cacheMinTokens ?? 1024;
    this.enableThinking = config.volcengine?.enableThinking ?? false;
    this.maxThinkingTokens = config.volcengine?.maxThinkingTokens ?? 32768;
    this.maxTokens = config.maxTokens ?? 8192;
    this.timeout = config.timeout ?? 120000;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3',
      timeout: this.timeout,
    });
  }

  async complete(
    messages: LLMMessage[],
    options?: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): Promise<LLMResponseWithTools> {
    try {
      const response = await this.createChatCompletion(messages, options, false);

      const message = response.choices[0]?.message;
      if (!message) {
        throw new LLMError('Empty response from model', 'unknown');
      }

      // Extract content and tool calls
      const content = this.extractContent(message);
      const toolCalls = this.extractToolCalls(message);

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          cacheHit: ((response.usage as VolcengineUsage)?.prompt_tokens_details?.cached_tokens ?? 0) > 0,
          cachedTokens: (response.usage as VolcengineUsage)?.prompt_tokens_details?.cached_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *stream(
    messages: LLMMessage[],
    options?: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): AsyncIterable<StreamEvent> {
    try {
      const stream = await this.createChatCompletion(messages, options, true);

      const toolCallBuffer: Map<number, { name: string; arguments: string }> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Text content
        if (delta.content) {
          yield { type: 'text_delta', content: delta.content };
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!toolCallBuffer.has(index)) {
              toolCallBuffer.set(index, { name: '', arguments: '' });
            }

            const buffer = toolCallBuffer.get(index)!;
            if (toolCall.function?.name) {
              buffer.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              buffer.arguments += toolCall.function.arguments;
            }
          }
        }

        // Check for finish reason
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          for (const [, buffer] of toolCallBuffer) {
            try {
              const args = JSON.parse(buffer.arguments);
              yield {
                type: 'tool_call',
                toolCall: { name: buffer.name, arguments: args },
              };
            } catch {
              // Invalid JSON, skip
            }
          }
          toolCallBuffer.clear();
        }
      }

      yield {
        type: 'done',
        usage: undefined, // Streaming doesn't provide usage in Volcengine
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async createChatCompletion(
    messages: LLMMessage[],
    options?: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
    },
    stream: boolean = false
  ): Promise<OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (options?.systemPrompt) {
      openaiMessages.push({ role: 'system', content: options.systemPrompt });
    }

    // Add messages
    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      });
    }

    // Build request params
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
      max_tokens: this.maxTokens,
      stream,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as FunctionParameters,
        },
      }));
      params.tool_choice = 'auto';
    }

    // Build extra_body for Volcengine specific features
    const extraBody: Record<string, unknown> = {};

    // Prefix Cache configuration
    if (this.enablePrefixCache) {
      extraBody.prefix_cache = {
        enabled: true,
        min_tokens: this.cacheMinTokens,
      };
    }

    // Thinking (deep reasoning) configuration
    if (this.enableThinking) {
      extraBody.thinking = {
        type: 'enabled',
        budget_tokens: this.maxThinkingTokens,
      };
    }

    // Add extra_body to params
    if (Object.keys(extraBody).length > 0) {
      (params as OpenAI.Chat.ChatCompletionCreateParams & { extra_body?: Record<string, unknown> }).extra_body = extraBody;
    }

    return this.client.chat.completions.create(params);
  }

  private extractContent(message: OpenAI.Chat.ChatCompletionMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    // Handle array format (thinking scenario)
    if (Array.isArray(message.content)) {
      return (message.content as ContentPart[])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
    }

    return '';
  }

  private extractToolCalls(message: OpenAI.Chat.ChatCompletionMessage): ToolCall[] {
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return [];
    }

    return message.tool_calls
      .filter(tc => tc.type === 'function')
      .map(tc => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          // Invalid JSON
        }
        return {
          name: tc.function.name,
          arguments: args,
        };
      });
  }

  private handleError(error: unknown): LLMError {
    const err = error as Error & { status?: number; code?: string; headers?: Record<string, string> };
    const message = err?.message ?? String(error);

    if (message.includes('rate limit') || err?.status === 429) {
      const retryAfter = err?.headers?.['retry-after'];
      return new LLMError(message, 'rate_limit', retryAfter ? parseInt(retryAfter) : undefined);
    }

    if (message.includes('timeout') || err?.code === 'ETIMEDOUT') {
      return new LLMError(message, 'timeout');
    }

    if (err?.status === 401 || message.includes('auth')) {
      return new LLMError(message, 'auth_error');
    }

    if ((err?.status ?? 0) >= 500) {
      return new LLMError(message, 'service_unavailable');
    }

    if (message.includes('context') || message.includes('token')) {
      return new LLMError(message, 'context_overflow');
    }

    return new LLMError(message, 'unknown');
  }
}
