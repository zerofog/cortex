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
 * Mechanism: an `O_EXCL` (`wx` flag) create of `.cortex/.lock` is the atomic
 * test-and-set. The lock file holds the owner's pid (for cross-process liveness
 * checks) plus a per-instance nonce (for same-process ownership — see release()).
 * A lock whose holder process is no longer alive (crash, SIGKILL — no chance to
 * release) is detected via `process.kill(pid, 0)` and reclaimed. This is an
 * *advisory* lock: it coordinates cooperating cortex instances, it does not
 * enforce OS-level exclusion.
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
 *  owns the project's `.cortex/` directory. The message names the holder pid and
 *  the lock path so the user can recover a genuinely-stale lock by hand. */
export class LockHeldError extends Error {
  constructor(
    readonly lockPath: string,
    readonly holderPid: number,
  ) {
    super(
      `[cortex] Another cortex instance (pid ${holderPid}) already owns this ` +
        `project's .cortex/ directory. Only one cortex dev server can run per ` +
        `project root. If that process is gone, delete the stale lock file: ${lockPath}`,
    )
    this.name = 'LockHeldError'
  }
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code
}

/** Parse a lock file. Returns null if the file is missing, unreadable, or not
 *  the JSON shape we wrote — all of which mean "treat as stale and reclaim" (a
 *  corrupt lock file can't be meaningfully owned by anyone). */
function readLockFile(lockPath: string): LockFileContents | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LockFileContents>
    if (
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
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
 */
const activeLocks = new Map<string, CortexLock>()

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
   */
  static acquire(cortexDir: string): CortexLock | null {
    const lockPath = path.join(cortexDir, '.lock')
    const registryKey = path.resolve(lockPath)

    // Same-process concurrent-acquire guard. The cross-process pid+liveness
    // check below cannot distinguish a true same-process conflict (webpack
    // MultiCompiler, double plugin registration) from a Vite in-process
    // restart, since both share process.pid. The in-memory registry makes
    // the distinction explicit: presence here means "another CortexLock
    // instance in this process still holds it" — refuse rather than reclaim.
    // Adapters that intend a handoff (Vite restart) call
    // CortexSession.releaseLockForHandoff() on the old session first.
    if (activeLocks.has(registryKey)) {
      throw new LockHeldError(lockPath, process.pid)
    }

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

    // Two passes: the first may find a stale lock and reclaim it; the second
    // then succeeds. A second EEXIST means another instance reclaimed in the
    // same window — treat that as genuinely held rather than looping.
    for (let attempt = 0; attempt < 2; attempt++) {
      const nonce = randomUUID()

      // Materialize the new lock CONTENT in a uniquely-named temp file FIRST,
      // then atomically hard-link it to lockPath. This removes a race the
      // older O_EXCL-open-then-write pattern had: between `openSync('wx')` and
      // `writeSync` the file existed but was empty — a second process hitting
      // EEXIST in that window would `readLockFile` → null → "corrupt, treat as
      // stale" → reclaim the in-progress lock. linkSync atomically creates
      // lockPath with the temp file's full content; observers either see no
      // file (acquire empty slot) or a complete file (live holder / stale).
      const tmpPath = `${lockPath}.creating-${process.pid}-${nonce}`
      const contents: LockFileContents = { pid: process.pid, nonce, startedAt: Date.now() }
      try {
        fs.writeFileSync(tmpPath, JSON.stringify(contents), { mode: 0o600, flag: 'wx' })
      } catch (writeErr) {
        // EEXIST = UUID collision on the temp path (vanishingly rare) → retry.
        // Any other error means the dir is unwritable (existing-but-readonly
        // .cortex/ etc.) — degrade, same as mkdir failure.
        if (isErrno(writeErr, 'EEXIST')) continue
        return degrade(writeErr)
      }

      let linked = false
      try {
        // Atomic O_EXCL-equivalent: hard-link the populated temp into place.
        // EEXIST if lockPath already exists — never partial.
        fs.linkSync(tmpPath, lockPath)
        linked = true
      } catch (linkErr) {
        // EEXIST = lockPath already exists → fall through to held/stale check.
        // Anything else is an environmental "can't link" — degrade.
        if (!isErrno(linkErr, 'EEXIST')) {
          try { fs.unlinkSync(tmpPath) } catch { /* harmless */ }
          return degrade(linkErr)
        }
      } finally {
        // Always clean up the temp file; lockPath now has its own inode after a
        // successful link (the temp was a second name for the same content).
        try { fs.unlinkSync(tmpPath) } catch { /* harmless */ }
      }
      if (linked) {
        const lock = new CortexLock(lockPath, nonce, registryKey)
        activeLocks.set(registryKey, lock)
        return lock
      }

      const holder = readLockFile(lockPath)
      if (holder !== null && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
        throw new LockHeldError(lockPath, holder.pid)
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
        if (!isErrno(renameErr, 'ENOENT')) throw renameErr
        continue
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
    activeLocks.delete(this.registryKey)
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
