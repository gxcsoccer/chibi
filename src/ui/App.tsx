/**
 * Main Ink Application
 * 重构后的主应用组件，使用新的 UI 组件
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentEvent } from '../events/types.js';
import type { EventEmitter } from '../events/emitter.js';
import { Header } from './components/Header.js';
import { QueryDisplay } from './components/QueryDisplay.js';
import { StatusBar, type StatusType } from './components/StatusBar.js';
import { ToolCallTimeline } from './components/ToolCallTimeline.js';
import { ThinkingDisplay } from './components/ThinkingDisplay.js';
import { ResultDisplay } from './components/ResultDisplay.js';
import type { ToolCallItem } from './components/ToolCallCard.js';
import { nanoid } from 'nanoid';

export interface AppProps {
  query: string;
  eventEmitter: EventEmitter;
  verbose?: boolean;
  onComplete?: (result: string) => void;
  onError?: (error: Error) => void;
}

interface AppState {
  status: StatusType;
  iteration: number;
  maxIterations: number;
  thinking: string;
  result?: string;
  error?: string;
  currentToolId?: string;
}

export function App({ query, eventEmitter, verbose = false, onComplete, onError }: AppProps) {
  const { exit } = useApp();
  const toolCallMapRef = useRef<Map<string, ToolCallItem>>(new Map());
  const currentToolIdRef = useRef<string | undefined>(undefined);
  const toolCallsVersionRef = useRef<number>(0);
  
  const [state, setState] = useState<AppState>({
    status: 'idle',
    iteration: 0,
    maxIterations: 20,
    thinking: '',
  });
  
  // 单独管理 toolCalls，只在真正变化时更新
  const [toolCallsVersion, setToolCallsVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = eventEmitter.subscribe((event: AgentEvent) => {
      handleEvent(event);
    });

    return () => unsubscribe();
  }, [eventEmitter]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const handleEvent = (event: AgentEvent) => {
    switch (event.type) {
      case 'session_start':
        setState(s => ({
          ...s,
          status: 'thinking',
        }));
        break;

      case 'iteration_start':
        setState(s => ({
          ...s,
          iteration: event.iteration,
          maxIterations: event.maxIterations,
          status: 'thinking',
        }));
        break;

      case 'thinking':
        // 在 tool_call 状态时，完全忽略 thinking 事件，避免触发重新渲染
        setState(s => {
          // 如果当前是 tool_call 状态，完全忽略 thinking 事件
          if (s.status === 'tool_call') {
            return s; // 返回相同对象，React 会完全跳过重新渲染
          }
          
          // 如果内容相同，也不更新
          if (s.thinking === event.content) {
            return s;
          }
          
          // 只在非 tool_call 状态时更新 thinking
          return {
            ...s,
            thinking: event.content,
            status: 'thinking',
          };
        });
        break;

      case 'tool_call': {
        const toolCallId = nanoid();
        const toolCall: ToolCallItem = {
          id: toolCallId,
          name: event.name,
          arguments: event.arguments,
          status: 'running',
        };
        
        toolCallMapRef.current.set(toolCallId, toolCall);
        currentToolIdRef.current = toolCallId;
        
        // 更新版本号，触发 toolCalls 重新渲染
        toolCallsVersionRef.current += 1;
        setToolCallsVersion(toolCallsVersionRef.current);
        
        setState(s => ({
          ...s,
          status: 'tool_call',
          currentToolId: toolCallId,
        }));
        break;
      }

      case 'tool_result': {
        // 找到最后一个状态为 'running' 的同名工具调用
        let toolCallId = currentToolIdRef.current;
        if (!toolCallId) {
          // 如果没有 currentToolId，尝试找到最后一个 running 状态的同名工具
          const runningCalls = Array.from(toolCallMapRef.current.entries())
            .filter(([_, call]) => call.name === event.name && call.status === 'running');
          if (runningCalls.length > 0) {
            toolCallId = runningCalls[runningCalls.length - 1][0];
          }
        }
        
        if (toolCallId && toolCallMapRef.current.has(toolCallId)) {
          const toolCall = toolCallMapRef.current.get(toolCallId)!;
          toolCall.status = event.result.success ? 'completed' : 'failed';
          toolCall.duration = event.duration;
          toolCall.result = {
            success: event.result.success,
            output: event.result.output,
            error: event.result.error,
          };
          toolCallMapRef.current.set(toolCallId, toolCall);
        }
        
        currentToolIdRef.current = undefined;
        
        // 更新版本号，触发 toolCalls 重新渲染
        toolCallsVersionRef.current += 1;
        setToolCallsVersion(toolCallsVersionRef.current);
        
        setState(s => ({
          ...s,
          status: 'thinking',
          currentToolId: undefined,
        }));
        break;
      }

      case 'done':
        setState(s => ({
          ...s,
          status: 'completed',
          result: event.result,
        }));
        onComplete?.(event.result);
        break;

      case 'error':
        setState(s => ({
          ...s,
          status: 'error',
          error: event.error.message,
        }));
        onError?.(event.error);
        break;

      case 'iteration_end':
        // 迭代结束，状态已经在 thinking 或 tool_call 中更新
        break;

      case 'session_end':
        // Session 结束，最终状态由 done 或 error 事件处理
        break;

      case 'stream_text':
        // 流式文本输出，可以用于实时显示结果
        // 目前由 done 事件统一处理最终结果
        break;

      case 'delegate':
      case 'delegate_result':
        // 委托事件，可以用于未来扩展
        break;

      case 'compression':
      case 'recall':
      case 'budget_warning':
      case 'messages_discarded':
        // 这些事件可以用于未来扩展，暂时不显示
        break;

      // Orchestrator events
      case 'phase_start':
      case 'phase_end':
      case 'synthesis_start':
      case 'synthesis_complete':
      case 'synthesis_error':
      case 'orchestrator_start':
      case 'orchestrator_complete':
      case 'orchestrator_error':
        // Orchestrator 事件，可以用于未来扩展
        break;

      default: {
        // 处理所有其他事件类型，确保类型安全
        const _exhaustive: never = event;
        break;
      }
    }
  };

  const getCurrentTool = (): string | undefined => {
    if (state.currentToolId) {
      const toolCall = toolCallMapRef.current.get(state.currentToolId);
      return toolCall?.name;
    }
    return undefined;
  };

  // 使用 useMemo 稳定 toolCalls 数组引用，只在版本号变化时重新计算
  const toolCalls = useMemo(() => {
    return Array.from(toolCallMapRef.current.values());
  }, [toolCallsVersion]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with Logo */}
      <Header />
      
      {/* Query Display */}
      <QueryDisplay query={query} />
      
      {/* Status Bar */}
      <StatusBar
        status={state.status}
        iteration={state.iteration}
        maxIterations={state.maxIterations}
        currentTool={getCurrentTool()}
        error={state.error}
      />
      
      {/* Thinking Display */}
      {state.status === 'thinking' && (
        <ThinkingDisplay thinking={state.thinking} visible={true} />
      )}
      
      {/* Tool Calls Timeline */}
      {toolCalls.length > 0 && (
        <ToolCallTimeline toolCalls={toolCalls} verbose={verbose} />
      )}
      
      {/* Result Display */}
      {state.status === 'completed' && state.result && (
        <ResultDisplay result={state.result} />
      )}
    </Box>
  );
}
