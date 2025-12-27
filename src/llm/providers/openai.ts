/**
 * OpenAI GPT Client
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

export class OpenAIClient implements LLMClient {
  readonly provider: LLMProvider = 'openai';
  readonly model: string;

  private client: OpenAI;
  private maxTokens: number;

  constructor(private config: LLMConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 8192;

    this.client = new OpenAI({
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

      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.model,
        messages: openaiMessages,
        max_tokens: this.maxTokens,
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

      const response = await this.client.chat.completions.create(params);

      const message = response.choices[0]?.message;
      if (!message) {
        throw new LLMError('Empty response from model', 'unknown');
      }

      // Extract content and tool calls
      const content = message.content ?? '';
      const toolCalls = this.extractToolCalls(message);

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
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
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (options?.systemPrompt) {
        openaiMessages.push({ role: 'system', content: options.systemPrompt });
      }

      for (const msg of messages) {
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      }

      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.model,
        messages: openaiMessages,
        max_tokens: this.maxTokens,
        stream: true,
      };

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

      const stream = await this.client.chat.completions.create(params);

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

      yield { type: 'done' };
    } catch (error) {
      throw this.handleError(error);
    }
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
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof OpenAI.RateLimitError) {
      const retryAfter = error.headers?.['retry-after'];
      return new LLMError(message, 'rate_limit', retryAfter ? parseInt(retryAfter) : undefined);
    }

    if (error instanceof OpenAI.AuthenticationError) {
      return new LLMError(message, 'auth_error');
    }

    if (error instanceof OpenAI.APIConnectionError) {
      return new LLMError(message, 'timeout');
    }

    if (error instanceof OpenAI.InternalServerError) {
      return new LLMError(message, 'service_unavailable');
    }

    if (message.includes('context') || message.includes('token')) {
      return new LLMError(message, 'context_overflow');
    }

    return new LLMError(message, 'unknown');
  }
}
