import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import { renderInShadow, dispatchPointerEvent } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{ onClose: () => void }> = {}) {
    const props = {
      onClose: vi.fn(),
      ...overrides,
    }
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

  it('renders grip and close button', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__grip')).not.toBeNull()
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
  })

  it('renders mode switcher and close button', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__modes')).not.toBeNull()
    expect(root.querySelectorAll('.cortex-toolbar__mode').length).toBe(2)
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    const { root } = setup({ onClose })
    const closeBtn = root.querySelector('[data-action="close"]') as HTMLButtonElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalled()
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

  it('does not start drag when pointerdown is on a non-grip element (divider)', () => {
    // Toolbar.handlePointerDown's grip-allowlist guard: drag starts ONLY from
    // .cortex-toolbar__grip. Retargeted off the removed badge onto the divider
    // — a plain non-interactive <div>. The divider is NOT in useDrag's
    // interactive blocklist (button/a/input/select/textarea/[role=button]), so
    // the ONLY thing that can block the drag here is Toolbar's allowlist guard.
    //
    // Assertion mechanism: useDrag.handlePointerDown calls
    // setPointerCapture(pointerId) on the toolbar element synchronously the
    // moment a drag starts — and only then. Spying on it is a falsifiable
    // signal: drop the `closest('.cortex-toolbar__grip')` check in Toolbar and
    // this test fails (the divider would reach useDrag, which doesn't block a
    // plain div, so the drag starts and setPointerCapture fires). The old
    // `toolbar.style.transform` mechanism is unusable here — the transform is
    // Preact-state-driven and does not flush synchronously under happy-dom.
    const { root } = setup()
    const toolbar = root.querySelector('.cortex-toolbar') as HTMLElement
    const divider = root.querySelector('.cortex-toolbar__divider') as HTMLElement
    const grip = root.querySelector('.cortex-toolbar__grip') as HTMLElement
    // happy-dom does not implement setPointerCapture — useDrag try/catches the
    // call for exactly this reason. Install a stub so we can observe whether
    // useDrag reached the capture call (i.e. whether a drag actually started).
    const capture = vi.fn()
    ;(toolbar as unknown as { setPointerCapture: () => void }).setPointerCapture = capture

    // pointerdown on the divider — Toolbar's allowlist guard must short-circuit
    // before useDrag runs, so no pointer capture (no drag start).
    dispatchPointerEvent(divider, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    expect(capture).not.toHaveBeenCalled()

    // Positive control: pointerdown on the grip passes the allowlist, reaches
    // useDrag, and starts the drag — proving the spy can observe a real start.
    dispatchPointerEvent(grip, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    expect(capture).toHaveBeenCalled()
  })
})
