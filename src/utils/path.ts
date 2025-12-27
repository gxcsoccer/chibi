/**
 * Path utilities with security checks
 */

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';

/**
 * Resolve a path relative to the working directory
 * Ensures the resolved path is within the working directory (no path traversal)
 */
export function resolveSafePath(workingDir: string, inputPath: string): string | null {
  const resolved = path.resolve(workingDir, inputPath);
  const normalized = path.normalize(resolved);

  // Check for path traversal
  if (!normalized.startsWith(workingDir)) {
    return null;
  }

  return normalized;
}

/**
 * Check if a path exists and is a file
 */
export function isFile(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a directory
 */
export function isDirectory(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get file extension (lowercase, without dot)
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext ? ext.slice(1).toLowerCase() : '';
}

/**
 * Check if file matches any of the patterns
 */
export function matchesPattern(filePath: string, patterns: string[]): boolean {
  const fileName = path.basename(filePath);
  const ext = getExtension(filePath);

  for (const pattern of patterns) {
    // Extension pattern: *.ts
    if (pattern.startsWith('*.')) {
      if (ext === pattern.slice(2)) return true;
    }
    // Exact match
    else if (fileName === pattern) {
      return true;
    }
    // Directory pattern: dir/
    else if (pattern.endsWith('/')) {
      const dir = pattern.slice(0, -1);
      if (filePath.includes(`/${dir}/`) || filePath.startsWith(`${dir}/`)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Default ignore patterns for code search
 */
export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.nuxt/',
  '__pycache__/',
  '.pytest_cache/',
  'target/',
  'vendor/',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];
