import { defineConfig } from 'tsup'

// Externalized packages: optional peer deps + heavy runtime deps (lazy-loaded)
const externals = ['vite', 'next', 'webpack', 'tailwindcss', 'ts-morph', 'ws', 'postcss']

export default defineConfig([
  // Server-side: core types + source transform
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // Vite adapter
  {
    entry: ['src/adapters/vite.ts'],
    outDir: 'dist/vite',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
    esbuildOptions(options) {
      // import.meta.url is guarded by __dirname check — CJS branch never reaches it
      options.logOverride = { 'empty-import-meta': 'silent' }
    },
  },
  // Next.js adapter
  {
    entry: ['src/adapters/next.ts'],
    outDir: 'dist/next',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
    esbuildOptions(options) {
      options.logOverride = { 'empty-import-meta': 'silent' }
    },
  },
  // Next.js webpack loader — CJS only (webpack requires CJS loaders)
  {
    entry: ['src/adapters/next-source-loader.ts'],
    outDir: 'dist/next',
    format: ['cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // CLI entry — cortex mcp / cortex init
  {
    entry: ['src/cli/index.ts'],
    outDir: 'dist/cli',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    external: [...externals, '@modelcontextprotocol/sdk', 'zod'],
  },
  // Browser-side: Preact UI bundled as IIFE for Shadow DOM injection
  {
    entry: ['src/browser/index.tsx'],
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    outDir: 'dist/browser',
    sourcemap: false,
    globalName: 'CortexEditor',
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options) {
      options.jsx = 'automatic'
      options.jsxImportSource = 'preact'
    },
    loader: { '.css': 'text' },
  },
])
