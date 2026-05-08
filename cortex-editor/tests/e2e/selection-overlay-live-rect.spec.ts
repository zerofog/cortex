/**
 * SelectionOverlay live-rect tracking in real Chromium (ZF0-1559).
 *
 * Business purpose: the state lens is the designer's control for switching
 * between default/:hover/:focus/:active styling. If the selected element moves
 * after selection, the lens must track the element's live browser rect instead
 * of staying pinned to stale coordinates. Happy-dom cannot reliably exercise
 * this RAF + layout behavior, so this coverage belongs in Layer 4.
 *
 * Falsifiability proof performed 2026-05-07:
 *   Mutation: temporarily changed SelectionOverlay's lens transform to use
 *   the previous transform after scroll.
 *   Observed failure: this spec timed out while polling for the lens Y
 *   position to change after window.scrollTo().
 *   Revert: restored SelectionOverlay, rebuilt, and reran the spec green.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootFixture } from './helpers/boot.js'
import type { CortexTestBridge } from './helpers/bridge.js'

const LIVE_RECT_SELECTOR = '#selection-overlay-live-rect-target'
const LIVE_RECT_SOURCE = 'fixture:selection-overlay-live-rect:1'
const SCROLL_DELTA = 120

interface LensSnapshot {
  found: boolean
  transform: string
  visibility: string
  buttonCount: number
  targetTop: number
  scrollY: number
}

/**
 * Parse the inline transform written by SelectionOverlay's RAF loop.
 *
 * Business logic impact: the assertion below compares the same position value
 * the user sees on the lens, not an inferred duplicate of the component's
 * placement formula.
 */
function parseLensTranslateY(transform: string): number {
  const match = transform.match(/^translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)$/)
  const yRaw = match?.[2]
  if (!yRaw) {
    throw new Error(`[selection-overlay-live-rect] unexpected lens transform: ${transform}`)
  }
  return Number(yRaw)
}

/**
 * Render a target with a real CSS :hover rule before selection.
 *
 * Business logic impact: CortexApp's detectStates() must find at least one
 * interaction-state declaration for SelectionOverlay to render the state lens.
 */
async function installLiveRectTarget(page: Page): Promise<void> {
  await page.evaluate(
    ({ selector, source }) => {
      const id = selector.slice(1)
      document.documentElement.style.scrollBehavior = 'auto'
      document.body.style.margin = '0'
      document.body.style.minHeight = '1400px'

      const style = document.createElement('style')
      style.id = 'selection-overlay-live-rect-style'
      style.textContent = `
        #${id} {
          position: absolute;
          top: 320px;
          left: 240px;
          width: 180px;
          height: 64px;
          padding: 0;
          color: rgb(42, 42, 42);
          background: rgb(255, 255, 255);
          border: 1px solid rgb(120, 120, 120);
          border-radius: 4px;
        }
        #${id}:hover {
          color: rgb(17, 91, 180);
        }
      `
      document.head.append(style)

      const target = document.createElement('button')
      target.id = id
      target.type = 'button'
      target.setAttribute('data-cortex-source', source)
      target.textContent = 'Live rect target'
      document.body.append(target)
    },
    { selector: LIVE_RECT_SELECTOR, source: LIVE_RECT_SOURCE },
  )
}

/**
 * Select the live-rect target through CortexApp's debug bridge.
 *
 * Business logic impact: this enters the same selected-element state that a
 * real design-mode click would enter, so SelectionOverlay and state detection
 * run through the production component path.
 */
async function selectLiveRectTarget(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const target = document.querySelector<HTMLElement>(selector)
    if (!target) throw new Error(`[selection-overlay-live-rect] target not found: ${selector}`)
    const bridge = (globalThis as unknown as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__
    if (!bridge?.selectElement) throw new Error('[selection-overlay-live-rect] bridge.selectElement not present')
    bridge.selectElement(target)
  }, LIVE_RECT_SELECTOR)
}

/**
 * Read the state lens and selected target geometry from the real browser.
 *
 * Business logic impact: this keeps the spec anchored to rendered DOM state,
 * proving the user-visible lens follows the selected element after scroll.
 */
async function readLensSnapshot(page: Page): Promise<LensSnapshot> {
  return await page.evaluate((selector) => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    const lens = root?.querySelector<HTMLElement>('.cortex-state-lens')
    const target = document.querySelector<HTMLElement>(selector)
    const rect = target?.getBoundingClientRect()

    return {
      found: !!lens,
      transform: lens?.style.transform ?? '',
      visibility: lens?.style.visibility ?? '',
      buttonCount: root?.querySelectorAll('.cortex-state-lens__btn').length ?? 0,
      targetTop: rect?.top ?? Number.NaN,
      scrollY: window.scrollY,
    }
  }, LIVE_RECT_SELECTOR)
}

test.describe('SelectionOverlay state lens live-rect tracking @fast-ci', () => {
  test('state lens follows the selected element after real browser scroll', async ({ page }) => {
    await bootFixture(page, {
      activateDesignMode: true,
      collectDivergences: false,
    })
    await installLiveRectTarget(page)
    await selectLiveRectTarget(page)

    await expect
      .poll(
        async () => {
          const snapshot = await readLensSnapshot(page)
          return snapshot.found &&
            snapshot.visibility === 'visible' &&
            snapshot.buttonCount === 2 &&
            snapshot.transform.startsWith('translate(')
        },
        { timeout: 2000 },
      )
      .toBe(true)

    const before = await readLensSnapshot(page)
    const beforeY = parseLensTranslateY(before.transform)

    await page.evaluate((scrollDelta) => {
      window.scrollTo(0, scrollDelta)
    }, SCROLL_DELTA)

    await expect
      .poll(
        async () => {
          const snapshot = await readLensSnapshot(page)
          if (!snapshot.found || snapshot.scrollY !== SCROLL_DELTA) return false
          let currentY: number
          try {
            currentY = parseLensTranslateY(snapshot.transform)
          } catch {
            return false
          }
          return currentY < beforeY - (SCROLL_DELTA / 2) &&
            snapshot.targetTop < before.targetTop - (SCROLL_DELTA / 2)
        },
        { timeout: 3000 },
      )
      .toBe(true)

    const after = await readLensSnapshot(page)
    const afterY = parseLensTranslateY(after.transform)

    expect(after.transform).not.toBe(before.transform)
    expect(after.scrollY).toBe(SCROLL_DELTA)
    expect(before.targetTop - after.targetTop).toBeGreaterThan(SCROLL_DELTA / 2)
    expect(beforeY - afterY).toBeGreaterThan(SCROLL_DELTA / 2)
  })
})
