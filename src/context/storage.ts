/**
 * Context Storage - L0 Layer (Disk Persistence)
 */

import fs from 'fs-extra';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { ChatMessage, Session, LLMTurn } from './types.js';
import { ContextError } from '../errors/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Storage paths
 */
export interface StoragePaths {
  base: string;
  sessions: string;
}

/**
 * Context Storage manages disk persistence for sessions and messages
 */
export class ContextStorage {
  private paths: StoragePaths;
  private initialized = false;

  constructor(private baseDir: string = '.chibi') {
    const base = path.resolve(process.cwd(), baseDir);
    this.paths = {
      base,
      sessions: path.join(base, 'sessions'),
    };
  }

  /**
   * Initialize storage directories
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.ensureDir(this.paths.base);
      await fs.ensureDir(this.paths.sessions);
      this.initialized = true;
      logger.debug({ paths: this.paths }, 'Storage initialized');
    } catch (error) {
      throw new ContextError(`Failed to initialize storage: ${error}`, 'storage');
    }
  }

  /**
   * Create a new session
   */
  async createSession(query: string, workingDir: string): Promise<Session> {
    await this.init();

    const sessionId = nanoid(10);
    const sessionDir = path.join(this.paths.sessions, sessionId);

    await fs.ensureDir(sessionDir);
    await fs.ensureDir(path.join(sessionDir, 'messages'));
    await fs.ensureDir(path.join(sessionDir, 'turns'));

    const session: Session = {
      id: sessionId,
      query,
      startedAt: Date.now(),
      workingDir,
      storage: {
        sessionDir,
        messages: new Map(),
      },
      messages: [],
      totalTokens: 0,
      budget: {
        total: 0,
        used: 0,
        available: 0,
        breakdown: {
          systemPrompt: 0,
          messages: 0,
          reserved: 0,
        },
      },
    };

    await this.saveSession(session);
    logger.debug({ sessionId }, 'Session created');

    return session;
  }

  /**
   * Save session metadata
   */
  async saveSession(session: Session): Promise<void> {
    const sessionFile = path.join(this.paths.sessions, session.id, 'session.json');

    // Convert Map to object for serialization
    const serializable = {
      ...session,
      storage: {
        ...session.storage,
        messages: Object.fromEntries(session.storage.messages),
      },
    };

    await fs.writeJson(sessionFile, serializable, { spaces: 2 });
  }

  /**
   * Save message original content to disk (L0)
   * Used for recall when message is compressed
   */
  async saveMessageContent(sessionId: string, message: ChatMessage): Promise<string> {
    const messagesDir = path.join(this.paths.sessions, sessionId, 'messages');
    const filePath = path.join(messagesDir, `${message.key}.json`);

    const stored = {
      key: message.key,
      role: message.role,
      content: message.content,
      tokens: message.tokens,
      timestamp: message.timestamp,
      metadata: message.metadata,
    };

    await fs.writeJson(filePath, stored, { spaces: 2 });
    return filePath;
  }

  /**
   * Load message original content from disk (L0)
   */
  async loadMessageContent(sessionId: string, messageKey: string): Promise<ChatMessage | null> {
    const filePath = path.join(this.paths.sessions, sessionId, 'messages', `${messageKey}.json`);

    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    try {
      const data = await fs.readJson(filePath);
      return {
        ...data,
        compressed: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save LLM turn for debugging
   * Files are named as {agent}-{turn}.json for easy sorting and identification
   * e.g., investigator-001.json, synthesizer-001.json
   */
  async saveLLMTurn(sessionId: string, turn: LLMTurn): Promise<string> {
    const turnsDir = path.join(this.paths.sessions, sessionId, 'turns');
    await fs.ensureDir(turnsDir);

    // Format turn number with leading zeros (001, 002, ...)
    const turnNumber = String(turn.turn).padStart(3, '0');
    const agent = turn.agent ?? 'main';
    const fileName = `${agent}-${turnNumber}.json`;
    const filePath = path.join(turnsDir, fileName);

    await fs.writeJson(filePath, turn, { spaces: 2 });
    logger.debug({ sessionId, turn: turn.turn, agent }, 'LLM turn saved');

    return filePath;
  }
}
