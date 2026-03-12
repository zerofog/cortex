import { WebSocketServer, WebSocket } from 'ws'
import { createServer, type Server as HttpServer } from 'http'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from '../adapters/types.js'

export interface CortexTransportOptions {
  port?: number
  heartbeatInterval?: number
}

export class CortexTransport implements ServerChannel {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
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
    this.httpServer = createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      ws.on('close', () => this.clients.delete(ws))
      ws.on('message', (raw) => {
        try {
          const parsed: unknown = JSON.parse(raw.toString())
          if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
            for (const h of this.messageHandlers) h(parsed as BrowserToServer)
          }
        } catch {
          // Ignore malformed messages
        }
      })
    })

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.on('error', reject)
      this.httpServer!.listen(this.requestedPort, () => {
        const addr = this.httpServer!.address()
        this.actualPort = typeof addr === 'object' && addr ? addr.port : 0
        this.heartbeatTimer = setInterval(() => {
          for (const ws of this.clients) {
            if (ws.readyState !== WebSocket.OPEN) {
              this.clients.delete(ws)
            } else {
              ws.ping()
            }
          }
        }, this.heartbeatInterval)
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
        ws.send(data)
      }
    }
  }

  onMessage(handler: (msg: BrowserToServer) => void): void {
    this.messageHandlers.push(handler)
  }

  async dispose(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    for (const ws of this.clients) {
      ws.close()
    }
    this.clients.clear()

    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve())
          } else {
            resolve()
          }
        })
      } else if (this.httpServer) {
        this.httpServer.close(() => resolve())
      } else {
        resolve()
      }
    })
  }
}
