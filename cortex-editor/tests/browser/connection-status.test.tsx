import { describe, it, expect, vi, afterEach } from 'vitest'
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

  it('renders reconnected footer with reconnected message and class', () => {
    // Leaf contract for the transient "reconnected" flash state. The
    // auto-dismiss timing (2s → connected) is CortexApp's concern and is
    // covered by the integration test in cortex-app.test.tsx; the
    // hidden-when-connected contract is covered by the sibling leaf test above.
    const result = renderInShadow(
      <ConnectionStatusFooter status={{ status: 'reconnected' }} />,
    )
    cleanup = result.cleanup
    const { root } = result
    const footer = root.querySelector('.cortex-connection-status')
    expect(footer).not.toBeNull()
    expect(footer!.textContent).toContain('Reconnected')
    expect(footer!.classList.contains('cortex-connection-status--reconnected')).toBe(true)
  })
})
