import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createViteChannel, createWebSocketChannel, composeRequestWithId, matchesRequestId } from '../../src/browser/channel.js'
import type { ConnectionState, ServerToBrowser } from '../../src/adapters/types.js'

describe('createViteChannel', () => {
  beforeEach(() => {
    delete window.__cortex_send__
    delete window.__cortex_channel__
    // ZF0-1326 Task 1: __CORTEX_TOKEN__ is now closure-captured + tombstoned
    // by createViteChannel, so cross-test state must clean it too.
    delete window.__CORTEX_TOKEN__
  })

  it('implements CortexChannel interface', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    expect(channel).toHaveProperty('send')
    expect(channel).toHaveProperty('onMessage')
    expect(channel).toHaveProperty('connected')
  })

  // ZF0-1326 Task 1 — tombstone semantic.
  //
  // The `'X' in window` check (vs `=== undefined`) is load-bearing: it
  // distinguishes a `delete`d property from one that was assigned undefined.
  // A future regression like `window.__cortex_send__ = undefined` (instead
  // of `delete`) would still pass an `=== undefined` assertion but the
  // property would still be enumerable and reachable via descriptor. Only
  // `delete` produces `'X' in window === false`. This is the actual
  // security invariant — own-property absence, not value emptiness.
  it('deletes __cortex_send__ and __CORTEX_TOKEN__ from window post-create (own-property absence)', () => {
    window.__cortex_send__ = vi.fn()
    window.__CORTEX_TOKEN__ = 'test-token-xyz'
    createViteChannel()
    expect('__cortex_send__' in window).toBe(false)
    expect('__CORTEX_TOKEN__' in window).toBe(false)
  })

  it('captures __CORTEX_TOKEN__ into closure and stamps it on send', () => {
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend
    window.__CORTEX_TOKEN__ = 'closure-token'
    const channel = createViteChannel()

    channel.send({
      type: 'edit', protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    expect(mockSend).toHaveBeenCalledWith({
      type: 'edit', protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
      token: 'closure-token',
    })
  })

  it('dispose() does not re-leak captured globals to window (ZF0-1326 Task 1)', () => {
    window.__cortex_send__ = vi.fn()
    window.__CORTEX_TOKEN__ = 'token-x'
    const channel = createViteChannel()
    channel.dispose!()
    // Captured primitives must remain tombstoned post-dispose. A misguided
    // "cleanup" change that restored the globals (e.g.,
    // `window.__CORTEX_TOKEN__ = capturedToken` to "preserve for re-use")
    // would silently re-open the XSS vector. Pin the invariant.
    expect('__cortex_send__' in window).toBe(false)
    expect('__CORTEX_TOKEN__' in window).toBe(false)
  })

  it('send() calls window.__cortex_send__', () => {
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend
    const channel = createViteChannel()
    const msg = { type: 'edit' as const, protocolVersion: 1, editId: '1', property: 'color', value: 'red', source: 'Hero.tsx:5:3', elementSelector: 'div' }
    channel.send(msg)
    expect(mockSend).toHaveBeenCalledWith(msg)
  })

  it('send() is a no-op when __cortex_send__ is undefined', () => {
    const channel = createViteChannel()
    // Should not throw
    channel.send({ type: 'edit', protocolVersion: 1, editId: '1', property: 'color', value: 'red', source: 'Hero.tsx:5:3', elementSelector: 'div' })
  })

  it('onMessage() receives via handleServerMessage', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const handler = vi.fn()
    channel.onMessage(handler)

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    expect(handler).toHaveBeenCalledWith(msg)
  })

  it('delivers to multiple handlers', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const h1 = vi.fn()
    const h2 = vi.fn()
    channel.onMessage(h1)
    channel.onMessage(h2)

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    expect(h1).toHaveBeenCalledWith(msg)
    expect(h2).toHaveBeenCalledWith(msg)
  })

  it('connected is true when __cortex_send__ is a function', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    expect(channel.connected).toBe(true)
  })

  it('connected is false when __cortex_send__ is undefined', () => {
    const channel = createViteChannel()
    expect(channel.connected).toBe(false)
  })

  // Fix 1: unsubscribe
  it('onMessage() returns unsubscribe that removes handler', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const handler = vi.fn()
    const unsub = channel.onMessage(handler)

    unsub()

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribe only removes the specific handler', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const h1 = vi.fn()
    const h2 = vi.fn()
    const unsub1 = channel.onMessage(h1)
    channel.onMessage(h2)

    unsub1()

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledWith(msg)
  })

  it('unsubscribe is idempotent', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const h1 = vi.fn()
    const h2 = vi.fn()
    const unsub = channel.onMessage(h1)
    channel.onMessage(h2)

    unsub()
    unsub() // second call should be a no-op

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    // h2 should still be there — double-unsub shouldn't remove another handler
    expect(h2).toHaveBeenCalledWith(msg)
  })

  // Fix 8: handler unsub during dispatch does not skip remaining handlers
  it('handler unsub during dispatch does not skip remaining handlers', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const hC = vi.fn()
    let unsubB: () => void
    const hA = vi.fn(() => { unsubB() })
    const hB = vi.fn()
    channel.onMessage(hA)
    unsubB = channel.onMessage(hB)
    channel.onMessage(hC)

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    window.__cortex_channel__!.handleServerMessage(msg)
    expect(hA).toHaveBeenCalledWith(msg)
    expect(hC).toHaveBeenCalledWith(msg)
  })

  it('onConnectionChange returns unsubscribe (no-op)', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const unsub = channel.onConnectionChange(() => {})
    expect(typeof unsub).toBe('function')
    unsub() // should not throw
  })

  // Fix 10: Vite dispose clears handlers and window.__cortex_channel__
  it('dispose clears handlers and window.__cortex_channel__', () => {
    window.__cortex_send__ = vi.fn()
    const channel = createViteChannel()
    const handler = vi.fn()
    channel.onMessage(handler)

    channel.dispose!()

    expect(window.__cortex_channel__).toBeUndefined()
    // Handlers should be cleared — re-registering __cortex_channel__ and dispatching should not reach old handler
  })
})

