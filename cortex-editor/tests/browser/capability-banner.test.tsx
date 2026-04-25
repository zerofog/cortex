import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { CapabilityBanner } from '../../src/browser/components/CapabilityBanner.js'
import type { StyleCapability } from '../../src/adapters/types.js'

describe('CapabilityBanner', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('renders system name and status text for each system', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const systems: StyleCapability[] = [
      { name: 'Tailwind', status: 'preview-only' },
      { name: 'CSS Modules', status: 'ai-required' },
    ]
    render(<CapabilityBanner systems={systems} />, container)

    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('Tailwind')
    expect(banner!.textContent).toContain('visual preview active')
    expect(banner!.textContent).toContain('CSS Modules')
    expect(banner!.textContent).toContain('editing requires Claude Code')
  })

  it('dismiss button hides the banner', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const systems: StyleCapability[] = [
      { name: 'Tailwind', status: 'preview-only' },
    ]
    render(<CapabilityBanner systems={systems} />, container)

    expect(container.querySelector('[role="status"]')).not.toBeNull()

    const dismiss = container.querySelector('button[aria-label="Dismiss capability notice"]') as HTMLButtonElement
    expect(dismiss).not.toBeNull()
    dismiss.click()

    // After dismiss the banner should be gone (component returns null when dismissed)
    await new Promise<void>(r => setTimeout(r, 0))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
