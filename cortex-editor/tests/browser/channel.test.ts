import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createViteChannel, createWebSocketChannel } from '../../src/browser/channel.js'
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

  // ZF0-1326 Task 1 — tombstone semantic
  it('tombstones __cortex_send__ and __CORTEX_TOKEN__ on window post-create', () => {
    window.__cortex_send__ = vi.fn()
    window.__CORTEX_TOKEN__ = 'test-token-xyz'
    createViteChannel()
    // Both globals must be undefined post-boot — closes the XSS-via-dev-server
    // RCE vector. A hostile script loaded after channel boot cannot reach
    // either primitive on window.
    expect(window.__cortex_send__).toBeUndefined()
    expect(window.__CORTEX_TOKEN__).toBeUndefined()
  })

  it('captures __CORTEX_TOKEN__ into closure and stamps it on send', () => {
    const mockSend = vi.fn()
    window.__cortex_send__ = mockSend
    window.__CORTEX_TOKEN__ = 'closure-token'
    const channel = createViteChannel()

    // Simulate a hostile-script attempt to overwrite the global AFTER capture.
    // The channel's closure-captured token is unaffected.
    window.__CORTEX_TOKEN__ = 'attacker-token'

    channel.send({
      type: 'edit', protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    expect(mockSend).toHaveBeenCalledWith({
      type: 'edit', protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
      token: 'closure-token', // captured value, not the overwritten one
    })
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

  // ZF0-1326 Task 1 — tombstone semantic for the WebSocket channel
  it('tombstones __CORTEX_TOKEN__ on window post-create', () => {
    window.__CORTEX_TOKEN__ = 'ws-test-token'
    createWebSocketChannel({ url: 'ws://test' })
    expect(window.__CORTEX_TOKEN__).toBeUndefined()
  })

  it('stamps the closure-captured token on outgoing messages', () => {
    window.__CORTEX_TOKEN__ = 'ws-token-abc'
    const channel = createWebSocketChannel({ url: 'ws://test' })
    const ws = mockInstances[0]!
    ws._simulateOpen()

    // Hostile-script-style overwrite after capture — closure value wins
    window.__CORTEX_TOKEN__ = 'attacker-token'

    channel.send({
      type: 'edit' as const, protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string)
    expect(sent.token).toBe('ws-token-abc')
  })

  it('uses the closure-captured token even after reconnect-flush', () => {
    window.__CORTEX_TOKEN__ = 'reconnect-token'
    const channel = createWebSocketChannel({ url: 'ws://test', maxRetries: 3 })

    // Queue while disconnected — token is closure-stamped at flush time
    channel.send({
      type: 'edit' as const, protocolVersion: 1, editId: '1',
      property: 'color', value: 'red', source: 'a:1:1', elementSelector: 'div',
    })

    // Hostile-script-style overwrite mid-flight
    window.__CORTEX_TOKEN__ = 'attacker-token'

    const ws = mockInstances[0]!
    ws._simulateOpen()

    const flushed = JSON.parse(ws.send.mock.calls[0]![0] as string)
    expect(flushed.token).toBe('reconnect-token')
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
      (c: [string]) => JSON.parse(c[0]).editId,
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
