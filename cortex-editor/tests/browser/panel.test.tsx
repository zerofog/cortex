import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { Panel } from '../../src/browser/components/Panel.js'
import { renderInShadow } from './helpers.js'

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

  it('calls onClose when close button clicked', () => {
    const { root, onClose } = setup()
    const closeBtn = root.querySelector('[data-action="close"]') as HTMLButtonElement
    closeBtn?.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render when element is null', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <Panel
        element={null as any}
        overrideManager={{} as any}
        onClose={() => {}}
        onSelectElement={() => {}}
      />,
      container,
    )
    expect(container.querySelector('.cortex-panel')).toBeNull()
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
        onClose={onClose} onSelectElement={onSelectElement} />,
      container,
    )
    await new Promise(r => setTimeout(r, 0))

    // No cross-fade on initial render
    let panel = container.querySelector('.cortex-panel')
    expect(panel?.classList.contains('cortex-panel--cross-fade')).toBe(false)

    // Switch element — should trigger cross-fade
    render(
      <Panel element={el2} overrideManager={overrideManager as any}
        onClose={onClose} onSelectElement={onSelectElement} />,
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
        onClose={() => {}} onSelectElement={() => {}} />,
      container,
    )
    // Advance enough for Preact's effect scheduling (>0ms needed under fake timers)
    await vi.advanceTimersByTimeAsync(10)

    // Switch element
    render(
      <Panel element={el2} overrideManager={overrideManager as any}
        onClose={() => {}} onSelectElement={() => {}} />,
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
