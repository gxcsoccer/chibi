/**
 * Investigator Agent Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestigatorAgent } from '../../src/agent/investigator.js';
import type { LLMClient, LLMResponse } from '../../src/llm/types.js';
import type { ContextManager } from '../../src/context/manager.js';
import type { EventEmitter } from '../../src/events/emitter.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { Tool } from '../../src/tools/types.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock tokens utility
vi.mock('../../src/utils/tokens.js', () => ({
  estimateTokens: () => 100,
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
    addMessage: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockReturnValue([]),
    getMessagesForLLM: vi.fn().mockReturnValue([]),
    getMessagesForSynthesis: vi.fn().mockReturnValue([]),
    setSystemPromptTokens: vi.fn(),
    getBudget: vi.fn().mockReturnValue({ used: 0, total: 100000, remaining: 100000 }),
    saveLLMTurn: vi.fn().mockResolvedValue(undefined),
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

/**
 * Create a mock tool registry with think tool
 */
function createMockToolRegistry(): ToolRegistry {
  const thinkTool: Tool = {
    name: 'think',
    description: 'Think through a problem',
    parameters: {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'Your thought' },
      },
      required: ['thought'],
    },
    execute: vi.fn().mockResolvedValue({ success: true, output: 'Thinking recorded.' }),
  };

  const readFileTool: Tool = {
    name: 'read_file',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
    execute: vi.fn().mockResolvedValue({ success: true, output: 'File content...' }),
  };

  const registry = new ToolRegistry();
  registry.register(thinkTool);
  registry.register(readFileTool);
  return registry;
}

