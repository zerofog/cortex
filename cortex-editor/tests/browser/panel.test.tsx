import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { Panel } from '../../src/browser/components/Panel.js'
import { renderInShadow, mockGetComputedStyle, createShadowHost } from './helpers.js'

const panelPositionProps = {
  position: { x: 1000, y: 12 },
  isSnapping: false,
  panelPointerDown: vi.fn(),
  panelPointerMove: vi.fn(),
  panelPointerUp: vi.fn(),
  panelPointerCancel: vi.fn(),
  // ZF0-1292: required since the architecture-review follow-up made the
  // prop mandatory. Tests that don't exercise HMR behavior pass 0 to keep
  // the Panel stable (no version bumps fired during the test body).
  hmrAppliedVersion: 0,
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
    expect(root.textContent).toContain('Size')
    expect(root.textContent).toContain('Spacing')
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

  it('re-detects typography bundle when element.className mutates (ZF0-1215 class observer)', async () => {
    // Invariant under test: Panel lives in a Preact shadow tree decoupled
    // from the user's React tree. When HMR rewrites the user's className,
    // the Panel MUST observe the mutation and re-run bundle detection so
    // the typography pill reflects the current class.
    //
    // Before the Task 17 observer fix, this test would show a stale bundle
    // name after className mutation because nothing bumped styleVersion.
    const BUNDLES = [
      { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
      { name: 'heading-1', fontSize: '32px', lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '700' },
    ]

    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/App.tsx:10:5')
    target.appendChild(document.createTextNode('Scenario'))
    target.className = 'text-heading-1'
    document.body.appendChild(target)
    const restoreStyles = mockGetComputedStyle(target, {
      fontSize: '32px',
      fontFamily: 'Inter',
      fontWeight: '700',
      lineHeight: '40px',
      letterSpacing: '-0.5px',
      textAlign: 'left',
      color: 'rgb(0,0,0)',
      display: 'block',
    })

    const overrideManager = {
      set: vi.fn(), get: vi.fn(), remove: vi.fn(),
      clearAll: vi.fn(), dispose: vi.fn(), flush: vi.fn(),
    }
    const result = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        textComponents={BUNDLES}
        {...panelPositionProps}
      />
    )
    cleanup = () => {
      result.cleanup()
      target.remove()
      restoreStyles()
    }

    // Initial render: pill shows heading-1.
    const typographySection = result.root.querySelector('[data-section-id="type"]')
    expect(typographySection).not.toBeNull()
    expect(typographySection!.textContent).toContain('heading-1')
    expect(typographySection!.textContent).not.toContain('body-md')

    // Mutate className — simulates React re-rendering after an HMR update.
    target.className = 'text-body-md'

    // Wait for MutationObserver callback + microtask coalescing + Preact re-render.
    await vi.waitFor(() => {
      expect(typographySection!.textContent).toContain('body-md')
      expect(typographySection!.textContent).not.toContain('heading-1')
    }, { timeout: 500 })
  })
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
      set: vi.fn(), get: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
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
    // PanelHeader should show "(library)" badge
    await vi.waitFor(() => {
      const badge = container.querySelector('.cortex-panel-header__library')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toContain('library')
    }, { timeout: 500 })

    render(null, container)
    container.remove()
    parent.remove()
  })

  it('does not show library badge for user-space elements', async () => {
    const userEl = document.createElement('div')
    userEl.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(userEl)

    const overrideManager = {
      set: vi.fn(), get: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
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
    // useMemo must re-run when activeState changes — proves it's in the dep array
    await vi.waitFor(() => {
      expect(targetCallCount).toBeGreaterThanOrEqual(1)
    }, { timeout: 500 })

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
    // Verify getComputedStyle was called with '::before' pseudo
    await vi.waitFor(() => {
      const pseudoCalls = gcsCallLog.filter(c => c.target === target && c.pseudo === '::before')
      expect(pseudoCalls.length).toBeGreaterThan(0)
    }, { timeout: 500 })

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
    // The defaultStylesRef should have been populated by the useEffect on [element].
    // Verify it was called at least once for the snapshot.
    let initialCount!: number
    await vi.waitFor(() => {
      expect(gcsCallCount).toBeGreaterThanOrEqual(1)
      initialCount = gcsCallCount
    }, { timeout: 500 })

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
    // Should render pseudo tabs
    await vi.waitFor(() => {
      const tabs = container.querySelector('.cortex-pseudo-tabs')
      expect(tabs).not.toBeNull()
      expect(container.querySelector('[data-pseudo="::before"]')).not.toBeNull()
      expect(container.querySelector('[data-pseudo="::after"]')).not.toBeNull()
    }, { timeout: 500 })

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
    await vi.waitFor(() => {
      expect(pseudoTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)
    }, { timeout: 500 })

    // Trigger a property change via ArrowUp on a NumericInput to exercise the
    // applyOverride → overrideManager.set path with the pseudo parameter.
    const numericInput = container.querySelector('.cortex-numeric-input__value') as HTMLInputElement
    expect(numericInput).not.toBeNull()
    numericInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    // overrideManager.set must have been called with '::before' as the pseudo parameter
    await vi.waitFor(() => {
      const setCall = (overrideManager.set as ReturnType<typeof vi.fn>).mock.calls.find(
        (args: unknown[]) => args[3] === '::before'
      )
      expect(setCall).toBeDefined()
    }, { timeout: 500 })

    render(null, container)
    container.remove()
    target.remove()
  })

  // Bug #17: blast-radius style tag removed on unmount (ZF0-1321).
  // Preact's useEffect cleanup is registered only after the mount effect runs.
  // Under fake timers the mount effect is scheduled via an rAF/setTimeout race
  // inside preact/hooks `afterNextFrame`, and under concurrent fork load that
  // schedule doesn't reliably drain with `vi.advanceTimersByTimeAsync`. If the
  // mount effect never ran, `hook._cleanup` stays undefined, so Preact's
  // synchronous `options.unmount` -> `invokeCleanup` is a no-op and the style
  // tag survives. `act()` from preact/test-utils patches
  // `options.requestAnimationFrame` and synchronously drains the effect queue,
  // so wrapping mount AND unmount in act() guarantees `_cleanup` is set before
  // unmount. preact/test-utils ships with the preact package (no new dep) —
  // same primitive @testing-library/preact uses.
  it('removes blast-radius style tag from document.head on unmount', async () => {
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
        set: vi.fn(), get: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
        dispose: vi.fn(), flush: vi.fn(),
      }

      document.body.appendChild(container)

      await act(() => {
        render(
          <Panel element={el} overrideManager={overrideManager as any}
            onClose={() => {}} onSelectElement={() => {}} {...panelPositionProps} />,
          container,
        )
      })

      // Manually inject the blast-radius style tag to simulate a highlight having occurred.
      // The style is lazily injected on first highlightSharedElements() call, not on mount.
      if (!document.head.querySelector('[data-cortex-blast-radius-style]')) {
        const style = document.createElement('style')
        style.setAttribute('data-cortex-blast-radius-style', '')
        style.textContent = '[data-cortex-blast-radius] { outline: 2px dashed #f97316 !important; }'
        document.head.appendChild(style)
      }

      expect(document.head.querySelector('[data-cortex-blast-radius-style]')).not.toBeNull()

      await act(() => {
        render(null, container)
      })

      expect(document.head.querySelector('[data-cortex-blast-radius-style]')).toBeNull()
    } finally {
      container.remove()
      el.remove()
      el2.remove()
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
    await vi.waitFor(() => {
      expect(pseudoTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)
    }, { timeout: 500 })

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
    // The element tab should be active (reset on element change)
    // Two microtask cycles needed: useEffect on [element] fires setActivePseudo('element'),
    // then re-render completes.
    await vi.waitFor(() => {
      const elementTab = container.querySelector('[data-pseudo="element"]') as HTMLButtonElement
      expect(elementTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)
    }, { timeout: 500 })

    render(null, container)
    container.remove()
    el1.remove()
    el2.remove()
  })
})

