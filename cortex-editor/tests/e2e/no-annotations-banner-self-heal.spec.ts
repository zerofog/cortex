/**
 * NoAnnotationsBanner MutationObserver self-heal e2e coverage (ZF0-1561).
 *
 * Business purpose: the banner component installs a MutationObserver on
 * `document.body` (childList, subtree) and calls `setHidden(true)` when
 * an element with `data-cortex-source` appears. Happy-dom cannot faithfully
 * simulate this interaction (Preact effect scheduling × MO timer queue ×
 * vitest polling — Test Anti-Pattern #3). These specs exercise the self-heal
 * flow against real Chromium MutationObserver delivery, with no sleeps.
 *
 * Standard `bootFixture` (with default open-shadow patch) is used — no
 * closed-shadow concerns, banner renders into light DOM.
 *
 * The standard fixture contains pre-existing `[data-cortex-source]` elements
 * (count varies with fixture growth). T1 and T2 strip them all via
 * `querySelectorAll` before mounting; T3 intentionally leaves them to validate
 * the synchronous useState initializer.
 */
import { test, expect } from '@playwright/test'
import { bootFixture } from './helpers/boot.js'
import type { CortexTestBridge } from './helpers/bridge.js'

/** Resolved handle type from the kit's mountInRoot Promise. */
type BannerKitHandle = Awaited<ReturnType<NonNullable<CortexTestBridge['noAnnotationsBannerKit']>['mountInRoot']>>

test.describe('NoAnnotationsBanner self-heal (ZF0-1561) @fast-ci', () => {
  test.afterEach(async ({ page }) => {
    // Cleanup kit and any test-added annotation elements to prevent test pollution.
    await page.evaluate(() => {
      const handle = (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle
      if (handle) handle.cleanup()
      delete (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle
      // Remove any elements added by T2 so they don't leak into T3.
      for (const el of document.querySelectorAll('[data-cortex-source^="test:"]')) {
        el.remove()
      }
    })
  })

  test('banner is visible when document has no annotated elements', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false, waitForKit: 'noAnnotationsBannerKit' })

    await page.evaluate(async () => {
      // Strip all existing annotations — fixture has #center with data-cortex-source.
      for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
        el.remove()
      }

      const kit = (window as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__!.noAnnotationsBannerKit!
      const handle = await kit.mountInRoot(document.body)
      ;(window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle = handle
    })

    const isVisible = await page.evaluate(() => {
      return (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle!.isVisible()
    })
    expect(isVisible).toBe(true)
  })

  test('banner self-heals when an annotated element is added after mount', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false, waitForKit: 'noAnnotationsBannerKit' })

    await page.evaluate(async () => {
      // Strip all existing annotations so banner renders initially visible.
      for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
        el.remove()
      }

      const kit = (window as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__!.noAnnotationsBannerKit!
      const handle = await kit.mountInRoot(document.body)
      ;(window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle = handle
    })

    // Assert banner is visible before triggering the self-heal.
    const initiallyVisible = await page.evaluate(() => {
      return (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle!.isVisible()
    })
    expect(initiallyVisible).toBe(true)

    // Add an annotated element — set the attribute AND append in a single
    // evaluate so MutationObserver sees a single childList mutation with the
    // attribute already present on the new node.
    await page.evaluate(() => {
      const div = document.createElement('div')
      div.setAttribute('data-cortex-source', 'test:added:1')
      document.body.appendChild(div)
    })

    // Poll until banner self-heals — real Chromium MO delivery, no sleeps.
    await expect.poll(
      async () => await page.evaluate(() => (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle!.isVisible()),
      { timeout: 5000 },
    ).toBe(false)
  })

  test('banner stays hidden when an annotated element exists at mount time', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false, waitForKit: 'noAnnotationsBannerKit' })

    // Do NOT strip annotations — fixture's pre-existing `[data-cortex-source]` elements stay.
    // Validates the `useState(() => hasAnnotation())` synchronous initializer in NoAnnotationsBanner.
    await page.evaluate(async () => {
      const kit = (window as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__!.noAnnotationsBannerKit!
      const handle = await kit.mountInRoot(document.body)
      ;(window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle = handle
    })

    const isVisible = await page.evaluate(() => {
      return (window as { __test_banner_handle?: BannerKitHandle }).__test_banner_handle!.isVisible()
    })
    expect(isVisible).toBe(false)
  })
})
