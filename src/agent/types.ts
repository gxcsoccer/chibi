/**
 * Agent Types
 */

import type { Session, SynthesisMessage } from '../context/types.js';

/**
 * Agent decision types
 */
export type AgentDecision =
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'delegate'; agent: string; task: string }
  | { type: 'done'; result: string }
  | { type: 'thinking'; content: string }
  | { type: 'invalid_tool_call'; content: string; detectedToolName?: string }
  | { type: 'requires_self_check'; content: string };

/**
 * Agent state
 */
export interface AgentState {
  iteration: number;
  maxIterations: number;
  decisions: AgentDecision[];
  thinking: string[];
  status: 'running' | 'completed' | 'error' | 'stuck';
  stuckCount: number;
  lastToolResults: Map<string, string>;
}

/**
 * Agent loop configuration
 */
export interface AgentLoopConfig {
  maxIterations: number;
  stuckThreshold: number; // Number of same decisions before considered stuck
  enableThinking: boolean;
  thinkingBudget: number;
}

/**
 * Expert agent definition
 */
export interface ExpertAgent {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // Tool names this agent can use
  expertAgents?: string[]; // Sub-agents it can delegate to
}

/**
 * Agent iteration result
 */
export interface IterationResult {
  decision: AgentDecision;
  thinking?: string;
  toolResult?: {
    name: string;
    output: string;
    success: boolean;
  };
  tokensUsed: number;
}

/**
 * Agent run result
 */
export interface AgentRunResult {
  success: boolean;
  result: string;
  iterations: number;
  totalTokensUsed: number;
  decisions: AgentDecision[];
  error?: string;
}

/**
 * Investigation result - raw findings from investigator
 */
export interface InvestigationResult {
  success: boolean;
  findings: string;                  // Raw findings from investigation
  keyFiles: string[];                // Key files discovered
  messages: SynthesisMessage[];      // Filtered messages for synthesis
  iterations: number;
  totalTokensUsed: number;
  decisions: AgentDecision[];
  error?: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  maxInvestigationIterations: number;
  enableThinking: boolean;
  thinkingBudget: number;
}

/**
 * Command definition
 */
export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];

  agent: {
    systemPrompt: string;
    tools: string[];
    expertAgents?: string[];
  };

  workflow?: {
    preProcess?: (query: string, session: Session) => Promise<string>;
    postProcess?: (result: string, session: Session) => Promise<string>;
  };
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  loop: AgentLoopConfig;
  experts: Record<string, ExpertAgent>;
}

/**
 * Default agent loop configuration
 */
export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxIterations: 20,
  stuckThreshold: 3,
  enableThinking: false,
  thinkingBudget: 32768,
};
