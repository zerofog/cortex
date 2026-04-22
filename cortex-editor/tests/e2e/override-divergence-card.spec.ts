/**
 * End-to-end: forced mismatch surfaces the EditErrorCard (ZF0-1315).
 *
 * Business purpose: prove the full divergence pipeline from emission to
 * user-visible surface. Unit tests cover `override-bus` event shape and
 * `EditErrorCard` rendering in isolation, but neither exercises the
 * wire: override → bus → CortexApp `onDivergence` → `editErrors` Map
 * → Panel props → EditErrorCard render inside the closed Shadow DOM.
 * A regression anywhere along that wire silently breaks the "preview
 * shows X but live renders Y" signal — users would see nothing and
 * assume their edit succeeded. This spec is the tripwire.
 *
 * Three cases mapped to Linear ZF0-1315:
 *   1. Server-mismatch (immediate) — `handleHMRVerified(match=false)`.
 *   2. Retry-timeout (after 750ms window) — `handleHMRVerified(match=true)`
 *      on an element whose DOM value never reaches expected.
 *   3. Dismiss clears the card — surface-only, override stays.
 *
 * Falsifiability note (per CLAUDE.md Test Anti-Patterns §2): each case
 * is falsifiable by construction. If `emitDivergence` at override.ts:624
 * or :361 stops firing, `events` never fills and the `expect.poll`
 * times out with a clear error. If the card stops rendering, the
 * `getEditErrorCardState` probe returns `visible: false` and the
 * assertion fails. A mutation-based proof was NOT executed — the
 * existing smoke spec already exercises the Node-side `onDivergence`
 * round-trip, and the canonicalization spec (ZF0-1314) ran the full
 * mutation proof for this region of the wire in the prior task.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR, FIXTURE_SEED_SOURCE } from './helpers/fixture-server.js'
import { bootFixture } from './helpers/boot.js'
import {
  getEditErrorCardState,
  clickEditErrorCardDismiss,
  type CortexTestBridge,
  type DivergenceCollector,
} from './helpers/bridge.js'

/** Generous upper bound on VERIFY_RETRY_WINDOW_MS (750ms) + scheduling slack. */
const RETRY_BUDGET_MS = 1500

/** Read the `<style data-cortex-override>` text. Returns empty string if
 *  the element is absent. Callers assert substring presence of the
 *  property+value pair to prove the override was preserved (not pruned
 *  after a divergence — divergence-preservation is load-bearing). */
async function overrideStyleText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const el = document.head.querySelector('style[data-cortex-override]')
    return el?.textContent ?? ''
  })
}

