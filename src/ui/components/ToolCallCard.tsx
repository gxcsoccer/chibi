/**
 * Tool Call Card Component
 * 单个工具调用的详细信息卡片
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

// 使用 React.memo 优化单个工具调用卡片的渲染

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ToolCallItem {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  duration?: number;
  result?: {
    success: boolean;
    output?: string;
    error?: string;
  };
}

export interface ToolCallCardProps {
  toolCall: ToolCallItem;
  expanded?: boolean;
  verbose?: boolean;
  onToggle?: () => void;
}

export const ToolCallCard = React.memo(function ToolCallCard({ toolCall, expanded = false, verbose = false, onToggle: _onToggle }: ToolCallCardProps) {
  // 使用 useMemo 缓存格式化内容，避免每次渲染都重新计算
  const formattedArgs = useMemo(() => {
    if (!expanded) return '';
    const args = toolCall.arguments;
    const entries = Object.entries(args);
    if (entries.length === 0) return '';

    // verbose 模式下显示更多内容
    const maxLen = verbose ? 80 : 40;
    return entries
      .map(([key, value]) => {
        const valueStr = typeof value === 'string'
          ? `"${value.length > maxLen ? value.slice(0, maxLen) + '...' : value}"`
          : JSON.stringify(value).slice(0, maxLen);
        return `  ${key}: ${valueStr}`;
      })
      .join('\n');
  }, [toolCall.arguments, expanded, verbose]);

  // verbose 模式下显示结果预览
  const resultPreview = useMemo(() => {
    if (!verbose || !toolCall.result) return '';
    const output = toolCall.result.output || toolCall.result.error || '';
    if (!output) return '';
    // 只显示前 100 个字符
    const preview = output.length > 100 ? output.slice(0, 100) + '...' : output;
    return preview.replace(/\n/g, ' ');
  }, [verbose, toolCall.result]);

  const statusIcon = useMemo(() => {
    switch (toolCall.status) {
      case 'completed':
        return <Text color="green">✓</Text>;
      case 'running':
        return <Text color="yellow">●</Text>;
      case 'failed':
        return <Text color="red">✗</Text>;
      case 'pending':
        return <Text dimColor>○</Text>;
    }
  }, [toolCall.status]);

  // 紧凑模式：只显示一行
  if (!expanded) {
    return (
      <Box>
        {statusIcon}
        <Text> </Text>
        <Text>{toolCall.name}</Text>
        {toolCall.duration !== undefined && (
          <Text dimColor> {toolCall.duration}ms</Text>
        )}
      </Box>
    );
  }

  // 展开模式：显示详细参数
  return (
    <Box flexDirection="column">
      <Box>
        {statusIcon}
        <Text> </Text>
        <Text bold color="yellow">{toolCall.name}</Text>
        {toolCall.duration !== undefined && (
          <Text dimColor> {toolCall.duration}ms</Text>
        )}
      </Box>
      {formattedArgs && (
        <Box marginLeft={2}>
          <Text dimColor>{formattedArgs}</Text>
        </Box>
      )}
      {resultPreview && (
        <Box marginLeft={2}>
          <Text color="gray">→ {resultPreview}</Text>
        </Box>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  // 自定义比较：只有当工具调用的关键属性变化时才重新渲染
  return prevProps.toolCall.id === nextProps.toolCall.id &&
         prevProps.toolCall.status === nextProps.toolCall.status &&
         prevProps.toolCall.duration === nextProps.toolCall.duration &&
         prevProps.expanded === nextProps.expanded &&
         prevProps.verbose === nextProps.verbose;
});

