import fs from 'fs'
import { randomUUID } from 'node:crypto'
import type { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { ServerChannel } from '../adapters/types.js'
import type { StyleCapability } from './capabilities.js'
import type { EditPipeline } from './edit-pipeline.js'
import { AnnotationStore } from './annotations.js'
import { ActivityLog } from './session/activity-log.js'
import { StagedEditsCache } from './staged-edits.js'

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
  readonly stagedEdits: StagedEditsCache

  // --- Auth + Session ---
  /** Per-instance auth token — prevents cross-project writes on localhost. */
  readonly token: string
  /** Per-instance session ID — scopes broadcasts to prevent cross-tab contamination. */
  readonly sessionId: string
  /** Path to .cortex/token file (set by adapter, cleaned up on dispose). */
  tokenFilePath: string | null = null

  // --- CLI WebSocket bridge ---
  cliWss: WebSocketServer | null = null
  readonly cliClients: Set<WebSocket> = new Set()
  heartbeatTimer: ReturnType<typeof setInterval> | null = null
  readonly aliveFlags: WeakMap<WebSocket, boolean> = new WeakMap()
  upgradeHandlerRef: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null
  portFilePath: string | null = null

  // --- Editor state ---
  editorActive = false
  browserConnected = false
  pipeline: EditPipeline | null = null
  hmrUnsubscribe: (() => void) | null = null
  capabilitiesCache: StyleCapability[] | null = null
  /** Paths currently in their HMR-suppression TTL window. Value is the
   *  timer that will evict the entry when its 500ms expires.
   *
   *  Map<path, timer> (not Set<path>) so rapid consecutive writes to the
   *  same path can call clearTimeout on the previous timer before arming
   *  a fresh one (refreshing-timeout pattern). A plain Set with an
   *  independent timer per add would stack timers — timer #1 would fire
   *  and evict mid-window, re-exposing the file to HMR flicker between
   *  timer #1 and timer #2.
   *
   *  Entry presence is checked via `.has(path)` by handleHotUpdate; the
   *  timer values themselves are only read by performEditWrite when it
   *  needs to cancel a stale timer before arming a new one. */
  readonly recentEditWriteTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // --- Config ---
  readonly config: CortexConfig

  // --- Lifecycle ---
  private disposed = false

  get isDisposed(): boolean {
    return this.disposed
  }

  constructor(config: CortexConfig) {
    this.config = config
    this.token = randomUUID()
    this.sessionId = randomUUID()
    this.annotations = new AnnotationStore()
    this.activityLog = new ActivityLog()
    this.stagedEdits = new StagedEditsCache()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    // Each step is wrapped in try/catch so a failure in one step does not
    // prevent subsequent steps from running. Errors are collected and
    // logged at the end.
    const errors: { step: string; error: unknown }[] = []
    const trySync = (step: string, fn: () => void) => {
      try { fn() } catch (e) { errors.push({ step, error: e }) }
    }

    // 1. Stop heartbeat — must precede client termination to prevent
    //    a timer tick from pinging already-terminated sockets.
    trySync('heartbeat', () => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
      }
    })

    // 2. Terminate CLI clients — must precede WSS close so termination
    //    is processed while the server is still listening.
    trySync('cli-clients', () => {
      for (const client of this.cliClients) client.terminate()
      this.cliClients.clear()
    })

    // 3. Close CLI WebSocket server.
    trySync('cli-wss', () => {
      if (this.cliWss) {
        this.cliWss.close()
        this.cliWss = null
      }
    })

    // 4. Remove discovery files — ENOENT is expected (file may already be gone).
    //    Other errors (EPERM, EACCES) surface via the errors array.
    for (const [step, prop] of [['port-file', 'portFilePath'], ['token-file', 'tokenFilePath']] as const) {
      if (this[prop]) {
        try {
          fs.unlinkSync(this[prop]!)
        } catch (e) {
          const code = e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
          if (code !== 'ENOENT') errors.push({ step, error: e })
        }
        this[prop] = null
      }
    }

    // 5. Unsubscribe HMR — must precede pipeline dispose to prevent
    //    callbacks firing into a disposed pipeline's verifier.
    trySync('hmr-unsubscribe', () => {
      const unsub = this.hmrUnsubscribe
      this.hmrUnsubscribe = null
      unsub?.()
    })

    // 6. Dispose pipeline before channel — pipeline holds a channel
    //    reference (EditPipeline.dispose() is synchronous today).
    trySync('pipeline', () => {
      const p = this.pipeline
      this.pipeline = null
      p?.dispose()
    })

    // 7. Dispose channel (async — detaches server.hot listeners).
    if (this.channel) {
      try { await this.channel.dispose() } catch (e) { errors.push({ step: 'channel', error: e }) }
      this.channel = null
    }

    // 8. Clear collections and reset flags.
    this.hmrCallbacks.length = 0
    // Cancel pending timers before clearing — otherwise they fire into
    // a disposed Map (harmless optional chaining) but keep the event
    // loop alive for up to 500ms. timer.unref() in performEditWrite
    // covers process exit, but clearTimeout here gives deterministic
    // cleanup during hot-restart and tests.
    for (const timer of this.recentEditWriteTimers.values()) clearTimeout(timer)
    this.recentEditWriteTimers.clear()
    this.editorActive = false
    this.browserConnected = false
    this.capabilitiesCache = null
    this.upgradeHandlerRef = null

    if (errors.length > 0) {
      for (const { step, error } of errors) {
        console.error('[cortex] Session dispose failed at step "%s":', step, error)
      }
    }
  }
}
