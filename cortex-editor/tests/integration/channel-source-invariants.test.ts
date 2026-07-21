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

  it('contains exactly 4 references to `window.__CORTEX_TOKEN__` (capture+delete pair in each of Vite + WebSocket channels)', () => {
    // Vite channel: capture + delete = 2
    // WS channel: capture + delete = 2
    // Total: 4. A regression that re-reads window.__CORTEX_TOKEN__ at
    // send time (e.g., reverting `token: capturedToken` back to
    // `token: window.__CORTEX_TOKEN__`) bumps the count to 5+.
    const matches = code.match(/window\.__CORTEX_TOKEN__/g) ?? []
    expect(matches.length).toBe(4)
  })

  it('contains exactly 5 references to `window.__cortex_send__` (Vite capture+delete; WS install + dispose identity-check + dispose delete)', () => {
    // Vite channel: capture + delete = 2
    // WS channel (3B): 3 references —
    //   1. install:          window.__cortex_send__ = activationBridge
    //   2. dispose id-check:  window.__cortex_send__ === activationBridge
    //   3. dispose delete:    delete window.__cortex_send__
    //   The install + dispose delete clear the sentinel bootstrap() uses to
    //   detect the Vite adapter; the identity-check guards against clobbering a
    //   foreign primitive. NONE reads the primitive to forward a message.
    // Total: 5. A regression that re-READS window.__cortex_send__ to SEND at
    // send time bumps the count and trips the "never a read" test below.
    const matches = code.match(/window\.__cortex_send__/g) ?? []
    expect(matches.length).toBe(5)
  })

  it('the WebSocket channel never READS `window.__cortex_send__` to forward a message', () => {
    // The ZF0-1326 property this file guards: nothing may use the HMR send
    // primitive off window to transmit after capture. Classify every reference:
    //   1. Vite capture:    const capturedSend = window.__cortex_send__
    //   2. Vite delete:     delete window.__cortex_send__
    //   3. WS install:      window.__cortex_send__ = activationBridge   (assignment)
    //   4. WS dispose id:   window.__cortex_send__ === activationBridge (identity check, not a send)
    //   5. WS dispose del:  delete window.__cortex_send__
    // References NOT immediately followed by `=`/`===` are the reads and
    // delete-operands: the Vite capture (1) and the two delete operands (2, 5).
    // The install (3) and the dispose identity-check (4) are followed by `=`.
    // None of the five uses the primitive to send.
    const nonAssignmentRefs = [...code.matchAll(/window\.__cortex_send__(?!\s*=)/g)]
    expect(nonAssignmentRefs.length).toBe(3)
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
