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

/** Minimal CortexChannel stub that lets tests fire onMessage handlers manually
 *  and inspect the live handler count to verify subscribe/unsubscribe lifecycle. */
function makeChannel(): CortexChannel & {
  _fire: (msg: ServerToBrowser) => void
  _handlerCount: () => number
} {
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
    _handlerCount: () => handlers.length,
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
    const { result, unmount } = await renderHook(() => useTokenSubscription(channel))

    // Sanity: hook subscribed exactly one handler during mount.
    expect(channel._handlerCount()).toBe(1)

    unmount()

    // Falsifiable assertion 1: subscription removed — if the unsub closure
    // returned by onMessage is not invoked on cleanup, this is 1, not 0.
    expect(channel._handlerCount()).toBe(0)

    // Falsifiable assertion 2: a post-unmount fire does NOT crash. If a leaked
    // handler tried to call setState on the unmounted component, Preact would
    // warn but not throw; we assert no throw to catch regressions where the
    // handler dereferences a torn-down ref.
    expect(() => {
      channel._fire({ type: 'hello', protocolVersion: 1, sessionId: 'sess-3', spacingTokens: [
        { name: '--sp-after', valuePx: 4, source: 'css-variable' },
      ] })
    }).not.toThrow()

    // Falsifiable assertion 3: state observed at unmount is preserved. The
    // post-unmount fire above carried tokens; if the listener leaked, those
    // tokens would have replaced the unmounted result. Initial state is
    // tokens: [], isLoading: true (no hello fired before unmount).
    expect(result.current.tokens).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('resets tokens + isLoading when channel transitions to a new instance', async () => {
    // Regression: when the channel prop changes (HMR reconnect, workspace switch),
    // the effect must reset state and re-subscribe to the new channel rather than
    // leaving stale tokens from the dead channel visible during the new handshake.
    const channelA = makeChannel()
    const channelB = makeChannel()

    const result = { current: null as ReturnType<typeof useTokenSubscription> | null }
    const container = document.createElement('div')
    document.body.appendChild(container)

    function Wrapper({ ch }: { readonly ch: CortexChannel | null }) {
      result.current = useTokenSubscription(ch)
      return null
    }

    await act(async () => {
      render(<Wrapper ch={channelA} />, container)
    })

    // Channel A delivers hello with tokens.
    await act(async () => {
      channelA._fire({
        type: 'hello',
        protocolVersion: 1,
        sessionId: 'sess-A',
        spacingTokens: [{ name: '--spacing-md', valuePx: 16, source: 'tailwind-v4' as const }],
      })
    })
    expect(result.current!.isLoading).toBe(false)
    expect(result.current!.tokens).toHaveLength(1)
    expect(channelA._handlerCount()).toBe(1)
    expect(channelB._handlerCount()).toBe(0)

    // Swap channel — effect must (a) unsubscribe from A, (b) reset state, (c) subscribe to B.
    await act(async () => {
      render(<Wrapper ch={channelB} />, container)
    })

    // Falsifiable: state must be reset before B's hello arrives. Without the reset
    // (setTokens([]); setIsLoading(true) at the top of the effect), the consumer
    // briefly sees A's tokens while connected to B.
    expect(result.current!.isLoading).toBe(true)
    expect(result.current!.tokens).toEqual([])

    // Falsifiable: handler count moved from A to B (verifies the dependency-array
    // contract — old subscription torn down, new one registered).
    expect(channelA._handlerCount()).toBe(0)
    expect(channelB._handlerCount()).toBe(1)

    // Channel B's hello is observed.
    await act(async () => {
      channelB._fire({
        type: 'hello',
        protocolVersion: 1,
        sessionId: 'sess-B',
        spacingTokens: [{ name: '--spacing-lg', valuePx: 24, source: 'css-variable' as const }],
      })
    })
    expect(result.current!.isLoading).toBe(false)
    expect(result.current!.tokens).toEqual([{ name: '--spacing-lg', valuePx: 24, source: 'css-variable' }])

    act(() => { render(null, container) })
    container.remove()
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
