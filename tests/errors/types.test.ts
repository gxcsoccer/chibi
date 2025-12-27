/**
 * Error Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ChibiError,
  LLMError,
  ToolError,
  AgentError,
  ConfigError,
  ContextError,
} from '../../src/errors/types.js';

describe('Error Types', () => {
  describe('ChibiError', () => {
    it('should create error with message and code', () => {
      const error = new ChibiError('Test error', 'test_code');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('test_code');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('ChibiError');
    });

    it('should support recoverable flag', () => {
      const error = new ChibiError('Test error', 'test_code', true);

      expect(error.recoverable).toBe(true);
    });

    it('should support retryAfter', () => {
      const error = new ChibiError('Test error', 'test_code', true, 5000);

      expect(error.retryAfter).toBe(5000);
    });
  });

  describe('LLMError', () => {
    it('should be recoverable for rate_limit', () => {
      const error = new LLMError('Rate limited', 'rate_limit');

      expect(error.type).toBe('rate_limit');
      expect(error.recoverable).toBe(true);
      expect(error.code).toBe('llm_rate_limit');
      expect(error.name).toBe('LLMError');
    });

    it('should be recoverable for timeout', () => {
      const error = new LLMError('Timeout', 'timeout');

      expect(error.recoverable).toBe(true);
    });

    it('should be recoverable for service_unavailable', () => {
      const error = new LLMError('Service down', 'service_unavailable');

      expect(error.recoverable).toBe(true);
    });

    it('should not be recoverable for auth_error', () => {
      const error = new LLMError('Auth failed', 'auth_error');

      expect(error.recoverable).toBe(false);
    });

    it('should support retryAfter', () => {
      const error = new LLMError('Rate limited', 'rate_limit', 30000);

      expect(error.retryAfter).toBe(30000);
    });
  });

  describe('ToolError', () => {
    it('should include tool name', () => {
      const error = new ToolError('File not found', 'not_found', 'read_file');

      expect(error.type).toBe('not_found');
      expect(error.toolName).toBe('read_file');
      expect(error.code).toBe('tool_not_found');
      expect(error.name).toBe('ToolError');
    });

    it('should be recoverable only for timeout', () => {
      const timeoutError = new ToolError('Timeout', 'timeout', 'ripgrep');
      const notFoundError = new ToolError('Not found', 'not_found', 'read_file');

      expect(timeoutError.recoverable).toBe(true);
      expect(notFoundError.recoverable).toBe(false);
    });
  });

  describe('AgentError', () => {
    it('should create agent error with type', () => {
      const error = new AgentError('Max iterations reached', 'max_iterations');

      expect(error.type).toBe('max_iterations');
      expect(error.code).toBe('agent_max_iterations');
      expect(error.name).toBe('AgentError');
    });

    it('should default to not recoverable', () => {
      const error = new AgentError('Stuck loop', 'stuck_loop');

      expect(error.recoverable).toBe(false);
    });

    it('should support explicit recoverable flag', () => {
      const error = new AgentError('Tool error', 'tool_error', true);

      expect(error.recoverable).toBe(true);
    });
  });

  describe('ConfigError', () => {
    it('should create config error', () => {
      const error = new ConfigError('Invalid config');

      expect(error.message).toBe('Invalid config');
      expect(error.code).toBe('config_error');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('ConfigError');
    });
  });

  describe('ContextError', () => {
    it('should create context error with type', () => {
      const error = new ContextError('Storage failed', 'storage');

      expect(error.type).toBe('storage');
      expect(error.code).toBe('context_storage');
      expect(error.name).toBe('ContextError');
    });

    it('should not be recoverable for overflow', () => {
      const error = new ContextError('Context overflow', 'overflow');

      expect(error.recoverable).toBe(false);
    });

    it('should be recoverable for non-overflow types', () => {
      const storageError = new ContextError('Storage error', 'storage');
      const compressionError = new ContextError('Compression error', 'compression');
      const recallError = new ContextError('Recall error', 'recall');

      expect(storageError.recoverable).toBe(true);
      expect(compressionError.recoverable).toBe(true);
      expect(recallError.recoverable).toBe(true);
    });
  });
});
