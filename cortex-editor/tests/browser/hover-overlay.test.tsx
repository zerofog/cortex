import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { HoverOverlay } from '../../src/browser/components/HoverOverlay.js'
import { emitTransformUpdate } from '../../src/browser/transform-bus.js'
import { createShadowHost, mockGetBoundingClientRect } from './helpers.js'

describe('HoverOverlay', () => {
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
    render(<HoverOverlay element={null} />, root)
    expect(root.querySelector('.cortex-hover-overlay')).toBeNull()
  })

  it('renders a positioned div matching getBoundingClientRect', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 200, width: 300, height: 50,
    })

    render(<HoverOverlay element={target} />, root)

    const overlay = root.querySelector('.cortex-hover-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.transform).toBe('translate(200px, 100px)')
    expect(overlay.style.width).toBe('300px')
    expect(overlay.style.height).toBe('50px')

    restore()
    target.remove()
  })

  it('renders overlay with correct dimensions from bounding rect', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 10, left: 10, width: 100, height: 100,
    })

    render(<HoverOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-hover-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.width).toBe('100px')
    expect(overlay.style.height).toBe('100px')

    restore()
    target.remove()
  })

  it('label shows component name from PascalCase file in data-cortex-source', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<HoverOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('Hero')

    restore()
    target.remove()
  })

  it('label shows tagName.className when no data-cortex-source', () => {
    setup()
    const target = document.createElement('div')
    target.className = 'hero-section'
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<HoverOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('div.hero-section')

    restore()
    target.remove()
  })

  it('label shows just tagName when no class', () => {
    setup()
    const target = document.createElement('section')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<HoverOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('section')

    restore()
    target.remove()
  })

  it('label flips below when near viewport top', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 5, left: 100, width: 200, height: 40,
    })

    render(<HoverOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.classList.contains('cortex-label--below')).toBe(true)
    expect(label?.classList.contains('cortex-label--above')).toBe(false)

    restore()
    target.remove()
  })

  it('label is above when far from viewport top', () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 200, left: 100, width: 200, height: 40,
    })

    render(<HoverOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.classList.contains('cortex-label--above')).toBe(true)

    restore()
    target.remove()
  })

  it('re-renders on transform bus update to refresh position', async () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    mockGetBoundingClientRect(target, {
      top: 100, left: 200, width: 300, height: 50,
    })

    render(<HoverOverlay element={target} />, root)

    // Wait for Preact effects to initialize (useEffect fires on microtask)
    await new Promise(r => setTimeout(r, 10))

    // Verify initial position
    let overlay = root.querySelector('.cortex-hover-overlay') as HTMLElement
    expect(overlay.style.transform).toBe('translate(200px, 100px)')

    // Simulate canvas transform — element position changes
    mockGetBoundingClientRect(target, {
      top: 150, left: 250, width: 300, height: 50,
    })
    emitTransformUpdate()

    // Preact batches setState; wait for re-render flush
    await vi.waitFor(() => {
      overlay = root.querySelector('.cortex-hover-overlay') as HTMLElement
      expect(overlay.style.transform).toBe('translate(250px, 150px)')
    })

    target.remove()
  })
})
