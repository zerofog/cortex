/**
 * ZF0-1469 (T3 of ZF0-1453): Apply button state machine tests for PanelHeader.
 *
 * Covers all 5 Apply button states from the parent ticket spec:
 *   #1  bufferSize=0  → Apply button NOT in DOM
 *   #2  bufferSize>0  → Apply button idle: text contains "Apply" and count
 *   #3  Click Apply   → "Delivering…" text, button disabled, onApply called
 *   #4  onApply resolves → delivering state clears; button visibility depends on bufferSize
 *   #5  onApply rejects  → delivering state clears; button returns to idle "Apply (N)"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { PanelHeader } from '../../../src/browser/components/PanelHeader.js'

// Minimal required props — most are cosmetic for this test suite.
const BASE_PROPS = {
  tagName: 'div',
  componentName: null,
  sourceFile: null,
  sourceLine: null,
  filePath: null,
  hasParent: false,
  hasChildren: false,
  onClose: () => {},
  onSelectParent: () => {},
  onSelectChild: () => {},
}

describe('PanelHeader Apply button', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  // #1: bufferSize=0 → Apply button NOT in DOM
  it('Apply button is absent when bufferSize is 0', () => {
    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={0}
          onApply={() => Promise.resolve()}
        />,
        container,
      )
    })
    expect(container.querySelector('[data-action="apply"]')).toBeNull()
  })

  // #2: bufferSize=3 → Apply button rendered with text containing "Apply" and count
  it('Apply button renders with "Apply" text and buffer count when bufferSize > 0', () => {
    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={3}
          onApply={() => Promise.resolve()}
        />,
        container,
      )
    })
    const btn = container.querySelector('[data-action="apply"]')
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toContain('Apply')
    expect(btn!.textContent).toContain('3')
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  // #3: Click Apply → "Delivering…" text, disabled, onApply called once
  it('shows Delivering state and calls onApply once on click', async () => {
    let resolveApply!: () => void
    const applyPromise = new Promise<void>(res => { resolveApply = res })
    const onApply = vi.fn(() => applyPromise)

    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={5}
          onApply={onApply}
        />,
        container,
      )
    })

    const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(btn).not.toBeNull()

    act(() => { btn.click() })

    // After click, button should show delivering state.
    const deliveringBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(deliveringBtn).not.toBeNull()
    expect(deliveringBtn.textContent).toMatch(/delivering/i)
    expect(deliveringBtn.disabled).toBe(true)
    expect(onApply).toHaveBeenCalledTimes(1)

    // Clean up — resolve the promise to avoid dangling state.
    act(() => { resolveApply() })
    await applyPromise
  })

  // #4: onApply resolves → delivering clears; button hides when bufferSize goes to 0
  it('clears delivering state after onApply resolves; button hides when bufferSize→0', async () => {
    let resolveApply!: () => void
    const applyPromise = new Promise<void>(res => { resolveApply = res })
    const onApply = vi.fn(() => applyPromise)

    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={2}
          onApply={onApply}
        />,
        container,
      )
    })

    act(() => {
      const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
      btn.click()
    })

    // Resolve — parent would clear bufferSize to 0 in T4; simulate by re-rendering.
    act(() => { resolveApply() })
    await applyPromise

    // Re-render with bufferSize=0 to simulate parent buffer clear after delivery.
    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={0}
          onApply={onApply}
        />,
        container,
      )
    })

    // Button should be gone — bufferSize is now 0.
    expect(container.querySelector('[data-action="apply"]')).toBeNull()
  })

  // #5: onApply rejects → delivering clears; button returns to idle "Apply (N)"
  it('clears delivering state and shows idle Apply button after onApply rejects', async () => {
    let rejectApply!: (err: Error) => void
    const applyPromise = new Promise<void>((_, rej) => { rejectApply = rej })
    const onApply = vi.fn(() => applyPromise)

    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={4}
          onApply={onApply}
        />,
        container,
      )
    })

    act(() => {
      const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
      btn.click()
    })

    // Reject the apply — simulate delivery failure.
    act(() => { rejectApply(new Error('sendAndAck timeout after 10000ms')) })
    // Swallow the unhandled rejection that preact/test-utils surfaces.
    await applyPromise.catch(() => {})

    // Button should return to idle: same bufferSize (4), not disabled, "Apply" text.
    const idleBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(idleBtn).not.toBeNull()
    expect(idleBtn.textContent).toContain('Apply')
    expect(idleBtn.textContent).toContain('4')
    expect(idleBtn.disabled).toBe(false)
  })
})