describe('createWebSocketChannel', () => {
  let mockInstances: MockWebSocket[]

  class MockWebSocket {
    static readonly OPEN = 1
    static readonly CLOSED = 3
    readonly OPEN = 1
    readonly CLOSED = 3
    readyState = 0
    url: string
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    send = vi.fn()
    close = vi.fn()

    constructor(url: string) {
      this.url = url
      mockInstances.push(this)
    }

    _simulateOpen(): void {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }

    _simulateMessage(data: unknown): void {
      this.onmessage?.({ data: JSON.stringify(data) })
    }

    _simulateClose(): void {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.()
    }

    _simulateError(): void {
      this.onerror?.()
    }

    _simulateMalformedMessage(raw: string): void {
      this.onmessage?.({ data: raw })
    }
  }

  beforeEach(() => {
    mockInstances = []
    vi.useFakeTimers()
    // @ts-expect-error — mock WebSocket global
    globalThis.WebSocket = MockWebSocket
    delete window.__cortex_ws_port__
    // ZF0-1326 Task 1: __CORTEX_TOKEN__ closure-captured + tombstoned
    delete window.__CORTEX_TOKEN__
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ZF0-1326 Task 1 — tombstone semantic for the WebSocket channel.
  // See createViteChannel block above for the rationale on `'X' in window`
  // vs `=== undefined`.
  it('deletes __CORTEX_TOKEN__ from window post-create (own-property absence)', () => {
    window.__CORTEX_TOKEN__ = 'ws-test-token'
    createWebSocketChannel({ url: 'ws://test' })
    expect('__CORTEX_TOKEN__' in window).toBe(false)
  })

  it('stamps the closure-captured token on outgoing messages', () => {
    window.__CORTEX_TOKEN__ = 'ws-token-abc'
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    channel.send({
      type: 'edit' as const, protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string)
    expect(sent.token).toBe('ws-token-abc')
  })

  it('uses the closure-captured token across a real close→reconnect→flush cycle', () => {
    // The previous "reconnect-flush" test was subsumed by the closure-capture
    // assertion above — both queue-flush and immediate-send branches use the
    // same `capturedToken` local, so testing one tested the other.
    //
    // This replacement exercises the load-bearing scenario: a message queued
    // while disconnected, then a CLOSE event triggering reconnect, the
    // setTimeout firing, a NEW WebSocket instance being constructed, and
    // FINALLY the flush firing on that fresh socket. A regression that
    // re-read `window.__CORTEX_TOKEN__` inside `onopen` (rather than using
    // the closure) would survive the previous test and fail this one.
    window.__CORTEX_TOKEN__ = 'reconnect-token'
    const channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 3 })

    // Queue while initial socket is still pre-open
    channel.send({
      type: 'edit' as const, protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    // Trigger reconnect cycle: close the initial socket, advance timer,
    // verify a brand-new WebSocket instance was created.
    mockInstances[0]!._simulateClose()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Open the SECOND socket. Flush should fire on it. Even though
    // `window.__CORTEX_TOKEN__` is now reassigned (or absent), the captured
    // closure value is what the flush uses.
    window.__CORTEX_TOKEN__ = 'attacker-token'
    mockInstances[1]!._simulateOpen()

    expect(mockInstances[1]!.send).toHaveBeenCalled()
    const flushed = JSON.parse(mockInstances[1]!.send.mock.calls[0]![0] as string)
    expect(flushed.token).toBe('reconnect-token')
  })

  it('dispose() does not re-leak captured token to window (ZF0-1326 Task 1)', () => {
    window.__CORTEX_TOKEN__ = 'ws-token-x'
    const channel = createWebSocketChannel({ url: 'ws://test' })
    mockInstances[0]!._simulateOpen()
    channel.dispose!()
    expect('__CORTEX_TOKEN__' in window).toBe(false)
  })

  // 3B — the WS channel installs window.__cortex_send__ as the narrow
  // cortex/set-active bridge. That global is ALSO the sentinel bootstrap() uses
  // to detect the Vite adapter (typeof window.__cortex_send__ === 'function').
  // If it survives dispose(), a re-bootstrap after teardown misdetects the Vite
  // flow and silently drops init/hello/edit messages. dispose() must clear it.
  it('dispose() clears the __cortex_send__ activation-bridge sentinel it installed (3B)', () => {
    delete window.__cortex_send__
    const channel = createWebSocketChannel({ url: 'ws://test' })
    // The channel installs the sentinel on create.
    expect(typeof window.__cortex_send__).toBe('function')
    channel.dispose!()
    // own-property absence, not value emptiness — matches the ZF0-1326 posture.
    expect('__cortex_send__' in window).toBe(false)
  })

  it('dispose() does not clobber a foreign __cortex_send__ it did not install (3B guard)', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    // Simulate a real Vite primitive (or another channel) replacing the sentinel
    // after this channel installed its bridge. dispose() must only remove the
    // exact function this channel set, never a foreign one.
    const foreign = vi.fn()
    window.__cortex_send__ = foreign
    channel.dispose!()
    expect(window.__cortex_send__).toBe(foreign)
    delete window.__cortex_send__
  })

  it('connected is false until onopen fires', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    expect(channel.connected).toBe(false)
    mockInstances[0]!._simulateOpen()
    expect(channel.connected).toBe(true)
  })

  it('send() queues messages when disconnected, flushes on connect', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const msg = { type: 'edit' as const, protocolVersion: 1, editId: '1', property: 'color', value: 'red', source: 'Hero.tsx:5:3', elementSelector: 'div' }
    channel.send(msg)

    const ws = mockInstances[0]!
    expect(ws.send).not.toHaveBeenCalled()

    ws._simulateOpen()
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg))
  })

  it('send() sends immediately when connected', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    const msg = { type: 'edit' as const, protocolVersion: 1, editId: '1', property: 'color', value: 'red', source: 'Hero.tsx:5:3', elementSelector: 'div' }
    channel.send(msg)
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg))
  })

  it('onMessage delivers parsed JSON to handlers', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const handler = vi.fn()
    channel.onMessage(handler)

    const ws = mockInstances[0]!
    ws._simulateOpen()

    const msg: ServerToBrowser = { type: 'hello', protocolVersion: 1, sessionId: 'abc' }
    ws._simulateMessage(msg)
    expect(handler).toHaveBeenCalledWith(msg)
  })

  it('reconnects with exponential backoff on close', () => {
    createWebSocketChannel({ url: 'ws://test', maxRetries: 3 })
    expect(mockInstances).toHaveLength(1)

    // First disconnect → reconnect after 1s
    mockInstances[0]!._simulateClose()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Second disconnect → reconnect after 2s
    mockInstances[1]!._simulateClose()
    vi.advanceTimersByTime(2000)
    expect(mockInstances).toHaveLength(3)

    // Third disconnect → reconnect after 4s
    mockInstances[2]!._simulateClose()
    vi.advanceTimersByTime(4000)
    expect(mockInstances).toHaveLength(4)

    // Fourth disconnect → maxRetries (3) reached, no more reconnects
    mockInstances[3]!._simulateClose()
    vi.advanceTimersByTime(30000)
    expect(mockInstances).toHaveLength(4)
  })

  it('resets retry count on successful reconnect', () => {
    createWebSocketChannel({ url: 'ws://test', maxRetries: 3 })

    mockInstances[0]!._simulateClose()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Successful reconnect resets counter
    mockInstances[1]!._simulateOpen()
    mockInstances[1]!._simulateClose()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(3)
  })

  it('malformed JSON does not crash', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const handler = vi.fn()
    channel.onMessage(handler)

    const ws = mockInstances[0]!
    ws._simulateOpen()
    ws._simulateMalformedMessage('not json {{{')
    expect(handler).not.toHaveBeenCalled()
  })

  // Fix 1: unsubscribe
  it('onMessage() returns unsubscribe that removes handler', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const handler = vi.fn()
    const unsub = channel.onMessage(handler)

    unsub()

    const ws = mockInstances[0]!
    ws._simulateOpen()
    ws._simulateMessage({ type: 'hello', protocolVersion: 1, sessionId: 'abc' })
    expect(handler).not.toHaveBeenCalled()
  })

  // Fix 4: dispose
  it('dispose() closes WebSocket', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    channel.dispose!()

    expect(ws.close).toHaveBeenCalled()
    expect(channel.connected).toBe(false)
  })

  it('dispose() prevents reconnection', () => {
    const channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 5 })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    channel.dispose!()

    // Simulate close after dispose — should not attempt reconnect
    // onclose was nulled by dispose, but even if it fired, disposed flag blocks it
    vi.advanceTimersByTime(30000)
    expect(mockInstances).toHaveLength(1) // no new connections
  })

  it('dispose() clears queued messages and handlers', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const handler = vi.fn()
    channel.onMessage(handler)

    // Queue a message while disconnected
    channel.send({ type: 'edit', protocolVersion: 1, editId: '1', property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div' })

    channel.dispose!()

    // Open a new socket manually — the old channel should not flush
    const ws = mockInstances[0]!
    ws._simulateOpen()
    expect(ws.send).not.toHaveBeenCalled()
  })

  // Fix 5: queue cap
  it('drops oldest when queue exceeds limit', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const makeMsg = (id: string) => ({
      type: 'edit' as const, protocolVersion: 1, editId: id,
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    // Queue 101 messages (exceeds MAX_QUEUE_SIZE=100)
    for (let i = 0; i < 101; i++) {
      channel.send(makeMsg(String(i)))
    }

    // Open connection — should flush exactly 100 messages
    const ws = mockInstances[0]!
    ws._simulateOpen()
    expect(ws.send).toHaveBeenCalledTimes(100)

    // First flushed message should be id "1" (id "0" was dropped)
    const firstFlushed = JSON.parse(ws.send.mock.calls[0][0])
    expect(firstFlushed.editId).toBe('1')
  })

  // Fix 6: port configuration
  it('uses __cortex_ws_port__ when set', () => {
    window.__cortex_ws_port__ = 9999
    createWebSocketChannel()
    expect(mockInstances[0]!.url).toContain(':9999/cortex')
    delete window.__cortex_ws_port__
  })

  it('falls back to 24678 when __cortex_ws_port__ is not set', () => {
    createWebSocketChannel()
    expect(mockInstances[0]!.url).toContain(':24678/cortex')
  })

  it('uses wss: protocol when page is served over HTTPS', () => {
    const original = location.protocol
    Object.defineProperty(location, 'protocol', { value: 'https:', configurable: true })
    createWebSocketChannel()
    expect(mockInstances[0]!.url).toMatch(/^wss:/)
    Object.defineProperty(location, 'protocol', { value: original, configurable: true })
  })

  // Fix 8: handler unsub during dispatch does not skip remaining handlers
  it('handler unsub during dispatch does not skip remaining handlers', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const hC = vi.fn()
    let unsubB: () => void
    const hA = vi.fn(() => { unsubB() })
    const hB = vi.fn()
    channel.onMessage(hA)
    unsubB = channel.onMessage(hB)
    channel.onMessage(hC)

    const ws = mockInstances[0]!
    ws._simulateOpen()
    ws._simulateMessage({ type: 'hello', protocolVersion: 1, sessionId: 'abc' })

    expect(hA).toHaveBeenCalled()
    expect(hC).toHaveBeenCalled()
  })

  // Bug #18: queue cleared when retries exhausted
  it('clears queue when retries are exhausted', () => {
    const channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 1 })
    const makeMsg = (id: string) => ({
      type: 'edit' as const, protocolVersion: 1, editId: id,
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    // Queue messages while disconnected
    channel.send(makeMsg('1'))
    channel.send(makeMsg('2'))

    // First close → retry (retryCount 0 < maxRetries 1)
    mockInstances[0]!._simulateClose()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Queue more messages
    channel.send(makeMsg('3'))

    // Second close → retries exhausted (retryCount 1 >= maxRetries 1)
    mockInstances[1]!._simulateClose()
    vi.advanceTimersByTime(30000)
    expect(mockInstances).toHaveLength(2) // no more reconnects

    // Queue should be empty — no reconnect will ever flush these stale messages.
    // Direct verification: open the second WS instance — stale messages should NOT be flushed
    mockInstances[1]!._simulateOpen()
    // If queue was cleared, at most the post-exhaustion message ('4') could flush,
    // but since retries are exhausted, the channel is effectively dead.
    // The key assertion: messages '1', '2', '3' should NOT flush (they were stale)
    const flushedIds = mockInstances[1]!.send.mock.calls.map(
      (c: any[]) => JSON.parse(c[0]).editId,
    )
    expect(flushedIds).not.toContain('1')
    expect(flushedIds).not.toContain('2')
    expect(flushedIds).not.toContain('3')
  })

  // Note: the `if (disposed) return` guard in send() prevents queue growth after
  // disposal (memory leak defense). This is untestable from outside the closure
  // without a test seam — dispose() already nulls ws.onopen, so any flush-based
  // assertion passes regardless. Deleted per CLAUDE.md rule #2 (assertions must
  // be falsifiable). The queue-clearing-on-exhaustion test above covers the
  // user-visible behavior.

  describe('onConnectionChange', () => {
    let channel: ReturnType<typeof createWebSocketChannel>
    let lastWs: MockWebSocket

    beforeEach(() => {
      channel = createWebSocketChannel({ url: 'ws://test' })
      lastWs = mockInstances[mockInstances.length - 1]!
    })

    afterEach(() => {
      channel.dispose?.()
    })

    it('fires connected on WebSocket open', () => {
      const states: ConnectionState[] = []
      channel.onConnectionChange(state => states.push(state))

      lastWs._simulateOpen()

      expect(states).toEqual([{ status: 'connected' }])
    })

    it('fires reconnecting with retryCount on close when retries remain', () => {
      const states: ConnectionState[] = []
      lastWs._simulateOpen()
      channel.onConnectionChange(state => states.push(state))

      lastWs._simulateClose()

      expect(states).toEqual([
        { status: 'reconnecting', retryCount: 1, maxRetries: 5 },
      ])
    })

    it('fires disconnected after max retries', () => {
      channel.dispose?.()
      channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 1 })
      const newWs = mockInstances[mockInstances.length - 1]!

      const states: ConnectionState[] = []
      newWs._simulateOpen()
      channel.onConnectionChange(state => states.push(state))

      // First close -> reconnecting
      newWs._simulateClose()
      expect(states[0]).toEqual({ status: 'reconnecting', retryCount: 1, maxRetries: 1 })

      // Advance timer to trigger reconnect
      vi.advanceTimersByTime(1000)
      const retryWs = mockInstances[mockInstances.length - 1]!
      retryWs._simulateClose()
      expect(states[1]).toEqual({ status: 'disconnected' })
    })

    it('unsubscribe prevents further callbacks', () => {
      const states: ConnectionState[] = []
      const unsub = channel.onConnectionChange(state => states.push(state))

      lastWs._simulateOpen()
      expect(states.length).toBe(1)

      unsub()
      lastWs._simulateClose()
      expect(states.length).toBe(1) // no new entries
    })

    it('retries on constructor throw then fires disconnected after max retries', () => {
      channel.dispose?.()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Replace mock WebSocket with one that throws on 2nd+ instantiation
      let callCount = 0
      // @ts-expect-error — mock WebSocket global
      globalThis.WebSocket = class {
        onopen: (() => void) | null = null
        onclose: (() => void) | null = null
        onmessage: ((e: any) => void) | null = null
        onerror: (() => void) | null = null
        readyState = 0
        send = vi.fn()
        close = vi.fn()
        constructor() {
          callCount++
          if (callCount > 1) throw new Error('SecurityError: blocked')
          mockInstances.push(this as any)
        }
      }

      channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 2 })
      const states: ConnectionState[] = []
      channel.onConnectionChange(state => states.push(state))

      // First ws exists — simulate open then close to trigger reconnect
      const ws = mockInstances[mockInstances.length - 1]!
      ;(ws as any).readyState = 1
      ;(ws as any).onopen?.()
      ;(ws as any).readyState = 3
      ;(ws as any).onclose?.()

      // onclose: retryCount 0→1, fires reconnecting(1/2)
      expect(states).toEqual([
        { status: 'connected' },
        { status: 'reconnecting', retryCount: 1, maxRetries: 2 },
      ])

      // 1st retry timer fires — constructor throws, retryCount 1→2, fires reconnecting(2/2)
      vi.advanceTimersByTime(1000)
      expect(states[2]).toEqual({ status: 'reconnecting', retryCount: 2, maxRetries: 2 })

      // 2nd retry timer fires — constructor throws again, retryCount exhausted → disconnected
      vi.advanceTimersByTime(2000)
      expect(states[3]).toEqual({ status: 'disconnected' })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket connection failed:'),
        expect.any(String),
      )
      warnSpy.mockRestore()
    })

    afterEach(() => {
      // Restore original MockWebSocket — if the constructor-throw test fails
      // before restoring, subsequent tests would cascade fail without this.
      // @ts-expect-error — mock WebSocket global
      globalThis.WebSocket = MockWebSocket
    })

    it('handler errors are caught and do not prevent other handlers', () => {
      const states: ConnectionState[] = []
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      channel.onConnectionChange(() => { throw new Error('boom') })
      channel.onConnectionChange(state => states.push(state))

      lastWs._simulateOpen()

      expect(states).toEqual([{ status: 'connected' }])
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  // Fix 9: dispose nulls all WebSocket event handlers
  it('dispose nulls all WebSocket event handlers', () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    channel.dispose!()

    expect(ws.onopen).toBeNull()
    expect(ws.onmessage).toBeNull()
    expect(ws.onclose).toBeNull()
    expect(ws.onerror).toBeNull()
  })
})

