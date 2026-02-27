import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI entry — needs shebang for direct execution
  {
    entry: ['src/bin.ts'],
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Server — Node ESM, no shebang (may be import()-ed)
  {
    entry: ['src/server.ts'],
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    dts: true,
  },
  // Client — Preact panel bundled as IIFE for Shadow DOM injection
  // inspector.js and nav-blocker.js also bundled for consistent dist/client/ serving
  {
    entry: [
      'src/client/panel.tsx',
      'src/client/inspector.js',
      'src/client/nav-blocker.js',
    ],
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    outDir: 'dist/client',
    sourcemap: 'inline',
    outExtension() {
      return { js: '.js' };
    },
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.jsxImportSource = 'preact';
    },
  },
]);
