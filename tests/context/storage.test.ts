/**
 * Context Storage Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextStorage } from '../../src/context/storage.js';
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

describe('ContextStorage', () => {
  let storage: ContextStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `chibi-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    storage = new ContextStorage(tempDir);
  });

  afterEach(async () => {
    // Cleanup - ignore errors as temp dir may already be cleaned up
    try {
      await fs.remove(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should initialize storage directories', async () => {
      await storage.init();

      const sessionsDir = path.join(tempDir, 'sessions');
      expect(await fs.pathExists(tempDir)).toBe(true);
      expect(await fs.pathExists(sessionsDir)).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await storage.init();
      await storage.init(); // Second call should be a no-op

      expect(await fs.pathExists(tempDir)).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await storage.createSession('test query', '/test/dir');

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.query).toBe('test query');
      expect(session.workingDir).toBe('/test/dir');
      expect(session.messages).toEqual([]);
      expect(session.totalTokens).toBe(0);
    });

    it('should create session directories', async () => {
      const session = await storage.createSession('test', '/test');

      const sessionDir = path.join(tempDir, 'sessions', session.id);
      expect(await fs.pathExists(sessionDir)).toBe(true);
      expect(await fs.pathExists(path.join(sessionDir, 'messages'))).toBe(true);
      expect(await fs.pathExists(path.join(sessionDir, 'turns'))).toBe(true);
    });
  });

  describe('saveSession', () => {
    it('should save session metadata', async () => {
      const session = await storage.createSession('test', '/test');
      session.totalTokens = 100;

      await storage.saveSession(session);

      const sessionFile = path.join(tempDir, 'sessions', session.id, 'session.json');
      const saved = await fs.readJson(sessionFile);
      expect(saved.totalTokens).toBe(100);
    });
  });

  describe('saveMessageContent', () => {
    it('should save message to disk', async () => {
      const session = await storage.createSession('test', '/test');
      const message = {
        key: 'msg_test123',
        role: 'user' as const,
        content: 'test content',
        tokens: 10,
        compressed: false,
        timestamp: Date.now(),
      };

      const filePath = await storage.saveMessageContent(session.id, message);

      expect(await fs.pathExists(filePath)).toBe(true);
      const saved = await fs.readJson(filePath);
      expect(saved.content).toBe('test content');
    });
  });

  describe('loadMessageContent', () => {
    it('should load message from disk', async () => {
      const session = await storage.createSession('test', '/test');
      const message = {
        key: 'msg_test123',
        role: 'user' as const,
        content: 'test content',
        tokens: 10,
        compressed: false,
        timestamp: Date.now(),
      };

      await storage.saveMessageContent(session.id, message);
      const loaded = await storage.loadMessageContent(session.id, 'msg_test123');

      expect(loaded).toBeDefined();
      expect(loaded?.content).toBe('test content');
      expect(loaded?.compressed).toBe(false);
    });

    it('should return null for non-existent message', async () => {
      const session = await storage.createSession('test', '/test');
      const loaded = await storage.loadMessageContent(session.id, 'nonexistent');

      expect(loaded).toBeNull();
    });
  });

  describe('saveLLMTurn', () => {
    it('should save LLM turn', async () => {
      const session = await storage.createSession('test', '/test');
      const turn = {
        turn: 1,
        agent: 'investigator',
        messages: [],
        response: { content: 'test' },
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 1000,
      };

      const filePath = await storage.saveLLMTurn(session.id, turn);

      expect(await fs.pathExists(filePath)).toBe(true);
      expect(filePath).toContain('investigator-001.json');
    });
  });
});
