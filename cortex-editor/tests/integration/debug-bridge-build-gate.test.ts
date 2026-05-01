/**
 * Integration tests for the debug-bridge build-time gate (ZF0-1298).
 *
 * Runs both build variants ONCE per test file (in `beforeAll`) and asserts
 * on the captured bundle contents. Bounded at exactly 2 tsup invocations
 * regardless of assertion count — lets Task 2 append more assertions
 * against `prodBundle` / `testBundle` without additional build cost.
 *
 * Uses `execFileSync` (not `exec`) per the cortex-editor safe-exec convention
 * in `src/cli/demo.ts` — no shell, args as array, no injection surface.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Canonical ESM pattern — matches tests/browser/cx-token-namespace.test.ts,
// tests/e2e/helpers/fixture-server.ts, src/adapters/{next,vite}.ts, and
// src/cli/demo.ts. `__dirname` works under vitest's esbuild transform, but
// the explicit derivation is portable outside vitest too.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '../..')
// Same bundle path as tests/e2e/helpers/fixture-server.ts — consolidate into a
// shared constant if a third consumer appears (today the two live in separate
// vitest sub-projects / Playwright and can't cleanly share a module).
const BROWSER_BUNDLE = resolve(REPO_ROOT, 'dist/browser/index.js')
const BROWSER_DIST_DIR = resolve(REPO_ROOT, 'dist/browser')

describe('debug bridge build-time gate', () => {
  let prodBundle = ''
  let testBundle = ''

  beforeAll(() => {
    // Stale-bundle guard: delete dist/browser/ before each build. Without this,
    // a failed build would leave the PRIOR bundle on disk and `readFileSync`
    // would return stale content — the assertions could then false-pass on
    // whichever variant was written last. Clean slate → `existsSync` below
    // becomes a meaningful health check.
    rmSync(BROWSER_DIST_DIR, { recursive: true, force: true })
    // Prod build first so the on-disk artifact ends up as the test bundle —
    // a dev inspecting `dist/browser/` after a cold `npm test` sees the
    // bridge-armed variant the Playwright harness consumes next.
    //
    // Explicit env override: `execFileSync` inherits `process.env` by default,
    // which means a developer or CI with `CORTEX_TEST_BUILD=true` exported
    // (e.g., for local Playwright work) would silently turn this "prod build"
    // into a test build. Forcing `'false'` on the prod invocation and `'true'`
    // on the test invocation makes the assertions parent-env-independent.
    execFileSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CORTEX_TEST_BUILD: 'false' },
    })
    if (!existsSync(BROWSER_BUNDLE)) {
      throw new Error(`production build produced no bundle at ${BROWSER_BUNDLE}`)
    }
    prodBundle = readFileSync(BROWSER_BUNDLE, 'utf8')

    rmSync(BROWSER_DIST_DIR, { recursive: true, force: true })
    execFileSync('npm', ['run', 'build:test'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CORTEX_TEST_BUILD: 'true' },
    })
    if (!existsSync(BROWSER_BUNDLE)) {
      throw new Error(`test build produced no bundle at ${BROWSER_BUNDLE}`)
    }
    testBundle = readFileSync(BROWSER_BUNDLE, 'utf8')
  }, 180_000)

  describe('esbuild define injection', () => {
    it('production build replaces __CORTEX_TEST_BUILD__ identifier (no bare token remains)', () => {
      expect(prodBundle).not.toMatch(/\b__CORTEX_TEST_BUILD__\b/)
    })

    it('test build replaces __CORTEX_TEST_BUILD__ identifier (no bare token remains)', () => {
      expect(testBundle).not.toMatch(/\b__CORTEX_TEST_BUILD__\b/)
    })
  })

  describe('bridge DCE in prod, present in test bundle', () => {
    it('production bundle does NOT contain the bridge installation token', () => {
      // The bridge installs `window.__CORTEX_TEST__` — if DCE worked, this
      // string should not appear anywhere in the built bundle. Falsifiable:
      // adding a new bridge consumer OR regressing the gate to a runtime-only
      // check would both leave the literal in the bundle and fail this test.
      expect(prodBundle).not.toContain('__CORTEX_TEST__')
    })

    it('test bundle DOES contain the bridge installation token', () => {
      expect(testBundle).toContain('__CORTEX_TEST__')
    })

    it('production bundle does NOT contain the bridge object shape (rename-resistant)', () => {
      // Rename-bypass guard: if someone renames `window.__CORTEX_TEST__` to
      // `window.__CORTEX_BRIDGE__` without updating the test token above, the
      // string-literal check would silent-pass. The bridge's object-literal
      // shape (`overrideManager`, `channel`, `selectElement` in sequence) is
      // the load-bearing signature — those 3 keys appear together ONLY at the
      // bridge install site (CortexApp.tsx). Any rename to a differently-named
      // global would still produce the same object shape in the emitted code,
      // caught by this regex regardless of the property name.
      //
      // ZF0-1473 (sub-A): the `overrideManager` slot was widened from a bare
      // identifier reference (`overrideManager,`) to an explicit object
      // literal exposing 5 methods (`overrideManager: { set, flush, ... }`).
      // The regex now allows the inner object body between `overrideManager`
      // and `channel`, while still requiring all 3 keys to appear at the
      // bridge install site (post-minification).
      expect(prodBundle).not.toMatch(/overrideManager:\s*\{[\s\S]*?\},\s*channel,\s*selectElement/)
    })

    it('test bundle DOES contain the bridge object shape', () => {
      // Positive side of the rename-resistance check: proves the shape-regex
      // is correctly calibrated (if it never matched anything, the prod check
      // above would be vacuous).
      expect(testBundle).toMatch(/overrideManager:\s*\{[\s\S]*?\},\s*channel,\s*selectElement/)
    })

    it('production bundle is smaller than test bundle (DCE actually stripped bytes)', () => {
      // Sanity check — the string + shape assertions above already prove
      // semantic absence of the bridge. This one proves bytes were actually
      // stripped vs preserved-and-unreachable-but-same-size. A hardcoded
      // byte-threshold would be brittle against future minor refactors to
      // the bridge — `delta > 0` is sufficient to catch the "DCE completely
      // off" case (prod bundle == test bundle). Empirically delta is ~627
      // bytes today; that headroom is incidental, not load-bearing.
      expect(testBundle.length).toBeGreaterThan(prodBundle.length)
    })
  })
})
