/**
 * Status Bar Component
 * 显示当前状态和进度
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export type StatusType = 'idle' | 'thinking' | 'tool_call' | 'completed' | 'error';

export interface StatusBarProps {
  status: StatusType;
  iteration?: number;
  maxIterations?: number;
  currentTool?: string;
  error?: string;
}

export function StatusBar({ 
  status, 
  iteration, 
  maxIterations, 
  currentTool,
  error 
}: StatusBarProps) {
  const getStatusIndicator = () => {
    switch (status) {
      case 'thinking':
        return (
          <>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> </Text>
            <Text>Thinking...</Text>
          </>
        );
      case 'tool_call':
        return (
          <>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> </Text>
            <Text>Running </Text>
            <Text bold color="yellow">{currentTool}</Text>
            <Text>...</Text>
          </>
        );
      case 'completed':
        return (
          <Text color="green">✓ Completed</Text>
        );
      case 'error':
        return (
          <Text color="red">✗ Error: {error}</Text>
        );
      default:
        return <Text dimColor>Idle</Text>;
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>
          <Text bold>Status:</Text>
          <Text> </Text>
          {getStatusIndicator()}
        </Text>
      </Box>
      {iteration !== undefined && maxIterations !== undefined && (
        <Box marginTop={0}>
          <Text dimColor>
            Iteration: {iteration}/{maxIterations}
          </Text>
        </Box>
      )}
    </Box>
  );
}

