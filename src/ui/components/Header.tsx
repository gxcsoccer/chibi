/**
 * Header Component
 * 顶部标题栏，包含 logo 和标题
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Logo } from './Logo.js';

export interface HeaderProps {
  compact?: boolean;
}

export function Header({ compact = false }: HeaderProps) {
  return (
    <Box flexDirection="row" alignItems="center" marginBottom={1}>
      <Logo compact={compact} />
      <Box marginLeft={compact ? 1 : 2}>
        <Text bold color="cyan">
          Chibi
        </Text>
        <Text dimColor> - Another Code Agent</Text>
      </Box>
    </Box>
  );
}

