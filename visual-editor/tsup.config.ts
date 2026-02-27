import { defineConfig } from 'tsup';

export default defineConfig([
  // Server + CLI — single build pass, shebang added via postbuild script
  {
    entry: ['src/bin.ts', 'src/server.ts'],
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
    sourcemap: false,
    outExtension() {
      return { js: '.js' };
    },
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.jsxImportSource = 'preact';
    },
  },
]);
