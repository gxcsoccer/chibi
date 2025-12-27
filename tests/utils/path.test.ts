/**
 * Path Utils Tests
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSafePath,
  isFile,
  isDirectory,
  getExtension,
  matchesPattern,
  DEFAULT_IGNORE_PATTERNS,
} from '../../src/utils/path.js';
import path from 'node:path';

describe('Path Utils', () => {
  describe('resolveSafePath', () => {
    it('should resolve relative path within working dir', () => {
      const workDir = '/home/user/project';
      const result = resolveSafePath(workDir, 'src/index.ts');

      expect(result).toBe(path.join(workDir, 'src/index.ts'));
    });

    it('should return null for path traversal attempt', () => {
      const workDir = '/home/user/project';
      const result = resolveSafePath(workDir, '../../../etc/passwd');

      expect(result).toBeNull();
    });

    it('should handle absolute path within working dir', () => {
      const workDir = '/home/user/project';
      const result = resolveSafePath(workDir, '/home/user/project/src/file.ts');

      expect(result).toBe('/home/user/project/src/file.ts');
    });
  });

  describe('isFile', () => {
    it('should return true for existing file', () => {
      expect(isFile(__filename)).toBe(true);
    });

    it('should return false for directory', () => {
      expect(isFile(__dirname)).toBe(false);
    });

    it('should return false for non-existent path', () => {
      expect(isFile('/nonexistent/file.txt')).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for existing directory', () => {
      expect(isDirectory(__dirname)).toBe(true);
    });

    it('should return false for file', () => {
      expect(isDirectory(__filename)).toBe(false);
    });

    it('should return false for non-existent path', () => {
      expect(isDirectory('/nonexistent/directory')).toBe(false);
    });
  });

  describe('getExtension', () => {
    it('should return extension without dot', () => {
      expect(getExtension('file.ts')).toBe('ts');
      expect(getExtension('file.test.ts')).toBe('ts');
      expect(getExtension('/path/to/file.js')).toBe('js');
    });

    it('should return empty string for no extension', () => {
      expect(getExtension('Makefile')).toBe('');
      expect(getExtension('/path/to/file')).toBe('');
    });

    it('should return lowercase extension', () => {
      expect(getExtension('FILE.TS')).toBe('ts');
      expect(getExtension('File.JSON')).toBe('json');
    });
  });

  describe('matchesPattern', () => {
    it('should match extension pattern', () => {
      expect(matchesPattern('src/file.ts', ['*.ts'])).toBe(true);
      expect(matchesPattern('src/file.js', ['*.ts'])).toBe(false);
    });

    it('should match exact filename', () => {
      expect(matchesPattern('src/package.json', ['package.json'])).toBe(true);
      expect(matchesPattern('src/other.json', ['package.json'])).toBe(false);
    });

    it('should match directory pattern', () => {
      expect(matchesPattern('node_modules/pkg/index.js', ['node_modules/'])).toBe(true);
      expect(matchesPattern('src/index.js', ['node_modules/'])).toBe(false);
    });

    it('should return false for no matches', () => {
      expect(matchesPattern('src/file.ts', ['*.js', '*.jsx'])).toBe(false);
    });
  });

  describe('DEFAULT_IGNORE_PATTERNS', () => {
    it('should include common ignore patterns', () => {
      expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules/');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('.git/');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('dist/');
    });
  });
});
