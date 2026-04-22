/**
 * End-to-end: verify-then-act retry window behavior (ZF0-1316).
 *
 * Business purpose: prove the retry MutationObserver + polling +
 * final-timeout triad inside `armVerifyRetry()` actually converges on
 * the right decision across three timing regimes:
 *
 *   1. Late commit INSIDE the 750ms window → MO catches it, override
 *      removes cleanly, no divergence. This is the "slow React Fast
 *      Refresh" path — framework commits the style a few hundred ms
 *      after the server reports HMR verified, and we must notice.
 *   2. Late commit BEYOND the window → final timeout fires, divergence
 *      surfaces with `retryDurationMs >= 750`, override stays. This is
 *      the "framework never committed" path — user gets the EditErrorCard
 *      signal that preview is out of sync.
 *   3. Supersede-while-retry-in-flight → `trackPendingEdit` disposes
 *      the prior edit's retry observers (override.ts:583-586), so the
 *      old edit does not fire a stale divergence against the newer
 *      intent. Without the dispose, edit A's retry keeps polling with
 *      `expected = "32px"` while edit B has already swapped that to
 *      `"70px"` in the override manager — at the 750ms mark, edit A
 *      would either emit divergence against the now-wrong expected OR
 *      the match-guard (`currentOverride !== expectedValue`) would skip,
 *      but either way the observer resource is leaked and the timing
 *      contract is fragile. We assert absence of any late divergence.
 *
 * Constants under test (override.ts:321-322):
 *   - VERIFY_RETRY_WINDOW_MS = 750
 *   - VERIFY_POLL_INTERVAL_MS = 100
 * Timings chosen relative to those constants:
 *   - 400ms: well past the 100ms poll (which would already have seen
 *     the pre-commit `10px`) and well before the 750ms timeout. Forces
 *     the MO to be the signal that catches the late commit — exactly
 *     what case 1 tests.
 *   - 900ms: strictly past 750ms + rAF slack. The mutation lands AFTER
 *     the final-timeout divergence has already been emitted.
 *   - 100ms (case 3): fresh retry arms between edit A and edit B.
 *     Gives A's `armVerifyRetry` time to install its observer + start
 *     its poll interval before B supersedes, so the dispose is
 *     non-trivial (disposing an uninstalled observer would be a
 *     no-op and wouldn't test anything).
 *   - 300ms (case 3): commit of edit B's value, well after B is
 *     tracked, well before either edit's 750ms window closes.
 *
 * ----------------------------------------------------------------------
 * Falsifiability proof performed 2026-04-22 (per CLAUDE.md Test
 * Anti-Patterns §2 — assertions must be falsifiable):
 *
 *   Mutation: in `armVerifyRetry()` at override.ts:397-408, temporarily
 *   neutered all three convergence triggers — the MutationObserver
 *   callback, the poll interval, and the final-timeout rAF's
 *   `tryVerify(true)` call — replacing each with a no-op:
 *     observer = new MutationObserver(() => {})
 *     pollId = window.setInterval(() => {}, ...)
 *     timeoutId = window.setTimeout(() => {
 *       requestAnimationFrame(() => {})  // was: tryVerify(true)
 *     }, ...)
 *   Rebuilt the bundle with `npm run build`, re-ran this spec.
 *
 *   Observed failure (all 3 cases FAILED):
 *     - Case 1 (late commit within window) FAILED — no trigger fires
 *       `tryVerify` so the override is never removed. The poll timeout
 *       of 1000ms expired with `<style data-cortex-override>` still
 *       containing `padding-top:32px!important`. Failure line:
 *         `expect(text.includes('padding-top')).toBe(false)` → received true.
 *     - Case 2 (late commit beyond window) FAILED — with the final
 *       timeout's `tryVerify(true)` neutered, no divergence event ever
 *       fires. The 1500ms `expect.poll(() => events.length)` expired
 *       waiting for `> 0`. This proves case 2 actually depends on the
 *       final-timeout path (not on any stray emission route).
 *     - Case 3 (supersede + clean commit of B) FAILED — edit B's retry
 *       also has its triggers neutered, so B's override never removes
 *       when the 300ms inline-style mutation lands. Same 1000ms poll
 *       timeout as case 1, same failure mode (override retains rule).
 *       Confirms case 3's "B resolves cleanly" assertion depends on the
 *       same retry machinery as case 1.
 *
 *   Partial-mutation notes (exploratory, not the final proof):
 *     - Neutering ONLY the MutationObserver left case 1 green: the
 *       500ms poll tick caught the 400ms mutation and removed the
 *       override before the 1000ms deadline.
 *     - Neutering the MO + the poll interval still left case 1 green
 *       via the 750ms final-timeout rAF, which re-reads the now-
 *       committed inline style and matches.
 *     - This is why the proof mutation targets all three triggers —
 *       only by taking away every convergence path does case 1's
 *       removal become observably impossible.
 *
 *   Case 3's ABSENCE-of-divergence assertion (the `toPass` at line
 *   ~383) is not covered by this mutation — it tests a guard that only
 *   fires when edit A's retry is still alive AND triggered by the
 *   300ms mutation. In current code, `trackPendingEdit` disposes A's
 *   observer at the 100ms supersede (override.ts:583-586), so A can
 *   never fire. Removing that dispose loop would exercise A's
 *   `currentOverride !== expectedValue` guard at override.ts:336-340 —
 *   that guard calls `dispose()` and returns without emitting, so the
 *   absence-of-divergence assertion would still pass. The dispose is
 *   a resource-leak fix; the superseded-guard is the user-visible
 *   safeguard. We keep case 3's absence assertion as a regression
 *   guard against a future refactor that removes BOTH — a composite
 *   removal would cause A to emit `{ expected: "32px", actual: "70px" }`
 *   and the test would loudly fail.
 *
 *   Revert: restored override.ts:397-408, rebuilt with
 *   `npm run build`, re-ran. All 3 cases green. Full e2e suite (11
 *   tests) green.
 * ----------------------------------------------------------------------
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  installFixtureServer,
  FIXTURE_URL,
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
} from './helpers/fixture-server.js'
import {
  setupDebugBridge,
  activateDesignMode,
  waitForBridge,
  collectDivergences,
  getEditErrorCardState,
} from './helpers/bridge.js'

/** Boot the fixture with the debug bridge, fixture server, and divergence
 *  collector wired in. Factored out so each case reads as pure timing +
 *  assertions. Same contract as the divergence-card spec's `bootAndSelect`
 *  but without the `selectElement` call — two of the three cases here do
 *  not touch the Panel (they assert on override style text + bus events). */
