import type { BrowserToServer, ConnectionState, CortexChannel, ServerToBrowser } from '../adapters/types.js'
import './types.js' // Window augmentation (__cortex_send__, __cortex_channel__, __cortex_ws_port__)

/** Max queued messages during WebSocket disconnection (Fix 5) */
const MAX_QUEUE_SIZE = 100

/**
 * Create a channel using Vite HMR custom events.
 * Requires window.__cortex_send__ (injected by the Vite adapter CLIENT_SCRIPT).
 *
 * ZF0-1326 Task 1 — closure-capture + tombstone:
 * `__cortex_send__` is the underlying edit primitive (calls `import.meta.hot.send`)
 * and `__CORTEX_TOKEN__` is the WS auth token. Both are injected on `window` at
 * bootstrap. If left there post-boot, an XSS payload reads the token and calls
 * the send primitive directly for a fully-authed RCE through cortex's edit
 * pipeline (server-side WRITE_TYPES check accepts because token is real).
 *
 * We capture both into closure scope at channel-create time, then delete them
 * from window. Trusted callers (this channel's `send`) use the closure pair;
 * any post-boot script — hostile or otherwise — sees `undefined` on window and
 * has no path to forge an authed message.
 *
 * Note on idempotency: if `createViteChannel()` is called twice on the same
 * page (not expected in production — pages instantiate one channel), the
 * second call captures `undefined` for both globals and returns a no-op send.
 * Tests that need a fresh channel must reset `window.__cortex_send__` and
 * `window.__CORTEX_TOKEN__` before each call.
 */
