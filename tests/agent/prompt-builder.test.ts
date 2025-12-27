/**
 * Prompt Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildInvestigatorPrompt,
  buildSynthesizerPrompt,
  buildUserPrompt,
  buildToolResultPrompt,
  buildSynthesizerUserPrompt,
} from '../../src/agent/prompt-builder.js';
import type { Tool } from '../../src/tools/types.js';

describe('Prompt Builder', () => {
  describe('buildInvestigatorPrompt', () => {
    const mockTools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
        execute: async () => ({ success: true, output: '' }),
      },
      {
        name: 'think',
        description: 'Think through a problem',
        parameters: {
          type: 'object',
          properties: {
            thought: { type: 'string', description: 'Your thought' },
          },
          required: ['thought'],
        },
        execute: async () => ({ success: true, output: '' }),
      },
    ];

    it('should include the most important rules section', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('⚠️ 最重要的规则');
      expect(prompt).toContain('你只能报告你用 read_file 实际读取过的文件内容');
    });

    it('should include ripgrep vs read_file distinction', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('ripgrep vs read_file 的区别');
      expect(prompt).toContain('ripgrep | 定位文件位置');
      expect(prompt).toContain('read_file | 读取文件内容');
      expect(prompt).toContain('❌ 不能');
      expect(prompt).toContain('✅ 可以');
    });

    it('should include typical error example', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('典型错误示例');
      expect(prompt).toContain('错误做法');
      expect(prompt).toContain('正确做法');
    });

    it('should include mandatory self-check section', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('完成调查前的强制自检');
      expect(prompt).toContain('在输出 [INVESTIGATION_COMPLETE] 之前，必须先用 think 工具进行自检');
    });

    it('should include self-check checklist', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('自检清单');
      expect(prompt).toContain('用户问题回答情况');
      expect(prompt).toContain('文件读取记录（区分 read_file vs ripgrep）');
      expect(prompt).toContain('调用链验证');
      expect(prompt).toContain('缺失的环节');
      expect(prompt).toContain('结论');
    });

    it('should include self-check failure conditions', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('自检不通过的情况');
      expect(prompt).toContain('用户问题没有得到充分回答');
      expect(prompt).toContain('调用链有断点');
      expect(prompt).toContain('ripgrep 证据，没有 read_file 证据');
    });

    it('should include output format with evidence source column', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('文件读取记录（只列出 read_file 读取过的文件）');
      expect(prompt).toContain('证据来源');
      expect(prompt).toContain('| 步骤 | 位置 | 代码片段 | 证据来源 |');
    });

    it('should include prohibition section', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('禁止事项');
      expect(prompt).toContain('禁止描述未读取的文件');
      expect(prompt).toContain('禁止推测调用链');
      expect(prompt).toContain('禁止使用 ripgrep 作为调用证据');
      expect(prompt).toContain('禁止编造行号');
    });

    it('should include tool descriptions', () => {
      const prompt = buildInvestigatorPrompt(mockTools);

      expect(prompt).toContain('### read_file');
      expect(prompt).toContain('### think');
    });
  });

  describe('buildSynthesizerPrompt', () => {
    it('should include core principle about respecting facts', () => {
      const prompt = buildSynthesizerPrompt();

      expect(prompt).toContain('核心原则');
      expect(prompt).toContain('尊重事实，不要编造');
    });

    it('should include prohibition section', () => {
      const prompt = buildSynthesizerPrompt();

      expect(prompt).toContain('禁止事项');
      expect(prompt).toContain('禁止编造');
    });
  });

  describe('buildUserPrompt', () => {
    it('should return the query as-is', () => {
      const query = 'What is the project structure?';
      const prompt = buildUserPrompt(query);

      expect(prompt).toBe(query);
    });
  });

  describe('buildToolResultPrompt', () => {
    it('should format success result correctly', () => {
      const prompt = buildToolResultPrompt('read_file', 'File content here', true);

      expect(prompt).toContain('工具 "read_file" 执行成功');
      expect(prompt).toContain('File content here');
    });

    it('should format failure result correctly', () => {
      const prompt = buildToolResultPrompt('read_file', 'File not found', false);

      expect(prompt).toContain('工具 "read_file" 执行失败');
      expect(prompt).toContain('File not found');
    });
  });

  describe('buildSynthesizerUserPrompt', () => {
    it('should include original query and findings', () => {
      const query = 'What is the user creation flow?';
      const findings = '## Findings\n\nUser creation starts at...';

      const prompt = buildSynthesizerUserPrompt(query, findings);

      expect(prompt).toContain('用户原始问题');
      expect(prompt).toContain(query);
      expect(prompt).toContain('调查发现');
      expect(prompt).toContain(findings);
      expect(prompt).toContain('直接以标题开始，不要有任何前言');
    });
  });
});
