import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { NoAnnotationsBanner } from '../../../src/browser/components/NoAnnotationsBanner.js'
import { createEditableDiv } from '../helpers.js'

describe('NoAnnotationsBanner', () => {
  let container: HTMLDivElement

  afterEach(() => {
    // Clear appended annotated elements between tests
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('renders when document has 0 elements with data-cortex-source', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const banner = container.querySelector('[data-banner-id="no-annotations"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('No editable elements detected')
  })

  it('does NOT render when document has at least 1 annotated element', () => {
    const editable = createEditableDiv()
    document.body.appendChild(editable)

    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const banner = container.querySelector('[data-banner-id="no-annotations"]')
    expect(banner).toBeNull()
  })

  it('does NOT render after dismiss is clicked', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement
    expect(dismiss).not.toBeNull()
    dismiss.click()

    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[data-banner-id="no-annotations"]')).toBeNull()
  })

  it('renders setup link with non-empty href', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const link = container.querySelector('a[href]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBeTruthy()
    expect(link!.getAttribute('href')!.length).toBeGreaterThan(0)
  })

  it('body text describes the Vite plugin requirement', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const banner = container.querySelector('[data-banner-id="no-annotations"]')
    expect(banner!.textContent).toContain('Vite plugin')
  })

  it('queries data-cortex-source once at mount, not on every render', () => {
    // Clear any leftover annotated elements so spy call count is predictable
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }

    const spy = vi.spyOn(document, 'querySelectorAll')

    container = document.createElement('div')
    document.body.appendChild(container)
    render(<NoAnnotationsBanner />, container)

    // Force re-renders by rendering the same vnode against the same container multiple times
    render(<NoAnnotationsBanner />, container)
    render(<NoAnnotationsBanner />, container)

    // Filter to only our selector in case Preact internals call querySelectorAll with other selectors
    const ourCalls = spy.mock.calls.filter(([sel]) => sel === '[data-cortex-source]')
    expect(ourCalls.length).toBe(1)

    spy.mockRestore()
  })
})
