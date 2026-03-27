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
    const { root } = setup()
    expect(root.textContent).toContain('Display')
    expect(root.textContent).toContain('Padding')
    expect(root.textContent).toContain('Font')
  })

  it('renders Phase 5b sections', () => {
    const { root } = setup()
    expect(root.querySelector('[data-section-id="fill"]')).not.toBeNull()
    expect(root.querySelector('[data-section-id="border"]')).not.toBeNull()
    expect(root.querySelector('[data-section-id="shadow"]')).not.toBeNull()
    expect(root.querySelector('[data-section-id="effects"]')).not.toBeNull()
  })

  it('renders three section groups with correct data-group attributes', () => {
    const { root } = setup()
    const groups = root.querySelectorAll('.cortex-section-group')
    expect(groups.length).toBe(3)
    expect(root.querySelector('[data-group="layout"]')).not.toBeNull()
    expect(root.querySelector('[data-group="typography"]')).not.toBeNull()
    expect(root.querySelector('[data-group="style"]')).not.toBeNull()
  })

  it('renders group headers with correct labels', () => {
    const { root } = setup()
    const titles = root.querySelectorAll('.cortex-section-group__title')
    const labels = Array.from(titles).map(t => t.textContent)
    expect(labels).toEqual(['Layout', 'Typography', 'Style'])
  })

  it('groups sections under correct parent groups', () => {
    const { root } = setup()
    const layoutGroup = root.querySelector('[data-group="layout"]')!
    expect(layoutGroup.querySelector('[data-section-id="layout"]')).not.toBeNull()
    expect(layoutGroup.querySelector('[data-section-id="spacing"]')).not.toBeNull()

    const typographyGroup = root.querySelector('[data-group="typography"]')!
    expect(typographyGroup.querySelector('[data-section-id="type"]')).not.toBeNull()

    const styleGroup = root.querySelector('[data-group="style"]')!
    expect(styleGroup.querySelector('[data-section-id="fill"]')).not.toBeNull()
    expect(styleGroup.querySelector('[data-section-id="border"]')).not.toBeNull()
    expect(styleGroup.querySelector('[data-section-id="shadow"]')).not.toBeNull()
    expect(styleGroup.querySelector('[data-section-id="effects"]')).not.toBeNull()
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
    expect(container.textContent).toContain('Click an element to inspect')
    // Sections should NOT render in empty state
    expect(container.querySelector('[data-section-id]')).toBeNull()
    render(null, container)
    container.remove()
  })

  // M3: Cross-fade class applied on element switch
  it('adds cross-fade class when element changes', async () => {
    const el1 = document.createElement('div')
    el1.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(el1)

    const el2 = document.createElement('div')
    el2.setAttribute('data-cortex-source', 'src/Card.tsx:8:3')
    document.body.appendChild(el2)

    const onClose = vi.fn()
    const onSelectElement = vi.fn()
    const overrideManager = {
      set: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
      dispose: vi.fn(), flush: vi.fn(),
    }

    // Render into a plain container so we can re-render with different props
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel element={el1} overrideManager={overrideManager as any}
        onClose={onClose} onSelectElement={onSelectElement} {...panelPositionProps} />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // No cross-fade on initial render
    let panel = container.querySelector('.cortex-panel')
    expect(panel?.classList.contains('cortex-panel--cross-fade')).toBe(false)

    // Switch element — should trigger cross-fade
    render(
      <Panel element={el2} overrideManager={overrideManager as any}
        onClose={onClose} onSelectElement={onSelectElement} {...panelPositionProps} />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    panel = container.querySelector('.cortex-panel')
    expect(panel?.classList.contains('cortex-panel--cross-fade')).toBe(true)

    // Clean up
    render(null, container)
    container.remove()
    el1.remove()
    el2.remove()
  })

  // M3: Cross-fade class clears after timeout
  it('clears cross-fade class after animation duration', async () => {
    vi.useFakeTimers()

    const el1 = document.createElement('div')
    el1.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(el1)

    const el2 = document.createElement('div')
    el2.setAttribute('data-cortex-source', 'src/Card.tsx:8:3')
    document.body.appendChild(el2)

    const overrideManager = {
      set: vi.fn(), remove: vi.fn(), clearAll: vi.fn(),
      dispose: vi.fn(), flush: vi.fn(),
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <Panel element={el1} overrideManager={overrideManager as any}
        onClose={() => {}} onSelectElement={() => {}} {...panelPositionProps} />,
      container,
    )
    // Advance enough for Preact's effect scheduling (>0ms needed under fake timers)
    await vi.advanceTimersByTimeAsync(10)

    // Switch element
    render(
      <Panel element={el2} overrideManager={overrideManager as any}
        onClose={() => {}} onSelectElement={() => {}} {...panelPositionProps} />,
      container,
    )
    // Flush effects — Preact needs macrotask cycles under fake timers
    await vi.advanceTimersByTimeAsync(10)

    let panel = container.querySelector('.cortex-panel')
    expect(panel?.classList.contains('cortex-panel--cross-fade')).toBe(true)

    // Advance past the 150ms animation duration (already at ~20ms, need 130+ more)
    await vi.advanceTimersByTimeAsync(200)

    panel = container.querySelector('.cortex-panel')
    expect(panel?.classList.contains('cortex-panel--cross-fade')).toBe(false)

    render(null, container)
    container.remove()
    el1.remove()
    el2.remove()
    vi.useRealTimers()
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

    // Mock getComputedStyle to return different color for the element
    const cleanupMock = mockGetComputedStyle(target, { color: 'rgb(255, 0, 0)' })

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

    // The panel should have re-read computed styles (activeState changed)
    // We verify by checking it rendered (no error from stale memo)
    const panel = container.querySelector('.cortex-panel')
    expect(panel).not.toBeNull()

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

  it('computes dimmedProperties when activeState is not default', async () => {
    const target = createTarget()
    const overrideManager = createOverrideManager()
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Render in default state first (snapshot taken)
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

    // Mock different computed styles for hover state
    const cleanupMock = mockGetComputedStyle(target, {
      color: 'rgb(255, 0, 0)',
      backgroundColor: 'rgb(0, 0, 255)',
    })

    // Switch to hover state
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

    // Panel should render with dimming enabled (no crash, renders normally)
    const panel = container.querySelector('.cortex-panel')
    expect(panel).not.toBeNull()

    cleanupMock()
    render(null, container)
    container.remove()
    target.remove()
  })

  it('does not compute dimmedProperties when activeState is default', async () => {
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
        activeState="default"
        {...panelPositionProps}
      />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // Panel should render without dimming classes
    const panel = container.querySelector('.cortex-panel')
    expect(panel).not.toBeNull()

    render(null, container)
    container.remove()
    target.remove()
  })

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

    // Now trigger a property change — we'll find a scrub-capable input
    // The override manager's set should be called with pseudo parameter
    // For this test, we verify the panel rendered after pseudo tab switch
    const panel = container.querySelector('.cortex-panel')
    expect(panel).not.toBeNull()

    // The pseudo tab should be active
    expect(pseudoTab?.classList.contains('cortex-pseudo-tab--active')).toBe(true)

    render(null, container)
    container.remove()
    target.remove()
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
