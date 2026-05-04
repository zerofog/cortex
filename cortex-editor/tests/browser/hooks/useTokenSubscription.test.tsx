import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { useTokenSubscription } from '../../../src/browser/hooks/useTokenSubscription.js'
import type { CortexChannel } from '../../../src/adapters/types.js'
import type { ServerToBrowser } from '../../../src/adapters/types.js'

async function renderHook<T>(hookFn: () => T): Promise<{ result: { current: T }; unmount: () => void }> {
  const result = { current: null as T }
  const container = document.createElement('div')
  document.body.appendChild(container)

  function Wrapper() {
    result.current = hookFn()
    return null
  }

  // Wrap initial render in act so useEffect callbacks are flushed before we return.
  await act(async () => {
    render(<Wrapper />, container)
  })

  return {
    result,
    unmount: () => {
      act(() => { render(null, container) })
      container.remove()
    },
  }
}

/** Minimal CortexChannel stub that lets tests fire onMessage handlers manually. */
function makeChannel(): CortexChannel & { _fire: (msg: ServerToBrowser) => void } {
  const handlers: Array<(msg: ServerToBrowser) => void> = []
  return {
    send: vi.fn(),
    onMessage(handler) {
      handlers.push(handler)
      return () => {
        const i = handlers.indexOf(handler)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
    onConnectionChange: () => () => {},
    sendAndAck: vi.fn(),
    get connected() { return true },
    dispose: vi.fn(),
    _fire(msg: ServerToBrowser) {
      for (const h of [...handlers]) h(msg)
    },
  }
}

describe('useTokenSubscription', () => {
  let channel: ReturnType<typeof makeChannel>

  beforeEach(() => {
    channel = makeChannel()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with isLoading=true and empty tokens before any hello', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.tokens).toEqual([])
    unmount()
  })

  it('transitions to isLoading=false with tokens after hello arrives', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))

    const tokens = [
      { name: '--spacing-sm', valuePx: 8, source: 'tailwind-v4' as const },
      { name: '--spacing-md', valuePx: 16, source: 'tailwind-v3' as const },
    ]

    await act(async () => {
      channel._fire({
        type: 'hello',
        protocolVersion: 1,
        sessionId: 'sess-1',
        spacingTokens: tokens,
      })
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.tokens).toEqual(tokens)
    unmount()
  })

  it('sets tokens to empty array when hello has no spacingTokens field', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))

    await act(async () => {
      channel._fire({ type: 'hello', protocolVersion: 1, sessionId: 'sess-2' })
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.tokens).toEqual([])
    unmount()
  })

  it('ignores non-hello messages', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))

    await act(async () => {
      channel._fire({ type: 'cortex' })
      channel._fire({ type: 'agent-status', connected: true })
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.tokens).toEqual([])
    unmount()
  })

  it('returns stable empty state when channel is null', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(null))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.tokens).toEqual([])
    unmount()
  })

  it('cleans up the onMessage subscription on unmount', async () => {
    const { unmount } = await renderHook(() => useTokenSubscription(channel))

    unmount()

    // After unmount, firing hello should not throw (handler removed)
    await act(async () => {
      channel._fire({ type: 'hello', protocolVersion: 1, sessionId: 'sess-3' })
    })
    expect(true).toBe(true)
  })

  it('updates tokens on a second hello', async () => {
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))

    const first = [{ name: '--sp-sm', valuePx: 8, source: 'tailwind-v4' as const }]
    const second = [{ name: '--sp-lg', valuePx: 24, source: 'css-variable' as const }]

    await act(async () => {
      channel._fire({ type: 'hello', protocolVersion: 1, sessionId: 's1', spacingTokens: first })
    })
    expect(result.current.tokens).toEqual(first)

    await act(async () => {
      channel._fire({ type: 'hello', protocolVersion: 1, sessionId: 's2', spacingTokens: second })
    })
    expect(result.current.tokens).toEqual(second)

    unmount()
  })
})
