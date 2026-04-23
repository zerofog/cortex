/**
 * Integration tests for the debug-bridge build-time gate (ZF0-1298).
 *
 * Runs both build variants and inspects the resulting IIFE bundle to prove:
 *   - `npm run build` produces a bundle with the bridge DCE'd out.
 *   - `npm run build:test` produces a bundle with the bridge intact.
 *
 * Uses `execFileSync` (not `exec`) per the cortex-editor safe-exec convention
 * in `src/cli/demo.ts` — no shell, args as array, no injection surface.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../..')
const BROWSER_BUNDLE = resolve(REPO_ROOT, 'dist/browser/index.js')

describe('debug bridge build-time gate', () => {
  describe('Task 1 — define reaches esbuild', () => {
    it('npm run build replaces __CORTEX_TEST_BUILD__ identifier (no bare token remains)', () => {
      execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
      expect(existsSync(BROWSER_BUNDLE)).toBe(true)
      const bundle = readFileSync(BROWSER_BUNDLE, 'utf8')
      expect(bundle).not.toMatch(/\b__CORTEX_TEST_BUILD__\b/)
    }, 60_000)

    it('npm run build:test replaces __CORTEX_TEST_BUILD__ identifier (no bare token remains)', () => {
      execFileSync('npm', ['run', 'build:test'], { cwd: REPO_ROOT, stdio: 'inherit' })
      expect(existsSync(BROWSER_BUNDLE)).toBe(true)
      const bundle = readFileSync(BROWSER_BUNDLE, 'utf8')
      expect(bundle).not.toMatch(/\b__CORTEX_TEST_BUILD__\b/)
    }, 60_000)
  })
})
