import { describe, it, expect, afterEach, vi } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import { act } from 'preact/test-utils'
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
      // Wrap mount in act() so the useEffect that installs the document-level
      // mousedown listener runs synchronously before we dispatch. Per ZF0-1361
      // cross-model review: act() on the dispatch alone leaves the
      // listener-installation race intact.
      await act(() => {
        mount(<Popover onDismiss={onDismiss} />)
      })
      // act() wraps the dispatch so handler → setState → effect commit drains
      // synchronously. Replaces flushEffects() polling race per ZF0-1387 / ZF0-1361.
      await act(() => {
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
      })
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
    // Wrap mount in act() so the useEffect that installs the document-level
    // keydown listener runs synchronously before we dispatch. Per ZF0-1361
    // cross-model review: act() on the dispatch alone leaves the
    // listener-installation race intact.
    await act(() => {
      mount(<Popover onDismiss={onDismiss} />)
    })
    // act() wraps the dispatch so handler → setState → effect commit drains
    // synchronously. Replaces flushEffects() polling race per ZF0-1387 / ZF0-1361.
    await act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
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

  it('dismisses when mousedown hits a shadow-sibling outside the popover (ZF0-1292 follow-up)', async () => {
    // Regression test for the bug where the hook's `hosts` retargeting
    // check fired at the popover's OWN shadow-root listener. At that
    // scope, composedPath() already includes the host for every
    // inside-shadow click, so the hosts-check would bail on every
    // legitimate outside-popover dismiss. Symptom: clicking elsewhere
    // inside the Panel's shadow left the chip picker stuck open.
    //
    // Open shadow is used because happy-dom retargets composedPath
    // reliably for open roots. The closed-shadow case shares the same
    // `ownRoot` branch but can't be verified here — see the `it.skip`
    // above; coverage is deferred to a real-browser Playwright suite.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const shadowContainer = document.createElement('div')
    const sibling = document.createElement('button')
    sibling.setAttribute('data-testid', 'shadow-sibling')
    shadow.appendChild(shadowContainer)
    shadow.appendChild(sibling)
    try {
      const onDismiss = vi.fn()
      render(<Popover onDismiss={onDismiss} />, shadowContainer)
      await flushEffects()
      // Click a sibling inside the same shadow root, OUTSIDE the popover.
      sibling.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
      expect(onDismiss).toHaveBeenCalled()
      render(null, shadowContainer)
    } finally {
      host.remove()
    }
  })

  // ─── Trigger-aware bypass ──────────────────────────────────────────
  //
  // Without the trigger bypass, mousedown on the popover's own toggle
  // button fires useOutsideDismiss → onDismiss → state goes closed;
  // then click on the same button re-opens it. Net: popover appears
  // stuck open, user cannot close it by re-clicking the trigger.
  //
  // The triggerRefs prop extends the popover's dismiss boundary to
  // include the trigger element, letting the trigger's own onClick
  // be the single source of toggle truth.
  describe('triggerRefs — trigger-aware dismiss bypass', () => {
    function PopoverWithTrigger(props: {
      onDismiss: () => void
      includeTrigger: boolean
    }): VNode {
      const ref = useRef<HTMLDivElement>(null)
      const triggerRef = useRef<HTMLButtonElement>(null)
      useOutsideDismiss(
        ref,
        props.onDismiss,
        props.includeTrigger ? [triggerRef] : undefined,
      )
      return (
        <>
          <button ref={triggerRef} type="button" data-testid="trigger">
            toggle
          </button>
          <div ref={ref} data-testid="popover">
            body
          </div>
        </>
      )
    }

    it('does NOT dismiss when mousedown hits a registered trigger element', async () => {
      const onDismiss = vi.fn()
      mount(<PopoverWithTrigger onDismiss={onDismiss} includeTrigger={true} />)
      await flushEffects()

      const trigger = container.querySelector('[data-testid="trigger"]') as HTMLButtonElement
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))

      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('DOES dismiss when mousedown hits the trigger WITHOUT the bypass registered (proves the bypass is load-bearing)', async () => {
      // Falsifiability: run the exact same scenario but without the
      // trigger bypass, and confirm dismissal fires. If this didn't
      // fire, the bypass test above would be testing nothing.
      const onDismiss = vi.fn()
      mount(<PopoverWithTrigger onDismiss={onDismiss} includeTrigger={false} />)
      await flushEffects()

      const trigger = container.querySelector('[data-testid="trigger"]') as HTMLButtonElement
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('still dismisses on clicks that are NOT on the registered trigger', async () => {
      const onDismiss = vi.fn()
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      try {
        mount(<PopoverWithTrigger onDismiss={onDismiss} includeTrigger={true} />)
        await flushEffects()

        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))

        expect(onDismiss).toHaveBeenCalledTimes(1)
      } finally {
        outside.remove()
      }
    })
  })
})