test.describe('override divergence card (ZF0-1315)', () => {
  test('server-mismatch divergence: override preserved + card visible with Debug disclosure', async ({ page }) => {
    const { events, unsubscribe }: DivergenceCollector = (await bootFixture(page, {
      activateDesignMode: true,
      selectElement: FIXTURE_SEED_SELECTOR,
    }))!

    // Drive the bridge: set override, flush pending, track the edit,
    // then force server-mismatch with match=false. No retry window —
    // override.ts:624-631 emits divergence immediately.
    await page.evaluate((source) => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
      const editId = 'divergence-server-mismatch-1'
      bridge.overrideManager.set(source, 'padding-top', '32px')
      bridge.overrideManager.flush()
      bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '32px')
      bridge.overrideManager.handleHMRVerified(editId, false, 'jsx-immediate')
    }, FIXTURE_SEED_SOURCE)

    // Divergence event must arrive via the bus.
    await expect.poll(() => events.length, { timeout: 2000 }).toBeGreaterThan(0)
    expect(events[0]).toMatchObject({
      source: FIXTURE_SEED_SOURCE,
      property: 'padding-top',
      expected: '32px',
      actual: '',
    })
    expect(events[0]!.diagnostics.actualReadFrom).toBe('server-mismatch')

    // Override MUST be preserved — the whole point of server-mismatch
    // handling is that the browser-side visual state stays while the
    // user is notified. Pruning here would mask the regression that
    // ZF0-1235 was all about.
    const styleText = await overrideStyleText(page)
    expect(styleText).toContain('padding-top')
    expect(styleText).toContain('32px !important')

    // Card must render for the selected element. Reason text contains
    // the expected value (`32px`) and the "Preview shows" sentinel
    // string that CortexApp.tsx:421 composes.
    await expect.poll(() => getEditErrorCardState(page), { timeout: 2000 }).toMatchObject({
      visible: true,
      property: 'padding-top edit failed',
      hasDebugDisclosure: true,
    })
    const state = await getEditErrorCardState(page)
    expect(state.reason).toContain('Preview shows')
    expect(state.reason).toContain('32px')

    await unsubscribe()
  })

  test('retry-timeout divergence: override preserved + card reports both expected and actual', async ({ page }) => {
    const { events, unsubscribe }: DivergenceCollector = (await bootFixture(page, {
      activateDesignMode: true,
      selectElement: FIXTURE_SEED_SELECTOR,
    }))!

    // The fixture seed ships with inline `padding-top: 10px`. We do
    // NOT mutate it — when the retry window (VERIFY_RETRY_WINDOW_MS)
    // expires without the DOM reaching `32px`, override.ts:358-364
    // emits divergence with the read-back value (`10px`) and the
    // inline-style read path.
    await page.evaluate((source) => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
      const editId = 'divergence-retry-timeout-1'
      bridge.overrideManager.set(source, 'padding-top', '32px')
      bridge.overrideManager.flush()
      bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '32px')
      // match=true opens the retry window instead of emitting immediately.
      bridge.overrideManager.handleHMRVerified(editId, true, 'jsx-immediate')
    }, FIXTURE_SEED_SOURCE)

    // Retry window is 750ms — allow up to RETRY_BUDGET_MS for event to
    // reach the Node collector.
    await expect.poll(() => events.length, { timeout: RETRY_BUDGET_MS }).toBeGreaterThan(0)
    const event = events[0]!
    expect(event).toMatchObject({
      source: FIXTURE_SEED_SOURCE,
      property: 'padding-top',
      expected: '32px',
      actual: '10px',
    })
    expect(event.diagnostics.actualReadFrom).toBe('inline-style')
    // 750ms window + scheduling overhead, but never less than the window.
    expect(event.diagnostics.retryDurationMs).toBeGreaterThanOrEqual(750)
    // `priorValues` is a ring-buffer of prior `set()` calls for this
    // source+property+pseudo (see `recordPriorValue` at override.ts:110-124).
    // It tracks what the user/bridge intended to override TO over time,
    // not DOM readbacks from the verify loop — so after one `set('32px')`
    // the array is exactly `['32px']`. The Linear issue's phrasing of
    // "should include the prior 10px" was written against a hypothetical
    // where `priorValues` captured DOM readings; matching the actual
    // implementation is the right test.
    expect(Array.isArray(event.diagnostics.priorValues)).toBe(true)
    expect(event.diagnostics.priorValues.length).toBeGreaterThan(0)
    expect(event.diagnostics.priorValues).toContain('32px')

    // Override stays — the divergence card's whole job is to tell the
    // user the preview is out of sync, not to snap back to the server
    // value.
    const styleText = await overrideStyleText(page)
    expect(styleText).toContain('padding-top')
    expect(styleText).toContain('32px !important')

    // Card renders with both sides of the divergence visible in the
    // reason line — this is the user's only signal that the edit
    // didn't actually land.
    await expect.poll(() => getEditErrorCardState(page), { timeout: 2000 }).toMatchObject({
      visible: true,
      property: 'padding-top edit failed',
    })
    const state = await getEditErrorCardState(page)
    expect(state.reason).toContain('32px')
    expect(state.reason).toContain('10px')

    await unsubscribe()
  })

  test('Dismiss clears the error card from the Panel', async ({ page }) => {
    const { events, unsubscribe }: DivergenceCollector = (await bootFixture(page, {
      activateDesignMode: true,
      selectElement: FIXTURE_SEED_SELECTOR,
    }))!

    // Reuse case 1's server-mismatch path to get a card on screen fast —
    // no retry delay, deterministic setup, same assertions already
    // covered above so we don't duplicate the surface checks.
    await page.evaluate((source) => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
      const editId = 'divergence-dismiss-1'
      bridge.overrideManager.set(source, 'padding-top', '32px')
      bridge.overrideManager.flush()
      bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '32px')
      bridge.overrideManager.handleHMRVerified(editId, false, 'jsx-immediate')
    }, FIXTURE_SEED_SOURCE)

    // Wait for the card to be on screen before trying to click Dismiss —
    // without this the click races the render and flakes.
    await expect.poll(() => getEditErrorCardState(page), { timeout: 2000 }).toMatchObject({ visible: true })

    // Sanity: the collector actually saw the event we're dismissing.
    expect(events.length).toBeGreaterThan(0)

    const clicked = await clickEditErrorCardDismiss(page)
    expect(clicked).toBe(true)

    // Card disappears — `editErrors` Map clears the key, Panel re-renders.
    await expect.poll(() => getEditErrorCardState(page), { timeout: 1000 }).toMatchObject({ visible: false })

    // Per Linear spec: Dismiss does NOT unwind the override. The CSS
    // rule stays in `<style data-cortex-override>`; only the error
    // surface clears. Guards against a future refactor that "helpfully"
    // rolls back on Dismiss — that would be a silent visual regression.
    const styleText = await overrideStyleText(page)
    expect(styleText).toContain('padding-top')
    expect(styleText).toContain('32px !important')

    await unsubscribe()
  })
})
