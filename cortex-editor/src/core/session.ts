import fs from 'fs'
import type { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { ServerChannel } from '../adapters/types.js'
import type { StyleCapability } from './capabilities.js'
import type { EditPipeline } from './edit-pipeline.js'
import { AnnotationStore } from './annotations.js'
import { ActivityLog } from './session/activity-log.js'

/** Narrow config interface — only the fields CortexSession actually needs.
 *  Adapters (Vite, Next.js) map their framework config to this at the boundary. */
export interface CortexConfig {
  readonly root: string
  readonly mode: string
}

/**
 * Groups all per-server-lifecycle state that was previously scattered across
 * module-level globals in vite.ts. Each Vite dev server restart gets a fresh
 * CortexSession; dispose() cleans up the old one.
 *
 * Design: This is intentionally a state container with public mutable fields,
 * mirroring the module-level `let` variables it replaces. vite.ts reads and
 * writes these fields directly. Callers must check `isDisposed` before writing
 * fields. Encapsulation tightens in later steps (A2-A4) as behaviors migrate
 * into the class.
 *
 * A2 integration note: The channel's own dispose() in vite.ts duplicates some
 * bridge cleanup (heartbeat, clients, WSS, port file). When wiring the session
 * into configureServer, strip that duplication — the session owns all resource
 * lifecycle; the channel should only clean up server.hot listeners.
 */
export class CortexSession {
  // --- Communication ---
  channel: ServerChannel | null = null
  readonly hmrCallbacks: ((files: string[]) => void)[] = []

  // --- Stores ---
  readonly annotations: AnnotationStore
  readonly activityLog: ActivityLog

  // --- CLI WebSocket bridge ---
  cliWss: InstanceType<typeof WebSocketServer> | null = null
  readonly cliClients: Set<InstanceType<typeof WebSocket>> = new Set()
  heartbeatTimer: ReturnType<typeof setInterval> | null = null
  readonly aliveFlags: WeakMap<InstanceType<typeof WebSocket>, boolean> = new WeakMap()
  upgradeHandlerRef: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null
  portFilePath: string | null = null

  // --- Editor state ---
  editorActive = false
  browserConnected = false
  pipeline: EditPipeline | null = null
  hmrUnsubscribe: (() => void) | null = null
  capabilitiesCache: StyleCapability[] | null = null
  readonly recentEditWrites: Set<string> = new Set()

  // --- Config ---
  readonly config: CortexConfig

  // --- Lifecycle ---
  private disposed = false

  get isDisposed(): boolean {
    return this.disposed
  }

  constructor(config: CortexConfig) {
    this.config = config
    this.annotations = new AnnotationStore()
    this.activityLog = new ActivityLog()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    // Each step is wrapped in try/catch so a failure in one step does not
    // prevent subsequent steps from running. Errors are collected and
    // logged at the end.
    const errors: unknown[] = []
    const trySync = (fn: () => void) => { try { fn() } catch (e) { errors.push(e) } }

    // 1. Stop heartbeat — must precede client termination to prevent
    //    a timer tick from pinging already-terminated sockets.
    trySync(() => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
      }
    })

    // 2. Terminate CLI clients — must precede WSS close so the close
    //    frames go out on a still-open server.
    trySync(() => {
      for (const client of this.cliClients) client.terminate()
      this.cliClients.clear()
    })

    // 3. Close CLI WebSocket server.
    trySync(() => {
      if (this.cliWss) {
        this.cliWss.close()
        this.cliWss = null
      }
    })

    // 4. Remove port file — non-fatal (file may already be gone).
    trySync(() => {
      if (this.portFilePath) {
        try { fs.unlinkSync(this.portFilePath) } catch { /* ENOENT is expected */ }
        this.portFilePath = null
      }
    })

    // 5. Unsubscribe HMR — must precede pipeline dispose to prevent
    //    callbacks firing into a disposed pipeline's verifier.
    if (this.hmrUnsubscribe) {
      trySync(() => this.hmrUnsubscribe!())
      this.hmrUnsubscribe = null
    }

    // 6. Dispose pipeline before channel — pipeline holds a channel
    //    reference (EditPipeline.dispose() is synchronous today).
    if (this.pipeline) {
      trySync(() => this.pipeline!.dispose())
      this.pipeline = null
    }

    // 7. Dispose channel (async — detaches server.hot listeners).
    if (this.channel) {
      try { await this.channel.dispose() } catch (e) { errors.push(e) }
      this.channel = null
    }

    // 8. Clear collections and reset flags.
    this.hmrCallbacks.length = 0
    this.recentEditWrites.clear()
    this.editorActive = false
    this.browserConnected = false
    this.capabilitiesCache = null
    this.upgradeHandlerRef = null

    if (errors.length > 0) {
      console.warn('[cortex] Session dispose encountered errors:', errors)
    }
  }
}
