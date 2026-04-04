import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { createServer, type Server as HttpServer, type IncomingMessage } from 'http'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from '../adapters/types.js'

export interface CortexTransportOptions {
  port?: number
  heartbeatInterval?: number
}

const ALLOWED_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

export class CortexTransport implements ServerChannel {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private aliveFlags = new WeakMap<WebSocket, boolean>()
  private messageHandlers: ((msg: BrowserToServer) => void)[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly heartbeatInterval: number
  private readonly requestedPort: number
  private actualPort = 0

  constructor(options?: CortexTransportOptions) {
    this.requestedPort = options?.port ?? 0
    this.heartbeatInterval = options?.heartbeatInterval ?? 30_000
  }

  get port(): number {
    return this.actualPort
  }

  async start(): Promise<void> {
    if (this.httpServer) throw new Error('CortexTransport already started')

    // Assign synchronously so concurrent start() calls hit the guard above
    this.httpServer = createServer()
    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: 64 * 1024,
      verifyClient: ({ origin }: { origin: string; req: IncomingMessage }, cb: (ok: boolean, code?: number, msg?: string) => void) => {
        // Non-browser clients (CLI, tests) send no Origin header.
        // Reject origin === 'null' (sent by sandboxed iframes, data: URIs) to prevent CSWSH bypass.
        const allowed = !origin || ALLOWED_ORIGINS.test(origin)
        cb(allowed, allowed ? undefined : 403, allowed ? undefined : 'Forbidden')
      },
    })

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws)
      this.aliveFlags.set(ws, true)
      ws.on('pong', () => this.aliveFlags.set(ws, true))
      ws.on('error', (err) => {
        console.warn('[cortex] WebSocket client error:', err.message)
        this.clients.delete(ws)
      })
      ws.on('close', () => this.clients.delete(ws))
      ws.on('message', (raw: RawData) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw.toString())
        } catch {
          return // malformed JSON — nothing to do
        }
        if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
          const handlers = [...this.messageHandlers]
          for (const h of handlers) {
            try { h(parsed as BrowserToServer) } catch (err) {
              console.warn('[cortex] Message handler error:', err instanceof Error ? err.message : err)
            }
          }
        }
      })
    })

    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        // Clean up half-initialized state so the instance can be retried or disposed
        this.wss?.close()
        this.httpServer?.close()
        this.wss = null
        this.httpServer = null
        reject(err)
      }
      this.httpServer!.once('error', onError)
      this.httpServer!.listen(this.requestedPort, '127.0.0.1', () => {
        this.httpServer!.removeListener('error', onError)
        const addr = this.httpServer!.address()
        this.actualPort = typeof addr === 'object' && addr ? addr.port : 0
        this.heartbeatTimer = setInterval(() => {
          for (const ws of this.clients) {
            if (!this.aliveFlags.get(ws)) {
              ws.terminate()
              this.clients.delete(ws)
            } else {
              this.aliveFlags.set(ws, false)
              try { ws.ping() } catch { this.clients.delete(ws) }
            }
          }
        }, this.heartbeatInterval)
        this.heartbeatTimer.unref()
        resolve()
      })
    })
  }

  send(msg: ServerToBrowser): void {
    this.broadcast(msg)
  }

  broadcast(msg: ServerToBrowser): void {
    const data = JSON.stringify(msg)
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data) } catch { this.clients.delete(ws) }
      }
    }
  }

  onMessage(handler: (msg: BrowserToServer) => void): () => void {
    this.messageHandlers.push(handler)
    return () => {
      const idx = this.messageHandlers.indexOf(handler)
      if (idx >= 0) this.messageHandlers.splice(idx, 1)
    }
  }

  async dispose(): Promise<void> {
    if (!this.httpServer) return // already disposed or never started

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // Capture refs and null out to guard against concurrent dispose
    const wss = this.wss
    const http = this.httpServer
    this.wss = null
    this.httpServer = null

    for (const ws of this.clients) {
      ws.terminate()
    }
    this.clients.clear()
    this.messageHandlers.length = 0

    await new Promise<void>((resolve) => {
      if (wss) {
        wss.close(() => {
          if (http) {
            http.close(() => resolve())
          } else {
            resolve()
          }
        })
      } else if (http) {
        http.close(() => resolve())
      } else {
        resolve()
      }
    })
  }
}
