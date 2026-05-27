import fs from 'node:fs'
import path from 'node:path'
import { atomicWrite } from './atomic-write.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Schema for `.cortex/usage.json`. This is a STATE document, not an event
 * log — fields are updated in-place rather than appended. Unbounded growth
 * is intentionally avoided (the file is read back on every activation and
 * should remain tiny).
 */
export interface UsageState {
  /** Schema version — currently always `1`. */
  readonly version: 1
  /** ISO date string (`YYYY-MM-DD`) of the first ever activation on this machine. */
  firstActivationDate?: string
  /** ISO date string (`YYYY-MM-DD`) of the most-recent activation. Used to detect
   *  return sessions (day changed since last activation). */
  lastActivationDate?: string
  /** Set to `true` after the first successful source-file write. Never reset. */
  firstEditRecorded?: boolean
}

/**
 * Telemetry handle returned by {@link createTelemetry}. When disabled, all
 * methods are no-ops and resolve immediately without any I/O.
 */
export interface Telemetry {
  /** Emit `cortex_init` — call once when `cortex init` completes setup. */
  recordInit(): Promise<void>
  /**
   * Emit `editor_activated`. Also emits `return_session` when the last
   * activation was on a different calendar day. Updates `lastActivationDate`
   * (and sets `firstActivationDate` on first ever call) in usage.json.
   */
  recordActivation(): Promise<void>
  /**
   * Emit `first_edit` once per project lifetime. No-op if
   * `firstEditRecorded` is already `true` in usage.json.
   */
  recordFirstEdit(): Promise<void>
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for {@link createTelemetry}. All non-`enabled`
 * fields default to production implementations; tests supply spies/stubs so
 * no real I/O or network calls are made.
 */
export interface TelemetryOptions {
  /** When `false` (the default when `CORTEX_TELEMETRY` is unset), the
   *  returned object is fully inert — no file writes, no fetches. */
  readonly enabled: boolean
  /** Optional remote POST endpoint (`http:`/`https:` only). When omitted, all
   *  events are local-only. */
  readonly endpoint: string | undefined
  /** Absolute path to the project root. usage.json is written to
   *  `<cortexRoot>/.cortex/usage.json`. */
  readonly cortexRoot: string
  /** cortex-editor package version — included as `cortexVersion` in remote
   *  payloads so the backend can bucket by release. */
  readonly version: string
  /** Clock injectable for deterministic date strings in tests. */
  readonly now?: () => Date
  /** Fetch injectable so tests never touch the network. Defaults to global
   *  `fetch`. */
  readonly fetchImpl?: typeof fetch
  /** `fs.readFileSync` injectable. Defaults to the real `fs.readFileSync`. */
  readonly readFileSync?: (path: string, encoding: BufferEncoding) => string
  /** Atomic-write injectable. Defaults to {@link atomicWrite}. */
  readonly writeFile?: (filePath: string, content: string) => Promise<void>
  /** `fs.mkdirSync` injectable. Defaults to the real `fs.mkdirSync`. */
  readonly mkdirSync?: (
    dirPath: string,
    options: { recursive: true; mode: number },
  ) => void
}

// ---------------------------------------------------------------------------
// No-op sentinel (returned when disabled)
// ---------------------------------------------------------------------------

const NOOP: Telemetry = {
  async recordInit() {},
  async recordActivation() {},
  async recordFirstEdit() {},
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `Telemetry` instance. When `options.enabled` is `false`, returns
 * a fully inert no-op object — no `.cortex/` directory is created, no
 * `usage.json` is touched, no network traffic is generated.
 *
 * Privacy contract:
 * - Remote POST bodies contain ONLY `{event, ts, cortexVersion}` — never
 *   file paths, project names, usernames, hostnames, or machine identifiers.
 * - All local I/O and network errors are swallowed; telemetry must never
 *   throw into the caller or block the normal dev-server workflow.
 */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  if (!options.enabled) return NOOP

  const {
    endpoint,
    cortexRoot,
    version,
    now,
    fetchImpl = fetch,
    readFileSync: readFileSyncImpl = (p, enc) => fs.readFileSync(p, enc),
    writeFile: writeFileImpl = atomicWrite,
    mkdirSync: mkdirSyncImpl = (d, opts) => { fs.mkdirSync(d, opts) },
  } = options

  const usagePath = path.join(cortexRoot, '.cortex', 'usage.json')
  const cortexDir = path.join(cortexRoot, '.cortex')

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /** Returns today as `YYYY-MM-DD` in UTC. */
  function today(): string {
    return (now?.() ?? new Date()).toISOString().slice(0, 10)
  }

  /**
   * Read the current usage.json from disk. Returns `null` when the file does
   * not exist yet (ENOENT) or cannot be parsed — callers treat `null` as an
   * empty initial state.
   */
  function readState(): UsageState | null {
    try {
      const raw = readFileSyncImpl(usagePath, 'utf-8')
      return JSON.parse(raw) as UsageState
    } catch {
      return null
    }
  }

  /**
   * Ensure `.cortex/` exists, then atomically write the new state.
   * All errors are swallowed — telemetry is best-effort.
   */
  async function persistState(state: UsageState): Promise<void> {
    try {
      mkdirSyncImpl(cortexDir, { recursive: true, mode: 0o700 })
      await writeFileImpl(usagePath, JSON.stringify(state, null, 2))
    } catch {
      // Swallow — telemetry must never throw into the caller.
    }
  }

  /**
   * Emit a single telemetry event:
   * 1. (Local sink) Trigger a state update via `persistState`.
   * 2. (Remote sink) Fire-and-forget POST to `endpoint` when set.
   *
   * No PII: the payload contains ONLY `event`, `ts`, and `cortexVersion`.
   * Never include paths, usernames, hostnames, or machine identifiers.
   */
  function emit(event: string): void {
    if (endpoint) {
      const payload = {
        event,
        ts: (now?.() ?? new Date()).toISOString(),
        cortexVersion: version,
      }
      void fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {})
    }
  }

