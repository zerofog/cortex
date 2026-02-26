import { defineConfig } from 'tsup';

export default defineConfig([
  // Server — Node ESM
  {
    entry: ['src/bin.ts', 'src/server.ts'],
    format: ['esm'],
    target: 'node20',
    clean: true,
    sourcemap: true,
    dts: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
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
    outDir: 'dist/client',
    sourcemap: true,
    esbuildOptions(options) {
      options.jsxFactory = 'h';
      options.jsxFragment = 'Fragment';
    },
  },
]);
