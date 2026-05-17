import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { InactiveTabBanner } from '../../src/browser/components/InactiveTabBanner.js'

describe('InactiveTabBanner', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function mount() {
    container = document.createElement('div')
    document.body.appendChild(container)
  }

  it('renders nothing when message is null', () => {
    mount()
    render(<InactiveTabBanner message={null} />, container)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('renders the message when present', () => {
    mount()
    render(
      <InactiveTabBanner message="Another tab is the active editor." />,
      container,
    )
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('Another tab is the active editor.')
  })

  it('dismiss button hides the banner', async () => {
    mount()
    render(<InactiveTabBanner message="hello" />, container)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    const dismiss = container.querySelector(
      'button[aria-label="Dismiss inactive-tab notice"]',
    ) as HTMLButtonElement
    expect(dismiss).not.toBeNull()
    dismiss.click()

    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('re-shows the banner when a new message arrives after dismissal', async () => {
    mount()
    render(<InactiveTabBanner message="first" />, container)

    const dismiss = container.querySelector(
      'button[aria-label="Dismiss inactive-tab notice"]',
    ) as HTMLButtonElement
    dismiss.click()
    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()

    render(<InactiveTabBanner message="second" />, container)
    await new Promise<void>(r => setTimeout(r, 0))
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('second')
  })

  it('clears the banner when message transitions to null', async () => {
    mount()
    render(<InactiveTabBanner message="initial" />, container)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    render(<InactiveTabBanner message={null} />, container)
    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  // Regression: codex review (P2) flagged that dismissedMessage persisted
  // across the active-changed clear, so a future inactive-tab event with
  // the SAME stable message string from the adapter would stay hidden.
  it('re-shows the banner when the SAME message arrives after dismissal + clear cycle', async () => {
    mount()
    const STABLE = 'Another tab is the active editor'

    // 1. Inactive-tab → banner shows
    render(<InactiveTabBanner message={STABLE} />, container)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    // 2. User dismisses
    const dismiss = container.querySelector(
      'button[aria-label="Dismiss inactive-tab notice"]',
    ) as HTMLButtonElement
    dismiss.click()
    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()

    // 3. Tab becomes active → CortexApp clears message
    render(<InactiveTabBanner message={null} />, container)
    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()

    // 4. New inactive-tab conflict with the SAME message → must re-show
    render(<InactiveTabBanner message={STABLE} />, container)
    await new Promise<void>(r => setTimeout(r, 0))
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain(STABLE)
  })
})