export function createViteChannel(): CortexChannel {
  const handlers: Array<(msg: ServerToBrowser) => void> = []

  // Capture-and-delete the bootstrap-injected primitives (ZF0-1326 Task 1).
  // Order matters: capture first, delete second. The deletes require
  // `configurable: true` on the bootstrap descriptor (vite.ts).
  const capturedSend = window.__cortex_send__
  const capturedToken = window.__CORTEX_TOKEN__
  delete window.__cortex_send__
  delete window.__CORTEX_TOKEN__

  // Register receiver — Vite adapter calls handleServerMessage when server sends data
  Object.defineProperty(window, '__cortex_channel__', {
    value: Object.freeze({
      handleServerMessage(data: ServerToBrowser) {
        for (const h of [...handlers]) {
          try { h(data) } catch (err) {
            console.warn('[cortex] Message handler error:', err instanceof Error ? err.message : err)
          }
        }
      },
    }),
    writable: false,
    configurable: true, // configurable so dispose() can clean up
  })

  return {
    send(msg: BrowserToServer): void {
      capturedSend?.({ ...msg, token: capturedToken })
    },
    onMessage(handler: (msg: ServerToBrowser) => void): () => void {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
    onConnectionChange(_handler: (state: ConnectionState) => void): () => void {
      // Vite HMR manages its own reconnection and overlay — no lifecycle events to emit.
      return () => {}
    },
    get connected(): boolean {
      return typeof capturedSend === 'function'
    },
    dispose(): void {
      handlers.length = 0
      delete window.__cortex_channel__
    },
  }
}

/** Options for WebSocket channel creation */
export interface WebSocketChannelOptions {
  /** WebSocket URL. Overrides port-based default. */
  url?: string
  /** Max reconnection attempts. Defaults to 5. */
  maxRetries?: number
}

/**
 * Create a channel using WebSocket (for Next.js or standalone).
 * Handles reconnection with exponential backoff.
 * Port defaults to window.__cortex_ws_port__ ?? 24678 (Fix 6).
 *
 * ZF0-1326 Task 1 — token closure-capture + tombstone:
 * `__CORTEX_TOKEN__` is captured into closure scope and deleted from window
 * at channel-create time. This closes the token-leak leg of the XSS RCE
 * vector — post-boot scripts cannot read the token off window. The captured
 * token is then stamped on every send (matches the pre-tombstone behavior
 * where channel.send re-read window.__CORTEX_TOKEN__ at send time, and on
 * each reconnect-flush). For tests that need a fresh channel, reset
 * `window.__CORTEX_TOKEN__` before each call.
 */
export function createWebSocketChannel(options?: WebSocketChannelOptions): CortexChannel {
  const port = window.__cortex_ws_port__ ?? 24678
  const defaultProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = options?.url ?? `${defaultProtocol}//${location.hostname}:${port}/cortex`
  const maxRetries = options?.maxRetries ?? 5

  // Capture-and-delete the bootstrap-injected token (ZF0-1326 Task 1).
  // No `__cortex_send__` capture needed here — this channel uses the native
  // WebSocket constructor directly, not the Vite HMR send primitive.
  const capturedToken = window.__CORTEX_TOKEN__
  delete window.__CORTEX_TOKEN__

  const handlers: Array<(msg: ServerToBrowser) => void> = []
  const statusHandlers: Array<(state: ConnectionState) => void> = []
  const queue: BrowserToServer[] = []
  let ws: WebSocket | null = null
  let connected = false
  let retryCount = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function fireStatus(state: ConnectionState): void {
    for (const h of [...statusHandlers]) {
      try { h(state) } catch (err) {
        console.warn('[cortex] Connection status handler error:', err instanceof Error ? err.message : err)
      }
    }
  }

  function connect(): void {
    if (disposed) return
    try {
      ws = new WebSocket(url)
    } catch (err) {
      // WebSocket constructor can throw (invalid URL, security policy, etc.)
      // Without this catch, a throw during setTimeout-driven reconnection is
      // silently swallowed, leaving the indicator stuck on "Reconnecting" forever.
      // Retry if attempts remain (transient CSP/policy errors may resolve);
      // only go terminal if retry budget is exhausted.
      console.warn('[cortex] WebSocket connection failed:', err instanceof Error ? err.message : err)
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * 2 ** retryCount, 30000)
        retryCount++
        fireStatus({ status: 'reconnecting', retryCount, maxRetries })
        reconnectTimer = setTimeout(connect, delay)
      } else {
        queue.length = 0
        fireStatus({ status: 'disconnected' })
      }
      return
    }

    ws.onopen = () => {
      connected = true
      retryCount = 0
      fireStatus({ status: 'connected' })
      // Flush queued messages — stamp token at send time (not enqueue time)
      // so reconnection to a restarted server uses the fresh token.
      while (queue.length > 0) {
        const msg = queue.shift()!
        ws!.send(JSON.stringify({ ...msg, token: capturedToken }))
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      let data: ServerToBrowser
      try {
        data = JSON.parse(event.data as string) as ServerToBrowser
      } catch {
        // Malformed JSON — ignore
        return
      }
      for (const h of [...handlers]) {
        try { h(data) } catch (err) {
          console.warn('[cortex] Message handler error:', err instanceof Error ? err.message : err)
        }
      }
    }

    ws.onclose = () => {
      connected = false
      if (disposed) return
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * 2 ** retryCount, 30000)
        retryCount++
        fireStatus({ status: 'reconnecting', retryCount, maxRetries })
        reconnectTimer = setTimeout(connect, delay)
      } else {
        queue.length = 0  // clear stale messages — no reconnect will flush them
        fireStatus({ status: 'disconnected' })
        console.warn(
          `[cortex] WebSocket disconnected after ${maxRetries} retries. ` +
          `Edits will not be saved until the page is refreshed. URL: ${url}`,
        )
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror — reconnection handled there
    }
  }

  connect()

  return {
    send(msg: BrowserToServer): void {
      if (disposed) return
      if (connected && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ...msg, token: capturedToken }))
      } else {
        // Fix 5: cap queue size, drop oldest. Queue raw messages —
        // token is stamped at send time from the closure-captured value
        // (ZF0-1326 Task 1), so the queue itself stays token-free until flush.
        if (queue.length >= MAX_QUEUE_SIZE) {
          queue.shift()
        }
        queue.push(msg)
      }
    },
    onMessage(handler: (msg: ServerToBrowser) => void): () => void {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
    onConnectionChange(handler: (state: ConnectionState) => void): () => void {
      statusHandlers.push(handler)
      return () => {
        const idx = statusHandlers.indexOf(handler)
        if (idx >= 0) statusHandlers.splice(idx, 1)
      }
    },
    get connected(): boolean {
      return connected
    },
    dispose(): void {
      disposed = true
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
        ws.close()
        ws = null
      }
      connected = false
      handlers.length = 0
      statusHandlers.length = 0
      queue.length = 0
    },
  }
}
