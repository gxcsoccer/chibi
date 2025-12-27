/**
 * Builtin Tools
 */

import type { Tool } from '../types.js';
import { thinkTool } from './think.js';
import { ripgrepTool } from './ripgrep.js';
import { readFileTool } from './read-file.js';
import { listDirTool } from './list-dir.js';
import { recallDetailTool } from './recall-detail.js';

/**
 * All builtin tools
 */
export const builtinTools: Tool[] = [
  thinkTool,
  ripgrepTool,
  readFileTool,
  listDirTool,
  recallDetailTool,
];

/**
 * Export individual tools
 */
export { thinkTool } from './think.js';
export { ripgrepTool } from './ripgrep.js';
export { readFileTool } from './read-file.js';
export { listDirTool } from './list-dir.js';
export { recallDetailTool } from './recall-detail.js';
