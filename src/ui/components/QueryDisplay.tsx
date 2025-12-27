/**
 * Query Display Component
 * 展示用户查询
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface QueryDisplayProps {
  query: string;
}

export function QueryDisplay({ query }: QueryDisplayProps) {
  return (
    <Box marginBottom={1}>
      <Text>
        <Text bold>Query:</Text>
        <Text> {query}</Text>
      </Text>
    </Box>
  );
}

