/**
 * LLM Client Factory
 */

import type { LLMConfig, LLMClient } from './types.js';
import { AnthropicClient } from './providers/anthropic.js';
import { OpenAIClient } from './providers/openai.js';
import { VolcengineClient } from './providers/volcengine.js';
import { ConfigError } from '../errors/types.js';

/**
 * Create an LLM client based on configuration
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'openai':
      return new OpenAIClient(config);
    case 'volcengine':
      return new VolcengineClient(config);
    default:
      throw new ConfigError(`Unknown LLM provider: ${(config as { provider: string }).provider}`);
  }
}

/**
 * Get default LLM configuration from environment variables
 */
export function getDefaultLLMConfig(): LLMConfig {
  // Priority: Volcengine > Anthropic > OpenAI
  if (process.env.ARK_API_KEY) {
    return {
      provider: 'volcengine',
      model: process.env.ARK_MODEL ?? 'doubao-seed-code-preview-251028',
      apiKey: process.env.ARK_API_KEY,
      baseUrl: process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
      volcengine: {
        enablePrefixCache: true,
        cacheMinTokens: 1024,
        enableThinking: false,
        maxThinkingTokens: 32768,
      },
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  throw new ConfigError(
    'No LLM API key found. Set ARK_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.'
  );
}