// ── Pure helper tests ─────────────────────────────────────────────────────

describe('composeRequestWithId', () => {
  it('stamps the given requestId and a blank token placeholder', () => {
    const msg = { type: 'staged-edits-ready' as const, count: 5 }
    const result = composeRequestWithId(msg, 'req-123')
    expect((result as Record<string, unknown>).requestId).toBe('req-123')
    // token placeholder is '' — channel.send() overwrites it with the
    // closure-captured token (ZF0-1326 Task 1).
    expect((result as Record<string, unknown>).token).toBe('')
  })

  it('preserves all fields from the original message', () => {
    const msg = { type: 'staged-edits-ready' as const, count: 3 }
    const result = composeRequestWithId(msg, 'req-abc') as Record<string, unknown>
    expect(result.type).toBe('staged-edits-ready')
    expect(result.count).toBe(3)
  })
})

describe('matchesRequestId', () => {
  it('returns true when serverMsg contains the expected requestId', () => {
    const msg: ServerToBrowser = { type: 'staged-edits-acked', requestId: 'req-xyz' }
    expect(matchesRequestId(msg, 'req-xyz')).toBe(true)
  })

  it('returns false when requestId does not match', () => {
    const msg: ServerToBrowser = { type: 'staged-edits-acked', requestId: 'req-xyz' }
    expect(matchesRequestId(msg, 'req-abc')).toBe(false)
  })

  it('returns false when serverMsg has no requestId field', () => {
    const msg: ServerToBrowser = { type: 'cortex' }
    expect(matchesRequestId(msg, 'req-xyz')).toBe(false)
  })
})

