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

    const initial = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) throw new Error('[spacing-box-model] shadow root unavailable')

      const diagram = root.querySelector<HTMLElement>('[data-testid="spacing-box-model-diagram"]')
      if (!diagram) throw new Error('[spacing-box-model] diagram missing')
      const diagramSurface = diagram.querySelector<HTMLElement>('.cortex-box-model__diagram')
      if (!diagramSurface) throw new Error('[spacing-box-model] diagram surface missing')
      const rect = diagramSurface.getBoundingClientRect()

      const rightPadding = diagram.querySelector<HTMLButtonElement>('[data-layer="padding"][data-side="right"]')
      if (!rightPadding) throw new Error('[spacing-box-model] right padding side missing')
      rightPadding.click()

      return {
        boxSizing: diagram.dataset['boxSizing'],
        width: rect.width,
        height: rect.height,
        hasMargin: !!diagram.querySelector('.cortex-box-model__layer--margin'),
        hasBorder: !!diagram.querySelector('.cortex-box-model__layer--border'),
        hasPadding: !!diagram.querySelector('.cortex-box-model__layer--padding'),
        hasContent: !!diagram.querySelector('.cortex-box-model__content'),
      }
    })

    const readSelection = () =>
      page.evaluate(() => {
        const host = document.querySelector('[data-cortex-host]')
        const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
        if (!root) throw new Error('[spacing-box-model] shadow root unavailable')

        const rightPadding = root.querySelector<HTMLButtonElement>('[data-layer="padding"][data-side="right"]')
        const editor = root.querySelector<HTMLElement>('[data-testid="spacing-box-model-side-editor"]')
        const input = editor?.querySelector<HTMLInputElement>('input')

        return {
          rightPaddingPressed: rightPadding?.getAttribute('aria-pressed') ?? null,
          editorLayer: editor?.dataset['layer'] ?? null,
          editorSide: editor?.dataset['side'] ?? null,
          editorLabel: editor?.textContent ?? '',
          inputValue: input?.value ?? null,
        }
      })

    await expect.poll(readSelection, { timeout: 2000 }).toMatchObject({
      rightPaddingPressed: 'true',
      editorLayer: 'padding',
      editorSide: 'right',
      inputValue: '0',
    })
    const selected = await readSelection()

    expect(initial).toMatchObject({
      boxSizing: 'content-box',
      hasMargin: true,
      hasBorder: true,
      hasPadding: true,
      hasContent: true,
    })
    expect(selected.editorLabel).toContain('Padding right')
    expect(initial.width).toBeGreaterThan(200)
    expect(initial.height).toBeGreaterThanOrEqual(136)
    expect(initial.height).toBeLessThanOrEqual(144)
  })
})
