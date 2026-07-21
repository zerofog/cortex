import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Single-writer advisory lock on a project's `.cortex/` directory (ZF0-1851).
 *
 * Before this, two cortex dev servers on the same project root relied on
 * `EADDRINUSE` (port-bind failure) as a de-facto single-writer guard — implicit,
 * and structurally racy: instance #2 constructs CortexSession (which reads, and
 * could write, `.cortex/`) BEFORE it ever attempts the port bind. This makes the
 * single-writer guarantee explicit: instance #2 fails fast, before touching
 * `.cortex/`, with a clear error.
 *
 * Mechanism (atomic placement via write-then-link): each acquire writes the
 * fully-populated lock content to a uniquely-named temp file, then atomically
 * hard-links it to `.cortex/.lock` via `fs.linkSync`. `linkSync` fails with
 * EEXIST if the target already exists, so the lock file is either fully present
 * (live holder or stale-for-reclaim) or absent — never partially written. The
 * older `openSync('wx')` + `writeSync` pattern had a small window where the
 * file existed but was empty; a concurrent acquirer hitting EEXIST in that gap
 * would classify the in-progress lock as "corrupt → stale" and reclaim it,
 * defeating the single-writer guarantee. Stale recovery uses `fs.renameSync`
 * as the atomic compare-and-take.
 *
 * The lock file holds the owner's pid (for cross-process liveness via
 * `process.kill(pid, 0)`) plus a per-instance nonce (so release() only unlinks
 * a file THIS instance still owns — handles Vite in-process restart). This is
 * an *advisory* lock coordinating cooperating cortex instances, not OS-enforced
 * mutual exclusion.
 *
 * Not `proper-lockfile`: cortex-editor is a published package kept deliberately
 * lean on runtime deps, and the need here is a single acquire-at-startup /
 * hold-for-session / release-on-exit — not the retry-under-contention pattern
 * that library is built for.
 */

interface LockFileContents {
  /** OS process id of the cortex instance that owns the lock — cross-process
   *  liveness key (is the holder alive → conflict, vs dead → stale + reclaim). */
  pid: number
  /** Unique per-CortexLock-instance id. pid alone is insufficient: a Vite dev
   *  server restarts `configureServer` IN-PROCESS, so the old and new sessions
   *  share a pid. release() matches on nonce so the old session's delayed
   *  release cannot unlink the new session's freshly-acquired lock file. */
  nonce: string
  /** Date.now() at acquisition — purely diagnostic (helps a human reading the file). */
  startedAt: number
}

/** Thrown by {@link CortexLock.acquire} when a *live* cortex instance already
 *  owns the project's `.cortex/` directory. `inProcess` is true when the
 *  conflict is a second acquire in the SAME Node runtime (webpack MultiCompiler
 *  or double plugin registration) — the recovery advice in that case is to
 *  dispose / handoff the prior instance, NOT to delete the lock file (which
 *  would yank it from a still-live owner). For cross-process conflicts,
 *  deleting a genuinely-stale file is the correct manual recovery. */
export class LockHeldError extends Error {
  /**
   * `sameFamily` is true when the live holder's nonce appears in this process's
   * inherited `__CORTEX_LOCK_FAMILY` env — i.e. the holder is the SAME boot's
   * bridge in an ancestor/sibling process, not a conflicting second dev server.
   * `next dev` evaluates next.config in more than one process per boot (the CLI
   * process and the dev server it spawns, which inherits the env); the losing
   * evaluation must go inert SILENTLY. Callers should suppress the warning when
   * this is set — a normal boot must never print a lock conflict.
   */
  constructor(
    readonly lockPath: string,
    readonly holderPid: number,
    readonly inProcess: boolean = false,
    readonly sameFamily: boolean = false,
  ) {
    const tail = inProcess
      ? `Another CortexSession instance in this Node process still holds the lock — ` +
        `this usually means webpack MultiCompiler or the plugin was registered twice. ` +
        `Dispose the prior session (or call releaseLockForHandoff() before reacquiring) ` +
        `before constructing a new one. Do NOT delete the lock file — it is actively held.`
      : `Only one cortex dev server can run per project root. ` +
        `If that process is gone, delete the stale lock file: ${lockPath}`
    super(
      `[cortex] Another cortex instance (pid ${holderPid}) already owns this ` +
        `project's .cortex/ directory. ${tail}`,
    )
    this.name = 'LockHeldError'
  }
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code
}