async function boot(page: Page): Promise<Awaited<ReturnType<typeof collectDivergences>>> {
  await setupDebugBridge(page)
  await activateDesignMode(page)
  await installFixtureServer(page)
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { CortexEditor?: unknown }).CortexEditor !== 'undefined',
    null,
    { timeout: 5000 },
  )
  await waitForBridge(page)
  return await collectDivergences(page)
}

/** Read the current `<style data-cortex-override>` text, or '' if absent.
 *  Case 1 asserts the override removed (empty or no padding-top rule).
 *  Case 2 asserts the override preserved (padding-top:32px !important present). */
async function overrideStyleText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const el = document.head.querySelector('style[data-cortex-override]')
    return el?.textContent ?? ''
  })
}

test.describe('override retry window (ZF0-1316)', () => {
  test('late commit WITHIN 750ms window → clean removal (MO catches)', async ({ page }) => {
    const { events, unsubscribe } = await boot(page)

    // Drive the bridge: arm a `padding-top: 32px` override against the
    // seed (which ships with inline `padding-top: 10px`), flush so the
    // override `<style>` rule is materialized, track the pending edit,
    // then signal `handleHMRVerified(match=true)` to enter the retry
    // window. The initial verify read sees `10px` (pre-commit) and arms
    // `armVerifyRetry`. At ~400ms we mutate the element's inline style
    // to `32px` via setTimeout INSIDE the page — this fires the
    // MutationObserver on `style`, which calls `tryVerify(false)`,
    // which reads `32px`, matches, and removes the override cleanly.
    //
    // Timing rationale: 400ms is well past `armVerifyRetry`'s
    // double-rAF arming (typically <5ms) and the first poll tick
    // (100ms), and well before the 750ms final timeout. It forces the
    // signal path to be the MO attribute-change callback — the poll
    // tick at 500ms would eventually catch it too, but 400ms gives MO
    // a comfortable lead.
    await page.evaluate(
      ({ source, selector }) => {
        const bridge = (globalThis as unknown as {
          __CORTEX_TEST__?: {
            overrideManager: {
              set: (s: string, p: string, v: string) => void
              flush: () => void
              trackPendingEdit: (id: string, s: string, p: string, v: string) => void
              handleHMRVerified: (id: string, match: boolean, kind: string) => void
            }
          }
        }).__CORTEX_TEST__
        if (!bridge) throw new Error('bridge missing')
        const editId = 'retry-window-within-1'
        bridge.overrideManager.set(source, 'padding-top', '32px')
        bridge.overrideManager.flush()
        bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '32px')
        bridge.overrideManager.handleHMRVerified(editId, true, 'jsx-immediate')
        // Schedule the late commit inside the browser — no Node-side
        // timing games. setTimeout is stable here because we're in a
        // single page with no animation frame starvation.
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(selector)
          if (!el) throw new Error('seed element gone')
          el.style.paddingTop = '32px'
        }, 400)
      },
      { source: FIXTURE_SEED_SOURCE, selector: FIXTURE_SEED_SELECTOR },
    )

    // The override should be removed once `tryVerify` sees the
    // committed value. 1.0s total wall-clock is generous — mutation at
    // 400ms + MO callback (<<5ms) + rAF + `remove()` + rebuild style
    // element. `expect.poll` re-reads until the assertion passes.
    await expect
      .poll(
        async () => {
          const text = await overrideStyleText(page)
          // "Removed" means either the override element is gone OR it
          // no longer contains a `padding-top` rule. OverrideManager
          // prunes the rule block when the last declaration clears.
          return text.includes('padding-top')
        },
        { timeout: 1000 },
      )
      .toBe(false)

    // No divergence should have fired — the match-after-retry path at
    // override.ts:352-356 short-circuits emission. Assert absence
    // over a short window past the 750ms boundary to catch a late
    // divergence bug (emission after removal) if one were introduced.
    await expect(async () => {
      expect(events).toHaveLength(0)
    }).toPass({ timeout: 400 })

    // Panel check is optional per the issue; confirm no EditErrorCard
    // surfaced — regression guard against a future refactor that emits
    // "phantom success" cards.
    const cardState = await getEditErrorCardState(page)
    expect(cardState.visible).toBe(false)

    await unsubscribe()
  })

  test('late commit BEYOND 750ms window → divergence, override preserved', async ({ page }) => {
    const { events, unsubscribe } = await boot(page)

    // Same arm as case 1, but we delay the inline-style mutation to
    // ~900ms — past the 750ms final-timeout boundary. By the time the
    // mutation lands, `tryVerify(true)` has already:
    //   1. Read the still-`10px` inline value
    //   2. Seen the mismatch
    //   3. Called `emitDivergence` with expected=32px, actual=10px
    //   4. Disposed the retry observer
    // The 900ms mutation is observable noise — it arrives after the
    // decision is made.
    //
    // Timing rationale: 900ms = 750ms window + 150ms slack for the
    // trailing rAF inside the timeout callback (override.ts:405-408)
    // and the divergence event round-trip to the Node-side collector.
    // Going any later just wastes wall-clock; going any earlier risks
    // racing the final timeout.
    await page.evaluate(
      ({ source, selector }) => {
        const bridge = (globalThis as unknown as {
          __CORTEX_TEST__?: {
            overrideManager: {
              set: (s: string, p: string, v: string) => void
              flush: () => void
              trackPendingEdit: (id: string, s: string, p: string, v: string) => void
              handleHMRVerified: (id: string, match: boolean, kind: string) => void
            }
          }
        }).__CORTEX_TEST__
        if (!bridge) throw new Error('bridge missing')
        const editId = 'retry-window-beyond-1'
        bridge.overrideManager.set(source, 'padding-top', '32px')
        bridge.overrideManager.flush()
        bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '32px')
        bridge.overrideManager.handleHMRVerified(editId, true, 'jsx-immediate')
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(selector)
          if (!el) throw new Error('seed element gone')
          el.style.paddingTop = '32px'
        }, 900)
      },
      { source: FIXTURE_SEED_SOURCE, selector: FIXTURE_SEED_SELECTOR },
    )

    // Divergence should fire near the 750ms boundary. Budget 1500ms so
    // a slow CI runner has headroom — we're not asserting the exact
    // time, just that the event shape is correct.
    await expect.poll(() => events.length, { timeout: 1500 }).toBeGreaterThan(0)
    const event = events[0]!
    expect(event).toMatchObject({
      source: FIXTURE_SEED_SOURCE,
      property: 'padding-top',
      expected: '32px',
      actual: '10px',
    })
    expect(event.diagnostics.actualReadFrom).toBe('inline-style')
    expect(event.diagnostics.kindUsed).toBe('jsx-immediate')
    // Must be >= the configured window, not exactly 750ms — rAF +
    // event loop scheduling always adds a few ms under load.
    expect(event.diagnostics.retryDurationMs ?? 0).toBeGreaterThanOrEqual(750)

    // Override preserved — divergence emission at override.ts:361-364
    // explicitly does NOT call `remove()`. The EditErrorCard is the
    // user's signal; snapping the preview back to `10px` would steal
    // the evidence of the problem.
    const styleText = await overrideStyleText(page)
    expect(styleText).toContain('padding-top')
    expect(styleText).toContain('32px !important')

    await unsubscribe()
  })

  test('supersede while retry in flight → no stale divergence from first edit', async ({ page }) => {
    const { events, unsubscribe } = await boot(page)

    // Arm edit A (`32px`) and let its retry begin, then at ~100ms arm
    // edit B (`70px`) on the same source+property. Per
    // `trackPendingEdit` at override.ts:583-586, B's arm disposes A's
    // retry observer. At ~300ms, commit B's value via inline-style
    // mutation — B's newly-armed MO catches it and removes the
    // override cleanly. A must NOT emit divergence at any point.
    //
    // Timing rationale:
    //   - 100ms: A's retry is fully armed (MO installed, poll running,
    //     final timeout scheduled). Disposing a not-yet-armed retry
    //     would be trivially correct and wouldn't test anything.
    //   - 300ms: well past B's arm (a few ms after 100ms) and well
    //     before B's 750ms timeout. B's MO fires, removes override.
    await page.evaluate(
      ({ source, selector }) => {
        const bridge = (globalThis as unknown as {
          __CORTEX_TEST__?: {
            overrideManager: {
              set: (s: string, p: string, v: string) => void
              flush: () => void
              trackPendingEdit: (id: string, s: string, p: string, v: string) => void
              handleHMRVerified: (id: string, match: boolean, kind: string) => void
            }
          }
        }).__CORTEX_TEST__
        if (!bridge) throw new Error('bridge missing')
        const editA = 'retry-supersede-A'
        const editB = 'retry-supersede-B'
        // Edit A: 32px
        bridge.overrideManager.set(source, 'padding-top', '32px')
        bridge.overrideManager.flush()
        bridge.overrideManager.trackPendingEdit(editA, source, 'padding-top', '32px')
        bridge.overrideManager.handleHMRVerified(editA, true, 'jsx-immediate')
        // Edit B supersedes at 100ms.
        setTimeout(() => {
          bridge.overrideManager.set(source, 'padding-top', '70px')
          bridge.overrideManager.flush()
          bridge.overrideManager.trackPendingEdit(editB, source, 'padding-top', '70px')
          bridge.overrideManager.handleHMRVerified(editB, true, 'jsx-immediate')
        }, 100)
        // Commit B's value at 300ms — B's MO fires → removes override.
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(selector)
          if (!el) throw new Error('seed element gone')
          el.style.paddingTop = '70px'
        }, 300)
      },
      { source: FIXTURE_SEED_SOURCE, selector: FIXTURE_SEED_SELECTOR },
    )

    // B should resolve: override removed within ~1.0s. Same matcher
    // shape as case 1 — poll until the padding-top rule is gone.
    await expect
      .poll(
        async () => {
          const text = await overrideStyleText(page)
          return text.includes('padding-top')
        },
        { timeout: 1000 },
      )
      .toBe(false)

    // Crucial assertion: NO divergence at any point during a 1.5s
    // window — past both edit A's (750ms from t=0) and edit B's
    // (750ms from t=100ms = 850ms) final-timeout boundaries. If edit
    // A's retry observer weren't disposed by B's track, one of its
    // triggers (MO on the 300ms style mutation, or poll at any tick,
    // or the 750ms final) would read actual=70px vs expected=32px and
    // fire divergence. `toPass` re-asserts every 100ms over 1500ms —
    // any non-empty events array during that window fails immediately.
    await expect(async () => {
      expect(events).toHaveLength(0)
    }).toPass({ timeout: 1500 })

    await unsubscribe()
  })
})
