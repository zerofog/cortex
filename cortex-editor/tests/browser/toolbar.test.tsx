import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import { renderInShadow, dispatchPointerEvent } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{ commentMode: boolean; onCommentMode: () => void }> = {}) {
    const props = { ...overrides }
    const result = renderInShadow(<Toolbar {...props} />)
    cleanup = result.cleanup
    return { ...result, props }
  }

  it('renders toolbar element', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
  })

  it('renders select and comment mode buttons', () => {
    const { root } = setup()
    const selectBtn = root.querySelector('[data-mode="select"]')
    const commentBtn = root.querySelector('[data-mode="comment"]')
    expect(selectBtn).not.toBeNull()
    expect(commentBtn).not.toBeNull()
    expect(selectBtn!.classList.contains('cortex-toolbar__mode--active')).toBe(true)
    expect(commentBtn!.classList.contains('cortex-toolbar__mode--active')).toBe(false)
  })

  it('renders grip and mode switcher (no close button, no divider)', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__grip')).not.toBeNull()
    expect(root.querySelector('.cortex-toolbar__modes')).not.toBeNull()
    expect(root.querySelectorAll('.cortex-toolbar__mode').length).toBe(2)
  })

  // ── X button + divider removed (UX simplification) ────────────────
  //
  // The X close button was removed in favor of Esc-to-deactivate. The
  // cascading Escape handler in CortexApp (Priority 4) already calls
  // handleClose() when nothing else consumed the key. The hotkey
  // (cmd+shift+. / ctrl+shift+.) still reactivates cortex from anywhere.

  it('does NOT render an X close button', () => {
    const { root } = setup()
    expect(root.querySelector('[data-action="close"]')).toBeNull()
    expect(root.querySelector('.cortex-toolbar__btn--close')).toBeNull()
  })

  it('does NOT render the toolbar divider', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__divider')).toBeNull()
  })

  it('renders grip drag handle as non-button div', () => {
    const { root } = setup()
    const grip = root.querySelector('.cortex-toolbar__grip')
    expect(grip).not.toBeNull()
    expect(grip?.tagName.toLowerCase()).not.toBe('button')
  })

  it('badge is never rendered (activity-count badge removed)', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__badge')).toBeNull()
  })

  it('does not start drag when pointerdown is on a non-grip element', () => {
    // Toolbar.handlePointerDown's grip-allowlist guard: drag starts ONLY from
    // .cortex-toolbar__grip. The negative target used to be the divider, but
    // the divider was removed when the X close button went away (Esc-to-close
    // replacement). Switching to `.cortex-toolbar__modes-indicator` — the
    // sliding-pill div under the mode radiogroup — which is also a plain
    // non-interactive <div> NOT in useDrag's interactive blocklist.
    //
    // Assertion mechanism: useDrag.handlePointerDown calls
    // setPointerCapture(pointerId) on the toolbar element synchronously the
    // moment a drag starts — and only then. Spying on it is a falsifiable
    // signal: drop the `closest('.cortex-toolbar__grip')` check in Toolbar and
    // this test fails (the indicator would reach useDrag, which doesn't block
    // a plain div, so the drag starts and setPointerCapture fires).
    const { root } = setup()
    const toolbar = root.querySelector('.cortex-toolbar') as HTMLElement
    const nonGrip = root.querySelector('.cortex-toolbar__modes-indicator') as HTMLElement
    const grip = root.querySelector('.cortex-toolbar__grip') as HTMLElement
    expect(nonGrip).not.toBeNull()
    // happy-dom does not implement setPointerCapture — useDrag try/catches the
    // call for exactly this reason. Install a stub so we can observe whether
    // useDrag reached the capture call (i.e. whether a drag actually started).
    const capture = vi.fn()
    ;(toolbar as unknown as { setPointerCapture: () => void }).setPointerCapture = capture

    // pointerdown on the non-grip indicator — Toolbar's allowlist guard must
    // short-circuit before useDrag runs, so no pointer capture (no drag start).
    dispatchPointerEvent(nonGrip, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    expect(capture).not.toHaveBeenCalled()

    // Positive control: pointerdown on the grip passes the allowlist, reaches
    // useDrag, and starts the drag — proving the spy can observe a real start.
    dispatchPointerEvent(grip, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    expect(capture).toHaveBeenCalled()
  })
})