/** Parse a lock file. Returns null if the file is missing, unreadable, or not
 *  the JSON shape we wrote — all of which mean "treat as stale and reclaim" (a
 *  corrupt lock file can't be meaningfully owned by anyone).
 *
 *  pid > 0 is required: passing 0 or a negative pid to `process.kill(pid, 0)`
 *  has special process-group semantics (0 = current group, -N = group N) and
 *  would produce wrong "alive" verdicts. A file claiming such a pid is treated
 *  as corrupt rather than as a legitimate holder. */
function readLockFile(lockPath: string): LockFileContents | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LockFileContents>
    if (
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.nonce === 'string'
    ) {
      return { pid: parsed.pid, nonce: parsed.nonce, startedAt: parsed.startedAt ?? 0 }
    }
    return null
  } catch {
    return null
  }
}

/** Is `pid` a live process? `process.kill(pid, 0)` sends no signal — it only
 *  probes existence. ESRCH = no such process (dead). EPERM = exists but owned by
 *  another user (alive). Any other outcome: assume alive (conservative — a false
 *  "alive" just refuses startup; a false "dead" would wrongly reclaim). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if (isErrno(err, 'ESRCH')) return false
    return true
  }
}

/**
 * In-memory registry of active locks held by THIS process, keyed by the
 * resolved lockPath. Catches the same-process concurrent-acquire case that
 * cross-process pid checks miss: webpack MultiCompiler, the plugin registered
 * twice, or any future setup that spins up two CortexSession instances on the
 * same cortexDir in one Node runtime. Both would carry the same pid; only an
 * in-memory record can tell "live conflict" from "Vite restart handoff."
 *
 * The Vite-restart path is therefore explicit: adapters must call
 * CortexSession.releaseLockForHandoff() on the old session BEFORE constructing
 * the new one — that synchronously removes the old lock from this registry so
 * the new acquire sees an empty slot. Without that explicit handoff, the
 * second acquire is treated (correctly) as a concurrent conflict.
 *
 * Parked on globalThis, NOT module scope: a dual-format package can be loaded
 * twice into one process (the CJS build by Next's config loader, the ESM build
 * elsewhere). With a module-scoped Map, the second module instance would miss
 * the in-process guard, read its OWN pid from the live lock file, classify it
 * "stale (our own leak)" and steal a live lock. One per-realm registry closes
 * that hole. Only .has/.get/.set/.delete are used, so structurally-identical
 * CortexLock instances from either module copy interoperate.
 */
const LOCK_REGISTRY_KEY = Symbol.for('cortex-editor.lock-registry')

function activeLocks(): Map<string, CortexLock> {
  const holder = globalThis as unknown as Record<symbol, Map<string, CortexLock> | undefined>
  return (holder[LOCK_REGISTRY_KEY] ??= new Map())
}

/**
 * Boot-family nonce propagation. When a lock is acquired, its nonce is appended
 * to `__CORTEX_LOCK_FAMILY` in this process's env; children spawned AFTER that
 * inherit it. A later acquire that loses to a live holder whose nonce is in the
 * inherited list knows the holder is the same boot's bridge (the `next dev` CLI
 * process vs the dev-server child it spawns) rather than a second dev server —
 * and refuses silently. Capped so long-lived test processes acquiring many
 * locks don't grow the env var unboundedly.
 */
