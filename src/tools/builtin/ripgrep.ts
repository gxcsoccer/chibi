/**
 * Grep Search Tool
 *
 * Uses ripgrep for fast code searching
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult, ToolParameter } from '../types.js';
import { resolveSafePath, DEFAULT_IGNORE_PATTERNS } from '../../utils/path.js';
import { ToolError } from '../../errors/types.js';
import { getRipgrepPath } from '../ripgrep/index.js';

const PARAMETERS: Record<string, ToolParameter> = {
  pattern: {
    type: 'string',
    description: 'The regex pattern to search for',
    required: true,
  },
  path: {
    type: 'string',
    description: 'Directory or file to search in (relative to working directory)',
    required: false,
  },
  file_pattern: {
    type: 'string',
    description: 'Glob pattern to filter files (e.g., "*.ts", "*.py")',
    required: false,
  },
  case_sensitive: {
    type: 'boolean',
    description: 'Whether the search should be case sensitive',
    required: false,
  },
  max_results: {
    type: 'number',
    description: 'Maximum number of results to return (default: 50)',
    required: false,
  },
  context_lines: {
    type: 'number',
    description: 'Number of context lines to show before and after match',
    required: false,
  },
};

export const ripgrepTool: Tool = {
  name: 'ripgrep',
  description:
    'Search for a pattern in files using ripgrep (rg). Returns matching lines with file paths and line numbers.',
  parameters: PARAMETERS,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    const pattern = params.pattern as string;
    if (!pattern) {
      return {
        success: false,
        output: '',
        error: 'Pattern is required',
      };
    }

    const searchPath = params.path as string | undefined;
    const filePattern = params.file_pattern as string | undefined;
    const caseSensitive = params.case_sensitive as boolean | undefined;
    const maxResults = (params.max_results as number) ?? 50;
    const contextLines = (params.context_lines as number) ?? 2;

    // Resolve search path
    let resolvedPath = context.workingDir;
    if (searchPath) {
      const safePath = resolveSafePath(context.workingDir, searchPath);
      if (!safePath) {
        return {
          success: false,
          output: '',
          error: `Invalid path: ${searchPath}`,
        };
      }
      resolvedPath = safePath;
    }

    // Build ripgrep arguments
    const args: string[] = [
      '--json', // JSON output for parsing
      '--max-count', maxResults.toString(),
      '-C', contextLines.toString(),
    ];

    if (!caseSensitive) {
      args.push('-i');
    }

    if (filePattern) {
      args.push('-g', filePattern);
    }

    // Add ignore patterns
    for (const ignorePattern of DEFAULT_IGNORE_PATTERNS) {
      args.push('-g', `!${ignorePattern}`);
    }

    args.push(pattern, resolvedPath);

    try {
      const result = await runRipgrep(args, context.abortSignal);
      const matches = parseRipgrepOutput(result, context.workingDir);

      if (matches.length === 0) {
        return {
          success: true,
          output: 'No matches found.',
          metadata: {
            duration: Date.now() - startTime,
            matchCount: 0,
          },
        };
      }

      const output = formatMatches(matches, maxResults);

      return {
        success: true,
        output,
        metadata: {
          duration: Date.now() - startTime,
          matchCount: matches.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolError(message, 'execution_failed', 'ripgrep');
    }
  },
};

interface Match {
  file: string;
  line: number;
  text: string;
  context?: string[];
}

async function runRipgrep(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use bundled ripgrep, fallback to system rg
    const rgPath = getRipgrepPath();
    const rg = spawn(rgPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });

    let stdout = '';
    let stderr = '';

    rg.stdout.on('data', data => {
      stdout += data.toString();
    });

    rg.stderr.on('data', data => {
      stderr += data.toString();
    });

    rg.on('close', code => {
      // ripgrep returns 1 when no matches found, which is not an error
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        reject(new Error(`ripgrep failed: ${stderr || `exit code ${code}`}`));
      }
    });

    rg.on('error', err => {
      reject(err);
    });
  });
}

function parseRipgrepOutput(output: string, workingDir: string): Match[] {
  if (!output.trim()) {
    return [];
  }

  const matches: Match[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    try {
      const data = JSON.parse(line);

      if (data.type === 'match') {
        const file = path.relative(workingDir, data.data.path.text);
        const lineNum = data.data.line_number;
        const text = data.data.lines.text.trim();

        matches.push({
          file,
          line: lineNum,
          text,
        });
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return matches;
}

function formatMatches(matches: Match[], maxResults: number): string {
  const grouped: Map<string, Match[]> = new Map();

  for (const match of matches.slice(0, maxResults)) {
    const existing = grouped.get(match.file) ?? [];
    existing.push(match);
    grouped.set(match.file, existing);
  }

  let output = `Found ${matches.length} matches in ${grouped.size} files:\n\n`;

  for (const [file, fileMatches] of grouped) {
    output += `## ${file}\n`;
    for (const match of fileMatches) {
      output += `  ${match.line}: ${match.text}\n`;
    }
    output += '\n';
  }

  if (matches.length > maxResults) {
    output += `\n... and ${matches.length - maxResults} more matches (truncated)`;
  }

  return output;
}
