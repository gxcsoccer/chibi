/**
 * Result Display Component
 * 展示最终结果
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ResultDisplayProps {
  result: string;
}

export function ResultDisplay({ result }: ResultDisplayProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold>Result</Text>
      </Box>
      <Box 
        flexDirection="column" 
        borderStyle="single" 
        borderColor="green"
        paddingX={1} 
        paddingY={1}
      >
        <Text>{result}</Text>
      </Box>
    </Box>
  );
}

