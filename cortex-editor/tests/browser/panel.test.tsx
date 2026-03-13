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

  it('renders tab navigation', () => {
    const { root } = setup()
    expect(root.textContent).toContain('Spacing')
    expect(root.textContent).toContain('Layout')
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
})
