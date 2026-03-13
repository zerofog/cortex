import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SelectionOverlay } from '../../src/browser/components/SelectionOverlay.js'
import { createShadowHost, mockGetBoundingClientRect } from './helpers.js'

describe('SelectionOverlay', () => {
  let root: HTMLDivElement
  let cleanupHost: () => void

  function setup() {
    const sh = createShadowHost()
    root = sh.root
    cleanupHost = sh.cleanup
    return sh
  }

  afterEach(() => {
    if (cleanupHost) cleanupHost()
  })

  it('renders nothing when element is null', () => {
    setup()
    render(<SelectionOverlay element={null} />, root)
    expect(root.querySelector('.cortex-selection-overlay')).toBeNull()
  })

  it('renders positioned div with correct class', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 200, width: 300, height: 50,
    })

    render(<SelectionOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-selection-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.top).toBe('100px')
    expect(overlay.style.left).toBe('200px')
    expect(overlay.style.width).toBe('300px')
    expect(overlay.style.height).toBe('50px')

    restore()
    target.remove()
  })

  it('has the selection-overlay CSS class for transition styling', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 10, left: 10, width: 100, height: 100,
    })

    render(<SelectionOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-selection-overlay') as HTMLElement
    expect(overlay.classList.contains('cortex-selection-overlay')).toBe(true)

    restore()
    target.remove()
  })

  it('label shows component name + source file from data-cortex-source', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:14:5')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('Hero — Hero.tsx:14')

    restore()
    target.remove()
  })

  it('label shows filename:line for non-PascalCase source files', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'index.tsx:3:1')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('index.tsx:3')

    restore()
    target.remove()
  })

  it('label shows tagName.className when no data-cortex-source', () => {
    setup()
    const target = document.createElement('button')
    target.className = 'primary-btn large'
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('button.primary-btn')

    restore()
    target.remove()
  })

  it('label handles path-style source attributes', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/components/Button.tsx:22:3')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('Button — Button.tsx:22')

    restore()
    target.remove()
  })

  // Fix 3: isConnected guard
  it('stops RAF when element detaches from DOM', async () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 50, left: 50, width: 100, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-selection-overlay') as HTMLElement
    expect(overlay).not.toBeNull()

    // Detach element from DOM
    target.remove()

    // The RAF loop should stop — overlay position should not update
    // We can verify by checking that getBoundingClientRect is not called after detach
    const spy = vi.spyOn(target, 'getBoundingClientRect')

    // Wait for one RAF cycle
    await new Promise(r => requestAnimationFrame(r))

    // After detach, the RAF loop should have bailed on isConnected check
    expect(spy).not.toHaveBeenCalled()

    restore()
    spy.mockRestore()
  })
})
