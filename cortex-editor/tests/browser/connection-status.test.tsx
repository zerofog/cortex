import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ConnectionStatusFooter } from '../../src/browser/components/Panel.js'
import { renderInShadow } from './helpers.js'

describe('ConnectionStatusFooter', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders reconnecting footer with retry count', () => {
    const result = renderInShadow(
      <ConnectionStatusFooter status={{ status: 'reconnecting', retryCount: 2, maxRetries: 5 }} />,
    )
    cleanup = result.cleanup
    const { root } = result
    const footer = root.querySelector('.cortex-connection-status')
    expect(footer).not.toBeNull()
    expect(footer!.getAttribute('role')).toBe('status')
    expect(footer!.textContent).toContain('Reconnecting')
    expect(footer!.textContent).toContain('2/5')
    expect(footer!.classList.contains('cortex-connection-status--reconnecting')).toBe(true)
  })

  it('renders disconnected footer with warning message', () => {
    const result = renderInShadow(
      <ConnectionStatusFooter status={{ status: 'disconnected' }} />,
    )
    cleanup = result.cleanup
    const { root } = result
    const footer = root.querySelector('.cortex-connection-status')
    expect(footer).not.toBeNull()
    expect(footer!.textContent).toContain('Disconnected')
    expect(footer!.textContent).toContain('won’t save')
    expect(footer!.classList.contains('cortex-connection-status--disconnected')).toBe(true)
  })

  it('hides footer when connected (aria-live container present but empty)', () => {
    const result = renderInShadow(
      <ConnectionStatusFooter status={{ status: 'connected' }} />,
    )
    cleanup = result.cleanup
    const { root } = result
    const footer = root.querySelector('.cortex-connection-status')
    expect(footer).not.toBeNull()
    expect(footer!.classList.contains('cortex-connection-status--hidden')).toBe(true)
    expect(footer!.textContent?.trim()).toBe('')
  })

  it('renders reconnected footer then auto-dismisses', () => {
    // Render "reconnected" state — this is the transient flash shown after
    // CortexApp transitions from disconnected/reconnecting → connected.
    const result = renderInShadow(
      <ConnectionStatusFooter status={{ status: 'reconnected' }} />,
    )
    cleanup = result.cleanup
    const { root } = result

    const footer = root.querySelector('.cortex-connection-status')
    expect(footer).not.toBeNull()
    expect(footer!.textContent).toContain('Reconnected')
    expect(footer!.classList.contains('cortex-connection-status--reconnected')).toBe(true)

    // Auto-dismiss is driven by CortexApp's 2s timer which updates the status
    // prop from 'reconnected' → 'connected'. Simulate that transition directly.
    render(<ConnectionStatusFooter status={{ status: 'connected' }} />, root)
    const dismissed = root.querySelector('.cortex-connection-status')
    expect(dismissed).not.toBeNull()
    expect(dismissed!.classList.contains('cortex-connection-status--hidden')).toBe(true)
    expect(dismissed!.textContent?.trim()).toBe('')
  })
})