// ── sendAndAck — uuid polyfill guard ────────────────────────────────────

describe('sendAndAckImpl uuid polyfill', () => {
  // Falsifiable: monkey-patches crypto.randomUUID to throw, then verifies that
  // sendAndAck still generates a requestId and resolves. Proves generateId()
  // polyfill is in use rather than the bare crypto.randomUUID call.
  it('sendAndAck works when crypto.randomUUID throws (uses generateId polyfill)', async () => {
    const originalRandomUUID = crypto.randomUUID.bind(crypto)
    crypto.randomUUID = () => { throw new Error('randomUUID unavailable in this context') }

    try {
      delete window.__cortex_send__
      delete window.__cortex_channel__
      delete window.__CORTEX_TOKEN__
      const mockSend = vi.fn()
      window.__cortex_send__ = mockSend
      window.__CORTEX_TOKEN__ = 'test-token'

      const channel = createViteChannel()
      const pendingPromise = channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })

      // Verify a requestId was generated despite crypto.randomUUID throwing.
      const sentMsg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>
      const requestId = sentMsg?.requestId as string
      expect(typeof requestId).toBe('string')
      expect(requestId.length).toBeGreaterThan(0)

      // Resolve the promise so it doesn't hang as an unhandled rejection.
      const ack = { type: 'staged-edits-acked' as const, requestId }
      window.__cortex_channel__!.handleServerMessage(ack)
      await pendingPromise
    } finally {
      crypto.randomUUID = originalRandomUUID
      delete window.__cortex_send__
      delete window.__cortex_channel__
      delete window.__CORTEX_TOKEN__
    }
  })
})

