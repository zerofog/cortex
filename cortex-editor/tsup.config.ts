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
    // DTS for ALL entries generated in one pass below — not per-config
    external: externals,
  },
  // Vite adapter
  {
    entry: ['src/adapters/vite.ts'],
    outDir: 'dist/vite',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
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
      // Build-time gate for the debug bridge (ZF0-1298). `CORTEX_TEST_BUILD=true`
      // flips the identifier to `true` so the bridge installs; every other build
      // gets `false` and esbuild DCE strips the entire guarded block from the
      // production bundle. Values must be string-encoded JS expressions because
      // esbuild.define parses them — `'true'` / `'false'`, not booleans.
      //
      // The `...options.define` spread is load-bearing, not defensive: tsup
      // pre-populates `options.define` with `TSUP_FORMAT` and env-derived
      // `process.env.*` entries before calling this hook. Dropping the spread
      // would silently clobber tsup's format detection.
      options.define = {
        ...options.define,
        __CORTEX_TEST_BUILD__: process.env.CORTEX_TEST_BUILD === 'true' ? 'true' : 'false',
      }
    },
    loader: { '.css': 'text' },
  },
  // DTS-only pass: generates all declarations in a single tsc invocation.
  // Before: 4 configs × dts:true = 4 parallel tsc runs (~16s total).
  // After: 1 config × dts:true = 1 tsc run (~4s).
  {
    entry: {
      'index': 'src/index.ts',
      'vite/vite': 'src/adapters/vite.ts',
      'next/next': 'src/adapters/next.ts',
      'next/next-source-loader': 'src/adapters/next-source-loader.ts',
    },
    format: ['esm', 'cjs'],
    target: 'node20',
    dts: { only: true },
    external: externals,
  },
])
