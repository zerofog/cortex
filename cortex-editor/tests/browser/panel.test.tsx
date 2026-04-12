import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { Panel } from '../../src/browser/components/Panel.js'
import { renderInShadow, mockGetComputedStyle } from './helpers.js'

const panelPositionProps = {
  position: { x: 1000, y: 12 },
  isSnapping: false,
  panelPointerDown: vi.fn(),
  panelPointerMove: vi.fn(),
  panelPointerUp: vi.fn(),
  panelPointerCancel: vi.fn(),
}

// Global defense-in-depth against fake-timer leakage across tests.
// A previous iteration had two tests that installed vi.useFakeTimers() and
// relied on end-of-test vi.useRealTimers() — when those tests threw an
// assertion error they skipped cleanup, leaving fake timers installed and
// causing every subsequent `await new Promise(r => setTimeout(r, 0))` to
// hang forever. See panel-section-order.test.ts for the same guard.
afterEach(() => {
  vi.useRealTimers()
})

describe('Panel', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(element?: HTMLElement) {
    const target = element ?? (() => {
      const el = document.createElement('div')
      el.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
      el.className = 'test-target'
      document.body.appendChild(el)
      return el
    })()

    const onClose = vi.fn()
    const onSelectElement = vi.fn()
    const overrideManager = {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      clearAll: vi.fn(),
      dispose: vi.fn(),
      flush: vi.fn(),
    }

    const result = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={onClose}
        onSelectElement={onSelectElement}
        {...panelPositionProps}
      />
    )
    cleanup = () => {
      result.cleanup()
      target.remove()
    }
    return { ...result, onClose, onSelectElement, overrideManager, target }
  }

  it('renders panel with correct class', () => {
    const { root } = setup()
    const panel = root.querySelector('.cortex-panel')
    expect(panel).not.toBeNull()
  })

  it('renders panel header with element info', () => {
    const { root } = setup()
    expect(root.textContent).toContain('Hero')
  })

  it('renders section labels', () => {
    // Use a text-bearing element so the Typography section renders.
    // The default setup() target is a childless <div> which intentionally
    // omits Typography (see `containsDirectText` helper in Panel.tsx).
    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    target.appendChild(document.createTextNode('Hero heading'))
    document.body.appendChild(target)
    const { root } = setup(target)
    expect(root.textContent).toContain('Display')
    expect(root.textContent).toContain('Padding')
    // v2: "Font" sub-label removed; the SectionGroup header reads "Typography"
    expect(root.textContent).toContain('Typography')
  })

  it('renders Phase 5b sections', () => {
    const { root } = setup()
    // BackgroundSection only renders when background has a value;
    // with a default transparent background, the group is present
    // but the section content is not. Assert the group exists.
    expect(root.querySelector('[data-group="background"]')).not.toBeNull()
    // BorderSection only renders when border has a value; with default
    // styles (borderStyle: 'none'), the group is present but the section
    // content is not. Same pattern as BackgroundSection above.
    expect(root.querySelector('[data-group="border"]')).not.toBeNull()
    // Task 15 consolidated ShadowSection + EffectsSection into a single
    // unified EffectsSection with data-section-id="effects".
    expect(root.querySelector('[data-section-id="effects"]')).not.toBeNull()
  })

  // Canonical section group count, data-group presence, and header label
  // order are all owned by tests/browser/panel-section-order.test.ts. Do not
  // re-assert them here — the array-equality tests in that file are the
  // single source of truth and any duplicate here would be subsumed.

  it('groups sections under correct parent groups', () => {
    const { root } = setup()
    const elementsGroup = root.querySelector('[data-group="elements"]')!
    expect(elementsGroup.querySelector('.cortex-layer-tree')).not.toBeNull()

    const layoutGroup = root.querySelector('[data-group="layout"]')!
    expect(layoutGroup.querySelector('[data-section-id="layout"]')).not.toBeNull()
    expect(layoutGroup.querySelector('[data-section-id="spacing"]')).not.toBeNull()

    const positionGroup = root.querySelector('[data-group="position"]')!
    expect(positionGroup.querySelector('[data-section-id="position"]')).not.toBeNull()

    // Background group always renders; BackgroundSection content renders
    // only when the background is non-transparent.  With default mock
    // styles the element has no background, so assert the group exists.
    const backgroundGroup = root.querySelector('[data-group="background"]')!
    expect(backgroundGroup).not.toBeNull()

    // Border group always renders; BorderSection content renders
    // only when the border has a value (borderStyle !== 'none'). With
    // default mock styles the element has no border, so assert the
    // group exists but section content is absent.
    const borderGroup = root.querySelector('[data-group="border"]')!
    expect(borderGroup).not.toBeNull()

    // Task 15 consolidated shadow + effects into a single EffectsSection.
    const effectsGroup = root.querySelector('[data-group="effects"]')!
    expect(effectsGroup.querySelector('[data-section-id="effects"]')).not.toBeNull()
  })

  it('calls onClose when close button clicked', () => {
    const { root, onClose } = setup()
    const closeBtn = root.querySelector('[data-action="close"]') as HTMLButtonElement
    closeBtn?.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('renders empty state panel when element is null', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <Panel
        element={null}
        overrideManager={{} as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
      />,
      container,
    )
    expect(container.querySelector('.cortex-panel')).not.toBeNull()
    expect(container.textContent).toContain('Click any element to start editing')
    // Sections should NOT render in empty state
    expect(container.querySelector('[data-section-id]')).toBeNull()
    render(null, container)
    container.remove()
  })

  // NOTE: The old `cortex-panel--cross-fade` animation was removed in ZF0-1122
  // when LayerTree was introduced; see the comment at Panel.tsx around the
  // `useEffect(() => { ... prevElementRef.current !== element ... }, [element])`
  // block: "No cross-fade or body remount — sections update via normal prop
  // changes." The two cross-fade tests that used to live here asserted a class
  // that never rendered and were only passing-or-timing-out at random due to
  // a vi.useFakeTimers() cleanup that the failing assertion skipped. Deleted
  // as dead zombie tests rather than ported.
})