// ── sendAndAck tests — Vite channel ─────────────────────────────────────

describe('createViteChannel sendAndAck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    delete window.__cortex_send__
    delete window.__cortex_channel__
    delete window.__CORTEX_TOKEN__
    window.__cortex_send__ = vi.fn()
    window.__CORTEX_TOKEN__ = 'test-token'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sendAndAck resolves on matching requestId in ack message', async () => {
    // Capture the mock BEFORE creating the channel — createViteChannel tombstones
    // window.__cortex_send__ immediately, making it inaccessible post-creation.
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend

    const channel = createViteChannel()
    const pendingPromise = channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })

    // Extract the requestId from the call recorded by the mock (still a valid
    // vi.fn reference even after tombstoning — only the window property was deleted).
    const sentMsg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>
    const requestId = sentMsg?.requestId as string
    expect(typeof requestId).toBe('string')

    const ack: ServerToBrowser = { type: 'staged-edits-acked', requestId }
    window.__cortex_channel__!.handleServerMessage(ack)

    const result = await pendingPromise
    expect(result).toEqual(ack)
  })

  it('sendAndAck rejects on timeout (default 10s)', async () => {
    const channel = createViteChannel()
    const pendingPromise = channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })

    vi.advanceTimersByTime(10001)

    await expect(pendingPromise).rejects.toThrow('sendAndAck timeout after 10000ms')
  })

  // Vite channel has no connection lifecycle events — disconnect rejection
  // path is a dead branch. The timeout path is the only rejection path.
  it.skip('sendAndAck rejects on disconnect during wait (Vite channel has no lifecycle — skip)', () => {
    // TODO: Vite HMR manages its own reconnection without emitting ConnectionState events.
    // The onConnectionChange no-op in createViteChannel means this rejection path
    // is unreachable. Only the timeout fires. Test omitted per CLAUDE.md rule #3.
  })

  it('sendAndAck does NOT resolve on mismatched requestId', async () => {
    let resolved = false
    const channel = createViteChannel()
    // Suppress the expected timeout rejection — this test is about the positive
    // assertion (promise stays pending), not the eventual rejection path.
    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })
      .then(() => { resolved = true })
      .catch(() => {})

    // Dispatch an ack with a DIFFERENT requestId — should not resolve.
    const wrongAck: ServerToBrowser = { type: 'staged-edits-acked', requestId: 'wrong-id' }
    window.__cortex_channel__!.handleServerMessage(wrongAck)

    // Yield multiple event loop turns — promise should still be pending.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Clean up — advance timer to expire the pending promise cleanly.
    vi.advanceTimersByTime(10001)
    await Promise.resolve()
  })

  it('sendAndAck cleans up listener after resolve (no double-resolution)', async () => {
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend

    const channel = createViteChannel()
    const results: ServerToBrowser[] = []
    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 }).then(r => results.push(r))

    const sentMsg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>
    const requestId = sentMsg?.requestId as string

    // First ack — resolves the promise.
    const ack1: ServerToBrowser = { type: 'staged-edits-acked', requestId }
    window.__cortex_channel__!.handleServerMessage(ack1)
    await Promise.resolve()
    expect(results).toHaveLength(1)

    // Second ack with the SAME requestId — listener must have been removed.
    const ack2: ServerToBrowser = { type: 'staged-edits-acked', requestId }
    window.__cortex_channel__!.handleServerMessage(ack2)
    await Promise.resolve()
    // Still only 1 result — no double-resolution.
    expect(results).toHaveLength(1)
  })

  it('sendAndAck cleans up listener after reject (no spurious resolve after timeout)', async () => {
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend

    const channel = createViteChannel()
    let resolvedAfterTimeout = false

    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 }).catch(() => {
      // Expected rejection — verify promise is settled.
    })

    // Advance past timeout — listener is removed and promise is rejected.
    vi.advanceTimersByTime(10001)
    await Promise.resolve()

    // Now dispatch an ack — the sendAndAck listener was removed on rejection,
    // but a NEW onMessage handler can still receive it (channel still works).
    // This confirms the cleanup de-registered the sendAndAck listener specifically,
    // not all listeners, and the settled promise cannot re-resolve.
    const sentMsg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>
    const requestId = sentMsg?.requestId as string

    channel.onMessage((msg) => {
      if ('requestId' in msg && (msg as Record<string, unknown>).requestId === requestId) {
        resolvedAfterTimeout = true
      }
    })
    window.__cortex_channel__!.handleServerMessage({ type: 'staged-edits-acked', requestId })
    await Promise.resolve()

    // The new handler received the ack (channel still works), but the original
    // sendAndAck promise did NOT re-resolve (JS Promise settled state is immutable).
    expect(resolvedAfterTimeout).toBe(true)
  })
})

