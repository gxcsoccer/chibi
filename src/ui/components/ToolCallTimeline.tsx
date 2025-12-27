/**
 * Tool Call Timeline Component
 * 以时间线形式展示所有工具调用
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ToolCallCard, type ToolCallItem } from './ToolCallCard.js';

export interface ToolCallTimelineProps {
  toolCalls: ToolCallItem[];
  maxVisible?: number;
  verbose?: boolean;
}

// 使用 React.memo 优化，只在 toolCalls 真正变化时重新渲染
export const ToolCallTimeline = React.memo(function ToolCallTimeline({ toolCalls, maxVisible = 10, verbose = false }: ToolCallTimelineProps) {
  if (toolCalls.length === 0) {
    return null;
  }

  // 只显示最近的 N 个工具调用，避免内容过多
  const displayCalls = toolCalls.length <= maxVisible
    ? toolCalls
    : toolCalls.slice(-maxVisible);

  const hiddenCount = toolCalls.length - displayCalls.length;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text bold dimColor>Tools </Text>
        <Text dimColor>({toolCalls.length} calls)</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        {hiddenCount > 0 && (
          <Text dimColor>... {hiddenCount} earlier calls hidden</Text>
        )}
        {displayCalls.map((toolCall, index) => {
          // verbose 模式下展开所有，否则只展开正在运行的
          const isLast = index === displayCalls.length - 1;
          const isRunning = toolCall.status === 'running';
          const shouldExpand = verbose || (isLast && isRunning);

          return (
            <ToolCallCard
              key={toolCall.id}
              toolCall={toolCall}
              expanded={shouldExpand}
              verbose={verbose}
            />
          );
        })}
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // verbose 变化需要重新渲染
  if (prevProps.verbose !== nextProps.verbose) {
    return false;
  }

  // 快速路径：引用相同直接跳过
  if (prevProps.toolCalls === nextProps.toolCalls) {
    return true;
  }

  // 长度不同，需要重新渲染
  if (prevProps.toolCalls.length !== nextProps.toolCalls.length) {
    return false;
  }

  // 只比较最后一个工具调用的状态（通常只有它在变化）
  if (prevProps.toolCalls.length > 0) {
    const lastIndex = prevProps.toolCalls.length - 1;
    const prevLast = prevProps.toolCalls[lastIndex];
    const nextLast = nextProps.toolCalls[lastIndex];

    return prevLast.id === nextLast.id &&
           prevLast.status === nextLast.status;
  }

  return true;
});

