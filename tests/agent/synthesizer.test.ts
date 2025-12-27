/**
 * Synthesizer Agent Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesizerAgent } from '../../src/agent/synthesizer.js';
import type { LLMClient, LLMResponse } from '../../src/llm/types.js';
import type { ContextManager } from '../../src/context/manager.js';
import type { EventEmitter } from '../../src/events/emitter.js';
import type { SynthesisMessage } from '../../src/context/types.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/**
 * Create a mock LLM client
 */
function createMockLLMClient(responses: LLMResponse[]): LLMClient {
  let callIndex = 0;
  return {
    complete: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      return response;
    }),
    stream: vi.fn(),
  };
}

/**
 * Create a mock context manager
 */
function createMockContextManager(): ContextManager {
  return {
    getSession: vi.fn().mockReturnValue({ id: 'test-session', workDir: '/test' }),
    saveLLMTurn: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue({ success: true, content: 'Recalled content here' }),
  } as unknown as ContextManager;
}

/**
 * Create a mock event emitter
 */
function createMockEventEmitter(): EventEmitter {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as EventEmitter;
}

describe('SynthesizerAgent', () => {
  let mockLLMClient: LLMClient;
  let mockContextManager: ContextManager;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    mockContextManager = createMockContextManager();
    mockEventEmitter = createMockEventEmitter();
  });

  describe('Basic Synthesis', () => {
    it('should synthesize messages into a report', async () => {
      const response: LLMResponse = {
        content: '## User Creation Flow\n\n### Entry Point\n- File: handler.go:123',
        usage: { inputTokens: 500, outputTokens: 200 },
      };

      mockLLMClient = createMockLLMClient([response]);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      const messages: SynthesisMessage[] = [
        { key: 'msg_1', role: 'user', content: 'Query', compressed: false },
        { key: 'msg_2', role: 'assistant', content: 'Found handler.go', compressed: false },
      ];

      const result = await synthesizer.synthesize('What is user creation flow?', messages);

      expect(result.success).toBe(true);
      expect(result.report).toContain('User Creation Flow');
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should emit synthesis_start and synthesis_done events', async () => {
      const response: LLMResponse = {
        content: '## Report\n\nSummary here',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([response]);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      await synthesizer.synthesize('Query', []);

      const emitCalls = vi.mocked(mockEventEmitter.emit).mock.calls;
      const startEvent = emitCalls.find(call => call[0].type === 'synthesis_start');
      const completeEvent = emitCalls.find(call => call[0].type === 'synthesis_complete');

      expect(startEvent).toBeDefined();
      expect(completeEvent).toBeDefined();
    });
  });

  describe('Recall Detail', () => {
    it('should handle recall_detail tool calls', async () => {
      const recallResponse: LLMResponse = {
        content: '',
        toolCalls: [
          { name: 'recall_detail', arguments: { key: 'msg_compressed' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const finalResponse: LLMResponse = {
        content: '## Final Report\n\nWith recalled details',
        usage: { inputTokens: 200, outputTokens: 100 },
      };

      mockLLMClient = createMockLLMClient([recallResponse, finalResponse]);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      const messages: SynthesisMessage[] = [
        { key: 'msg_compressed', role: 'user', content: '[COMPRESSED] ...', compressed: true },
      ];

      const result = await synthesizer.synthesize('Query', messages);

      expect(result.success).toBe(true);
      expect(vi.mocked(mockContextManager.recall)).toHaveBeenCalledWith({ key: 'msg_compressed' });
    });

    it('should limit recall iterations', async () => {
      // Always return recall_detail to test iteration limit
      const recallResponse: LLMResponse = {
        content: '',
        toolCalls: [
          { name: 'recall_detail', arguments: { key: 'msg_1' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient(Array(10).fill(recallResponse));

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager,
        { maxRecallIterations: 3 }
      );

      await synthesizer.synthesize('Query', []);

      // Should stop after max iterations
      expect(vi.mocked(mockLLMClient.complete).mock.calls.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLMClient = {
        complete: vi.fn().mockRejectedValue(new Error('LLM API Error')),
        stream: vi.fn(),
      };

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      const result = await synthesizer.synthesize('Query', []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM API Error');
    });

    it('should emit error event on failure', async () => {
      mockLLMClient = {
        complete: vi.fn().mockRejectedValue(new Error('API Error')),
        stream: vi.fn(),
      };

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      await synthesizer.synthesize('Query', []);

      const emitCalls = vi.mocked(mockEventEmitter.emit).mock.calls;
      const errorEvent = emitCalls.find(call => call[0].type === 'synthesis_error');

      expect(errorEvent).toBeDefined();
    });
  });

  describe('Message Formatting', () => {
    it('should include key files in user prompt', async () => {
      const response: LLMResponse = {
        content: '## Report',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([response]);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      const keyFiles = ['handler.go', 'user.go', 'controller.go'];
      await synthesizer.synthesize('Query', [], keyFiles);

      const llmCalls = vi.mocked(mockLLMClient.complete).mock.calls;
      const messages = llmCalls[0][0] as Array<{ content: string }>;

      // User message should contain key files
      const userMessage = messages.find(m => m.content?.includes('关键文件'));
      expect(userMessage).toBeDefined();
    });

    it('should format investigation messages correctly', async () => {
      const response: LLMResponse = {
        content: '## Report',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([response]);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      const messages: SynthesisMessage[] = [
        { key: 'msg_1', role: 'user', content: 'User query', compressed: false },
        { key: 'msg_2', role: 'assistant', content: 'Assistant response', compressed: false },
        { key: 'msg_3', role: 'user', content: 'Tool result', toolName: 'read_file', compressed: false },
      ];

      await synthesizer.synthesize('Query', messages);

      const llmCalls = vi.mocked(mockLLMClient.complete).mock.calls;
      expect(llmCalls.length).toBe(1);
    });
  });

  describe('Token Usage', () => {
    it('should accumulate token usage across iterations', async () => {
      const responses: LLMResponse[] = [
        {
          content: '',
          toolCalls: [{ name: 'recall_detail', arguments: { key: 'msg_1' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '## Report',
          usage: { inputTokens: 200, outputTokens: 100 },
        },
      ];

      mockLLMClient = createMockLLMClient(responses);

      const synthesizer = new SynthesizerAgent(
        mockLLMClient,
        mockEventEmitter,
        mockContextManager
      );

      // Include compressed content to enable multiple iterations
      const messages: SynthesisMessage[] = [
        { key: 'msg_1', role: 'user', content: '[COMPRESSED] ...', compressed: true },
      ];

      const result = await synthesizer.synthesize('Query', messages);

      // Should sum tokens from all iterations
      expect(result.tokensUsed).toBe(450); // 100+50+200+100
    });
  });
});
