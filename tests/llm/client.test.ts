/**
 * LLM Client Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLLMClient, getDefaultLLMConfig } from '../../src/llm/client.js';
import { ConfigError } from '../../src/errors/types.js';
import type { LLMProvider } from '../../src/llm/types.js';

describe('LLM Client', () => {
  describe('createLLMClient', () => {
    it('should create Volcengine client', () => {
      const client = createLLMClient({
        provider: 'volcengine',
        model: 'test-model',
        apiKey: 'test-key',
      });

      expect(client).toBeDefined();
      expect(client.provider).toBe('volcengine');
      expect(client.complete).toBeDefined();
    });

    it('should create Anthropic client', () => {
      const client = createLLMClient({
        provider: 'anthropic',
        model: 'claude-3',
        apiKey: 'test-key',
      });

      expect(client).toBeDefined();
      expect(client.provider).toBe('anthropic');
      expect(client.complete).toBeDefined();
    });

    it('should create OpenAI client', () => {
      const client = createLLMClient({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      });

      expect(client).toBeDefined();
      expect(client.provider).toBe('openai');
      expect(client.complete).toBeDefined();
    });

    it('should throw error for unknown provider', () => {
      expect(() => {
        createLLMClient({
          provider: 'unknown' as LLMProvider,
          model: 'test',
          apiKey: 'test',
        });
      }).toThrow(ConfigError);
    });
  });

  describe('getDefaultLLMConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset env
      process.env = { ...originalEnv };
      delete process.env.ARK_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return Volcengine config when ARK_API_KEY is set', () => {
      process.env.ARK_API_KEY = 'test-ark-key';

      const config = getDefaultLLMConfig();

      expect(config.provider).toBe('volcengine');
      expect(config.apiKey).toBe('test-ark-key');
    });

    it('should return Anthropic config when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const config = getDefaultLLMConfig();

      expect(config.provider).toBe('anthropic');
      expect(config.apiKey).toBe('test-anthropic-key');
    });

    it('should return OpenAI config when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const config = getDefaultLLMConfig();

      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('test-openai-key');
    });

    it('should prioritize Volcengine over others', () => {
      process.env.ARK_API_KEY = 'test-ark-key';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const config = getDefaultLLMConfig();

      expect(config.provider).toBe('volcengine');
    });

    it('should throw error when no API key is set', () => {
      expect(() => getDefaultLLMConfig()).toThrow(ConfigError);
    });
  });
});
