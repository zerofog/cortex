import fs from 'fs'
import { randomUUID } from 'node:crypto'
import type { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { ServerChannel } from '../adapters/types.js'
import type { StyleCapability } from './capabilities.js'
import type { EditPipeline } from './edit-pipeline.js'
import type { Telemetry } from '../adapters/telemetry.js'
import { AnnotationStore } from './annotations.js'
import { ActivityLog } from './session/activity-log.js'
import { StagedEditsCache } from './staged-edits.js'
import { CortexLock } from './cortex-lock.js'
import { initialActiveState, type ActiveState } from '../adapters/cortex-active-state.js'

/** Narrow config interface — only the fields CortexSession actually needs.
 *  Adapters (Vite, Next.js) map their framework config to this at the boundary. */
export interface CortexConfig {
  readonly root: string
  readonly mode: string
  /** When set, AnnotationStore hydrates from this file on construction
   *  and write-throughs every mutation. Adapter resolves the path from
   *  the CORTEX_PERSIST_ANNOTATIONS env var. */
  readonly annotationsFilePath?: string
  /** When set, the session acquires a single-writer advisory lock on this
   *  `.cortex/` directory at construction (ZF0-1851) — a second cortex instance
   *  on the same project root fails fast with LockHeldError instead of racing
   *  `.cortex/` writes. Adapters pass `path.join(root, '.cortex')`; unit tests
   *  leave it unset (no lock, no behavior change). */
  readonly cortexDir?: string
  /** Pre-generated nonce to stamp into the lock file instead of a fresh UUID.
   *  The Next adapter passes its runtimeId here, having already advertised it
   *  in __CORTEX_LOCK_FAMILY at config-eval time — so a same-boot sibling
   *  process spawned before this async acquire completes still classifies the
   *  holder as sameFamily. Unset → random per-acquire nonce (Vite/webpack). */
  readonly lockOwnerNonce?: string
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

  // --- Single-writer lock (ZF0-1851) ---
  /** Held when `config.cortexDir` was set and the lock was acquired. `null` when
   *  no cortexDir was given (unit tests) or the `.cortex/` dir was unwritable
   *  (read-only root — degraded, lock-less, same as the pre-ZF0-1851 behavior). */
  private readonly lock: CortexLock | null
  /** This session's lock GENERATION id — stamped into injection.json so
   *  <CortexDevScripts/> can prove the discovery files it read belong to the
   *  live lock's exact acquisition. null when lock-less (read-only root). */
  get lockGeneration(): string | null { return this.lock?.generation ?? null }
  /** Best-effort discovery-file cleanup for natural-drain exits that never run
   *  dispose() (see constructor); detached again in dispose(). */
  private readonly onExitCleanup: () => void

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
  /** Path to .cortex/injection.json (set by adapter, cleaned up on dispose). */
  injectionFilePath: string | null = null
  /** Adapter-owned cleanup for pending httpServer lifecycle listeners. */
  listeningCleanup: (() => void) | null = null

  // --- Telemetry ---
  /** Opt-in telemetry handle. `null` when `CORTEX_TELEMETRY` is unset or
   *  not `'true'`. Set by the adapter (vite.ts / webpack.ts) after session
   *  construction, so tests that construct CortexSession directly remain
   *  unaffected. */
  telemetry: Telemetry | null = null

  // --- Editor state ---
  /** Pillar 1: server-owned activation state. Replaces editorActive as the
   *  source of truth. editorActive is kept as a derived field for the dual-mode
   *  period — readers haven't migrated yet. */
  activeState: ActiveState = initialActiveState
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
    // ZF0-1851: acquire the single-writer lock FIRST — before AnnotationStore's
    // loadAnnotations() reads `.cortex/` and before any later `.cortex/` write.
    // A live conflicting instance throws LockHeldError here, so the adapter's
    // `new CortexSession(...)` throws and it refuses to start. `acquire` returns
    // null (no throw) only when `.cortex/` itself is unwritable — see CortexLock.
    // Natural-drain exits (a transient config evaluator whose bridge is
    // unref'd) run process-exit handlers but never dispose(). This handler
    // removes the discovery files the session wrote, so such an evaluator
    // leaves .cortex/ CLEAN instead of orphaned port/token/injection.json.
    // Registered BEFORE the lock is acquired — exit handlers run in
    // registration order, so the files are deleted while WE still hold the
    // lock; registering after would delete them AFTER the lock's own exit
    // handler released it, a window where a successor may already have
    // acquired and published ITS files (cubic P2). Removed again in dispose()
    // to keep long-lived restart patterns from accumulating listeners.
    this.onExitCleanup = () => {
      for (const filePath of [this.portFilePath, this.tokenFilePath, this.injectionFilePath]) {
        if (!filePath) continue
        try { fs.unlinkSync(filePath) } catch { /* already gone */ }
      }
    }
    process.once('exit', this.onExitCleanup)
    try {
      this.lock = config.cortexDir ? CortexLock.acquire(config.cortexDir, config.lockOwnerNonce) : null
    } catch (err) {
      // A LockHeldError (or any acquire failure) aborts construction. Detach
      // the exit handler we just registered — otherwise Next's conflict retry,
      // which constructs a fresh session per attempt, leaks one 'exit' listener
      // (and this partially-built session) per failed attempt, eventually
      // tripping Node's MaxListenersExceededWarning (cubic P3).
      process.removeListener('exit', this.onExitCleanup)
      throw err
    }
    this.token = randomUUID()
    this.sessionId = randomUUID()
    this.annotations = new AnnotationStore(
      config.annotationsFilePath
        ? { persistence: { filePath: config.annotationsFilePath } }
        : undefined,
    )
    this.activityLog = new ActivityLog()
    this.stagedEdits = new StagedEditsCache()
  }

  /**
   * Synchronously release the .cortex/ single-writer lock without running the
   * full async dispose() (ZF0-1851). Used by adapters for the in-process
   * restart handoff (Vite's configureServer re-entry): we want the new
   * CortexSession to acquire immediately without being blocked by the old
   * session's lingering registry entry, but we DON'T want to await the full
   * async teardown (channel.dispose etc.) before constructing the new session.
   *
   * Idempotent — safe to call before dispose() (which also releases the lock
   * as its last step). Webpack adapters don't need this (no in-process
   * restart pattern); MultiCompiler / double-registration is caught by the
   * registry's same-process guard.
   */
  releaseLockForHandoff(): void {
    this.lock?.release()
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

    // 4. Remove pending HTTP-server lifecycle listeners before file cleanup.
    trySync('http-listening-listener', () => {
      const cleanup = this.listeningCleanup
      this.listeningCleanup = null
      cleanup?.()
    })

    // 5. Remove discovery files — ENOENT is expected (file may already be gone).
    //    Other errors (EPERM, EACCES) surface via the errors array. The
    //    process-exit fallback handler is detached first: dispose() is doing
    //    its job now, and long-lived restart patterns (Vite) must not
    //    accumulate one listener per disposed session.
    trySync('exit-cleanup-detach', () => process.removeListener('exit', this.onExitCleanup))
    for (const [step, prop] of [['port-file', 'portFilePath'], ['token-file', 'tokenFilePath'], ['injection-file', 'injectionFilePath']] as const) {
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

    // 6. Unsubscribe HMR — must precede pipeline dispose to prevent
    //    callbacks firing into a disposed pipeline's verifier.
    trySync('hmr-unsubscribe', () => {
      const unsub = this.hmrUnsubscribe
      this.hmrUnsubscribe = null
      unsub?.()
    })

    // 7. Dispose pipeline before channel — pipeline holds a channel
    //    reference (EditPipeline.dispose() is synchronous today).
    trySync('pipeline', () => {
      const p = this.pipeline
      this.pipeline = null
      p?.dispose()
    })

    // 8. Dispose channel (async — detaches server.hot listeners).
    if (this.channel) {
      try { await this.channel.dispose() } catch (e) { errors.push({ step: 'channel', error: e }) }
      this.channel = null
    }

    // 9. Clear collections and reset flags.
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
    this.listeningCleanup = null

    // 10. Release the single-writer lock LAST — hold ownership of `.cortex/`
    //     until every other resource is torn down, so a successor instance
    //     can't start writing while we're still mid-cleanup. Idempotent and
    //     no-op when no lock was held (no cortexDir / read-only root).
    trySync('lock', () => this.lock?.release())

    if (errors.length > 0) {
      for (const { step, error } of errors) {
        console.error('[cortex] Session dispose failed at step "%s":', step, error)
      }
    }
  }
}
