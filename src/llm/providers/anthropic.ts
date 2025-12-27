/**
 * Anthropic Claude Client
 */

import Anthropic from '@anthropic-ai/sdk';
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

// Anthropic usage with cache fields
interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

export class AnthropicClient implements LLMClient {
  readonly provider: LLMProvider = 'anthropic';
  readonly model: string;

  private client: Anthropic;
  private maxTokens: number;

  constructor(private config: LLMConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 8192;

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 120000,
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
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      const params: Anthropic.MessageCreateParams = {
        model: this.model,
        max_tokens: this.maxTokens,
        messages: anthropicMessages,
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      if (options?.tools && options.tools.length > 0) {
        params.tools = options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        }));
      }

      const response = await this.client.messages.create(params);

      // Extract content and tool calls
      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheHit: ((response.usage as AnthropicUsage).cache_read_input_tokens ?? 0) > 0,
          cachedTokens: (response.usage as AnthropicUsage).cache_read_input_tokens,
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
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      const params: Anthropic.MessageStreamParams = {
        model: this.model,
        max_tokens: this.maxTokens,
        messages: anthropicMessages,
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      if (options?.tools && options.tools.length > 0) {
        params.tools = options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        }));
      }

      const stream = this.client.messages.stream(params);

      let currentToolName = '';
      let currentToolInput = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolName = event.content_block.name;
            currentToolInput = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text_delta', content: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolName) {
            try {
              const args = JSON.parse(currentToolInput);
              yield {
                type: 'tool_call',
                toolCall: { name: currentToolName, arguments: args },
              };
            } catch {
              // Invalid JSON
            }
            currentToolName = '';
            currentToolInput = '';
          }
        } else if (event.type === 'message_stop') {
          yield { type: 'done' };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): LLMError {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof Anthropic.RateLimitError) {
      const retryAfter = error.headers?.['retry-after'];
      return new LLMError(message, 'rate_limit', retryAfter ? parseInt(retryAfter) : undefined);
    }

    if (error instanceof Anthropic.AuthenticationError) {
      return new LLMError(message, 'auth_error');
    }

    if (error instanceof Anthropic.APIConnectionError) {
      return new LLMError(message, 'timeout');
    }

    if (error instanceof Anthropic.InternalServerError) {
      return new LLMError(message, 'service_unavailable');
    }

    if (message.includes('context') || message.includes('token')) {
      return new LLMError(message, 'context_overflow');
    }

    return new LLMError(message, 'unknown');
  }
}
