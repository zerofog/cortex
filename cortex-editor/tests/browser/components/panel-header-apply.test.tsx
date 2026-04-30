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

  // ZF0-1453 (post-Step-9.5): "Hidden after success" — button must stay hidden
  // after sendAndAck resolves even if bufferSize > 0 (Claude hasn't drained the
  // buffer yet). Without this gate, the button reappears as Apply (N) inviting
  // double-clicks that re-send the same intents to Claude.
  it('stays hidden after onApply resolves even when bufferSize > 0 (Claude not yet drained)', async () => {
    let resolveApply!: () => void
    const applyPromise = new Promise<void>(res => { resolveApply = res })
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

    // Click Apply
    act(() => {
      const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
      btn.click()
    })

    // Resolve sendAndAck — but bufferSize STAYS at 4 (Claude is still processing,
    // hasn't called cortex_discard_edits yet).
    act(() => { resolveApply() })
    await applyPromise
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    // Re-render with bufferSize STILL 4 (Claude in flight). Button must stay hidden.
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

    // Falsifiable: a regression that drops the pendingClaude gate would render
    // the idle Apply button here because bufferSize > 0.
    expect(container.querySelector('[data-action="apply"]')).toBeNull()

    // Now Claude drains: bufferSize → 0
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

    // After buffer drains, pendingClaude resets via useEffect; subsequent edits would
    // resurface the button. Render with bufferSize=2 to simulate new edits.
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

    expect(container.querySelector('[data-action="apply"]')).not.toBeNull()
    expect(container.querySelector('[data-action="apply"]')!.textContent).toContain('2')
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

  // #6: aria-busy is 'true' during delivering, absent when idle
  it('aria-busy is "true" on Apply button while delivering and absent when idle', async () => {
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

    // Idle: aria-busy should be absent (not set).
    const idleBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(idleBtn.getAttribute('aria-busy')).toBeNull()

    act(() => { idleBtn.click() })

    // During delivery: aria-busy must be 'true'.
    const deliveringBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(deliveringBtn.getAttribute('aria-busy')).toBe('true')

    // Clean up.
    act(() => { resolveApply() })
    await applyPromise
  })

  // #7: onApplyError is called with the rejection error when onApply rejects
  it('calls onApplyError with the rejection error when onApply rejects', async () => {
    const applyError = new Error('sendAndAck timeout after 10000ms')
    let rejectApply!: (err: Error) => void
    const applyPromise = new Promise<void>((_, rej) => { rejectApply = rej })
    const onApply = vi.fn(() => applyPromise)
    const onApplyError = vi.fn()

    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={1}
          onApply={onApply}
          onApplyError={onApplyError}
        />,
        container,
      )
    })

    act(() => {
      const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
      btn.click()
    })

    act(() => { rejectApply(applyError) })
    await applyPromise.catch(() => {})

    // onApplyError must have been called with the exact error.
    expect(onApplyError).toHaveBeenCalledTimes(1)
    expect(onApplyError).toHaveBeenCalledWith(applyError)

    // Delivering state must also have cleared (button is back to idle).
    const idleBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
    expect(idleBtn.disabled).toBe(false)
  })

  // #8: unmount during in-flight onApply — no state update on unmounted component
  it('does not call setDelivering after unmount (mounted-flag guard)', async () => {
    let resolveApply!: () => void
    const applyPromise = new Promise<void>(res => { resolveApply = res })
    const onApply = vi.fn(() => applyPromise)

    act(() => {
      render(
        <PanelHeader
          {...BASE_PROPS}
          bufferSize={1}
          onApply={onApply}
        />,
        container,
      )
    })

    act(() => {
      const btn = container.querySelector('[data-action="apply"]') as HTMLButtonElement
      btn.click()
    })

    // Unmount BEFORE the promise resolves — simulates Panel re-mount during wait.
    const warnSpy = vi.spyOn(console, 'warn')
    act(() => { render(null, container) })

    // Now resolve the promise — the mountedRef guard should block setDelivering.
    act(() => { resolveApply() })
    await applyPromise

    // Preact should NOT have logged a state-update-on-unmounted-component warning.
    const cortexWarns = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('unmounted')),
    )
    expect(cortexWarns).toHaveLength(0)
    warnSpy.mockRestore()
  })
})
