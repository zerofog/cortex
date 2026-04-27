/**
 * Source-level invariants for the channel tombstone (ZF0-1326 Task 1, Step 4
 * review fix).
 *
 * The bundle-grep test in `cortex-send-tombstone.test.ts` is build-aware but
 * brittle to esbuild output transforms (bracket-form property access,
 * future minifier choices). This file does the complementary check at the
 * SOURCE level — counting occurrences of `window.__CORTEX_TOKEN__` and
 * `window.__cortex_send__` in `src/browser/channel.ts`.
 *
 * The invariant: there should be exactly 2 occurrences of each global —
 * one capture-into-closure read and one delete. Any third occurrence
 * suggests a regression where a send-time read of the tombstoned global
 * has been re-introduced (e.g., by reverting `capturedToken` back to
 * `window.__CORTEX_TOKEN__` inside the send callback).
 *
 * This is rename-resistant (the global name IS the security primitive's
 * name; renaming it requires updating both source and test by name —
 * unlike the bundle-grep where minifier output is variable). It also
 * skips the build cost — runs in milliseconds.
 *
 * Why both this AND the bundle-grep test exist:
 * - Source test catches: send-time global re-reads (the regression mode
 *   the previous brittle bundle regex tried to catch).
 * - Bundle test catches: DCE accidentally stripping the delete statements.
 *
 * Together: rename-resistant + DCE-resistant.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '../..')
const CHANNEL_SOURCE = resolve(REPO_ROOT, 'src/browser/channel.ts')

describe('channel.ts source-level invariants (ZF0-1326 Task 1)', () => {
  const source = readFileSync(CHANNEL_SOURCE, 'utf8')

  // Strip comment lines so the assertions can't false-pass on
  // documentation-only mentions of the global names. Single-line and
  // block comments both removed.
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[\s]*\/\/.*$/gm, '')

  const code = stripComments(source)

  it('contains exactly 2 references to `window.__CORTEX_TOKEN__` (capture + delete in createViteChannel only — createWebSocketChannel adds 2 more for a total of 4)', () => {
    // Vite channel: capture (line 35) + delete (line 38) = 2
    // WS channel: capture (line 111) + delete (line 112) = 2
    // Total: 4. A regression that re-reads window.__CORTEX_TOKEN__ at
    // send time (e.g., reverting `token: capturedToken` back to
    // `token: window.__CORTEX_TOKEN__`) bumps the count to 5+.
    const matches = code.match(/window\.__CORTEX_TOKEN__/g) ?? []
    expect(matches.length).toBe(4)
  })

  it('contains exactly 2 references to `window.__cortex_send__` (capture + delete in createViteChannel only)', () => {
    // Vite channel: capture (line 35) + delete (line 37) = 2
    // WS channel: 0 references (uses native WebSocket, not the HMR primitive)
    // Total: 2. A regression that re-reads window.__cortex_send__ at
    // send time bumps the count to 3+.
    const matches = code.match(/window\.__cortex_send__/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('contains the delete statements that the tombstone semantic depends on', () => {
    // Positive existence check — pairs with the bundle-grep test which
    // verifies DCE doesn't strip these from the emitted bundle. Together
    // they prove: the source has the delete, AND the bundle keeps it.
    expect(code).toContain('delete window.__cortex_send__')
    expect(code).toContain('delete window.__CORTEX_TOKEN__')
  })

  it('does NOT contain the pre-tombstone send-time global read pattern', () => {
    // The pre-fix shape was `token: window.__CORTEX_TOKEN__` inside the
    // send callbacks. Post-fix this is replaced with `token: capturedToken`.
    // This assertion catches a regression that re-reads the global at
    // send time (where the closure-captured value would be the only
    // legitimate source).
    expect(code).not.toMatch(/token:\s*window\.__CORTEX_TOKEN__/)
  })
})
