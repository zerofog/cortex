import fs from 'fs'
import type { ResolvedConfig } from 'vite'
import type { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { ServerChannel } from '../adapters/types.js'
import type { StyleCapability } from './capabilities.js'
import type { EditPipeline } from './edit-pipeline.js'
import { AnnotationStore } from './annotations.js'
import { ActivityLog } from './session/activity-log.js'

/**
 * Groups all per-server-lifecycle state that was previously scattered across
 * module-level globals in vite.ts. Each Vite dev server restart gets a fresh
 * CortexSession; dispose() cleans up the old one.
 *
 * Design: This is intentionally a state container with public mutable fields,
 * mirroring the module-level `let` variables it replaces. vite.ts reads and
 * writes these fields directly. Encapsulation tightens in later steps (A2-A4)
 * as behaviors migrate into the class.
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
  readonly config: ResolvedConfig

  // --- Lifecycle ---
  private disposed = false

  get isDisposed(): boolean {
    return this.disposed
  }

  constructor(config: ResolvedConfig) {
    this.config = config
    this.annotations = new AnnotationStore()
    this.activityLog = new ActivityLog()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    // 1. Stop heartbeat — must precede client termination to prevent
    //    a timer tick from pinging already-terminated sockets.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // 2. Terminate CLI clients — must precede WSS close so the close
    //    frames go out on a still-open server.
    for (const client of this.cliClients) client.terminate()
    this.cliClients.clear()

    // 3. Close CLI WebSocket server.
    if (this.cliWss) {
      this.cliWss.close()
      this.cliWss = null
    }

    // 4. Remove port file — non-fatal (file may already be gone).
    if (this.portFilePath) {
      try { fs.unlinkSync(this.portFilePath) } catch { /* ENOENT is expected */ }
      this.portFilePath = null
    }

    // 5. Dispose pipeline before channel — pipeline dispose is synchronous
    //    today (EditPipeline.dispose(): void), but must precede channel
    //    teardown since pipeline holds a channel reference.
    if (this.pipeline) {
      this.pipeline.dispose()
      this.pipeline = null
    }

    // 6. Dispose channel (async — may need to detach server.hot listeners).
    if (this.channel) {
      await this.channel.dispose()
      this.channel = null
    }

    // 7. Unsubscribe HMR callback.
    if (this.hmrUnsubscribe) {
      this.hmrUnsubscribe()
      this.hmrUnsubscribe = null
    }

    // 8. Clear collections and reset flags.
    this.hmrCallbacks.length = 0
    this.recentEditWrites.clear()
    this.editorActive = false
    this.browserConnected = false
    this.capabilitiesCache = null
    this.upgradeHandlerRef = null
  }
}
