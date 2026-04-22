/**
 * Live-browser counterpart to the `it.skip`'d F6 unit test at
 * `tests/browser/override.test.ts:1303`. Proves that
 * `canonicalizeCssValue` (override.ts:509-534) correctly matches hex
 * against rgb so the override is removed cleanly rather than surfacing
 * a bogus divergence card.
 *
 * The F6 unit test was skipped because happy-dom's `getComputedStyle`
 * does not perform CSS value canonicalization (colors, keywords, etc.)
 * — any attempt to assert on the real branch silently passed via the
 * string-equality fast path (`'#3366ff' === 'rgb(51, 102, 255)'` is
 * false, but the downstream canonicalize call returned `''` on both
 * sides, so `valuesMatch` returned false for the wrong reason). A real
 * Chromium browser is the only environment where this can be tested
 * meaningfully; that's what this spec provides.
 *
 * ----------------------------------------------------------------------
 * Falsifiability proof performed 2026-04-22 (per CLAUDE.md Test
 * Anti-Patterns §2 — assertions must be falsifiable):
 *
 *   Mutation: temporarily patched `canonicalizeCssValue` at
 *   override.ts:509-534 to `return ''` unconditionally, rebuilt the
 *   bundle with `npm run build`, re-ran this spec.
 *
 *   Observed failure:
 *     - Case 1 (hex → rgb) FAILED — a divergence event fired with
 *       { expected: '#3366ff', actual: 'rgb(51, 102, 255)',
 *         diagnostics.actualReadFrom: 'inline-style' }.
 *       Override was NOT removed (the `<style data-cortex-override>`
 *       text still contained a `color:` rule after the retry window).
 *       This proves Case 1 actually exercises the canonicalization
 *       path — take canonicalization away and the test breaks.
 *     - Case 2 (short hex #fff → rgb) FAILED for the same reason.
 *     - Case 3 (rgb → rgb identity) PASSED. Expected: `valuesMatch`'s
 *       string-equality fast path (override.ts:480) matches both sides
 *       before canonicalization is consulted, so mutating
 *       `canonicalizeCssValue` has no effect on this path. Case 3 is
 *       therefore a regression guard on the fast path itself, not on
 *       canonicalization — by design.
 *
 *   Revert: restored override.ts, rebuilt, re-ran. All 3 cases green.
 * ----------------------------------------------------------------------
 */
import { test, expect } from '@playwright/test'
import { installFixtureServer, FIXTURE_URL } from './helpers/fixture-server.js'
import { setupDebugBridge, waitForBridge, collectDivergences } from './helpers/bridge.js'

const SOURCE = 'fixture:1:1'

/**
 * Read the current `color:` declaration from the
 * `<style data-cortex-override>` element. Returns the raw declaration
 * text if present, or null if the override has been cleanly removed.
 * An empty style tag or a rule set with no `color:` inside counts as
 * "removed" — the OverrideManager prunes whole rule blocks when the
 * last declaration clears, but a stale-but-empty style element is
 * equally acceptable observable behavior.
 */
async function colorOverrideDeclaration(page: import('@playwright/test').Page): Promise<string | null> {
  return await page.evaluate(() => {
    const styleEl = document.head.querySelector('style[data-cortex-override]')
    if (!styleEl) return null
    const text = styleEl.textContent ?? ''
    const match = text.match(/color\s*:\s*([^;]+);/i)
    return match && match[1] ? match[1].trim() : null
  })
}

/**
 * Count any `.cortex-error-card` nodes rendered in the Panel's Shadow
 * DOM. Relies on `setupDebugBridge` having patched `attachShadow` to
 * `open` mode, so the root is accessible from Playwright.
 */
async function errorCardCount(page: import('@playwright/test').Page): Promise<number> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return 0
    return root.querySelectorAll('.cortex-error-card').length
  })
}

test.describe('override canonicalization (ZF0-1314 — closes F6 happy-dom gap)', () => {
  // Enough to cover VERIFY_RETRY_WINDOW_MS (750ms) + scheduling slack.
  const RETRY_BUDGET_MS = 1500

  async function runCanonicalizationCase(
    page: import('@playwright/test').Page,
    editValue: string,
    canonicalInline: string,
    editId: string,
  ): Promise<void> {
    await setupDebugBridge(page)
    await installFixtureServer(page)
    await page.goto(FIXTURE_URL)
    await page.waitForFunction(() => typeof (globalThis as any).CortexEditor !== 'undefined', null, { timeout: 5000 })
    await waitForBridge(page)

    const { events, unsubscribe } = await collectDivergences(page)

    // Simulate the React commit that the Code Translator would produce:
    // the inline `color` on the seed element is already the browser's
    // canonical serialization of `editValue`. The OverrideManager must
    // match the edit (in original shape) against this inline value via
    // `canonicalizeCssValue`.
    await page.evaluate((canonical) => {
      const el = document.querySelector<HTMLElement>('#center')
      if (!el) throw new Error('fixture seed element missing')
      el.style.color = canonical
    }, canonicalInline)

    await page.evaluate(
      ({ source, value, id }) => {
        const bridge = (globalThis as any).__CORTEX_TEST__
        bridge.overrideManager.set(source, 'color', value)
        bridge.overrideManager.flush()
        bridge.overrideManager.trackPendingEdit(id, source, 'color', value)
        bridge.overrideManager.handleHMRVerified(id, true, 'jsx-immediate')
      },
      { source: SOURCE, value: editValue, id: editId },
    )

    // Override must be removed within the retry budget — poll on the
    // style element, never a fixed sleep.
    await expect
      .poll(() => colorOverrideDeclaration(page), { timeout: RETRY_BUDGET_MS })
      .toBeNull()

    // Patience check: no divergence emitted even after we've confirmed
    // removal. Events accrue asynchronously, so re-read after the poll
    // resolves — there should still be none.
    expect(events).toHaveLength(0)

    // No EditErrorCard rendered — the Panel subscribes to the same bus
    // and renders a card on divergence. This guards against silent UI
    // regressions that don't fire the debug listener.
    expect(await errorCardCount(page)).toBe(0)

    await unsubscribe()
  }

  test('hex (#3366ff) canonicalizes to rgb and removes cleanly', async ({ page }) => {
    await runCanonicalizationCase(page, '#3366ff', 'rgb(51, 102, 255)', 'canon-hex-long-1')
  })

  test('short hex (#fff) canonicalizes to rgb and removes cleanly', async ({ page }) => {
    await runCanonicalizationCase(page, '#fff', 'rgb(255, 255, 255)', 'canon-hex-short-1')
  })

  test('rgb identity (already-canonical) takes the fast path and removes cleanly', async ({ page }) => {
    // Both sides are the browser's canonical form — `valuesMatch`'s
    // string-equality fast path (override.ts:480) fires before
    // canonicalization. This case is a regression guard: if anyone ever
    // "simplifies" the fast path away, the retry-and-divergence path
    // would still canonicalize successfully, but this test would catch
    // the regression in a surface where it's easy to reason about.
    await runCanonicalizationCase(page, 'rgb(51, 102, 255)', 'rgb(51, 102, 255)', 'canon-rgb-identity-1')
  })
})
