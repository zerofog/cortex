import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ErrorToast } from '../../src/browser/components/ErrorToast.js'
import { createMockChannel } from './helpers.js'

/** Yield enough time for Preact useEffect subscriptions to register. */
const waitForEffects = () => new Promise<void>(r => setTimeout(r, 50))

describe('ErrorToast', () => {
  let container: HTMLDivElement

  afterEach(() => {
    render(null, container)
    container?.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders a toast when undo_sync_status fails with non-empty_stack reason', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const channel = createMockChannel()
    render(<ErrorToast channel={channel} />, container)

    // Wait for the useEffect subscription to register before sending a message
    await waitForEffects()

    // No toast initially
    expect(container.querySelector('[role="alert"]')).toBeNull()

    channel._simulateMessage({
      type: 'undo_sync_status',
      status: 'failed',
      reason: 'stale file',
      reason_code: 'stale',
    })

    await vi.waitFor(() => {
      const alert = container.querySelector('[role="alert"]')
      expect(alert).not.toBeNull()
      expect(alert!.textContent).toContain('stale file')
    }, { timeout: 500 })
  })

  it('does not render a toast for empty_stack failures', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const channel = createMockChannel()
    render(<ErrorToast channel={channel} />, container)

    // Wait for the useEffect subscription to register before sending a message
    await waitForEffects()

    channel._simulateMessage({
      type: 'undo_sync_status',
      status: 'failed',
      reason: 'Nothing to undo.',
      reason_code: 'empty_stack',
    })
    // Give Preact a macrotask to flush — no toast should appear for empty_stack
    await new Promise<void>(r => setTimeout(r, 20))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
