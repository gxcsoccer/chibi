/**
 * Read File Tool
 */

import fs from 'fs-extra';
import type { Tool, ToolContext, ToolResult, ToolParameter } from '../types.js';
import { resolveSafePath, isFile } from '../../utils/path.js';
import { ToolError } from '../../errors/types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_LINES = 2000;

const PARAMETERS: Record<string, ToolParameter> = {
  path: {
    type: 'string',
    description: 'Path to the file to read (relative to working directory)',
    required: true,
  },
  start_line: {
    type: 'number',
    description: 'Start reading from this line number (1-indexed)',
    required: false,
  },
  end_line: {
    type: 'number',
    description: 'Stop reading at this line number (inclusive)',
    required: false,
  },
};

export const readFileTool: Tool = {
  name: 'read_file',
  description:
    'Read the contents of a file. Returns the file content with line numbers.',
  parameters: PARAMETERS,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    const filePath = params.path as string;
    if (!filePath) {
      return {
        success: false,
        output: '',
        error: 'File path is required',
      };
    }

    const startLine = (params.start_line as number) ?? 1;
    const endLine = params.end_line as number | undefined;

    // Resolve path safely
    const resolvedPath = resolveSafePath(context.workingDir, filePath);
    if (!resolvedPath) {
      return {
        success: false,
        output: '',
        error: `Invalid path: ${filePath}`,
      };
    }

    // Check if file exists
    if (!isFile(resolvedPath)) {
      return {
        success: false,
        output: '',
        error: `File not found: ${filePath}`,
      };
    }

    try {
      // Check file size
      const stats = await fs.stat(resolvedPath);
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          output: '',
          error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 1MB.`,
        };
      }

      // Read file
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const lines = content.split('\n');

      // Calculate actual range
      const actualStart = Math.max(1, startLine);
      const actualEnd = Math.min(
        endLine ?? lines.length,
        actualStart + MAX_LINES - 1,
        lines.length
      );

      // Extract lines with line numbers
      const selectedLines = lines.slice(actualStart - 1, actualEnd);
      const numberedLines = selectedLines.map(
        (line, i) => `${String(actualStart + i).padStart(5)}│ ${line}`
      );

      let output = `File: ${filePath}\n`;
      output += `Lines: ${actualStart}-${actualEnd} of ${lines.length}\n`;
      output += `${'─'.repeat(60)}\n`;
      output += numberedLines.join('\n');

      if (actualEnd < lines.length) {
        output += `\n\n... ${lines.length - actualEnd} more lines`;
      }

      return {
        success: true,
        output,
        metadata: {
          duration: Date.now() - startTime,
          bytesRead: content.length,
          source: filePath,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolError(message, 'execution_failed', 'read_file');
    }
  },
};
