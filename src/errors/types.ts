/**
 * Error Types
 */

export type LLMErrorType =
  | 'rate_limit'
  | 'timeout'
  | 'service_unavailable'
  | 'invalid_request'
  | 'auth_error'
  | 'context_overflow'
  | 'unknown';

export type ToolErrorType =
  | 'not_found'
  | 'permission_denied'
  | 'timeout'
  | 'invalid_params'
  | 'execution_failed'
  | 'unknown';

export type AgentErrorType =
  | 'max_iterations'
  | 'stuck_loop'
  | 'budget_exceeded'
  | 'tool_error'
  | 'llm_error'
  | 'unknown';

/**
 * Base error class for Chibi
 */
export class ChibiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'ChibiError';
  }
}

/**
 * LLM-related errors
 */
export class LLMError extends ChibiError {
  constructor(
    message: string,
    public readonly type: LLMErrorType,
    retryAfter?: number
  ) {
    const recoverable = ['rate_limit', 'timeout', 'service_unavailable'].includes(type);
    super(message, `llm_${type}`, recoverable, retryAfter);
    this.name = 'LLMError';
  }
}

/**
 * Tool execution errors
 */
export class ToolError extends ChibiError {
  constructor(
    message: string,
    public readonly type: ToolErrorType,
    public readonly toolName: string,
    retryAfter?: number
  ) {
    const recoverable = ['timeout'].includes(type);
    super(message, `tool_${type}`, recoverable, retryAfter);
    this.name = 'ToolError';
  }
}

/**
 * Agent loop errors
 */
export class AgentError extends ChibiError {
  constructor(
    message: string,
    public readonly type: AgentErrorType,
    recoverable: boolean = false
  ) {
    super(message, `agent_${type}`, recoverable);
    this.name = 'AgentError';
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends ChibiError {
  constructor(message: string) {
    super(message, 'config_error', false);
    this.name = 'ConfigError';
  }
}

/**
 * Context management errors
 */
export class ContextError extends ChibiError {
  constructor(
    message: string,
    public readonly type: 'overflow' | 'storage' | 'compression' | 'recall'
  ) {
    super(message, `context_${type}`, type !== 'overflow');
    this.name = 'ContextError';
  }
}