describe('InvestigatorAgent', () => {
  let mockLLMClient: LLMClient;
  let mockContextManager: ContextManager;
  let mockEventEmitter: EventEmitter;
  let mockToolRegistry: ToolRegistry;

  beforeEach(() => {
    mockContextManager = createMockContextManager();
    mockEventEmitter = createMockEventEmitter();
    mockToolRegistry = createMockToolRegistry();
  });

  describe('Stuck Loop Detection', () => {
    it('should detect stuck state when same tool is called repeatedly', async () => {
      // Create responses that repeat the same tool call
      const repeatedToolCall = {
        content: '',
        toolCalls: [
          { name: 'read_file', arguments: { path: 'test.go' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      // After stuck detection, model should change behavior
      const changedResponse = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Findings\nTest complete',
        toolCalls: [
          { name: 'think', arguments: { thought: 'Self check...' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const doneResponse = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Findings\nTest complete',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([
        repeatedToolCall,
        repeatedToolCall,
        repeatedToolCall, // This should trigger stuck detection
        changedResponse,  // After feedback, model uses think
        doneResponse,     // Then completes
      ]);

      // Mock tool execution to fail (simulating non-existent file)
      const readFileTool = mockToolRegistry.get('read_file')!;
      vi.mocked(readFileTool.execute).mockResolvedValue({
        success: false,
        output: 'File not found',
      });

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter,
        { stuckThreshold: 3 }
      );

      await agent.investigate('Test query');

      // Check that stuck feedback message was added
      const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
      const stuckMessage = addMessageCalls.find(
        call => call[0].content?.includes('检测到循环')
      );
      expect(stuckMessage).toBeDefined();
    });

    it('should not detect stuck state if tool arguments differ', async () => {
      const responses = [
        {
          content: '',
          toolCalls: [{ name: 'read_file', arguments: { path: 'file1.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '',
          toolCalls: [{ name: 'read_file', arguments: { path: 'file2.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '',
          toolCalls: [{ name: 'read_file', arguments: { path: 'file3.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '[INVESTIGATION_COMPLETE]\n\nFindings here',
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      ];

      mockLLMClient = createMockLLMClient(responses);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter,
        { stuckThreshold: 3 }
      );

      await agent.investigate('Test query');

      // Check that no stuck feedback message was added
      const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
      const stuckMessage = addMessageCalls.find(
        call => call[0].content?.includes('检测到循环')
      );
      expect(stuckMessage).toBeUndefined();
    });
  });

  describe('Self-Check Requirement', () => {
    it('should require think tool before completing investigation', async () => {
      // First response tries to complete without think
      const directComplete = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Findings\nNo self check done',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      // After feedback, uses think then completes
      const thinkResponse = {
        content: '',
        toolCalls: [
          { name: 'think', arguments: { thought: 'Self check: verified' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const finalComplete = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Findings\nWith self check',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([
        directComplete,  // Should trigger requires_self_check
        thinkResponse,   // Uses think
        finalComplete,   // Now can complete
      ]);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      const result = await agent.investigate('Test query');

      // Check that self-check requirement message was added
      const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
      const selfCheckMessage = addMessageCalls.find(
        call => call[0].content?.includes('必须先完成自检才能结束调查')
      );
      expect(selfCheckMessage).toBeDefined();

      // Investigation should eventually succeed
      expect(result.success).toBe(true);
    });

    it('should allow completion after think tool is used', async () => {
      const thinkFirst = {
        content: '',
        toolCalls: [
          { name: 'think', arguments: { thought: 'Self check: all verified' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const complete = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Findings\nCompleted with self check',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([thinkFirst, complete]);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      const result = await agent.investigate('Test query');

      // Check that no self-check requirement message was added
      const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
      const selfCheckMessage = addMessageCalls.find(
        call => call[0].content?.includes('必须先完成自检才能结束调查')
      );
      expect(selfCheckMessage).toBeUndefined();

      expect(result.success).toBe(true);
      expect(result.findings).toContain('Completed with self check');
    });
  });

  describe('Decision Parsing', () => {
    it('should parse tool_call decision correctly', async () => {
      const toolCallResponse = {
        content: '',
        toolCalls: [
          { name: 'read_file', arguments: { path: 'test.go' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const doneResponse = {
        content: '',
        toolCalls: [
          { name: 'think', arguments: { thought: 'Self check' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const finalResponse = {
        content: '[INVESTIGATION_COMPLETE]\n\nDone',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([toolCallResponse, doneResponse, finalResponse]);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      const result = await agent.investigate('Test query');

      // Should have recorded the tool call decision
      expect(result.decisions.some(d => d.type === 'tool_call' && d.name === 'read_file')).toBe(true);
    });

    it('should parse done decision when INVESTIGATION_COMPLETE is present after think', async () => {
      const thinkResponse = {
        content: '',
        toolCalls: [
          { name: 'think', arguments: { thought: 'Self check completed' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const doneResponse = {
        content: '[INVESTIGATION_COMPLETE]\n\n## Summary\nInvestigation complete.',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockLLMClient = createMockLLMClient([thinkResponse, doneResponse]);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      const result = await agent.investigate('Test query');

      expect(result.success).toBe(true);
      expect(result.decisions.some(d => d.type === 'done')).toBe(true);
    });
  });

  describe('Max Iterations', () => {
    it('should stop after max iterations and return partial findings', async () => {
      // Create responses that never complete
      const infiniteToolCalls = Array(25).fill(null).map((_, i) => ({
        content: '',
        toolCalls: [
          { name: 'read_file', arguments: { path: `file${i}.go` } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      }));

      mockLLMClient = createMockLLMClient(infiniteToolCalls);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter,
        { maxIterations: 5 }
      );

      const result = await agent.investigate('Test query');

      expect(result.success).toBe(true); // Still succeeds with partial findings
      expect(result.iterations).toBe(5);
    });
  });

  describe('Event Emission', () => {
    it('should emit iteration_start and iteration_end events', async () => {
      const responses = [
        {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      ];

      mockLLMClient = createMockLLMClient(responses);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      await agent.investigate('Test query');

      const emitCalls = vi.mocked(mockEventEmitter.emit).mock.calls;

      // Check for iteration events
      const iterationStartEvents = emitCalls.filter(call => call[0].type === 'iteration_start');
      const iterationEndEvents = emitCalls.filter(call => call[0].type === 'iteration_end');

      expect(iterationStartEvents.length).toBeGreaterThan(0);
      expect(iterationEndEvents.length).toBeGreaterThan(0);
    });

    it('should emit done event when investigation completes', async () => {
      const responses = [
        {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: '[INVESTIGATION_COMPLETE]\n\nFindings here',
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      ];

      mockLLMClient = createMockLLMClient(responses);

      const agent = new InvestigatorAgent(
        mockLLMClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter
      );

      await agent.investigate('Test query');

      const emitCalls = vi.mocked(mockEventEmitter.emit).mock.calls;
      const doneEvent = emitCalls.find(call => call[0].type === 'done');

      expect(doneEvent).toBeDefined();
    });
  });

  describe('Abort Handling', () => {
    it('should stop investigation when aborted', async () => {
      let callCount = 0;

      // Create a mock that delays responses and tracks call count
      const mockClient: LLMClient = {
        complete: vi.fn().mockImplementation(async () => {
          callCount++;
          // Delay to allow abort to happen
          await new Promise(resolve => setTimeout(resolve, 20));
          return {
            content: '',
            toolCalls: [{ name: 'read_file', arguments: { path: `file${callCount}.go` } }],
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }),
        stream: vi.fn(),
      };

      const agent = new InvestigatorAgent(
        mockClient,
        mockContextManager,
        mockToolRegistry,
        mockEventEmitter,
        { maxIterations: 20 }
      );

      // Abort after first iteration completes
      setTimeout(() => agent.abort(), 50);

      // Start investigation
      const result = await agent.investigate('Test query');

      // Should have stopped before max iterations
      expect(result.iterations).toBeLessThan(20);
    });
  });

  describe('Hallucination Detection', () => {
    describe('Pattern Detection - </user> tag', () => {
      it('should detect hallucination with </user> tag and no tool calls', async () => {
        const hallucinatedResponse = {
          content: `调用 ripgrep 工具

我需要搜索相关代码。

</user>
工具 "ripgrep" 执行成功:

Found 5 matches...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        // After hallucination feedback, model should use proper tool call
        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        // Check that hallucination warning message was added
        const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
        const hallucinationWarning = addMessageCalls.find(
          call => call[0].content?.includes('检测到幻觉内容')
        );
        expect(hallucinationWarning).toBeDefined();

        // Check that hallucination_detected decision was recorded
        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });

      it('should save only cleaned content before hallucination marker', async () => {
        const hallucinatedResponse = {
          content: `这是有效的分析内容。

让我继续调查。

</user>
工具执行成功，这是虚假的结果...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        await agent.investigate('Test query');

        // Check that cleaned content was saved (without hallucination)
        const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
        const assistantMessages = addMessageCalls.filter(call => call[0].role === 'assistant');

        // Find the message that should contain only cleaned content
        const cleanedMessage = assistantMessages.find(
          call => call[0].content?.includes('这是有效的分析内容')
        );

        // Verify the hallucinated part is not in any assistant message
        const hasHallucination = assistantMessages.some(
          call => call[0].content?.includes('工具执行成功，这是虚假的结果')
        );

        expect(cleanedMessage).toBeDefined();
        expect(hasHallucination).toBe(false);
      });
    });

    describe('Pattern Detection - Chinese tool execution', () => {
      it('should detect hallucination with Chinese tool execution pattern', async () => {
        const hallucinatedResponse = {
          content: `分析代码...

工具 "read_file" 执行成功:

File: src/main.go
Lines: 1-50
...虚假内容...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        // Check that hallucination_detected decision was recorded
        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });

      it('should detect hallucination with tool execution failure pattern', async () => {
        const hallucinatedResponse = {
          content: `尝试读取文件...

工具 "read_file" 执行失败:

Error: File not found`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });
    });

    describe('Pattern Detection - English tool execution', () => {
      it('should detect hallucination with English tool executed pattern', async () => {
        const hallucinatedResponse = {
          content: `Analyzing code...

Tool "ripgrep" executed successfully:

Found 10 matches...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });

      it('should detect hallucination with Tool completed pattern', async () => {
        const hallucinatedResponse = {
          content: `Reading file...

Tool "read_file" completed:

Content here...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });
    });

    describe('Pattern Detection - File content header', () => {
      it('should detect hallucination with fake file content header', async () => {
        const hallucinatedResponse = {
          content: `File: src/main.go
Lines: 1-50
────────────────────
package main

func main() {
    // fake content
}`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          hallucinatedResponse,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(true);
      });
    });

    describe('No Hallucination', () => {
      it('should not detect hallucination in normal content', async () => {
        const normalResponse = {
          content: `我正在分析代码结构。

这个项目使用了 Go 语言。

让我继续调查更多细节。`,
          toolCalls: [{ name: 'read_file', arguments: { path: 'main.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const thinkResponse = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          normalResponse,
          thinkResponse,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        const result = await agent.investigate('Test query');

        // Should not have hallucination_detected decision
        expect(result.decisions.some(d => d.type === 'hallucination_detected')).toBe(false);

        // Should have normal tool_call decisions
        expect(result.decisions.some(d => d.type === 'tool_call')).toBe(true);
      });
    });

    describe('Hallucination with Valid Tool Calls', () => {
      it('should clean hallucinated content even when valid tool calls exist', async () => {
        // This simulates the case where LLM returns both valid tool calls AND hallucinated content
        const responseWithBothToolCallAndHallucination = {
          content: `我将搜索相关代码...

</user>
工具 "ripgrep" 执行成功:

Found 5 matches in fake results...`,
          toolCalls: [{ name: 'read_file', arguments: { path: 'real_file.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const thinkResponse = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          responseWithBothToolCallAndHallucination,
          thinkResponse,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        await agent.investigate('Test query');

        // Check that the hallucinated content was NOT saved to conversation
        const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
        const hasHallucinatedContent = addMessageCalls.some(
          call => call[0].content?.includes('Found 5 matches in fake results')
        );

        expect(hasHallucinatedContent).toBe(false);

        // Check that clean content was saved
        const hasCleanContent = addMessageCalls.some(
          call => call[0].content?.includes('我将搜索相关代码') &&
                  !call[0].content?.includes('</user>')
        );

        expect(hasCleanContent).toBe(true);
      });

      it('should use fallback description when content is entirely hallucinated', async () => {
        // Content starts with hallucination marker
        const entirelyHallucinatedResponse = {
          content: `</user>
工具 "ripgrep" 执行成功:

Fake results...`,
          toolCalls: [{ name: 'read_file', arguments: { path: 'file.go' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const thinkResponse = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          entirelyHallucinatedResponse,
          thinkResponse,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        await agent.investigate('Test query');

        // Check that fallback description was used
        const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
        const hasFallback = addMessageCalls.some(
          call => call[0].role === 'assistant' &&
                  call[0].content?.includes('调用 read_file 工具')
        );

        expect(hasFallback).toBe(true);
      });
    });

    describe('Multiple Hallucination Patterns', () => {
      it('should detect first hallucination pattern in content with multiple patterns', async () => {
        const multiPatternHallucination = {
          content: `分析开始...

</user>
工具 "ripgrep" 执行成功:

File: src/main.go
Lines: 1-50

工具 "read_file" 执行成功:

More fake content...`,
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const properToolCall = {
          content: '',
          toolCalls: [{ name: 'think', arguments: { thought: 'Self check' } }],
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        const doneResponse = {
          content: '[INVESTIGATION_COMPLETE]\n\nDone',
          usage: { inputTokens: 100, outputTokens: 50 },
        };

        mockLLMClient = createMockLLMClient([
          multiPatternHallucination,
          properToolCall,
          doneResponse,
        ]);

        const agent = new InvestigatorAgent(
          mockLLMClient,
          mockContextManager,
          mockToolRegistry,
          mockEventEmitter
        );

        await agent.investigate('Test query');

        // Check that only content before first pattern was saved
        const addMessageCalls = vi.mocked(mockContextManager.addMessage).mock.calls;
        const cleanedMessages = addMessageCalls.filter(
          call => call[0].role === 'assistant' && call[0].content?.includes('分析开始')
        );

        expect(cleanedMessages.length).toBeGreaterThan(0);

        // Verify none of the hallucinated content was saved
        const hasHallucination = addMessageCalls.some(
          call => call[0].content?.includes('工具 "ripgrep" 执行成功')
        );
        expect(hasHallucination).toBe(false);
      });
    });
  });
});
