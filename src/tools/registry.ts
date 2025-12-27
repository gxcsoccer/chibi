/**
 * Tool Registry
 */

import type { Tool, ToolRegistryConfig } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Tool Registry manages available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = config;
  }

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    // Check if tool is disabled
    if (this.config.disabledTools?.includes(tool.name)) {
      logger.debug({ tool: tool.name }, 'Tool disabled by config');
      return;
    }

    // Check if only specific tools are enabled
    if (
      this.config.enabledTools &&
      this.config.enabledTools.length > 0 &&
      !this.config.enabledTools.includes(tool.name)
    ) {
      logger.debug({ tool: tool.name }, 'Tool not in enabled list');
      return;
    }

    this.tools.set(tool.name, tool);
    logger.debug({ tool: tool.name }, 'Tool registered');
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

}
