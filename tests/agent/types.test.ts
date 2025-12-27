/**
 * Agent Types Tests
 */

import { describe, it, expect } from 'vitest';
import type { AgentDecision } from '../../src/agent/types.js';

describe('Agent Types', () => {
  describe('AgentDecision', () => {
    it('should support tool_call decision', () => {
      const decision: AgentDecision = {
        type: 'tool_call',
        name: 'read_file',
        arguments: { path: 'test.go' },
      };

      expect(decision.type).toBe('tool_call');
      expect(decision.name).toBe('read_file');
      expect(decision.arguments).toEqual({ path: 'test.go' });
    });

    it('should support delegate decision', () => {
      const decision: AgentDecision = {
        type: 'delegate',
        agent: 'synthesizer',
        task: 'Summarize findings',
      };

      expect(decision.type).toBe('delegate');
      expect(decision.agent).toBe('synthesizer');
      expect(decision.task).toBe('Summarize findings');
    });

    it('should support done decision', () => {
      const decision: AgentDecision = {
        type: 'done',
        result: 'Investigation complete',
      };

      expect(decision.type).toBe('done');
      expect(decision.result).toBe('Investigation complete');
    });

    it('should support thinking decision', () => {
      const decision: AgentDecision = {
        type: 'thinking',
        content: 'Let me analyze this...',
      };

      expect(decision.type).toBe('thinking');
      expect(decision.content).toBe('Let me analyze this...');
    });

    it('should support invalid_tool_call decision', () => {
      const decision: AgentDecision = {
        type: 'invalid_tool_call',
        content: 'I will use read_file tool...',
        detectedToolName: 'read_file',
      };

      expect(decision.type).toBe('invalid_tool_call');
      expect(decision.content).toContain('read_file');
      expect(decision.detectedToolName).toBe('read_file');
    });

    it('should support requires_self_check decision', () => {
      const decision: AgentDecision = {
        type: 'requires_self_check',
        content: '[INVESTIGATION_COMPLETE]\n\nFindings without self check',
      };

      expect(decision.type).toBe('requires_self_check');
      expect(decision.content).toContain('[INVESTIGATION_COMPLETE]');
    });

    it('should allow type narrowing with switch statement', () => {
      const decisions: AgentDecision[] = [
        { type: 'tool_call', name: 'read_file', arguments: {} },
        { type: 'done', result: 'Complete' },
        { type: 'requires_self_check', content: 'No self check' },
      ];

      for (const decision of decisions) {
        switch (decision.type) {
          case 'tool_call':
            expect(decision.name).toBeDefined();
            break;
          case 'done':
            expect(decision.result).toBeDefined();
            break;
          case 'requires_self_check':
            expect(decision.content).toBeDefined();
            break;
          default:
            // Other types are valid but not tested here
            break;
        }
      }
    });
  });
});
