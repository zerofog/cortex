import { defineConfig } from 'vitest/config'

// ZF0-1566: detect coverage mode at config-load time so tests + config can
// scale timeouts and skip wall-clock perf assertions under V8 instrumentation.
// @vitest/coverage-v8 collects via the `inspector` API and does NOT set
// NODE_V8_COVERAGE in the test runtime, so we read argv ourselves. The env
// var we set propagates to forked worker processes via inheritance.
// See `tests/COVERAGE.md` for the canonical detection contract.
//
// Match `--coverage`, `--coverage=true`, `--coverage.<sub>=...`. We scan ALL
// matching args (not just the first) and only treat `--coverage=false|0`,
// `--coverage.enabled=false|0`, or Vitest's `--no-coverage` / `--no-coverage.enabled`
// as explicit-disable. Sub-flags like `--coverage.thresholds.lines=0` must NOT
// disable detection, otherwise a developer running
// `vitest --coverage --coverage.thresholds.lines=0` (legitimate threshold
// override) would unintentionally skip our adjustments.
const coverageArgs = process.argv.filter(
  (a) => a === '--coverage' || a.startsWith('--coverage=') || a.startsWith('--coverage.'),
)
const COVERAGE_EXPLICIT_DISABLE = /^--coverage(\.enabled)?=(false|0)$/
// Vitest CLI also supports `--no-coverage` and `--no-coverage.enabled` as
// negated boolean disables — these don't match the coverageArgs filter
// (different prefix), so we scan argv directly.
const NEGATED_DISABLE = /^--no-coverage(\.enabled)?$/
const coverageExplicitlyDisabled =
  coverageArgs.some((a) => COVERAGE_EXPLICIT_DISABLE.test(a)) ||
  process.argv.some((a) => NEGATED_DISABLE.test(a))
// Explicit disable wins over BOTH the argv match and the NODE_V8_COVERAGE
// env-var fallback — if the user said no, they meant it.
const COVERAGE_ENABLED = coverageExplicitlyDisabled
  ? false
  : coverageArgs.length > 0 || !!process.env.NODE_V8_COVERAGE
if (COVERAGE_ENABLED) {
  process.env.VITEST_COVERAGE = '1'
  // Visible breadcrumb so a future debug of "why was my test skipped?" or
  // "why is my timeout 15s?" lands here first. One line, stderr.
  // eslint-disable-next-line no-console
  console.warn('[vitest.config] ZF0-1566: coverage detected — testTimeout=15s, wall-clock perf assertions skipped')
}

// Defensive duplication: the project-based workspace config in this repo has
// a documented gotcha that top-level `define` does NOT propagate to sub-
// projects (see line ~65 below). Vitest's docs say `testTimeout`/`hookTimeout`
// DO propagate as defaults from the parent `test` block, but we anchor the
// values to constants and reference them in each project's `test` block so
// the timeout behavior is unambiguous regardless of inheritance semantics.
const TEST_TIMEOUT = COVERAGE_ENABLED ? 15000 : 5000
const HOOK_TIMEOUT = COVERAGE_ENABLED ? 15000 : 10000

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    // Some integration tests shell out to full tsup builds. Keep Vitest's
    // file sequencing non-concurrent so timing-sensitive adapter performance
    // assertions do not measure contention from build-artifact tests.
    sequence: {
      concurrent: false,
    },
    // ZF0-1566: ts-morph and AST-heavy tests (init.test.ts:238,
    // tool-applicator.test.ts:21, plus the rewriter suite) need more than
    // the 5s default when running under V8 coverage instrumentation —
    // coverage hooks every branch/statement which can push the ~200ms
    // ts-morph cold-load path well past the default timeout.
    // COVERAGE_ENABLED is computed above by reading argv; the env var
    // VITEST_COVERAGE propagates the same signal to test files for
    // selective skipping (see source-transform.test.ts perf assertion).
    testTimeout: TEST_TIMEOUT,
    hookTimeout: HOOK_TIMEOUT,
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
      { test: { name: 'server', environment: 'node', include: ['tests/adapters/**/*.test.ts', 'tests/core/**/*.test.ts', 'tests/cli/**/*.test.ts', 'tests/schemas/**/*.test.ts'], testTimeout: TEST_TIMEOUT, hookTimeout: HOOK_TIMEOUT } },
      { test: { name: 'styles', environment: 'node', include: ['tests/styles/**/*.test.ts'], testTimeout: TEST_TIMEOUT, hookTimeout: HOOK_TIMEOUT } },
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
          // ZF0-1566: anchor to root-level constants so the timeout is
          // unambiguous regardless of vitest's workspace-inheritance semantics.
          testTimeout: TEST_TIMEOUT,
          hookTimeout: HOOK_TIMEOUT,
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
          // ZF0-1566: anchor to root-level constants so the timeout is
          // unambiguous regardless of vitest's workspace-inheritance semantics.
          testTimeout: TEST_TIMEOUT,
          hookTimeout: HOOK_TIMEOUT,
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
