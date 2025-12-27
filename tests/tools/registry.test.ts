/**
 * Tool Registry Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { Tool } from '../../src/tools/types.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/**
 * Create a mock tool
 */
function createMockTool(name: string): Tool {
  return {
    name,
    description: `Mock tool ${name}`,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: vi.fn().mockResolvedValue({ success: true, output: '' }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = createMockTool('read_file');
      registry.register(tool);

      expect(registry.has('read_file')).toBe(true);
      expect(registry.get('read_file')).toBe(tool);
    });

    it('should not register disabled tools', () => {
      registry = new ToolRegistry({ disabledTools: ['read_file'] });
      const tool = createMockTool('read_file');
      registry.register(tool);

      expect(registry.has('read_file')).toBe(false);
    });

    it('should only register enabled tools when enabledTools is set', () => {
      registry = new ToolRegistry({ enabledTools: ['read_file'] });

      registry.register(createMockTool('read_file'));
      registry.register(createMockTool('ripgrep'));

      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('ripgrep')).toBe(false);
    });

    it('should register all tools when enabledTools is empty', () => {
      registry = new ToolRegistry({ enabledTools: [] });

      registry.register(createMockTool('read_file'));
      registry.register(createMockTool('ripgrep'));

      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('ripgrep')).toBe(true);
    });
  });

  describe('registerAll', () => {
    it('should register multiple tools', () => {
      const tools = [
        createMockTool('read_file'),
        createMockTool('ripgrep'),
        createMockTool('list_dir'),
      ];

      registry.registerAll(tools);

      expect(registry.getAll()).toHaveLength(3);
      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('ripgrep')).toBe(true);
      expect(registry.has('list_dir')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return the tool if exists', () => {
      const tool = createMockTool('read_file');
      registry.register(tool);

      expect(registry.get('read_file')).toBe(tool);
    });

    it('should return undefined if tool does not exist', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true if tool exists', () => {
      registry.register(createMockTool('read_file'));
      expect(registry.has('read_file')).toBe(true);
    });

    it('should return false if tool does not exist', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all registered tools', () => {
      registry.register(createMockTool('read_file'));
      registry.register(createMockTool('ripgrep'));

      const tools = registry.getAll();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toContain('read_file');
      expect(tools.map(t => t.name)).toContain('ripgrep');
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('getNames', () => {
    it('should return all tool names', () => {
      registry.register(createMockTool('read_file'));
      registry.register(createMockTool('ripgrep'));

      const names = registry.getNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('read_file');
      expect(names).toContain('ripgrep');
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.getNames()).toHaveLength(0);
    });
  });
});
