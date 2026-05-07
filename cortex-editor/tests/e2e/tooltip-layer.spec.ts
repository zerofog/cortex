/**
 * TooltipLayer e2e coverage for ZF0-962.
 *
 * Business purpose: unit tests can prove event delegation and Floating UI calls,
 * but the regression was visual: CSS pseudo-element tooltips were clipped by
 * `.cortex-panel__body` overflow. This spec uses real Chromium layout to scroll
 * a NumericInput to the panel-body boundary, hover it, and prove the rendered
 * `.cortex-tooltip` escapes that clipping container without using the Native
 * Popover API attribute.
 */
import { test, expect } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR } from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  selectElement,
  waitForElementStatePanel,
} from './helpers/panel.js'

test('NumericInput tooltip escapes panel-body clipping without Native Popover API', async ({ page }) => {
  await bootWithSendSpy(page)
  await selectElement(page, FIXTURE_SEED_SELECTOR)
  await waitForElementStatePanel(page)

  const targetReady = await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return false
    return !!root.querySelector('.cortex-panel__body .cortex-numeric-input[data-tooltip="Width"]')
  })
  expect(targetReady).toBe(true)

  await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) throw new Error('[test] shadow root not accessible')
    const body = root.querySelector<HTMLElement>('.cortex-panel__body')
    const target = root.querySelector<HTMLElement>('.cortex-panel__body .cortex-numeric-input[data-tooltip="Width"]')
    if (!body || !target) throw new Error('[test] tooltip target not found')

    const bodyRect = body.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    body.scrollTop += targetRect.top - bodyRect.top
  })

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector('[data-cortex-host]')
          const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
          const body = root?.querySelector<HTMLElement>('.cortex-panel__body')
          const target = root?.querySelector<HTMLElement>('.cortex-panel__body .cortex-numeric-input[data-tooltip="Width"]')
          if (!body || !target) return false
          return Math.abs(target.getBoundingClientRect().top - body.getBoundingClientRect().top) <= 1
        }),
      { timeout: 2000 },
    )
    .toBe(true)

  await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) throw new Error('[test] shadow root not accessible')
    const target = root.querySelector<HTMLElement>('.cortex-panel__body .cortex-numeric-input[data-tooltip="Width"]')
    if (!target) throw new Error('[test] tooltip target not found')
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true, pointerId: 1 }))
  })

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector('[data-cortex-host]')
          const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
          return !!root?.querySelector('.cortex-tooltip')
        }),
      { timeout: 2000 },
    )
    .toBe(true)

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) throw new Error('[test] shadow root not accessible')
    const body = root.querySelector<HTMLElement>('.cortex-panel__body')
    const target = root.querySelector<HTMLElement>('.cortex-panel__body .cortex-numeric-input[data-tooltip="Width"]')
    const tooltip = root.querySelector<HTMLElement>('.cortex-tooltip')
    if (!body || !target || !tooltip) throw new Error('[test] tooltip state not found')

    const bodyRect = body.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    return {
      text: tooltip.textContent?.trim() ?? '',
      hasPopoverAttribute: tooltip.hasAttribute('popover'),
      describedBy: target.getAttribute('aria-describedby') ?? '',
      bodyTop: bodyRect.top,
      targetLeft: targetRect.left,
      tooltipBottom: tooltipRect.bottom,
      tooltipLeft: tooltipRect.left,
    }
  })

  expect(snapshot.text.length).toBeGreaterThan(0)
  expect(snapshot.hasPopoverAttribute).toBe(false)
  expect(snapshot.describedBy.split(/\s+/)).toContain('cortex-tooltip')
  expect(snapshot.tooltipBottom).toBeLessThanOrEqual(snapshot.bodyTop + 1)
  expect(Math.abs(snapshot.tooltipLeft - snapshot.targetLeft)).toBeLessThanOrEqual(8)
})
