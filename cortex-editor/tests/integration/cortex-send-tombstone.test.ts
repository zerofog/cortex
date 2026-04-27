/**
 * Integration test for the `__cortex_send__` + `__CORTEX_TOKEN__` tombstone
 * (ZF0-1326 Task 1).
 *
 * The unit tests in `tests/browser/channel.test.ts` exercise the closure-capture
 * + delete sequence directly against the channel implementation. This file adds
 * a build-bundle-level assertion: the production browser bundle must contain
 * the literal `delete window.__cortex_send__` and `delete window.__CORTEX_TOKEN__`
 * statements. If a future refactor accidentally removes the tombstone (e.g.,
 * inlines the channel without the delete pair), this test catches it at the
 * artifact level — the closest we can get to "what actually ships" without
 * Playwright.
 *
 * Why this is integration, not unit:
 * - Asserts on the BUILT bundle (post-tsup), not source. Unit tests can pass
 *   on a source-level closure pattern that esbuild's DCE later strips if the
 *   `connected` getter is the only remaining consumer.
 * - Cross-component proof: the bootstrap descriptor in vite.ts uses
 *   `configurable: true` (so the delete works) AND the channel.ts source emits
 *   the delete. Both halves must be present in the artifact.
 *
 * Build cost note: this file triggers ONE tsup invocation in beforeAll
 * (~30s on a warm cache, ~60s cold). The existing
 * `debug-bridge-build-gate.test.ts` runs TWO builds; we deliberately do not
 * extend that file because its 2-build batching is tied to the test/prod
 * comparison it makes — our tombstone is build-flag-independent and only
 * needs the prod build.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '../..')
const BROWSER_BUNDLE = resolve(REPO_ROOT, 'dist/browser/index.js')
const BROWSER_DIST_DIR = resolve(REPO_ROOT, 'dist/browser')

describe('cortex_send + CORTEX_TOKEN tombstone (ZF0-1326 Task 1)', () => {
  let prodBundle = ''

  beforeAll(() => {
    rmSync(BROWSER_DIST_DIR, { recursive: true, force: true })
    execFileSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CORTEX_TEST_BUILD: 'false' },
    })
    if (!existsSync(BROWSER_BUNDLE)) {
      throw new Error(`production build produced no bundle at ${BROWSER_BUNDLE}`)
    }
    prodBundle = readFileSync(BROWSER_BUNDLE, 'utf8')
  }, 180_000)

  it('production bundle contains `delete window.__cortex_send__`', () => {
    // The literal delete statement must reach the emitted artifact. esbuild
    // does NOT minify property-name accesses on `window` — `__cortex_send__`
    // remains as an identifier-shaped property name regardless of
    // minifySyntax. If this assertion ever fails after a refactor, the
    // tombstone has regressed: the bootstrap-injected primitive will outlive
    // the channel-create call and a hostile script can call it.
    expect(prodBundle).toContain('delete window.__cortex_send__')
  })

  it('production bundle contains `delete window.__CORTEX_TOKEN__`', () => {
    // Same shape as the send-primitive delete. If this assertion fails, the
    // token-leak leg of the XSS RCE vector has re-opened — a hostile script
    // can read window.__CORTEX_TOKEN__ post-boot and forge an authed message.
    expect(prodBundle).toContain('delete window.__CORTEX_TOKEN__')
  })

  // Note: a previous version of this test asserted
  //   expect(prodBundle).not.toMatch(/token:\s*window\.__CORTEX_TOKEN__/)
  // to catch send-time global reads. Removed in Step 4 review fix because
  // the regex is brittle to esbuild output transforms (e.g., bracket-form
  // `window["__CORTEX_TOKEN__"]`, future minifier choices). Replaced with
  // a source-level invariant test in `tests/integration/channel-source-invariants.test.ts`
  // that asserts the SOURCE has exactly 2 `window.__CORTEX_TOKEN__` reads
  // (the two capture sites) — rename-resistant AND minifier-independent.
})
