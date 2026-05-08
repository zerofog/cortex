/**
 * Real-panel coverage for the spacing box model diagram (ZF0-1161).
 *
 * Business purpose: unit tests verify the exact emitted CSS properties; this
 * e2e test proves the diagram survives the real bundle, open-shadow harness,
 * selected-element panel branch, and compact 320px panel geometry.
 */
import { test, expect } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR } from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  selectElement,
  waitForElementStatePanel,
} from './helpers/panel.js'

test.describe('spacing box model diagram (ZF0-1161)', () => {
  test('renders compact nested regions and selects a clicked side in the real panel', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    const snapshot = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) throw new Error('[spacing-box-model] shadow root unavailable')

      const diagram = root.querySelector<HTMLElement>('[data-testid="spacing-box-model-diagram"]')
      if (!diagram) throw new Error('[spacing-box-model] diagram missing')
      const rect = diagram.getBoundingClientRect()

      const topPadding = diagram.querySelector<HTMLButtonElement>('[data-layer="padding"][data-side="top"]')
      if (!topPadding) throw new Error('[spacing-box-model] top padding side missing')
      topPadding.click()

      const editor = root.querySelector<HTMLElement>('[data-testid="spacing-box-model-side-editor"]')
      const input = editor?.querySelector<HTMLInputElement>('input')

      return {
        boxSizing: diagram.dataset['boxSizing'],
        width: rect.width,
        height: rect.height,
        hasMargin: !!diagram.querySelector('.cortex-box-model__layer--margin'),
        hasBorder: !!diagram.querySelector('.cortex-box-model__layer--border'),
        hasPadding: !!diagram.querySelector('.cortex-box-model__layer--padding'),
        hasContent: !!diagram.querySelector('.cortex-box-model__content'),
        topPaddingPressed: topPadding.getAttribute('aria-pressed'),
        editorLayer: editor?.dataset['layer'] ?? null,
        editorSide: editor?.dataset['side'] ?? null,
        editorLabel: editor?.textContent ?? '',
        inputValue: input?.value ?? null,
      }
    })

    expect(snapshot).toMatchObject({
      boxSizing: 'content-box',
      hasMargin: true,
      hasBorder: true,
      hasPadding: true,
      hasContent: true,
      topPaddingPressed: 'true',
      editorLayer: 'padding',
      editorSide: 'top',
      inputValue: '10',
    })
    expect(snapshot.editorLabel).toContain('Padding top')
    expect(snapshot.width).toBeGreaterThan(200)
    expect(snapshot.height).toBeGreaterThanOrEqual(150)
    expect(snapshot.height).toBeLessThanOrEqual(180)
  })
})
