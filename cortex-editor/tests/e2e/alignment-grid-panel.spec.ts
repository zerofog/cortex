/**
 * AlignmentGrid real-browser panel smoke.
 *
 * Business purpose: ZF0-1211 makes the compact 3x3 AlignmentGrid visible
 * inside both FlexControls and GridControls. Component tests pin the event
 * routing and DOM mode selection; this Playwright spec verifies the same
 * controls mount inside the real Shadow DOM panel with measurable layout, so
 * a hidden, zero-size, or wrong-mode indicator cannot pass readiness.
 *
 * Falsifiability note: this spec rides on the already-red/green component
 * tests for missing AlignmentGrid nodes and baseline mode selection. The
 * browser-only assertions here are the integration surface: panel branch,
 * Shadow DOM query, real CSS box size, and indicator DOM in Chromium.
 */
import { test, expect, type Page } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR } from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  selectElement,
  waitForElementStatePanel,
} from './helpers/panel.js'

interface AlignmentGridSnapshot {
  gridVisible: boolean
  gridWidth: number
  gridHeight: number
  cells: number
  rowBaseline: boolean
  rowBaselineTicks: number
  rowBaselineBars: number
  rowBaselineHasIcon: boolean
  rowBaselineHasLine: boolean
  fullIndicator: boolean
}

async function setSeedStyles(page: Page, styles: Record<string, string>): Promise<void> {
  await page.evaluate(
    ({ selector, nextStyles }) => {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) throw new Error(`[alignment-grid-panel] fixture ${selector} not found`)
      for (const [property, value] of Object.entries(nextStyles)) {
        el.style.setProperty(property, value)
      }
    },
    { selector: FIXTURE_SEED_SELECTOR, nextStyles: styles },
  )
}

async function getAlignmentGridSnapshot(
  page: Page,
  controlClass: 'cortex-flex-controls' | 'cortex-grid-controls',
): Promise<AlignmentGridSnapshot> {
  return await page.evaluate((cls) => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    const control = root?.querySelector(`.${cls}`) ?? null
    const grid = control?.querySelector<HTMLElement>('.cortex-alignment-grid') ?? null
    const rect = grid?.getBoundingClientRect()
    const rowBaseline = grid?.querySelector('.cortex-alignment-grid__span--row-baseline') ?? null

    return {
      gridVisible: !!grid && getComputedStyle(grid).display !== 'none' && getComputedStyle(grid).visibility !== 'hidden',
      gridWidth: rect?.width ?? 0,
      gridHeight: rect?.height ?? 0,
      cells: grid?.querySelectorAll('.cortex-alignment-grid__cell').length ?? 0,
      rowBaseline: !!rowBaseline,
      rowBaselineTicks: rowBaseline?.querySelectorAll('.cortex-alignment-grid__span-baseline-tick').length ?? 0,
      rowBaselineBars: rowBaseline?.querySelectorAll('.cortex-alignment-grid__span-bar').length ?? 0,
      rowBaselineHasIcon: !!rowBaseline?.querySelector('.cortex-alignment-grid__span-icon'),
      rowBaselineHasLine: !!rowBaseline?.querySelector('.cortex-alignment-grid__span-baseline-line'),
      fullIndicator: !!grid?.querySelector('.cortex-alignment-grid__span--full'),
    }
  }, controlClass)
}

test.describe('AlignmentGrid panel rendering (ZF0-1211)', () => {
  test('flex controls render a visible baseline distribution row', async ({ page }) => {
    await bootWithSendSpy(page)
    await setSeedStyles(page, {
      display: 'flex',
      'flex-direction': 'row',
      'justify-content': 'space-around',
      'align-items': 'baseline',
    })
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    const snapshot = await getAlignmentGridSnapshot(page, 'cortex-flex-controls')
    expect(snapshot.gridVisible).toBe(true)
    expect(snapshot.gridWidth).toBeGreaterThan(0)
    expect(snapshot.gridHeight).toBeGreaterThan(0)
    expect(snapshot.cells).toBe(6)
    expect(snapshot.rowBaseline).toBe(true)
    expect(snapshot.rowBaselineHasIcon).toBe(true)
    expect(snapshot.rowBaselineHasLine).toBe(true)
    expect(snapshot.rowBaselineTicks).toBe(2)
    expect(snapshot.rowBaselineBars).toBe(0)
    expect(snapshot.fullIndicator).toBe(false)
  })

  test('grid controls render a visible stretch-baseline row without distribution ticks', async ({ page }) => {
    await bootWithSendSpy(page)
    await setSeedStyles(page, {
      display: 'grid',
      'justify-items': 'stretch',
      'align-items': 'baseline',
    })
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    const snapshot = await getAlignmentGridSnapshot(page, 'cortex-grid-controls')
    expect(snapshot.gridVisible).toBe(true)
    expect(snapshot.gridWidth).toBeGreaterThan(0)
    expect(snapshot.gridHeight).toBeGreaterThan(0)
    expect(snapshot.cells).toBe(6)
    expect(snapshot.rowBaseline).toBe(true)
    expect(snapshot.rowBaselineHasIcon).toBe(true)
    expect(snapshot.rowBaselineHasLine).toBe(true)
    expect(snapshot.rowBaselineTicks).toBe(0)
    expect(snapshot.rowBaselineBars).toBe(0)
    expect(snapshot.fullIndicator).toBe(false)
  })
})
