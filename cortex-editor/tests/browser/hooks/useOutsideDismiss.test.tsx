import { describe, it, expect, afterEach, vi } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import { useRef } from 'preact/hooks'
import { useOutsideDismiss } from '../../../src/browser/hooks/useOutsideDismiss.js'

/**
 * Direct test of the hook's observable contract. Covers:
 *   - Light-DOM outside-click dismissal
 *   - Inside-click does NOT dismiss (composedPath includes ref)
 *   - Escape dismisses
 *   - Listeners are fully removed on unmount
 *   - Listener set is STABLE when the parent re-renders (the bug that
 *     inline-arrow callbacks silently create when they thrash deps)
 *
 * Closed-shadow retargeting behavior is NOT tested here — happy-dom
 * doesn't faithfully retarget `composedPath()` across closed boundaries,
 * so such a test would be theatre per CLAUDE.md anti-pattern 3. That
 * contract is verified by manual testing and (future) Playwright.
 */

let container: HTMLDivElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
})

function mount(vnode: VNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(vnode, container)
  return container
}

/** Preact's `useEffect` fires on the next microtask after commit, not
 *  synchronously at render() return. Happy-dom needs a small timeout for
 *  the effect queue to drain before event dispatch can exercise listeners. */
const flushEffects = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

function Popover(props: { onDismiss: () => void; label?: string }): VNode {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideDismiss(ref, props.onDismiss)
  return (
    <div ref={ref} data-testid="popover">
      <button type="button" data-testid="inside-btn">{props.label ?? 'option'}</button>
    </div>
  )
}

describe('useOutsideDismiss', () => {
  it('dismisses when the user mousedowns outside the popover (light DOM)', async () => {
    const onDismiss = vi.fn()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    try {
      mount(<Popover onDismiss={onDismiss} />)
      await flushEffects()
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      outside.remove()
    }
  })

  it('does NOT dismiss when the user mousedowns inside the popover', async () => {
    const onDismiss = vi.fn()
    const root = mount(<Popover onDismiss={onDismiss} />)
    await flushEffects()
    const inside = root.querySelector('[data-testid="inside-btn"]') as HTMLElement
    expect(inside).toBeTruthy()
    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on Escape keydown regardless of focus', async () => {
    const onDismiss = vi.fn()
    mount(<Popover onDismiss={onDismiss} />)
    await flushEffects()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does NOT dismiss on Escape if an upstream handler called preventDefault (H8)', async () => {
    // When a nested <dialog> or the CortexApp root Escape cascade handles
    // the keystroke first (via a capture-phase listener) and calls
    // preventDefault, the popover must NOT also dismiss. One keypress =
    // one dismissal. Without the defaultPrevented guard, users saw both
    // the modal close AND the open popover vanish on one Escape press.
    const onDismiss = vi.fn()
    mount(<Popover onDismiss={onDismiss} />)
    await flushEffects()

    const upstream = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') e.preventDefault()
    }
    document.addEventListener('keydown', upstream, { capture: true })
    try {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
      expect(onDismiss).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', upstream, { capture: true })
    }
  })

  it('does NOT dismiss on non-Escape keydowns', async () => {
    const onDismiss = vi.fn()
    mount(<Popover onDismiss={onDismiss} />)
    await flushEffects()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('removes all listeners on unmount (no leaks)', async () => {
    const onDismiss = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<Popover onDismiss={onDismiss} />, container)
    await flushEffects()

    // Unmount
    render(null, container)
    container.remove()
    await flushEffects()

    // Events on document after unmount must not reach the hook.
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('keeps listener identity stable across parent re-renders (no churn on inline onDismiss)', async () => {
    // Each parent re-render passes a fresh inline onDismiss function. With
    // a naive deps=[onDismiss] effect, the listeners would tear down + re-
    // register every render. With the ref-shim pattern, listener identity
    // stays stable and only the ref value updates.
    //
    // We observe this by counting addEventListener/removeEventListener
    // calls on document. Exactly one add per listener is expected across
    // many re-renders.

    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    try {
      const outer = document.createElement('div')
      document.body.appendChild(outer)
      try {
        for (let i = 0; i < 5; i++) {
          // New inline fn per render — different identity each time.
          render(<Popover onDismiss={() => {}} label={`r${i}`} />, outer)
          await flushEffects()
        }
        const keydownAdds = addSpy.mock.calls.filter(([ev]) => ev === 'keydown').length
        const keydownRemoves = removeSpy.mock.calls.filter(([ev]) => ev === 'keydown').length
        // With stable listeners, exactly one add and zero removes across
        // five re-renders. If deps=[onDismiss], we would see five adds
        // and four removes.
        expect(keydownAdds).toBe(1)
        expect(keydownRemoves).toBe(0)
      } finally {
        render(null, outer)
        outer.remove()
      }
    } finally {
      addSpy.mockRestore()
      removeSpy.mockRestore()
    }
  })

  it.skip('dismisses correctly when mounted inside a closed ShadowRoot — requires real browser', () => {
    // Happy-dom does not faithfully simulate closed-shadow `composedPath()`
    // retargeting. Attaching this test in happy-dom would pass regardless
    // of whether the hook walks the shadow chain or not — the exact
    // "happy-dom theatre" pattern CLAUDE.md forbids. Covered by manual
    // verification and (TODO) a Playwright suite against a real browser.
  })
})
