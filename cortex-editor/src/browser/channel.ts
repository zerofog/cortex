import type { BrowserToServer, CortexChannel, ServerToBrowser } from '../adapters/types.js'
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
  window.__cortex_channel__ = {
    handleServerMessage(data: ServerToBrowser) {
      for (const h of [...handlers]) {
        try { h(data) } catch (err) {
          console.warn('[cortex] Message handler error:', err instanceof Error ? err.message : err)
        }
      }
    },
  }

  return {
    send(msg: BrowserToServer): void {
      window.__cortex_send__?.(msg)
    },
    onMessage(handler: (msg: ServerToBrowser) => void): () => void {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
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
  const queue: BrowserToServer[] = []
  let ws: WebSocket | null = null
  let connected = false
  let retryCount = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function connect(): void {
    if (disposed) return
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected = true
      retryCount = 0
      // Flush queued messages
      while (queue.length > 0) {
        const msg = queue.shift()!
        ws!.send(JSON.stringify(msg))
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
        reconnectTimer = setTimeout(connect, delay)
      } else {
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
      if (connected && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
      } else {
        // Fix 5: cap queue size, drop oldest
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
      queue.length = 0
    },
  }
}
