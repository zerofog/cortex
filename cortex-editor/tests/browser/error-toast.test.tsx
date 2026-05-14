import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ErrorToast } from '../../src/browser/components/ErrorToast.js'
import { createMockChannel } from './helpers.js'

/**
 * Wait for ErrorToast's useEffect to commit and register its channel.onMessage
 * subscription. Polls the actual invariant (_handlerCount) instead of betting on
 * a fixed duration — a fixed flush() raced Preact's effect-commit phase, and
 * under fake timers that race orphaned the pending real-timer commit.
 */
const waitForSubscription = (channel: ReturnType<typeof createMockChannel>) =>
  vi.waitFor(() => expect(channel._handlerCount()).toBeGreaterThanOrEqual(1), { timeout: 500 })

describe('ErrorToast', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders a toast when undo_sync_status fails with a non-empty_stack reason (stale)', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const channel = createMockChannel()
    render(<ErrorToast channel={channel} />, container)

    await waitForSubscription(channel)

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

    await waitForSubscription(channel)

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

  it('auto-dismisses toast after 5s', async () => {
    // Mount under real timers so Preact's useEffect can commit and register
    // the channel subscription. Then switch to fake timers to advance past
    // the 5000ms auto-dismiss without a wall-clock wait.
    container = document.createElement('div')
    document.body.appendChild(container)

    const channel = createMockChannel()
    render(<ErrorToast channel={channel} />, container)

    // Wait deterministically for the useEffect subscription to commit before
    // switching timer modes. A fixed-duration flush() races the effect commit:
    // if vi.useFakeTimers() lands before the commit, the subscription is never
    // registered (empty handler list) AND the pending real-timer commit is
    // orphaned, since fake timers only control timers created after the switch.
    await waitForSubscription(channel)

    vi.useFakeTimers()

    channel._simulateMessage({
      type: 'undo_sync_status',
      status: 'failed',
      reason: 'stale file',
      reason_code: 'stale',
    })

    await vi.advanceTimersByTimeAsync(10)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    // Auto-dismiss fires at 5000ms (ErrorToast.tsx:35 passes 5000 to addToast)
    await vi.advanceTimersByTimeAsync(5000)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