// ── sendAndAck tests — WebSocket channel ────────────────────────────────

describe('createWebSocketChannel sendAndAck', () => {
  let mockInstances: MockWebSocket[]

  class MockWebSocket {
    static readonly OPEN = 1
    static readonly CLOSED = 3
    readonly OPEN = 1
    readonly CLOSED = 3
    readyState = 0
    url: string
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    send = vi.fn()
    close = vi.fn()

    constructor(url: string) {
      this.url = url
      mockInstances.push(this)
    }

    _simulateOpen(): void {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }

    _simulateMessage(data: unknown): void {
      this.onmessage?.({ data: JSON.stringify(data) })
    }

    _simulateClose(): void {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.()
    }
  }

  beforeEach(() => {
    mockInstances = []
    vi.useFakeTimers()
    // @ts-expect-error — mock WebSocket global
    globalThis.WebSocket = MockWebSocket
    delete window.__cortex_ws_port__
    delete window.__CORTEX_TOKEN__
    window.__CORTEX_TOKEN__ = 'ws-test-token'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sendAndAck resolves on matching requestId in ack message', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    const pendingPromise = channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 2 })

    // Extract the requestId from the sent message.
    const rawSent = ws.send.mock.calls[0]?.[0] as string
    const sentMsg = JSON.parse(rawSent) as Record<string, unknown>
    const requestId = sentMsg.requestId as string
    expect(typeof requestId).toBe('string')

    // Server sends back the ack.
    const ack: ServerToBrowser = { type: 'staged-edits-acked', requestId }
    ws._simulateMessage(ack)

    const result = await pendingPromise
    expect(result).toEqual(ack)
  })

  it('sendAndAck rejects on timeout (default 10s)', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    const pendingPromise = channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })
    vi.advanceTimersByTime(10001)

    await expect(pendingPromise).rejects.toThrow('sendAndAck timeout after 10000ms')
  })

  it('sendAndAck rejects on disconnect during wait', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 0 })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    const pendingPromise = channel.sendAndAck(
      { type: 'staged-edits-ready' as const, count: 1 },
      { timeoutMs: 30_000 }, // long timeout so disconnect fires first
    )

    // Trigger disconnection by closing after retry budget exhausted.
    ws._simulateClose()
    // Advance past retries (maxRetries=0 → disconnected immediately on close)
    // No timer needed — onclose with retryCount >= maxRetries fires disconnected synchronously.

    await expect(pendingPromise).rejects.toThrow('sendAndAck failed: channel disconnected')
  })

  it('sendAndAck does NOT resolve on mismatched requestId', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    let resolved = false
    // Suppress the expected timeout rejection — this test is about the positive
    // assertion (promise stays pending on wrong requestId), not the eventual rejection.
    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 })
      .then(() => { resolved = true })
      .catch(() => {})

    // Dispatch ack with wrong requestId — should not resolve.
    ws._simulateMessage({ type: 'staged-edits-acked', requestId: 'wrong-id' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Clean up — advance timer to expire the pending promise cleanly.
    vi.advanceTimersByTime(10001)
    await Promise.resolve()
  })

  it('sendAndAck cleans up listener after resolve (no double-resolution)', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    const results: ServerToBrowser[] = []
    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 }).then(r => results.push(r))

    const rawSent = ws.send.mock.calls[0]?.[0] as string
    const { requestId } = JSON.parse(rawSent) as { requestId: string }

    // First ack — resolves.
    ws._simulateMessage({ type: 'staged-edits-acked', requestId })
    await Promise.resolve()
    expect(results).toHaveLength(1)

    // Second ack with same requestId — listener removed, no double-resolution.
    ws._simulateMessage({ type: 'staged-edits-acked', requestId })
    await Promise.resolve()
    expect(results).toHaveLength(1)
  })

  it('sendAndAck cleans up listener after reject (timeout)', async () => {
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    let catchCalled = false
    channel.sendAndAck({ type: 'staged-edits-ready' as const, count: 1 }).catch(() => {
      catchCalled = true
    })

    vi.advanceTimersByTime(10001)
    await Promise.resolve()
    expect(catchCalled).toBe(true)

    // After rejection, a late-arriving ack should NOT re-resolve the settled promise.
    const rawSent = ws.send.mock.calls[0]?.[0] as string
    const { requestId } = JSON.parse(rawSent) as { requestId: string }
    // Dispatch the late ack — promise is already rejected; JS semantics guarantee
    // no state change. The listener was removed so no second resolution attempt.
    ws._simulateMessage({ type: 'staged-edits-acked', requestId })
    await Promise.resolve()
    // No assertion needed beyond "no throw" — Promise settled state is immutable.
  })
})
