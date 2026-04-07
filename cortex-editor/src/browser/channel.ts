import type { BrowserToServer, ConnectionState, CortexChannel, ServerToBrowser } from '../adapters/types.js'
import './types.js' // Window augmentation (__cortex_send__, __cortex_channel__, __cortex_ws_port__)

/** Max queued messages during WebSocket disconnection (Fix 5) */
const MAX_QUEUE_SIZE = 100

/**
 * Create a channel using Vite HMR custom events.
 * Requires window.__cortex_send__ (injected by the Vite adapter CLIENT_SCRIPT).
 */
export function createViteChannel(): CortexChannel {
  const handlers: Array<(msg: ServerToBrowser) => void> = []

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
      window.__cortex_send__?.({ ...msg, token: window.__CORTEX_TOKEN__ })
    },
    onMessage(handler: (msg: ServerToBrowser) => void): () => void {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
    onConnectionChange(_handler: (state: ConnectionState) => void): () => void {
      // Vite HMR channels are always connected — no reconnection lifecycle.
      // Stub satisfies the interface; real state emission added in Task 2.
      return () => {}
    },
    get connected(): boolean {
      return typeof window.__cortex_send__ === 'function'
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
 */
export function createWebSocketChannel(options?: WebSocketChannelOptions): CortexChannel {
  const port = window.__cortex_ws_port__ ?? 24678
  const defaultProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = options?.url ?? `${defaultProtocol}//${location.hostname}:${port}/cortex`
  const maxRetries = options?.maxRetries ?? 5

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
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected = true
      retryCount = 0
      fireStatus({ status: 'connected' })
      // Flush queued messages — stamp token at send time (not enqueue time)
      // so reconnection to a restarted server uses the fresh token.
      while (queue.length > 0) {
        const msg = queue.shift()!
        ws!.send(JSON.stringify({ ...msg, token: window.__CORTEX_TOKEN__ }))
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
        ws.send(JSON.stringify({ ...msg, token: window.__CORTEX_TOKEN__ }))
      } else {
        // Fix 5: cap queue size, drop oldest. Queue raw messages —
        // token is stamped at send time, not enqueue time, so reconnection
        // to a restarted server uses the fresh token from window globals.
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
