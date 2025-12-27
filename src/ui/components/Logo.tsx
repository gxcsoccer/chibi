/**
 * ASCII Art Logo Component
 * Chibi + 樱桃小丸子风格
 */

import React from 'react';
import { Box, Text } from 'ink';

const LOGO_ASCII = `
     ╭───────────────╮
     │   ╭─────╮     │
     │  (  • •  )    │
     │   ╰─────╯     │
     │    ╱   ╲      │
     │   ╱     ╲     │
     │  ╱       ╲    │
     ╰───────────────╯
        C H I B I
`;

const COMPACT_LOGO = `
  ( • • )
   ╱   ╲
`;

export interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  const logo = compact ? COMPACT_LOGO : LOGO_ASCII;
  
  return (
    <Box>
      <Text color="cyan">
        {logo}
      </Text>
    </Box>
  );
}

