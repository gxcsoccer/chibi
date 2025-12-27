/**
 * Config Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getDefaultConfig } from '../../src/utils/config.js';

describe('Config', () => {
  describe('getDefaultConfig', () => {
    it('should return default config', () => {
      const config = getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.llm).toBeDefined();
      expect(config.budget).toBeDefined();
      expect(config.agent).toBeDefined();
      expect(config.tools).toBeDefined();
      expect(config.output).toBeDefined();
      expect(config.log).toBeDefined();
    });

    it('should have correct default values', () => {
      const config = getDefaultConfig();

      expect(config.llm.provider).toBe('volcengine');
      expect(config.agent.maxIterations).toBe(20);
      expect(config.agent.stuckThreshold).toBe(3);
      expect(config.output.format).toBe('cli');
      expect(config.log.level).toBe('info');
    });
  });

  describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should load default config when no file exists', async () => {
      const config = await loadConfig();

      expect(config).toBeDefined();
      expect(config.llm).toBeDefined();
    });

    it('should merge env config', async () => {
      process.env.ARK_API_KEY = 'test-key';

      const config = await loadConfig();

      expect(config.llm.apiKey).toBe('test-key');
      expect(config.llm.provider).toBe('volcengine');
    });

    it('should respect CHIBI_LOG_LEVEL', async () => {
      process.env.CHIBI_LOG_LEVEL = 'debug';

      const config = await loadConfig();

      expect(config.log.level).toBe('debug');
    });
  });
});