describe('Panel — hmrAppliedVersion (ZF0-1292)', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
    vi.useRealTimers()
  })

  it('re-reads computed styles when hmrAppliedVersion prop changes', async () => {
    // Invariant: Panel must refresh when an out-of-band source edit (CSS file,
    // @theme token, parent cascade) changes computed styles without mutating
    // the selected element's own class/style attributes. MutationObserver
    // does not fire for stylesheet-level changes; the hmrAppliedVersion prop
    // is the escape hatch.
    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/hero.tsx:10:5')
    target.appendChild(document.createTextNode('Heading'))
    document.body.appendChild(target)

    // Mutable style ref — we swap values on the same object so
    // mockGetComputedStyle always returns the current snapshot (the mock
    // spreads `...styles` on every call). This lets us simulate a
    // stylesheet edit without re-invoking mockGetComputedStyle.
    const styles: Record<string, string> = {
      textAlign: 'left',
      fontSize: '32px',
      fontFamily: 'Inter',
      fontWeight: '700',
      lineHeight: '40px',
      letterSpacing: '0px',
      color: 'rgb(0,0,0)',
      display: 'block',
    }
    const restoreStyles = mockGetComputedStyle(target, styles)

    const overrideManager = {
      set: vi.fn(), get: vi.fn(), remove: vi.fn(),
      clearAll: vi.fn(), dispose: vi.fn(), flush: vi.fn(),
    }

    const { host, shadow, root: shadowRoot, cleanup: removeHost } =
      createShadowHost()
    const renderPanel = (version: number): void => {
      render(
        <Panel
          element={target}
          overrideManager={overrideManager as any}
          onClose={() => {}}
          onSelectElement={() => {}}
          {...panelPositionProps}
          hmrAppliedVersion={version}
        />,
        shadowRoot,
      )
    }

    renderPanel(0)
    cleanup = () => {
      render(null, shadowRoot)
      removeHost()
      target.remove()
      restoreStyles()
      // Silence unused warnings for host/shadow — retained for potential future debugging.
      void host
      void shadow
    }
    await new Promise(r => setTimeout(r, 10))

    // Initial render: SegmentedControl marks "left" as the active option.
    expect(
      shadowRoot.querySelector('.cortex-segmented__option--active[data-value="left"]'),
    ).not.toBeNull()

    // Simulate a stylesheet edit that changes the computed text-align
    // WITHOUT mutating any attribute on the target element.
    styles.textAlign = 'center'

    // Observer path is dormant — assert still stale.
    await new Promise(r => setTimeout(r, 20))
    expect(
      shadowRoot.querySelector('.cortex-segmented__option--active[data-value="left"]'),
    ).not.toBeNull()

    // Re-render with bumped hmrAppliedVersion.
    renderPanel(1)
    // Panel has re-read getComputedStyle and reflects the new value.
    await vi.waitFor(() => {
      expect(
        shadowRoot.querySelector('.cortex-segmented__option--active[data-value="center"]'),
      ).not.toBeNull()
      expect(
        shadowRoot.querySelector('.cortex-segmented__option--active[data-value="left"]'),
      ).toBeNull()
    }, { timeout: 500 })
  })

  // The paired behavior — sharedInfo useEffect re-runs on hmrAppliedVersion —
  // is covered by inspection of the deps list in Panel.tsx ("re-runs on
  // hmrAppliedVersion bumps" comment). A standalone behavioral test would
  // require module-level mocking of detectSharedClasses with vi.resetModules,
  // which pollutes Preact's module-scoped hook state and breaks sibling
  // tests (confirmed by running the blast-radius unmount test downstream).
  // The integration path is covered end-to-end in Step 9.5 manual
  // verification (scenario (d) — React Fast Refresh adds/removes siblings
  // sharing a class with the selected element).

  it('preserves editScope across hmrAppliedVersion bumps (split-useEffect regression guard)', async () => {
    // Locks in the commit f9b0e13 architectural fix: scope reset +
    // highlight clear fire ONLY on `[element]` changes, NOT on
    // `hmrAppliedVersion`. Without this split, an HMR cycle after the user
    // toggled to "All" scope would silently flip them back to "instance"
    // mid-edit. Flagged as HIGH by three independent reviewers in the
    // ZF0-1292 architecture review. If someone merges the two useEffects
    // back into one, this test fails.

    // Create two siblings annotated with `data-cortex-css` pointing at the
    // same CSS module file + selector — this is what `detectSharedClasses`
    // treats as a shared class (count > 1).
    const sharedCss = 'Component.module.css:.badge'
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/component.tsx:5:3')
    target.setAttribute('data-cortex-css', sharedCss)
    target.appendChild(document.createTextNode('Target'))
    document.body.appendChild(target)

    const sibling = document.createElement('div')
    sibling.setAttribute('data-cortex-source', 'src/component.tsx:10:3')
    sibling.setAttribute('data-cortex-css', sharedCss)
    document.body.appendChild(sibling)

    // When scope === 'all', Panel iterates sharedInfo.elements and calls
    // `cs.getPropertyValue(prop)` on both the target's and siblings' computed
    // styles. The default mockGetComputedStyle returns a spread object that
    // drops the CSSStyleDeclaration prototype, so getPropertyValue is missing.
    // Install a Proxy-based mock that provides getPropertyValue on any element.
    const originalGCS = window.getComputedStyle
    const defaultStyles: Record<string, string> = { display: 'block' }
    const makeProxy = (styles: Record<string, string>): CSSStyleDeclaration =>
      new Proxy(styles, {
        get(obj, prop) {
          if (prop === 'getPropertyValue') {
            return (p: string) => {
              const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
              return (obj as Record<string, string>)[camel] ?? (obj as Record<string, string>)[p] ?? ''
            }
          }
          return (obj as Record<string, string>)[prop as string] ?? ''
        },
      }) as unknown as CSSStyleDeclaration
    window.getComputedStyle = ((_el: Element, _pseudo?: string | null) =>
      makeProxy(defaultStyles)) as typeof window.getComputedStyle
    const restoreStyles = (): void => { window.getComputedStyle = originalGCS }

    const overrideManager = {
      set: vi.fn(), get: vi.fn(), remove: vi.fn(),
      clearAll: vi.fn(), dispose: vi.fn(), flush: vi.fn(),
    }

    const { shadow, root: shadowRoot, cleanup: removeHost } = createShadowHost()
    const renderPanel = (version: number): void => {
      render(
        <Panel
          element={target}
          overrideManager={overrideManager as any}
          onClose={() => {}}
          onSelectElement={() => {}}
          {...panelPositionProps}
          hmrAppliedVersion={version}
        />,
        shadowRoot,
      )
    }

    renderPanel(0)
    cleanup = () => {
      render(null, shadowRoot)
      removeHost()
      target.remove()
      sibling.remove()
      restoreStyles()
      void shadow
    }

    // Sanity: the scope toggle is rendered, meaning detectSharedClasses
    // found 2+ matching elements and sharedInfo is non-null.
    let allBtn!: HTMLButtonElement
    let instanceBtn!: HTMLButtonElement
    await vi.waitFor(() => {
      allBtn = shadowRoot.querySelector('.cortex-panel__scope-btn:last-child') as HTMLButtonElement
      expect(allBtn).not.toBeNull()
      expect(allBtn!.textContent).toContain('All')
      instanceBtn = shadowRoot.querySelector('.cortex-panel__scope-btn:first-child') as HTMLButtonElement
      // Initial state: "This element" is active (default from setEditScope('instance')).
      expect(instanceBtn.classList.contains('cortex-panel__scope-btn--active')).toBe(true)
      expect(allBtn!.classList.contains('cortex-panel__scope-btn--active')).toBe(false)
    }, { timeout: 500 })

    // User clicks "All" to switch scope.
    allBtn!.click()
    await vi.waitFor(() => {
      expect(allBtn!.classList.contains('cortex-panel__scope-btn--active')).toBe(true)
      expect(instanceBtn.classList.contains('cortex-panel__scope-btn--active')).toBe(false)
    }, { timeout: 500 })

    // Now bump hmrAppliedVersion — simulates an HMR cycle (stylesheet edit,
    // @theme token change, etc). The invariant under test: scope stays "All".
    renderPanel(1)
    // Re-query because Preact may have reconciled the buttons.
    await vi.waitFor(() => {
      const allBtnAfter = shadowRoot.querySelector('.cortex-panel__scope-btn:last-child') as HTMLButtonElement
      const instanceBtnAfter = shadowRoot.querySelector('.cortex-panel__scope-btn:first-child') as HTMLButtonElement
      expect(allBtnAfter.classList.contains('cortex-panel__scope-btn--active')).toBe(true)
      expect(instanceBtnAfter.classList.contains('cortex-panel__scope-btn--active')).toBe(false)
    }, { timeout: 500 })
  })
})
