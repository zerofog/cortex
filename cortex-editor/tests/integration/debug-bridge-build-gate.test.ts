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
import { readFileSync, existsSync } from 'node:fs'
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

describe('debug bridge build-time gate', () => {
  let prodBundle = ''
  let testBundle = ''

  beforeAll(() => {
    // Prod build first so the on-disk artifact ends up as the test bundle —
    // a dev inspecting `dist/browser/` after a cold `npm test` sees the
    // bridge-armed variant the Playwright harness consumes next.
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
    if (!existsSync(BROWSER_BUNDLE)) {
      throw new Error(`production build produced no bundle at ${BROWSER_BUNDLE}`)
    }
    prodBundle = readFileSync(BROWSER_BUNDLE, 'utf8')

    execFileSync('npm', ['run', 'build:test'], { cwd: REPO_ROOT, stdio: 'inherit' })
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
  })
})
