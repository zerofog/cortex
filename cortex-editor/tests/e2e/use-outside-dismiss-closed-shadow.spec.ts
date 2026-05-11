/**
 * Closed-shadow `useOutsideDismiss` e2e coverage (ZF0-1560).
 *
 * Business purpose: the hook has a closed-shadow-aware branch (lines 114-129
 * of useOutsideDismiss.ts) that walks shadow `hosts` when an outer listener's
 * `composedPath()` is truncated at a closed-shadow boundary. Happy-dom cannot
 * faithfully simulate this retargeting (Test Anti-Pattern #3: "no happy-dom
 * theatre"). These specs exercise the hook against real Chromium event
 * retargeting through a genuinely closed ShadowRoot.
 *
 * The `bootBundleWithClosedShadow` helper intentionally skips the
 * attachShadow override that `setupDebugBridge` applies — the shadow must
 * stay closed for the retargeting branch to be exercised.
 */
import { test, expect } from '@playwright/test'
import { bootBundleWithClosedShadow } from './helpers/closed-shadow.js'
import type { CortexTestBridge } from './helpers/bridge.js'

/** Resolved handle type from the kit's mountInRoot Promise. */
type KitHandle = Awaited<ReturnType<NonNullable<CortexTestBridge['useOutsideDismissKit']>['mountInRoot']>>

test.describe('useOutsideDismiss inside closed ShadowRoot (ZF0-1560) @fast-ci', () => {
  test.beforeEach(async ({ page }) => {
    await bootBundleWithClosedShadow(page)
    await page.evaluate(async () => {
      const host = document.createElement('div')
      host.id = 'closed-shadow-host'
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: 'closed' })
      const kit = (window as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__!.useOutsideDismissKit!
      ;(window as { __test_kit_handle?: KitHandle }).__test_kit_handle = await kit.mountInRoot(shadow)
    })
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      ;(window as { __test_kit_handle?: KitHandle }).__test_kit_handle?.cleanup()
    })
  })

  test('outside mousedown dismisses (Chromium retargeting through closed boundary)', async ({ page }) => {
    // Click outside the host's bounding box (popover is at 200,200 with size 120; click at 50,50 in light DOM).
    await page.mouse.click(50, 50)

    const dismissCount = await page.evaluate(() => (window as { __test_kit_handle?: KitHandle }).__test_kit_handle!.dismissCount())
    expect(dismissCount).toBe(1)
  })

  test('mousedown inside popover does NOT dismiss (closed-shadow path retargeting check)', async ({ page }) => {
    // Dispatch mousedown directly on the inside button (queryable via the kit's captured node ref, since
    // shadow is closed and Playwright cannot reach into it via DOM queries).
    await page.evaluate(() => {
      const handle = (window as { __test_kit_handle?: KitHandle }).__test_kit_handle!
      handle.insideButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    })

    const dismissCount = await page.evaluate(() => (window as { __test_kit_handle?: KitHandle }).__test_kit_handle!.dismissCount())
    expect(dismissCount).toBe(0)
  })

  test('Escape dismisses regardless of focus location', async ({ page }) => {
    await page.keyboard.press('Escape')

    const dismissCount = await page.evaluate(() => (window as { __test_kit_handle?: KitHandle }).__test_kit_handle!.dismissCount())
    expect(dismissCount).toBe(1)
  })
})
