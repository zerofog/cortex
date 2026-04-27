import { defineConfig } from 'tsup'
import type { BuildOptions } from 'esbuild'

// Externalized packages: optional peer deps + heavy runtime deps (lazy-loaded)
const externals = ['vite', 'next', 'webpack', 'tailwindcss', 'ts-morph', 'ws', 'postcss']

/**
 * Factory for browser-IIFE tsup entries (ZF0-1326 Task 3).
 *
 * The security invariants — `minifySyntax: true` and the
 * `__CORTEX_TEST_BUILD__` esbuild define — must apply to EVERY browser
 * bundle entry. Pre-factory, those invariants lived inline in the single
 * browser entry; a contributor adding a second entry could silently omit
 * either by copy-pasting the skeleton without the full `esbuildOptions`
 * body. This factory makes both invariants the path of least resistance
 * for new entries — a callsite that uses the standard
 * `{ ...browserBundleBase('src/x.ts', 'dist/x'), globalName: 'X' }`
 * spread inherits both invariants automatically.
 *
 * Caveat (Step 4 review honesty): the JS spread operator allows a caller
 * to override `esbuildOptions` after spreading the factory result, which
 * would silently drop the security invariants. So this is "by convention,
 * audited per-entry" rather than "by construction". Mitigation: any new
 * IIFE entry should be reviewed for the spread shape, and the structural
 * test at `tests/integration/tsup-config.test.ts` asserts the factory's
 * output preserves the invariants when used unmodified. Hardening to
 * actually-by-construction would require a composer API
 * (`browserBundleEntry(entry, outDir, { globalName })`) that owns
 * `esbuildOptions` — tracked as a deferred follow-up.
 *
 * Exported so a unit test can verify the factory's output without booting
 * tsup.
 */
export const browserBundleBase = (entry: string, outDir: string) => ({
  entry: [entry],
  format: ['iife'] as ['iife'],
  target: 'es2020',
  platform: 'browser' as const,
  outDir,
  sourcemap: false,
  outExtension: () => ({ js: '.js' }),
  esbuildOptions(options: BuildOptions) {
    options.jsx = 'automatic'
    options.jsxImportSource = 'preact'
    // Enable syntax-level minification (constant folding + DCE) without
    // full identifier minification. Required for `if (false && ...)` blocks
    // inserted by the `define` substitution below to be physically stripped
    // from the output — esbuild only DCEs dead branches when minifySyntax is
    // true (without it, `if (false) { ... }` is emitted verbatim).
    options.minifySyntax = true
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
  loader: { '.css': 'text' as const },
})

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
  // Browser-side: Preact UI bundled as IIFE for Shadow DOM injection.
  // Spread from the browserBundleBase factory above so `minifySyntax` + the
  // __CORTEX_TEST_BUILD__ define invariants are enforced by construction
  // (ZF0-1326 Task 3). A second IIFE entry (lean widget, etc.) added later
  // becomes a one-line spread; omission of either invariant is impossible.
  {
    ...browserBundleBase('src/browser/index.tsx', 'dist/browser'),
    globalName: 'CortexEditor',
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
