import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
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
        // Mirror the tsup browser bundle's __CORTEX_TEST_BUILD__ define so
        // source-compiled imports see the bridge path as live (ZF0-1298).
        // Top-level `define` in a projects-based workspace config does not
        // propagate to sub-projects — each project that uses the identifier
        // must declare it directly.
        define: {
          __CORTEX_TEST_BUILD__: 'true',
        },
        test: {
          name: 'browser',
          environment: 'happy-dom',
          include: ['tests/browser/**/*.test.ts', 'tests/browser/**/*.test.tsx'],
          // Fork pool with isolation per file: prevents cross-file DOM/global
          // contamination (document.head style leaks, persistent mocks on
          // getComputedStyle, module-scoped state in override-bus, etc.).
          //
          // singleFork: true forces the browser tests to run serially in one
          // long-lived worker process. Why: under the default parallel pool
          // (maxForks ≈ os.availableParallelism()), heavy happy-dom files
          // (cortex-app.test.tsx, panel.test.tsx, use-canvas-zoom.test.tsx)
          // ran concurrently and starved each other's setTimeout/vi.waitFor
          // schedulers, producing intermittent flake on tight-timeout
          // positive assertions (ZF0-1297 → ZF0-1322 → ZF0-1360 root cause).
          // isolate: true still resets the test environment (happy-dom +
          // module registry) between files, so cross-file state does not
          // leak — only the OS-level parallelism is removed.
          //
          // Trade-off: the browser project is noticeably slower when
          // serialized, but the server + integration projects remain
          // parallel.
          pool: 'forks',
          poolOptions: {
            forks: {
              isolate: true,
              singleFork: true,
            },
          },
          // retry:2 was removed in ZF0-1322 after the cortex-app state-leakage
          // fix (ZF0-1332) and the browser-test setTimeout→vi.waitFor sweep
          // (ZF0-1341) made 10× serial CI=true vitest run --project browser
          // pass cleanly. ZF0-1354 ran the retry:0 CI matrix verification and
          // confirmed the browser project goes green on Node 20 + Node 22
          // (with a documented residual Family C flake tracked in ZF0-1387).
          // To re-verify locally, use `bash scripts/verify-retry0.sh`. Any
          // new browser-test flake should be root-caused, not masked.
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // ZF0-1326 Step 4 review fix: serialize integration tests.
          // Multiple files (debug-bridge-build-gate.test.ts,
          // cortex-send-tombstone.test.ts) run `npm run build` and write
          // to dist/browser/ in their beforeAll. Under the default
          // parallel pool, the two builds can race-wipe each other's
          // dist (tsup writes incrementally; one process reading
          // dist/browser/index.js mid-rebuild gets ENOENT or torn
          // content). singleFork: true forces serial execution of all
          // integration tests in one long-lived worker, eliminating the
          // race without changing test logic.
          pool: 'forks',
          poolOptions: {
            forks: {
              isolate: true,
              singleFork: true,
            },
          },
        },
      },
    ],
  },
})