  // ------------------------------------------------------------------
  // Write serialization
  // ------------------------------------------------------------------

  // recordActivation and recordFirstEdit are both fire-and-forget (`void`) from
  // their call sites (vite activation hook + edit-pipeline writeFile wrapper), so
  // a user who activates then immediately applies an edit triggers two
  // read-modify-write cycles on usage.json concurrently. Without serialization
  // the last write wins and silently drops the other's fields — e.g. activation
  // overwrites `firstEditRecorded` (re-emitting first_edit later) or first-edit
  // drops `lastActivationDate` (breaking return-session detection, the metric
  // this whole module exists for). A per-instance promise-chain tail makes each
  // read-modify-write atomic w.r.t. the others; each task re-reads the state the
  // previous one persisted. Mirrors EditPipeline's `undoLock` pattern.
  let tail: Promise<void> = Promise.resolve()
  function serialize(task: () => Promise<void>): Promise<void> {
    // `.then(task, task)` runs the next task regardless of whether the prior
    // settled or rejected; the chain must never wedge on one failed write.
    const run = tail.then(task, task)
    tail = run.catch(() => {})
    return run
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return {
    recordInit(): Promise<void> {
      return serialize(async () => {
        emit('cortex_init')
        const state = readState() ?? ({ version: 1 } as UsageState)
        await persistState(state)
      })
    },

    recordActivation(): Promise<void> {
      return serialize(async () => {
        const todayStr = today()
        const state = readState() ?? ({ version: 1 } as UsageState)

        // Detect return session BEFORE updating lastActivationDate.
        const isReturnSession =
          state.lastActivationDate !== undefined &&
          state.lastActivationDate !== todayStr

        emit('editor_activated')
        if (isReturnSession) emit('return_session')

        const updated: UsageState = {
          ...state,
          firstActivationDate: state.firstActivationDate ?? todayStr,
          lastActivationDate: todayStr,
        }
        await persistState(updated)
      })
    },

    recordFirstEdit(): Promise<void> {
      return serialize(async () => {
        const state = readState() ?? ({ version: 1 } as UsageState)
        if (state.firstEditRecorded) return

        emit('first_edit')
        const updated: UsageState = { ...state, firstEditRecorded: true }
        await persistState(updated)
      })
    },
  }
}
