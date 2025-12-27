import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['react', 'ink'],
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  // CLI binary
  {
    entry: {
      'bin/chibi': 'bin/chibi.ts',
    },
    format: ['esm'],
    target: 'node20',
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['react', 'ink'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
]);
