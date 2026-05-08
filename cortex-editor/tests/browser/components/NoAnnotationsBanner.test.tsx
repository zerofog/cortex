import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { NoAnnotationsBanner } from '../../../src/browser/components/NoAnnotationsBanner.js'
import { createEditableDiv } from '../helpers.js'

describe('NoAnnotationsBanner', () => {
  let container: HTMLDivElement

  function resetHostDocument(): void {
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }
    document.documentElement.style.paddingTop = ''
    document.documentElement.style.transition = ''
    document.documentElement.style.removeProperty('--cx-banner-height')
    document.documentElement.style.removeProperty('--cx-banner-transform')
  }

  beforeEach(() => {
    resetHostDocument()
  })

  afterEach(() => {
    resetHostDocument()
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('renders title + Vite-plugin guidance when document has 0 annotated elements', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const banner = container.querySelector('[data-banner-id="no-annotations"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('No editable elements detected')
    expect(banner!.textContent).toContain('Vite plugin')
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

    await vi.waitFor(() => {
      expect(container.querySelector('[data-banner-id="no-annotations"]')).toBeNull()
    })
  })

  it('uses role="alert" + aria-live="assertive" — setup-blocking diagnostic, not polite status', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const banner = container.querySelector('[data-banner-id="no-annotations"]')!
    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.getAttribute('aria-live')).toBe('assertive')
  })

  it('renders setup link with exact URL + target=_blank + rel=noopener noreferrer', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)

    const link = container.querySelector('a[href]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('https://github.com/zerofog/cortex#setup')
    expect(link.getAttribute('target')).toBe('_blank')
    // target=_blank without rel=noopener is a known reverse-tabnabbing risk.
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('pushes host page content down by setting documentElement padding-top while visible', async () => {
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }
    document.documentElement.style.paddingTop = ''

    container = document.createElement('div')
    document.body.appendChild(container)
    expect(document.documentElement.style.paddingTop).toBe('')

    render(<NoAnnotationsBanner />, container)

    // Effect runs asynchronously after Preact commits the render — wait for
    // padding-top to be set to the banner's measured height (a px value).
    await vi.waitFor(() => {
      expect(document.documentElement.style.paddingTop).toMatch(/^\d+(\.\d+)?px$/)
    })
  })

  it('clears documentElement padding-top when banner is dismissed', async () => {
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }
    document.documentElement.style.paddingTop = ''

    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)
    await vi.waitFor(() => {
      expect(document.documentElement.style.paddingTop).toMatch(/^\d+(\.\d+)?px$/)
    })

    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement
    dismiss.click()

    await vi.waitFor(() => {
      expect(document.documentElement.style.paddingTop).toBe('')
    })
  })

  it('disconnects MutationObserver when banner is dismissed (regression: ZF0-1123 PR #95 quad-flagged dep-array bug)', async () => {
    // Falsifiability: this test fails if the MutationObserver useEffect's
    // dependency array drops `dismissed`. Without the dep, dismiss → no
    // effect re-run → no cleanup → observer stays attached observing
    // document.body for the rest of the session.
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }

    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)
    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement
    dismiss.click()
    await vi.waitFor(() => {
      expect(container.querySelector('[data-banner-id="no-annotations"]')).toBeNull()
    })

    // Observer should be disconnected. Spy on querySelector AFTER dismiss
    // (so we can attribute calls to the observer, not the initial mount).
    // Add a node that would normally trigger the observer's callback.
    const spy = vi.spyOn(document, 'querySelector')
    try {
      const editable = createEditableDiv()
      document.body.appendChild(editable)
      // Wait long enough for happy-dom's setTimeout(0) MO delivery.
      await new Promise(r => setTimeout(r, 50))

      const ourCalls = spy.mock.calls.filter(([sel]) => sel === '[data-cortex-source]')
      expect(ourCalls.length).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('publishes --cx-banner-height CSS variable for cortex UI to consume', async () => {
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }
    document.documentElement.style.removeProperty('--cx-banner-height')

    container = document.createElement('div')
    document.body.appendChild(container)
    expect(document.documentElement.style.getPropertyValue('--cx-banner-height')).toBe('')

    render(<NoAnnotationsBanner />, container)

    // CortexApp's translateY wrapper consumes this — toolbar/overlays/panel
    // shift down by the banner's measured height when it's set.
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--cx-banner-height')).toMatch(/^\d+(\.\d+)?px$/)
    })

    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement
    dismiss.click()
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--cx-banner-height')).toBe('')
    })
  })

  // TODO: requires real browser — happy-dom delivers MutationObserver
  // callbacks via its own timer queue, and the interaction between Preact's
  // effect scheduling, happy-dom's MO setTimeout, and vitest's polling makes
  // this flow untestable here despite the production code being correct.
  // Verified in Step 9.5 manual verification (banner self-heals after Vite
  // plugin install). See ZF0-1123 ship-task checkpoint Step 9.5 entry.
  it.skip('self-heals when an annotated element is added to the DOM after mount', async () => {
    for (const el of document.body.querySelectorAll('[data-cortex-source]')) {
      el.remove()
    }

    container = document.createElement('div')
    document.body.appendChild(container)

    render(<NoAnnotationsBanner />, container)
    expect(container.querySelector('[data-banner-id="no-annotations"]')).not.toBeNull()

    document.body.appendChild(createEditableDiv())

    await vi.waitFor(() => {
      expect(container.querySelector('[data-banner-id="no-annotations"]')).toBeNull()
    })
  })
})
