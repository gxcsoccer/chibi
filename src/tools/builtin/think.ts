/**
 * Think Tool
 *
 * Allows the agent to pause and think through complex problems.
 * Based on Anthropic's "think" tool concept.
 *
 * @see https://www.anthropic.com/engineering/claude-think-tool
 */

import type { Tool, ToolContext, ToolResult, ToolParameter } from '../types.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger();

const PARAMETERS: Record<string, ToolParameter> = {
  thought: {
    type: 'string',
    description: 'Your detailed thinking process - analyze results, plan next steps, or verify completeness',
    required: true,
  },
};

export const thinkTool: Tool = {
  name: 'think',
  description: `Use this tool to think through complex problems step by step.

Call this tool when you need to:
- **Analyze query**: Before searching, understand what the user is really asking for
- **Analyze results**: Process and interpret the output from a previous tool call
- **Plan strategy**: Decide which files to read or what patterns to search next
- **Verify completeness**: Check if you have gathered enough information to answer
- **Resolve ambiguity**: Reason through conflicting or unclear findings

The thinking process will be recorded for debugging but not shown to the user.
This tool helps you make better decisions by forcing explicit reasoning.`,

  parameters: PARAMETERS,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const thought = params.thought as string;

    if (!thought || thought.trim().length === 0) {
      return {
        success: false,
        output: '',
        error: 'Thought content is required',
      };
    }

    // Log the thinking for debugging/analysis
    logger.debug({
      sessionId: context.sessionId,
      thoughtLength: thought.length,
      thoughtPreview: thought.slice(0, 200),
    }, 'Agent thinking');

    // The tool doesn't "do" anything - it just provides a structured way
    // for the agent to think. The value is in:
    // 1. Forcing explicit reasoning
    // 2. Recording the thought process for debugging
    // 3. Allowing the agent to "pause" before acting

    return {
      success: true,
      output: 'Thinking recorded. Continue with your next action.',
    };
  },
};
