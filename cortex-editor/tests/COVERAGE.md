# Coverage Audit Command

Date introduced: 2026-05-11 (ZF0-1566)
Related: `HAPPY-DOM-AUDIT.md`, `SKIPPED-AUDIT.md`

## Canonical Audit Command

This is the command used by the Layer 2 audit (ZF0-1494) and the one the test suite is wired to support:

```
npx vitest run --coverage --coverage.reportOnFailure --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism
```

`npm run test:coverage` (defined in `package.json`) is a shortened variant — it runs `vitest run --coverage` without `--coverage.reportOnFailure`, the extra reporters, or `--no-file-parallelism`. Use the canonical command above when reproducing the Layer 2 audit or when timing-sensitive tests must run serially. Use `npm run test:coverage` for quick local coverage checks.

## V8 Coverage Adjustments

`@vitest/coverage-v8` collects coverage via Node's `inspector` API. The instrumentation hooks every branch and statement, which adds significant runtime overhead to CPU-heavy paths. Two adjustments handle this without losing test discipline:

### Adjustment 1 — Coverage-aware `testTimeout` and `hookTimeout`

`vitest.config.ts` detects `--coverage` at config-load time (by scanning `process.argv`) and exports a stable `VITEST_COVERAGE=1` env var that worker processes inherit. The same flag scales the top-level test timeouts:

```ts
testTimeout: COVERAGE_ENABLED ? 15000 : 5000,
hookTimeout: COVERAGE_ENABLED ? 15000 : 10000,
```

This handles tests that exercise ts-morph (`tests/cli/init.test.ts`, `tests/core/tool-applicator.test.ts`, the `tests/core/rewriter/` suite, and `tests/core/edit-pipeline.compound.test.ts`). ts-morph's first-load path is ~200ms baseline; under V8 coverage it can exceed the default 5s budget. Raising the ceiling has zero cost in normal runs.

### Adjustment 2 — Skip wall-clock perf assertions under coverage

`tests/adapters/source-transform.test.ts` has a 1000-element transform perf budget (`< 50ms` local / `< 100ms` CI). Under V8 coverage, `performance.now()` measures the cost of hooked instrumentation rather than the transform itself (~214.5ms observed against the 50ms budget). The test uses `it.skipIf(process.env.VITEST_COVERAGE)`:

```ts
it.skipIf(process.env.VITEST_COVERAGE === '1')('transforms a 1000-element file in under 50ms (median of 3)', () => { ... })
```

The perf assertion still runs in `npm test` / `npm run test:ci` (without `--coverage`) where wall-clock timing has meaning. Relaxing the budget to accommodate coverage overhead was rejected because a relaxed budget loses regression signal: a true 2× transform regression could still slip under a coverage-tolerant ceiling.

## What to do if a new test times out under coverage

1. **Is the test ts-morph / AST-heavy / CPU-bound?** No code change needed — the global `testTimeout: 15000` under coverage should cover it. If it still times out, raise this as a separate ticket and post the failing duration.
2. **Does the test assert wall-clock time (`performance.now`, `Date.now`)?** Add `it.skipIf(process.env.VITEST_COVERAGE === '1')` with a comment explaining why. Then verify the test still runs and passes in a non-coverage invocation.
3. **Does it allocate a large amount of memory or hold many open file handles?** First confirm coverage overhead is the cause (run the same test without `--coverage`). If yes, the test may need a smaller fixture or a coverage-aware fixture-size knob — not a longer timeout.
4. **Are you tempted to write `--coverage.exclude='**/your.test.ts'`?** Don't. Excluding source files from coverage is acceptable for type-only or barrel files (see `vitest.config.ts` coverage.exclude); excluding tests defeats the audit. Use `skipIf` instead.

## Shell Hygiene Note

`VITEST_COVERAGE` is set by `vitest.config.ts` at config-load time and only when `--coverage` is actually detected. If you manually export `VITEST_COVERAGE=1` in your shell (e.g., copied from a stale terminal session) and then run `npm test` *without* `--coverage`, the wall-clock perf test will silently skip. This is a shell-hygiene problem rather than a config bug — `unset VITEST_COVERAGE` to clear it. The config also writes a `[vitest.config]` stderr breadcrumb whenever it sets the var, which is the canonical evidence that detection fired.

## What NOT to do

- **Don't relax the perf budget** to accommodate coverage overhead. Relaxed budgets stop catching real regressions.
- **Don't write `it.skip(...)` unconditionally** for a coverage-only timeout. That re-introduces the rot ZF0-1494 just cleaned up.
- **Don't rely on `process.env.NODE_V8_COVERAGE` alone** to detect coverage — `@vitest/coverage-v8` does NOT set it in the test runtime (it collects via Node's `inspector` API). `vitest.config.ts` detects coverage primarily via argv scanning and falls back to `NODE_V8_COVERAGE` only for parent-process integrations that explicitly export it. Read `process.env.VITEST_COVERAGE === '1'` in tests.
