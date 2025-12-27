/**
 * Tool System Types
 */

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
}

/**
 * Tool definition
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;

  /**
   * Execute the tool
   */
  execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  workingDir: string;
  sessionId: string;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
}

/**
 * Tool execution progress
 */
export interface ToolProgress {
  stage: string;
  current?: number;
  total?: number;
  message?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: {
    duration?: number;
    bytesRead?: number;
    matchCount?: number;
    source?: string;
    tokens?: number;
  };
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
  enabledTools?: string[];
  disabledTools?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
}

/**
 * Special tools that have side effects on context
 */
export const SPECIAL_TOOLS = {
  RECALL_DETAIL: 'recall_detail',
  DELEGATE: 'delegate',
  DONE: 'done',
} as const;

/**
 * Convert tool to LLM tool definition format
 */
export function toolToLLMFormat(tool: Tool): {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
} {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(tool.parameters)) {
    properties[name] = {
      type: param.type,
      description: param.description,
    };
    if (param.enum) {
      properties[name].enum = param.enum;
    }
    if (param.required) {
      required.push(name);
    }
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties,
      required,
    },
  };
}
