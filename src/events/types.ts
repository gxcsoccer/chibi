/**
 * Event Types
 */

import type { AgentDecision } from '../agent/types.js';
import type { ToolResult } from '../tools/types.js';
import type { BudgetState } from '../context/types.js';

/**
 * All event types emitted by the agent
 */
export type AgentEvent =
  | SessionStartEvent
  | SessionEndEvent
  | IterationStartEvent
  | IterationEndEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | DelegateEvent
  | DelegateResultEvent
  | DoneEvent
  | ErrorEvent
  | BudgetWarningEvent
  | CompressionEvent
  | RecallEvent
  | MessagesDiscardedEvent
  | StreamTextEvent
  | PhaseStartEvent
  | PhaseEndEvent
  | SynthesisStartEvent
  | SynthesisCompleteEvent
  | SynthesisErrorEvent
  | OrchestratorStartEvent
  | OrchestratorCompleteEvent
  | OrchestratorErrorEvent;

export interface SessionStartEvent {
  type: 'session_start';
  sessionId: string;
  query: string;
  timestamp: number;
}

export interface SessionEndEvent {
  type: 'session_end';
  sessionId: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
  tokensUsed: number;
}

export interface IterationStartEvent {
  type: 'iteration_start';
  iteration: number;
  maxIterations: number;
  budget: BudgetState;
}

export interface IterationEndEvent {
  type: 'iteration_end';
  iteration: number;
  decision: AgentDecision;
  tokensUsed: number;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
  streaming: boolean;
}

export interface ToolCallEvent {
  type: 'tool_call';
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: 'tool_result';
  name: string;
  result: ToolResult;
  duration: number;
}

export interface DelegateEvent {
  type: 'delegate';
  agent: string;
  task: string;
}

export interface DelegateResultEvent {
  type: 'delegate_result';
  agent: string;
  result: string;
  success: boolean;
}

export interface DoneEvent {
  type: 'done';
  result: string;
}

export interface ErrorEvent {
  type: 'error';
  error: Error;
  recoverable: boolean;
  retrying: boolean;
}

export interface BudgetWarningEvent {
  type: 'budget_warning';
  used: number;
  available: number;
  threshold: number;
}

export interface CompressionEvent {
  type: 'compression';
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
}

export interface RecallEvent {
  type: 'recall';
  key: string;
  success: boolean;
  tokensRecalled: number;
}

export interface MessagesDiscardedEvent {
  type: 'messages_discarded';
  count: number;
  tokensFreed: number;
}

export interface StreamTextEvent {
  type: 'stream_text';
  content: string;
}

// Orchestrator events

export interface PhaseStartEvent {
  type: 'phase_start';
  phase: 'investigation' | 'synthesis';
  timestamp: number;
}

export interface PhaseEndEvent {
  type: 'phase_end';
  phase: 'investigation' | 'synthesis';
  success: boolean;
  iterations?: number;
  tokensUsed: number;
}

export interface SynthesisStartEvent {
  type: 'synthesis_start';
  timestamp: number;
}

export interface SynthesisCompleteEvent {
  type: 'synthesis_complete';
  duration: number;
  tokensUsed: number;
}

export interface SynthesisErrorEvent {
  type: 'synthesis_error';
  error: Error;
  duration: number;
}

export interface OrchestratorStartEvent {
  type: 'orchestrator_start';
  query: string;
  timestamp: number;
}

export interface OrchestratorCompleteEvent {
  type: 'orchestrator_complete';
  duration: number;
  iterations: number;
  tokensUsed: number;
}

export interface OrchestratorErrorEvent {
  type: 'orchestrator_error';
  error: Error;
  duration: number;
}

/**
 * Event handler type
 */
export type EventHandler = (event: AgentEvent) => void;
