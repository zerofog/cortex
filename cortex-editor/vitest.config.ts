import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  // Mirror the tsup browser bundle's define (ZF0-1298) so happy-dom browser
  // tests and source-compiled imports see the bridge path as live. Tests
  // compile source directly — without this mirror, `__CORTEX_TEST_BUILD__`
  // becomes a ReferenceError at test runtime. `'true'` matches the
  // `build:test` bundle: tests exercise the bridge-armed variant.
  define: {
    __CORTEX_TEST_BUILD__: 'true',
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/cli/**', 'src/browser/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      { test: { name: 'server', environment: 'node', include: ['tests/adapters/**/*.test.ts', 'tests/core/**/*.test.ts', 'tests/cli/**/*.test.ts'] } },
      {
        test: {
          name: 'browser',
          environment: 'happy-dom',
          include: ['tests/browser/**/*.test.ts', 'tests/browser/**/*.test.tsx'],
          // Fork pool with isolation per file: prevents cross-file DOM/global
          // contamination (document.head style leaks, persistent mocks on
          // getComputedStyle, module-scoped state in override-bus, etc.).
          // Without this, tests that pass in isolation flake when run together
          // under CI load. Trade-off: slightly slower startup per file, but
          // eliminates a whole class of flaky-under-load failures.
          pool: 'forks',
          poolOptions: {
            forks: {
              isolate: true,
            },
          },
          // Retry policy for residual timing flakes. The ZF0-1297 Step 12
          // test-hygiene fix (module-scope state resets + targeted vi.waitFor
          // conversions) eliminated most state-leakage failures, but
          // ~30 setTimeout(r, N) sites in browser tests (selection-overlay,
          // cortex-app HMR-filter describe, etc.) still occasionally race
          // under GitHub Linux runner concurrent-fork load. retry:2 here is
          // not a band-aid on dirty state — it's defense-in-depth on a
          // cleaned foundation. ZF0-1322 tracks the broader setTimeout→
          // vi.waitFor sweep that will eventually let this line be removed.
          retry: 2,
        },
      },
      { test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } },
    ],
  },
})
