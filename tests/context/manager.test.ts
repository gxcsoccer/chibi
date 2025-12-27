/**
 * Context Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextManager } from '../../src/context/manager.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ContextManager', () => {
  let manager: ContextManager;
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory
    tempDir = path.join(os.tmpdir(), `chibi-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Change to temp directory so .chibi is created there
    originalCwd = process.cwd();
    process.chdir(tempDir);

    manager = new ContextManager();
  });

  afterEach(async () => {
    // Restore cwd
    process.chdir(originalCwd);
    // Cleanup - ignore errors as temp dir may already be cleaned up
    try {
      await fs.remove(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initSession', () => {
    it('should initialize a new session', async () => {
      const session = await manager.initSession('test query', tempDir);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.query).toBe('test query');
      expect(session.budget).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should return null when no session', () => {
      expect(manager.getSession()).toBeNull();
    });

    it('should return current session', async () => {
      await manager.initSession('test', tempDir);
      const session = manager.getSession();

      expect(session).toBeDefined();
      expect(session?.query).toBe('test');
    });
  });

  describe('addMessage', () => {
    beforeEach(async () => {
      await manager.initSession('test', tempDir);
    });

    it('should add a message', async () => {
      const message = await manager.addMessage({
        role: 'user',
        content: 'Hello',
      });

      expect(message).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.tokens).toBeGreaterThan(0);
    });

    it('should update total tokens', async () => {
      await manager.addMessage({ role: 'user', content: 'Hello' });
      const session = manager.getSession();

      expect(session?.totalTokens).toBeGreaterThan(0);
    });

    it('should throw error when no session', async () => {
      const newManager = new ContextManager();

      await expect(
        newManager.addMessage({ role: 'user', content: 'test' })
      ).rejects.toThrow('No active session');
    });
  });

  describe('getMessagesForLLM', () => {
    beforeEach(async () => {
      await manager.initSession('test', tempDir);
    });

    it('should return empty array when no messages', () => {
      const messages = manager.getMessagesForLLM();
      expect(messages).toEqual([]);
    });

    it('should return messages without metadata', async () => {
      await manager.addMessage({ role: 'user', content: 'Hello' });
      await manager.addMessage({ role: 'assistant', content: 'Hi' });

      const messages = manager.getMessagesForLLM();

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi' });
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      await manager.initSession('test', tempDir);
    });

    it('should return all messages with metadata', async () => {
      await manager.addMessage({
        role: 'user',
        content: 'Hello',
        metadata: { toolName: 'read_file' },
      });

      const messages = manager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].metadata?.toolName).toBe('read_file');
    });
  });

  describe('getMessagesForSynthesis', () => {
    beforeEach(async () => {
      await manager.initSession('test', tempDir);
    });

    it('should filter out list_dir results', async () => {
      await manager.addMessage({
        role: 'user',
        content: 'dir listing',
        metadata: { toolName: 'list_dir' },
      });

      const messages = manager.getMessagesForSynthesis();

      expect(messages).toHaveLength(0);
    });

    it('should filter out ripgrep results', async () => {
      await manager.addMessage({
        role: 'user',
        content: 'search results',
        metadata: { toolName: 'ripgrep' },
      });

      const messages = manager.getMessagesForSynthesis();

      expect(messages).toHaveLength(0);
    });

    it('should include read_file results', async () => {
      await manager.addMessage({
        role: 'user',
        content: 'file content',
        metadata: { toolName: 'read_file', source: '/path/file.ts' },
      });

      const messages = manager.getMessagesForSynthesis();

      expect(messages).toHaveLength(1);
      expect(messages[0].toolName).toBe('read_file');
    });

    it('should include assistant messages', async () => {
      await manager.addMessage({
        role: 'assistant',
        content: 'analysis',
      });

      const messages = manager.getMessagesForSynthesis();

      expect(messages).toHaveLength(1);
    });
  });

  describe('getBudget', () => {
    it('should return zero budget when no session', () => {
      const budget = manager.getBudget();

      expect(budget.total).toBe(0);
      expect(budget.used).toBe(0);
    });

    it('should return budget after session init', async () => {
      await manager.initSession('test', tempDir);
      const budget = manager.getBudget();

      expect(budget.total).toBeGreaterThan(0);
    });
  });

  describe('setSystemPromptTokens', () => {
    it('should update budget breakdown', async () => {
      await manager.initSession('test', tempDir);
      manager.setSystemPromptTokens(1000);

      const budget = manager.getBudget();
      expect(budget.breakdown.systemPrompt).toBe(1000);
    });
  });

  describe('recall', () => {
    beforeEach(async () => {
      await manager.initSession('test', tempDir);
    });

    it('should return error when no key provided', async () => {
      const result = await manager.recall({});

      expect(result.success).toBe(false);
      expect(result.content).toContain('缺少 key 参数');
    });

    it('should return error for non-existent key', async () => {
      const result = await manager.recall({ key: 'msg_nonexistent' });

      expect(result.success).toBe(false);
      expect(result.content).toContain('未找到');
    });

    it('should return content for uncompressed message', async () => {
      const msg = await manager.addMessage({
        role: 'user',
        content: 'short content',
      });

      const result = await manager.recall({ key: msg.key });

      expect(result.success).toBe(true);
      expect(result.content).toContain('未被压缩');
    });
  });

  describe('save', () => {
    it('should save session state', async () => {
      await manager.initSession('test', tempDir);
      await manager.addMessage({ role: 'user', content: 'test' });

      await manager.save();

      // Verify session file exists
      const session = manager.getSession();
      const sessionFile = path.join(tempDir, '.chibi', 'sessions', session!.id, 'session.json');
      expect(await fs.pathExists(sessionFile)).toBe(true);
    });
  });

  describe('saveLLMTurn', () => {
    it('should save LLM turn', async () => {
      await manager.initSession('test', tempDir);

      await manager.saveLLMTurn({
        turn: 1,
        agent: 'investigator',
        messages: [],
        response: { content: 'test' },
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 1000,
      });

      const session = manager.getSession();
      const turnFile = path.join(
        tempDir,
        '.chibi',
        'sessions',
        session!.id,
        'turns',
        'investigator-001.json'
      );
      expect(await fs.pathExists(turnFile)).toBe(true);
    });

    it('should throw error when no session', async () => {
      const newManager = new ContextManager();

      await expect(
        newManager.saveLLMTurn({
          turn: 1,
          agent: 'test',
          messages: [],
          response: {},
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        })
      ).rejects.toThrow('No active session');
    });
  });
});