const FAMILY_ENV = '__CORTEX_LOCK_FAMILY'
/** Leak guard, not a working-set bound: eviction of a nonce whose lock is
 *  still ACTIVE would make a same-boot sibling classify that holder as a
 *  foreign conflict (cubic P2). With dedupe + adoption a family carries ~one
 *  nonce per project root, so 32 makes live-nonce eviction implausible while
 *  still capping pathological growth. */
const FAMILY_MAX = 32

function familyNonces(): string[] {
  return (process.env[FAMILY_ENV] ?? '').split(',').filter(Boolean)
}

/** Nonces THIS module instance advertised itself — everything else in the env
 *  list was inherited from an ancestor (or a sibling module instance, which is
 *  equally "same family"). */
const selfAdvertisedNonces = new Set<string>()

function addFamilyNonce(nonce: string): void {
  selfAdvertisedNonces.add(nonce)
  if (familyNonces().includes(nonce)) return
  process.env[FAMILY_ENV] = [...familyNonces(), nonce].slice(-FAMILY_MAX).join(',')
}

/** Most recent INHERITED family nonce (present in env, not advertised by this
 *  module instance), or null.
 *
 *  A config-evaluating process spawned by a cortex-advertising parent should
 *  ADOPT this as its own lock nonce instead of minting a fresh one — that
 *  makes the family classification work in BOTH race directions. Env flows
 *  parent→child only: if the child locks with a fresh nonce B and wins, the
 *  parent (family = [A]) would classify B as foreign, warn, and disable its
 *  loader — the codex P1. With adoption both processes lock as A, so
 *  whichever loses finds the winner's nonce in its family list. */
export function inheritedLockFamilyNonce(): string | null {
  const nonces = familyNonces()
  for (let i = nonces.length - 1; i >= 0; i--) {
    if (!selfAdvertisedNonces.has(nonces[i]!)) return nonces[i]!
  }
  return null
}

/** Advertise a nonce to future child processes BEFORE the (async) bridge
 *  construction acquires the lock with it. The Next adapter calls this
 *  synchronously during config evaluation with the runtimeId it will pass as
 *  `lockOwnerNonce` — so even a sibling process spawned in the window between
 *  config eval and lock acquisition inherits the nonce and classifies the
 *  eventual holder as sameFamily. Idempotent. */
export function advertiseLockFamilyNonce(nonce: string): void {
  addFamilyNonce(nonce)
}

function removeFamilyNonce(nonce: string): void {
  const remaining = familyNonces().filter((candidate) => candidate !== nonce)
  if (remaining.length === 0) delete process.env[FAMILY_ENV]
  else process.env[FAMILY_ENV] = remaining.join(',')
}

/** Liveness classification of a project's `.cortex/.lock` for consumers that
 *  need to know whether the discovery files next to it belong to a RUNNING
 *  bridge (e.g. <CortexDevScripts/> refusing to inject a dead port/token left
 *  behind by a hard-killed dev server).
 *
 *  Windows caveat: `live` relies on pid-existence, which PID reuse can fake.
 *  That errs on the safe side for every consumer here — a false `live` merely
 *  injects a snippet whose WS connect fails, and a false conflict refuses
 *  startup with a remediation message; neither deletes another owner's state. */
export type CortexLockLiveness = 'live' | 'stale' | 'missing' | 'corrupt'

export interface CortexLockInspection {
  liveness: CortexLockLiveness
  /** Owner nonce when the lock file is readable; null for missing/corrupt.
   *  Consumers use it to bind discovery-file CONTENTS to the live owner: the
   *  bridge stamps this nonce into injection.json, so files written by a
   *  predecessor generation are detectable even while a successor's lock is
   *  live (the acquire→publish handoff window). */
  holderNonce: string | null
}

