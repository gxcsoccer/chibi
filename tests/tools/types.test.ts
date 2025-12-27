/**
 * Tool Types Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { toolToLLMFormat, SPECIAL_TOOLS } from '../../src/tools/types.js';
import type { Tool } from '../../src/tools/types.js';

describe('Tool Types', () => {
  describe('toolToLLMFormat', () => {
    it('should convert basic tool to LLM format', () => {
      const tool: Tool = {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          path: {
            type: 'string',
            description: 'File path',
            required: true,
          },
        },
        execute: vi.fn(),
      };

      const result = toolToLLMFormat(tool);

      expect(result.name).toBe('read_file');
      expect(result.description).toBe('Read a file');
      expect(result.parameters.type).toBe('object');
      expect(result.parameters.properties.path.type).toBe('string');
      expect(result.parameters.properties.path.description).toBe('File path');
      expect(result.parameters.required).toContain('path');
    });

    it('should handle optional parameters', () => {
      const tool: Tool = {
        name: 'test_tool',
        description: 'Test',
        parameters: {
          required_param: {
            type: 'string',
            description: 'Required',
            required: true,
          },
          optional_param: {
            type: 'number',
            description: 'Optional',
            required: false,
          },
        },
        execute: vi.fn(),
      };

      const result = toolToLLMFormat(tool);

      expect(result.parameters.required).toContain('required_param');
      expect(result.parameters.required).not.toContain('optional_param');
    });

    it('should handle enum parameters', () => {
      const tool: Tool = {
        name: 'select_tool',
        description: 'Select option',
        parameters: {
          option: {
            type: 'string',
            description: 'Option to select',
            required: true,
            enum: ['option1', 'option2', 'option3'],
          },
        },
        execute: vi.fn(),
      };

      const result = toolToLLMFormat(tool);

      expect(result.parameters.properties.option.enum).toEqual(['option1', 'option2', 'option3']);
    });

    it('should handle empty parameters', () => {
      const tool: Tool = {
        name: 'no_params',
        description: 'No parameters',
        parameters: {},
        execute: vi.fn(),
      };

      const result = toolToLLMFormat(tool);

      expect(result.parameters.properties).toEqual({});
      expect(result.parameters.required).toEqual([]);
    });
  });

  describe('SPECIAL_TOOLS', () => {
    it('should define recall_detail', () => {
      expect(SPECIAL_TOOLS.RECALL_DETAIL).toBe('recall_detail');
    });

    it('should define delegate', () => {
      expect(SPECIAL_TOOLS.DELEGATE).toBe('delegate');
    });

    it('should define done', () => {
      expect(SPECIAL_TOOLS.DONE).toBe('done');
    });
  });
});
