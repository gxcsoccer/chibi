/**
 * Chibi - Agentic Code Search CLI
 */

// Export types
export type { LLMConfig, LLMClient, LLMMessage, LLMProvider, LLMResponse } from './llm/types.js';
export type { ChatMessage, Session, BudgetConfig, BudgetState, RecallRequest, RecallResult, SynthesisMessage } from './context/types.js';
export type { Tool, ToolContext, ToolResult, ToolParameter } from './tools/types.js';
export type { AgentState, AgentLoopConfig, AgentDecision, AgentRunResult, InvestigationResult, OrchestratorConfig } from './agent/types.js';
export type { AgentEvent, EventHandler } from './events/types.js';
export type { ChibiConfig } from './utils/config.js';

// Export errors
export { ChibiError, LLMError, ToolError, AgentError, ConfigError, ContextError } from './errors/types.js';

// Export LLM clients
export { createLLMClient, getDefaultLLMConfig } from './llm/client.js';
export { VolcengineClient } from './llm/providers/volcengine.js';
export { AnthropicClient } from './llm/providers/anthropic.js';
export { OpenAIClient } from './llm/providers/openai.js';

// Export context management
export { ContextManager } from './context/manager.js';
export { ContextStorage } from './context/storage.js';

// Export tools
export { ToolRegistry } from './tools/registry.js';
export { builtinTools } from './tools/builtin/index.js';

// Export agents
export { Orchestrator } from './agent/orchestrator.js';
export { InvestigatorAgent } from './agent/investigator.js';
export { SynthesizerAgent } from './agent/synthesizer.js';
export { buildUserPrompt, buildInvestigatorPrompt, buildSynthesizerPrompt } from './agent/prompt-builder.js';

// Export events
export { EventEmitter } from './events/emitter.js';

// Export utils
export { loadConfig, getDefaultConfig } from './utils/config.js';
export { initLogger, getLogger } from './utils/logger.js';
export { estimateTokens, truncateToTokens } from './utils/tokens.js';
