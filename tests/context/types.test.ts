/**
 * Context Types Tests
 */

import { describe, it, expect } from 'vitest';
import type { LLMTurn, SynthesisMessage, ChatMessage } from '../../src/context/types.js';

describe('Context Types', () => {
  describe('LLMTurn', () => {
    it('should support all decision types including requires_self_check', () => {
      const turnWithToolCall: LLMTurn = {
        turn: 1,
        timestamp: Date.now(),
        duration: 1000,
        input: {
          systemPrompt: 'Test prompt',
          messages: [{ role: 'user', content: 'Test' }],
        },
        output: {
          content: '',
        },
        decision: {
          type: 'tool_call',
          name: 'read_file',
          arguments: { path: 'test.go' },
        },
      };

      const turnWithDone: LLMTurn = {
        turn: 2,
        timestamp: Date.now(),
        duration: 1000,
        input: {
          systemPrompt: 'Test prompt',
          messages: [],
        },
        output: {
          content: '[INVESTIGATION_COMPLETE]',
        },
        decision: {
          type: 'done',
          result: 'Complete',
        },
      };

      const turnWithSelfCheck: LLMTurn = {
        turn: 3,
        timestamp: Date.now(),
        duration: 1000,
        input: {
          systemPrompt: 'Test prompt',
          messages: [],
        },
        output: {
          content: '[INVESTIGATION_COMPLETE] without self check',
        },
        decision: {
          type: 'requires_self_check',
          result: 'Self check required',
        },
      };

      expect(turnWithToolCall.decision.type).toBe('tool_call');
      expect(turnWithDone.decision.type).toBe('done');
      expect(turnWithSelfCheck.decision.type).toBe('requires_self_check');
    });

    it('should support all agent types', () => {
      const investigatorTurn: LLMTurn = {
        agent: 'investigator',
        turn: 1,
        timestamp: Date.now(),
        duration: 1000,
        input: { systemPrompt: '', messages: [] },
        output: { content: '' },
        decision: { type: 'done', result: '' },
      };

      const synthesizerTurn: LLMTurn = {
        agent: 'synthesizer',
        turn: 1,
        timestamp: Date.now(),
        duration: 1000,
        input: { systemPrompt: '', messages: [] },
        output: { content: '' },
        decision: { type: 'done', result: '' },
      };

      expect(investigatorTurn.agent).toBe('investigator');
      expect(synthesizerTurn.agent).toBe('synthesizer');
    });

    it('should support optional fields', () => {
      const minimalTurn: LLMTurn = {
        turn: 1,
        timestamp: Date.now(),
        duration: 1000,
        input: {
          systemPrompt: 'Test',
          messages: [],
        },
        output: {
          content: 'Response',
        },
        decision: {
          type: 'done',
          result: 'Complete',
        },
      };

      expect(minimalTurn.agent).toBeUndefined();
      expect(minimalTurn.usage).toBeUndefined();
      expect(minimalTurn.toolResult).toBeUndefined();
      expect(minimalTurn.output.thinking).toBeUndefined();
    });

    it('should support full turn with all fields', () => {
      const fullTurn: LLMTurn = {
        agent: 'investigator',
        turn: 1,
        timestamp: Date.now(),
        duration: 1000,
        input: {
          systemPrompt: 'System prompt',
          messages: [
            { role: 'user', content: 'Query', key: 'msg_1' },
            { role: 'assistant', content: 'Response', compressed: false },
          ],
          tools: [
            { name: 'read_file', description: 'Read a file' },
          ],
        },
        output: {
          content: 'LLM response',
          thinking: 'Internal thinking',
          toolCalls: [
            { name: 'read_file', arguments: { path: 'test.go' } },
          ],
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheHit: true,
          cachedTokens: 80,
        },
        decision: {
          type: 'tool_call',
          name: 'read_file',
          arguments: { path: 'test.go' },
        },
        toolResult: {
          name: 'read_file',
          success: true,
          output: 'File content...',
          duration: 50,
        },
      };

      expect(fullTurn.agent).toBe('investigator');
      expect(fullTurn.input.tools).toHaveLength(1);
      expect(fullTurn.output.toolCalls).toHaveLength(1);
      expect(fullTurn.usage?.cacheHit).toBe(true);
      expect(fullTurn.toolResult?.success).toBe(true);
    });
  });

  describe('SynthesisMessage', () => {
    it('should support user and assistant roles', () => {
      const userMessage: SynthesisMessage = {
        key: 'msg_1',
        role: 'user',
        content: 'User query',
        compressed: false,
      };

      const assistantMessage: SynthesisMessage = {
        key: 'msg_2',
        role: 'assistant',
        content: 'Assistant response',
        compressed: true,
      };

      expect(userMessage.role).toBe('user');
      expect(assistantMessage.role).toBe('assistant');
    });

    it('should support optional tool name and source', () => {
      const messageWithTool: SynthesisMessage = {
        key: 'msg_1',
        role: 'user',
        content: 'Tool result',
        toolName: 'read_file',
        source: 'plugins/admin/models/user.go',
        compressed: false,
      };

      expect(messageWithTool.toolName).toBe('read_file');
      expect(messageWithTool.source).toBe('plugins/admin/models/user.go');
    });
  });

  describe('ChatMessage', () => {
    it('should support all message roles', () => {
      const userMsg: ChatMessage = {
        role: 'user',
        content: 'Question',
      };

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: 'Answer',
      };

      const systemMsg: ChatMessage = {
        role: 'system',
        content: 'System instruction',
      };

      expect(userMsg.role).toBe('user');
      expect(assistantMsg.role).toBe('assistant');
      expect(systemMsg.role).toBe('system');
    });

    it('should support optional metadata', () => {
      const msgWithMetadata: ChatMessage = {
        role: 'user',
        content: 'Query',
        key: 'msg_unique',
        metadata: {
          compressible: false,
          source: 'user_input',
          tokens: 10,
        },
      };

      expect(msgWithMetadata.key).toBe('msg_unique');
      expect(msgWithMetadata.metadata?.compressible).toBe(false);
    });
  });
});
