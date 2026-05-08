/**
 * Real-browser CSSOM coverage for `detectStates`.
 *
 * Business purpose: `detectStates` powers the state lens on selected elements.
 * The lens should notice authored `:hover`, `:focus`, and `:active` styles
 * even when those rules live behind browser-only CSSOM surfaces like `@layer`,
 * native CSS nesting, or inaccessible cross-origin stylesheets. Happy-dom
 * cannot model those branches faithfully, so ZF0-1558 moves them to Chromium.
 *
 * Falsifiability proof performed 2026-05-08:
 *   Mutation: temporarily changed the test bridge's `detectStates` method to
 *   return empty records for every state.
 *   Observed failure: all four cases failed because expected declarations were
 *   missing, including the same-origin fallback rule in the cross-origin case.
 *   Revert: restored the bridge delegation to production `detectStates`; these
 *   cases passed again.
 *
 *   Mutation: temporarily removed the `try/catch` around `sheet.cssRules` in
 *   `src/browser/state-detector.ts`.
 *   Observed failure: Chromium threw a SecurityError from
 *   `CSSStyleSheet.cssRules`; the cross-origin case never reached the
 *   same-origin fallback rule.
 *   Revert: restored the catch; the cross-origin case passed.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootFixture } from './helpers/boot.js'
import type { CortexTestBridge } from './helpers/bridge.js'

interface SerializableStates {
  hover: Record<string, string>
  focus: Record<string, string>
  active: Record<string, string>
}

async function detectStatesForFixture(
  page: Page,
  fixture: { className: string, css: string },
): Promise<SerializableStates> {
  return await page.evaluate(({ className, css }) => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)

    const target = document.createElement('button')
    target.className = className
    document.body.appendChild(target)

    const bridge = (globalThis as unknown as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__
    if (!bridge?.detectStates) throw new Error('detectStates bridge is not installed')
    return bridge.detectStates(target)
  }, fixture)
}

test.describe('detectStates real-browser CSSOM coverage (ZF0-1558)', () => {
  test('recurses into @layer rules', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false })

    const states = await detectStatesForFixture(page, {
      className: 'zf0-layer-target',
      css: '@layer base { .zf0-layer-target:hover { opacity: 0.8; } }',
    })

    expect(states.hover.opacity).toBe('0.8')
    expect(states.focus).toEqual({})
    expect(states.active).toEqual({})
  })

  test('resolves native CSS nesting for &:hover', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false })

    const states = await detectStatesForFixture(page, {
      className: 'zf0-nesting-target',
      css: '.zf0-nesting-target { color: red; &:hover { background-color: blue; } }',
    })

    expect(states.hover['background-color']).toBe('blue')
  })

  test('resolves native CSS nesting for &.modifier:hover', async ({ page }) => {
    await bootFixture(page, { collectDivergences: false })

    const states = await detectStatesForFixture(page, {
      className: 'zf0-nested-modifier-target primary',
      css: '.zf0-nested-modifier-target { &.primary:hover { color: white; } }',
    })

    expect(states.hover.color).toBe('white')
  })

  test('skips cross-origin stylesheet cssRules SecurityError and continues same-origin sheets', async ({ page }) => {
    const crossOrigin = 'https://cortex-cross-origin.test'
    await page.route(`${crossOrigin}/state.css`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: '.zf0-cross-origin-target:hover { color: red; }',
      })
    })

    await bootFixture(page, { collectDivergences: false })

    const states = await page.evaluate(async (href) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      const loaded = new Promise<void>((resolve, reject) => {
        link.onload = () => resolve()
        link.onerror = () => reject(new Error('cross-origin stylesheet failed to load'))
      })
      document.head.appendChild(link)
      await loaded

      const sameOriginStyle = document.createElement('style')
      sameOriginStyle.textContent = '.zf0-cross-origin-target:hover { background-color: green; }'
      document.head.appendChild(sameOriginStyle)

      const target = document.createElement('button')
      target.className = 'zf0-cross-origin-target'
      document.body.appendChild(target)

      const bridge = (globalThis as unknown as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__
      if (!bridge?.detectStates) throw new Error('detectStates bridge is not installed')
      return bridge.detectStates(target)
    }, `${crossOrigin}/state.css`)

    expect(states.hover.color).toBeUndefined()
    expect(states.hover['background-color']).toBe('green')
  })
})
