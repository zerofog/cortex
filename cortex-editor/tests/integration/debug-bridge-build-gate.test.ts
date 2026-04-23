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
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../..')
const BROWSER_BUNDLE = resolve(REPO_ROOT, 'dist/browser/index.js')

describe('debug bridge build-time gate', () => {
  let prodBundle = ''
  let testBundle = ''

  beforeAll(() => {
    // Prod build first so the on-disk artifact ends up as the test bundle —
    // `test:e2e` rebuilds via `build:test` anyway, but a dev inspecting
    // `dist/browser/` after a cold `npm test` sees the bridge-armed variant
    // (the one the Playwright harness consumes), which matches the directory
    // content `test:e2e` expects next.
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
    it('production bundle does NOT contain bridge installation tokens', () => {
      // The bridge installs `window.__CORTEX_TEST__` — if DCE worked, this
      // string should not appear anywhere in the built bundle. Falsifiable:
      // adding a new bridge consumer OR regressing the gate to a runtime-only
      // check would both leave the literal in the bundle and fail this test.
      expect(prodBundle).not.toContain('__CORTEX_TEST__')
      // `selectElement:` (the bridge's object-literal key) is a sufficiently
      // specific token that its absence is a strong signal the gated block
      // was stripped. It does not collide with the selection system's
      // `setSelectionWithMetadata` helper.
      expect(prodBundle).not.toContain('selectElement:')
    })

    it('test bundle DOES contain bridge installation tokens', () => {
      expect(testBundle).toContain('__CORTEX_TEST__')
      expect(testBundle).toContain('selectElement:')
    })
  })
})
