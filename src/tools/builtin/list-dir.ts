/**
 * List Directory Tool
 */

import fs from 'fs-extra';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult, ToolParameter } from '../types.js';
import { resolveSafePath, isDirectory, matchesPattern, DEFAULT_IGNORE_PATTERNS } from '../../utils/path.js';
import { ToolError } from '../../errors/types.js';

const MAX_ENTRIES = 500;
const MAX_DEPTH = 5;

const PARAMETERS: Record<string, ToolParameter> = {
  path: {
    type: 'string',
    description: 'Directory path to list (relative to working directory)',
    required: false,
  },
  recursive: {
    type: 'boolean',
    description: 'Whether to list directories recursively',
    required: false,
  },
  max_depth: {
    type: 'number',
    description: 'Maximum depth for recursive listing (default: 3)',
    required: false,
  },
  pattern: {
    type: 'string',
    description: 'Glob pattern to filter files (e.g., "*.ts")',
    required: false,
  },
  show_hidden: {
    type: 'boolean',
    description: 'Whether to show hidden files (starting with .)',
    required: false,
  },
};

export const listDirTool: Tool = {
  name: 'list_dir',
  description:
    'List contents of a directory. Returns files and subdirectories with their sizes.',
  parameters: PARAMETERS,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    const dirPath = (params.path as string) ?? '.';
    const recursive = (params.recursive as boolean) ?? false;
    const maxDepth = Math.min((params.max_depth as number) ?? 3, MAX_DEPTH);
    const pattern = params.pattern as string | undefined;
    const showHidden = (params.show_hidden as boolean) ?? false;

    // Resolve path safely
    const resolvedPath = resolveSafePath(context.workingDir, dirPath);
    if (!resolvedPath) {
      return {
        success: false,
        output: '',
        error: `Invalid path: ${dirPath}`,
      };
    }

    // Check if directory exists
    if (!isDirectory(resolvedPath)) {
      return {
        success: false,
        output: '',
        error: `Directory not found: ${dirPath}`,
      };
    }

    try {
      const entries: DirectoryEntry[] = [];

      await listDirectory(
        resolvedPath,
        context.workingDir,
        entries,
        recursive,
        maxDepth,
        0,
        pattern,
        showHidden,
        context.abortSignal
      );

      if (entries.length === 0) {
        return {
          success: true,
          output: 'Directory is empty or no files match the criteria.',
          metadata: {
            duration: Date.now() - startTime,
          },
        };
      }

      const output = formatEntries(entries, dirPath);

      return {
        success: true,
        output,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolError(message, 'execution_failed', 'list_dir');
    }
  },
};

interface DirectoryEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  depth: number;
}

async function listDirectory(
  dir: string,
  workingDir: string,
  entries: DirectoryEntry[],
  recursive: boolean,
  maxDepth: number,
  currentDepth: number,
  pattern: string | undefined,
  showHidden: boolean,
  signal?: AbortSignal
): Promise<void> {
  if (currentDepth > maxDepth) return;
  if (entries.length >= MAX_ENTRIES) return;
  if (signal?.aborted) return;

  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) break;
    if (signal?.aborted) break;

    // Skip hidden files unless requested
    if (!showHidden && item.name.startsWith('.')) continue;

    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(workingDir, fullPath);

    // Skip ignored directories
    if (item.isDirectory()) {
      if (matchesPattern(fullPath, DEFAULT_IGNORE_PATTERNS)) continue;
    }

    // Apply pattern filter
    if (pattern && item.isFile()) {
      if (!matchesPattern(item.name, [pattern])) continue;
    }

    const entry: DirectoryEntry = {
      path: relativePath,
      type: item.isDirectory() ? 'directory' : 'file',
      depth: currentDepth,
    };

    if (item.isFile()) {
      try {
        const stats = await fs.stat(fullPath);
        entry.size = stats.size;
      } catch {
        // Ignore stat errors
      }
    }

    entries.push(entry);

    // Recurse into subdirectories
    if (recursive && item.isDirectory()) {
      await listDirectory(
        fullPath,
        workingDir,
        entries,
        recursive,
        maxDepth,
        currentDepth + 1,
        pattern,
        showHidden,
        signal
      );
    }
  }
}

function formatEntries(entries: DirectoryEntry[], basePath: string): string {
  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });

  let output = `Directory: ${basePath}\n`;
  output += `Entries: ${entries.length}${entries.length >= MAX_ENTRIES ? ' (truncated)' : ''}\n`;
  output += `${'─'.repeat(60)}\n\n`;

  const dirs = entries.filter(e => e.type === 'directory');
  const files = entries.filter(e => e.type === 'file');

  if (dirs.length > 0) {
    output += `Directories (${dirs.length}):\n`;
    for (const dir of dirs) {
      const indent = '  '.repeat(dir.depth);
      output += `${indent}📁 ${path.basename(dir.path)}/\n`;
    }
    output += '\n';
  }

  if (files.length > 0) {
    output += `Files (${files.length}):\n`;
    for (const file of files) {
      const indent = '  '.repeat(file.depth);
      const size = formatSize(file.size ?? 0);
      output += `${indent}📄 ${path.basename(file.path)} (${size})\n`;
    }
  }

  return output;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
