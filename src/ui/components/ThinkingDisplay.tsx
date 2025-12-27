/**
 * Thinking Display Component
 * 实时显示 LLM 的思考过程
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ThinkingDisplayProps {
  thinking?: string;
  visible?: boolean;
}

export function ThinkingDisplay({ thinking, visible = true }: ThinkingDisplayProps) {
  if (!visible || !thinking) {
    return null;
  }

  // 限制显示长度，避免占用太多空间
  const displayThinking = thinking.length > 300 
    ? thinking.slice(0, 300) + '...'
    : thinking;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text dimColor italic>
          {displayThinking}
        </Text>
      </Box>
    </Box>
  );
}