export function inspectCortexLock(cortexDir: string): CortexLockInspection {
  const lockPath = path.join(cortexDir, '.lock')
  try {
    fs.accessSync(lockPath)
  } catch {
    return { liveness: 'missing', holderNonce: null }
  }
  const holder = readLockFile(lockPath)
  if (holder === null) return { liveness: 'corrupt', holderNonce: null }
  return { liveness: isProcessAlive(holder.pid) ? 'live' : 'stale', holderNonce: holder.nonce }
}

export function checkCortexLockLiveness(cortexDir: string): CortexLockLiveness {
  return inspectCortexLock(cortexDir).liveness
}

export class CortexLock {
  private released = false
  private readonly onExit: () => void

  private constructor(
    private readonly lockPath: string,
    private readonly nonce: string,
    private readonly registryKey: string,
  ) {
    // Best-effort synchronous release for exit paths the adapter's
    // SIGTERM/SIGINT → dispose() handler didn't already cover (e.g. an
    // uncaught-exception exit). `process.on('exit')` callbacks may only do
    // synchronous work — fs.unlinkSync qualifies.
    this.onExit = () => this.release()
    process.once('exit', this.onExit)
  }

  /**
   * Acquire the single-writer lock for `cortexDir`'s `.cortex/.lock` file.
   *
   * - Returns a {@link CortexLock} on success.
   * - Throws {@link LockHeldError} when a live, *different* process already holds it.
   * - Returns `null` when the `.cortex/` directory cannot be created at all
   *   (EACCES/EROFS — a read-only project root). Locking is impossible there,
   *   but so is every other `.cortex/` write, so the caller runs lock-less and
   *   degraded — exactly the pre-existing read-only-root behavior. This is the
   *   ONE non-throwing degrade; lock-*held* always throws (no silent downgrade).
   * - Filesystems where the atomic link/rename protocol is unsupported but the
   *   directory IS writable (hard-link-less network mounts, AV-held files on
   *   Windows) fall back to MARKER MODE: a plain overwrite of the lock file.
   *   That forfeits race-proof exclusivity but preserves the ownership record —
   *   which <CortexDevScripts/>'s liveness gate and conflict warnings depend
   *   on. Degrading to lock-LESS there would make the gate permanently refuse
   *   a live bridge's discovery files.
   *
   * `ownerNonce` (optional) is stamped into the lock file instead of a fresh
   * UUID — see {@link advertiseLockFamilyNonce}.
   */
  static acquire(cortexDir: string, ownerNonce?: string): CortexLock | null {
    const lockPath = path.join(cortexDir, '.lock')

    // Any non-EEXIST filesystem error during lock I/O means locking is
    // impossible for environmental reasons (read-only root, EACCES on a
    // foreign-owned .cortex/, ENOTDIR for a path under a file, ENOSPC, etc.).
    // EEXIST is the only "expected" error and is handled separately (held vs
    // stale). Everything else → degrade: same lock-less behavior as before
    // ZF0-1851, with one warning. Lock-HELD always throws — never silent.
    const degrade = (reason: unknown): null => {
      console.warn(
        '[cortex] Could not create .cortex/ — running without the single-writer lock:',
        reason instanceof Error ? reason.message : String(reason),
      )
      return null
    }

    try {
      fs.mkdirSync(cortexDir, { recursive: true, mode: 0o700 })
    } catch (err) {
      return degrade(err)
    }

    // Canonicalize via realpath so the same .cortex/ accessed through a symlink,
    // case-variant, or alias path resolves to one registry key — string-based
    // path.resolve would treat them as different and let a second acquire bypass
    // the same-process guard, then reclaim the first lock as "stale" (same pid,
    // takes the our-own-leak path). realpath needs the dir to exist; mkdir ran
    // above. Fallback to path.resolve if realpath fails (e.g. case-insensitive
    // FS edge cases) so canonicalization is best-effort, never blocking.
    let registryKey: string
    try {
      registryKey = path.join(fs.realpathSync.native(cortexDir), '.lock')
    } catch {
      registryKey = path.resolve(lockPath)
    }

    // Same-process concurrent-acquire guard. The cross-process pid+liveness
    // check below cannot distinguish a true same-process conflict (webpack
    // MultiCompiler, double plugin registration) from a Vite in-process
    // restart, since both share process.pid. The in-memory registry makes
    // the distinction explicit: presence here means "another CortexLock
    // instance in this process still holds it" — refuse rather than reclaim.
    // Adapters that intend a handoff (Vite restart) call
    // CortexSession.releaseLockForHandoff() on the old session first.
    if (activeLocks().has(registryKey)) {
      throw new LockHeldError(lockPath, process.pid, /* inProcess */ true)
    }

    // Marker-mode fallback for environments where the atomic protocol below is
    // unsupported but plain writes work. Advisory-only (last-writer-wins), and
    // only reached on filesystem capability errors — never for a held lock.
    const markerFallback = (contents: LockFileContents, reason: unknown): CortexLock | null => {
      // Held-always-throws applies in marker mode too: never overwrite a lock
      // whose owner is alive in another process (reachable when the temp-file
      // create failed but the existing lock file itself is writable).
      const holder = readLockFile(lockPath)
      if (holder !== null && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
        throw new LockHeldError(lockPath, holder.pid, false, familyNonces().includes(holder.nonce))
      }
      try {
        fs.writeFileSync(lockPath, JSON.stringify(contents), { mode: 0o600 })
      } catch {
        return degrade(reason)
      }
      console.warn(
        '[cortex] Filesystem does not support atomic lock placement — using best-effort marker mode:',
        reason instanceof Error ? reason.message : String(reason),
      )
      const lock = new CortexLock(lockPath, contents.nonce, registryKey)
      activeLocks().set(registryKey, lock)
      addFamilyNonce(contents.nonce)
      return lock
    }

    // Two passes: the first may find a stale lock and reclaim it; the second
    // then succeeds. A second EEXIST means another instance reclaimed in the
    // same window — treat that as genuinely held rather than looping.
    for (let attempt = 0; attempt < 2; attempt++) {
      const nonce = ownerNonce ?? randomUUID()

      // Materialize the new lock CONTENT in a uniquely-named temp file FIRST,
      // then atomically hard-link it to lockPath. This removes a race the
      // older O_EXCL-open-then-write pattern had: between `openSync('wx')` and
      // `writeSync` the file existed but was empty — a second process hitting
      // EEXIST in that window would `readLockFile` → null → "corrupt, treat as
      // stale" → reclaim the in-progress lock. linkSync atomically creates
      // lockPath with the temp file's full content; observers either see no
      // file (acquire empty slot) or a complete file (live holder / stale).
      // The temp name uses its OWN random component, never the (possibly
      // caller-fixed) owner nonce: a deterministic temp path could collide
      // with a leaked temp from a crashed prior run and exhaust both attempts
      // into a spurious LockHeldError(-1) on a FREE lock. Only the lock file
      // CONTENT carries the owner nonce — temp naming needs uniqueness alone.
      const tmpPath = `${lockPath}.creating-${process.pid}-${randomUUID()}`
      const contents: LockFileContents = { pid: process.pid, nonce, startedAt: Date.now() }
      try {
        fs.writeFileSync(tmpPath, JSON.stringify(contents), { mode: 0o600, flag: 'wx' })
      } catch (writeErr) {
        // EEXIST = collision on the temp path (vanishingly rare) → retry.
        // Any other error: the exclusive-create protocol is unavailable —
        // try marker mode before giving up (degrade happens inside).
        if (isErrno(writeErr, 'EEXIST')) continue
        return markerFallback(contents, writeErr)
      }

      let linked = false
      try {
        // Atomic O_EXCL-equivalent: hard-link the populated temp into place.
        // EEXIST if lockPath already exists — never partial.
        fs.linkSync(tmpPath, lockPath)
        linked = true
      } catch (linkErr) {
        // EEXIST = lockPath already exists → fall through to held/stale check.
        // Anything else is an environmental "can't link" (hard-link-less
        // filesystem) — try marker mode before giving up.
        if (!isErrno(linkErr, 'EEXIST')) {
          try { fs.unlinkSync(tmpPath) } catch { /* harmless */ }
          return markerFallback(contents, linkErr)
        }
      } finally {
        // Always clean up the temp file; lockPath now has its own inode after a
        // successful link (the temp was a second name for the same content).
        try { fs.unlinkSync(tmpPath) } catch { /* harmless */ }
      }
      if (linked) {
        const lock = new CortexLock(lockPath, nonce, registryKey)
        activeLocks().set(registryKey, lock)
        // Advertise ownership to processes we spawn from here on (see FAMILY_ENV).
        addFamilyNonce(nonce)
        return lock
      }

      const holder = readLockFile(lockPath)
      if (holder !== null && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
        // A live holder whose nonce we inherited via env is this same boot's
        // bridge in another process — normal `next dev` double evaluation, not
        // a conflict. The caller suppresses the warning for sameFamily.
        throw new LockHeldError(lockPath, holder.pid, false, familyNonces().includes(holder.nonce))
      }
      if (holder === null && fs.existsSync(lockPath)) {
        // Present but unreadable/unparseable — warn before reclaiming so a
        // recurring corruption source (crashing writer, disk issue) stays
        // visible instead of being silently absorbed every boot.
        console.warn(`[cortex] The lock file at ${lockPath} is corrupt — reclaiming it.`)
      }
      // Stale: the holder process is dead, the file is corrupt, or it carries
      // OUR pid — a lock leaked by a crashed prior run, or (the common case) a
      // Vite in-process restart where the old session's async dispose hasn't
      // released yet. All are safe to reclaim. Use renameSync — the atomic
      // compare-and-take primitive: only ONE process can rename the file at
      // that inode. The loser sees ENOENT and the next iteration's linkSync
      // either succeeds (slot empty) or sees the winner's brand-new lock as a
      // live holder — preserving the single-writer guarantee even under
      // concurrent stale recovery.
      const reclaimPath = `${lockPath}.reclaiming-${process.pid}-${nonce}`
      try {
        fs.renameSync(lockPath, reclaimPath)
      } catch (renameErr) {
        // ENOENT = another reclaimer took the file → loop to retry the linkSync.
        // Anything else (e.g. EPERM on Windows when the file is still open by
        // another process) is an environmental "can't reclaim". We only reach
        // this branch for a STALE/corrupt holder, so a marker-mode overwrite
        // IS the reclaim (non-atomic); if even that fails, degrade with a
        // warning rather than throw and crash adapter startup.
        if (isErrno(renameErr, 'ENOENT')) continue
        return markerFallback(contents, renameErr)
      }
      try { fs.unlinkSync(reclaimPath) } catch { /* harmless — file gone */ }
    }

    // Both attempts lost the reclaim race — extremely unlikely. Refuse rather
    // than loop forever; the holder pid is unknown at this point.
    throw new LockHeldError(lockPath, -1)
  }

  /** Release the lock. Idempotent — safe to call from both dispose() and the
   *  process-exit handler. Only unlinks a lock file whose nonce still matches
   *  THIS instance, so it never deletes a lock a reclaimer (e.g. the next
   *  session after a Vite restart) already handed to a new owner. */
  release(): void {
    if (this.released) return
    this.released = true
    activeLocks().delete(this.registryKey)
    removeFamilyNonce(this.nonce)
    process.removeListener('exit', this.onExit)
    try {
      if (readLockFile(this.lockPath)?.nonce === this.nonce) {
        fs.unlinkSync(this.lockPath)
      }
    } catch {
      /* already gone, or unreadable — nothing to release */
    }
  }
}
