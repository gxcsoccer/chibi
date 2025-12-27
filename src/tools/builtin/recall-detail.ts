/**
 * Recall Detail Tool
 *
 * Recalls original content from compressed messages by key
 */

import type { Tool, ToolContext, ToolResult, ToolParameter } from '../types.js';

const PARAMETERS: Record<string, ToolParameter> = {
  key: {
    type: 'string',
    description: '要召回的消息的 key，格式如 msg_xxxxxxxx',
    required: true,
  },
};

/**
 * Recall Detail Tool
 *
 * This tool allows the agent to recall original content from compressed messages.
 * When a message is compressed, it shows a placeholder with the message key.
 * The agent can use this tool to retrieve the full original content.
 *
 * Note: This is a special tool handled directly by InvestigatorAgent and SynthesizerAgent,
 * not through the normal tool registry.
 */
export const recallDetailTool: Tool = {
  name: 'recall_detail',
  description:
    '召回被压缩消息的原始内容。当看到 [COMPRESSED:msg_xxx] 标记时，可以使用此工具获取完整内容。',
  parameters: PARAMETERS,

  async execute(
    _params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    // This tool requires special handling by the agent
    // because it needs access to ContextManager
    return {
      success: false,
      output: '',
      error: 'recall_detail 必须由 Agent 直接处理',
    };
  },
};

