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

export class CortexLock {
  private released = false
  private readonly onExit: () => void

  private constructor(
    private readonly lockPath: string,
    private readonly nonce: string,
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

    try {
      fs.mkdirSync(cortexDir, { recursive: true, mode: 0o700 })
    } catch (err) {
      console.warn(
        '[cortex] Could not create .cortex/ — running without the single-writer lock:',
        err instanceof Error ? err.message : String(err),
      )
      return null
    }

    // Two passes: the first may find a stale lock and reclaim it; the second
    // then succeeds. A second EEXIST means another instance reclaimed in the
    // same window — treat that as genuinely held rather than looping.
    for (let attempt = 0; attempt < 2; attempt++) {
      const nonce = randomUUID()
      try {
        // 'wx' = O_CREAT | O_EXCL — atomic test-and-set. EEXIST if already held.
        const fd = fs.openSync(lockPath, 'wx', 0o600)
        try {
          const contents: LockFileContents = { pid: process.pid, nonce, startedAt: Date.now() }
          fs.writeSync(fd, JSON.stringify(contents))
        } finally {
          fs.closeSync(fd)
        }
        return new CortexLock(lockPath, nonce)
      } catch (err) {
        if (!isErrno(err, 'EEXIST')) throw err

        const holder = readLockFile(lockPath)
        if (holder !== null && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
          throw new LockHeldError(lockPath, holder.pid)
        }
        // Stale: the holder process is dead, the file is corrupt, or it carries
        // OUR pid — a lock leaked by a crashed prior run, or (the common case) a
        // Vite in-process restart where the old session's async dispose hasn't
        // released yet. All are safe to reclaim. unlink racing another
        // reclaimer is harmless — the retry resolves it.
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* already reclaimed by someone else */
        }
      }
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