describe('Panel — library detection wiring', () => {
  it('passes isLibrary and ancestor info to PanelHeader for node_modules element', async () => {
    // Create a library element (path includes /node_modules/)
    const libEl = document.createElement('div')
    libEl.setAttribute('data-cortex-source', '/project/node_modules/@ui/Button.tsx:10:3')
    document.body.appendChild(libEl)

    // Create a user-space ancestor
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', 'src/App.tsx:5:1')
    parent.appendChild(libEl)
    document.body.appendChild(parent)

    const overrideManager = {
      set: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
      dispose: vi.fn(), flush: vi.fn(),
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel
        element={libEl}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // PanelHeader should show "(library)" badge
    const badge = container.querySelector('.cortex-panel-header__library')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('library')

    render(null, container)
    container.remove()
    parent.remove()
  })

  it('does not show library badge for user-space elements', async () => {
    const userEl = document.createElement('div')
    userEl.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(userEl)

    const overrideManager = {
      set: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
      dispose: vi.fn(), flush: vi.fn(),
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel
        element={userEl}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    const badge = container.querySelector('.cortex-panel-header__library')
    expect(badge).toBeNull()

    render(null, container)
    container.remove()
    userEl.remove()
  })
})

describe('Panel — activeState + activePseudo + dimming', () => {
  function createTarget(): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    el.className = 'test-target'
    document.body.appendChild(el)
    return el
  }

  function createOverrideManager() {
    return {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      clearAll: vi.fn(),
      dispose: vi.fn(),
      flush: vi.fn(),
    }
  }

  it('re-reads computedStyles when activeState changes', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Render with default state
    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        activeState="default"
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // Install mock + spy wrapper to detect getComputedStyle calls on our target
    const cleanupMock = mockGetComputedStyle(target, { color: 'rgb(255, 0, 0)' })
    let targetCallCount = 0
    const mockedGCS = window.getComputedStyle
    window.getComputedStyle = ((...args: [Element, string?]) => {
      if (args[0] === target) targetCallCount++
      return mockedGCS.apply(window, args)
    }) as typeof window.getComputedStyle

    // Re-render with hover state — should trigger useMemo re-read
    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        activeState="hover"
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // useMemo must re-run when activeState changes — proves it's in the dep array
    expect(targetCallCount).toBeGreaterThanOrEqual(1)

    cleanupMock()
    render(null, container)
    container.remove()
    target.remove()
  })

  it('uses getComputedStyle with pseudo when activePseudo is ::before', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Mock pseudo computed styles
    const original = window.getComputedStyle
    const gcsCallLog: Array<{ target: Element; pseudo: string | null | undefined }> = []
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      gcsCallLog.push({ target: el, pseudo })
      return original.call(window, el, pseudo)
    }) as typeof window.getComputedStyle

    // Render with hasBefore=true, then click the ::before tab
    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        hasBefore={true}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // Click the ::before pseudo tab
    const pseudoTab = container.querySelector('[data-pseudo="::before"]') as HTMLButtonElement
    expect(pseudoTab).not.toBeNull()
    pseudoTab?.click()
    await new Promise(r => setTimeout(r, 0))

    // Verify getComputedStyle was called with '::before' pseudo
    const pseudoCalls = gcsCallLog.filter(c => c.target === target && c.pseudo === '::before')
    expect(pseudoCalls.length).toBeGreaterThan(0)

    window.getComputedStyle = original
    render(null, container)
    container.remove()
    target.remove()
  })

  it('stores defaultComputedStyles snapshot on element mount (not on styleVersion)', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    const original = window.getComputedStyle
    let gcsCallCount = 0
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (el === target && !pseudo) gcsCallCount++
      return original.call(window, el, pseudo)
    }) as typeof window.getComputedStyle

    // Initial render
    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        activeState="default"
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))
    const initialCount = gcsCallCount

    // The defaultStylesRef should have been populated by the useEffect on [element].
    // Verify it was called at least once for the snapshot.
    expect(initialCount).toBeGreaterThanOrEqual(1)

    window.getComputedStyle = original
    render(null, container)
    container.remove()
    target.remove()
  })

  // TODO: assert dimmed CSS class when sections render dimmedProperties.
  // dimmedProperties is computed in Panel's useMemo but no section component
  // consumes the prop in JSX yet — there's no DOM output to assert against.
  it.skip('computes dimmedProperties when activeState is not default', () => {})
  it.skip('does not compute dimmedProperties when activeState is default', () => {})

  it('renders pseudo tabs when hasBefore or hasAfter is true', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        hasBefore={true}
        hasAfter={true}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // Should render pseudo tabs
    const tabs = container.querySelector('.cortex-pseudo-tabs')
    expect(tabs).not.toBeNull()

    const beforeTab = container.querySelector('[data-pseudo="::before"]')
    const afterTab = container.querySelector('[data-pseudo="::after"]')
    expect(beforeTab).not.toBeNull()
    expect(afterTab).not.toBeNull()

    render(null, container)
    container.remove()
    target.remove()
  })

  it('does not render pseudo tabs when hasBefore and hasAfter are false', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    const tabs = container.querySelector('.cortex-pseudo-tabs')
    expect(tabs).toBeNull()

    render(null, container)
    container.remove()
    target.remove()
  })

  it('passes pseudo parameter to overrideManager.set when activePseudo is not element', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        hasBefore={true}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // Click the ::before pseudo tab
    const pseudoTab = container.querySelector('[data-pseudo="::before"]') as HTMLButtonElement
    pseudoTab?.click()
    await new Promise(r => setTimeout(r, 0))

    expect(pseudoTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)

    // Trigger a property change via ArrowUp on a NumericInput to exercise the
    // applyOverride → overrideManager.set path with the pseudo parameter.
    const numericInput = container.querySelector('.cortex-numeric-input__value') as HTMLInputElement
    expect(numericInput).not.toBeNull()
    numericInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    // overrideManager.set must have been called with '::before' as the pseudo parameter
    const setCall = (overrideManager.set as ReturnType<typeof vi.fn>).mock.calls.find(
      (args: unknown[]) => args[3] === '::before'
    )
    expect(setCall).toBeDefined()

    render(null, container)
    container.remove()
    target.remove()
  })

  // Bug #17: blast-radius style tag removed on unmount
  it('removes blast-radius style tag from document.head on unmount', async () => {
    vi.useFakeTimers()

    const el = document.createElement('div')
    const el2 = document.createElement('div')
    const container = document.createElement('div')

    try {
      el.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
      el.className = 'shared-class'
      document.body.appendChild(el)

      el2.setAttribute('data-cortex-source', 'src/Card.tsx:8:3')
      el2.className = 'shared-class'
      document.body.appendChild(el2)

      const overrideManager = {
        set: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
        dispose: vi.fn(), flush: vi.fn(),
      }

      document.body.appendChild(container)

      render(
        <Panel element={el} overrideManager={overrideManager as any}
          onClose={() => {}} onSelectElement={() => {}} {...panelPositionProps} />,
        container,
      )
      await vi.advanceTimersByTimeAsync(50)

      // Manually inject the blast-radius style tag to simulate a highlight having occurred.
      // The style is lazily injected on first highlightSharedElements() call, not on mount.
      if (!document.head.querySelector('[data-cortex-blast-radius-style]')) {
        const style = document.createElement('style')
        style.setAttribute('data-cortex-blast-radius-style', '')
        style.textContent = '[data-cortex-blast-radius] { outline: 2px dashed #f97316 !important; }'
        document.head.appendChild(style)
      }

      expect(document.head.querySelector('[data-cortex-blast-radius-style]')).not.toBeNull()

      render(null, container)

      expect(document.head.querySelector('[data-cortex-blast-radius-style]')).toBeNull()
    } finally {
      container.remove()
      el.remove()
      el2.remove()
      vi.useRealTimers()
    }
  })

  it('resets activePseudo to element when element changes', async () => {
    const el1 = createTarget()
    const el2 = document.createElement('div')
    el2.setAttribute('data-cortex-source', 'src/Card.tsx:8:3')
    document.body.appendChild(el2)

    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Render with hasBefore, click ::before tab
    render(
      <Panel
        element={el1}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        hasBefore={true}
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    const pseudoTab = container.querySelector('[data-pseudo="::before"]') as HTMLButtonElement
    pseudoTab?.click()
    await new Promise(r => setTimeout(r, 0))

    // Switch to a different element
    render(
      <Panel
        element={el2}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        hasBefore={true}
        {...panelPositionProps}
      />,
      container,
    )
    // Two microtask cycles: first for useEffect on [element] to fire setActivePseudo('element'),
    // second for the re-render triggered by that state change to complete.
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    // The element tab should be active (reset on element change)
    const elementTab = container.querySelector('[data-pseudo="element"]') as HTMLButtonElement
    expect(elementTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)

    render(null, container)
    container.remove()
    el1.remove()
    el2.remove()
  })
})
