import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, basename, join } from 'node:path'

/**
 * Thrown by `atomicWrite` when the on-disk content does not match the intent
 * after the write completes (and after one retry). Signals that an external
 * process — most commonly a running editor's auto-save — reverted the write.
 *
 * Callers in the edit pipeline should surface this to the browser as
 * `edit_status: failed, reason_code: 'external_revert'` so the Panel can
 * show the user their editor overrode the edit. Silently succeeding would
 * leave the browser's view diverged from disk, cascading into stale-state
 * bugs on the next edit (the class-accumulation symptom that triggered this
 * plan).
 *
 * The `.message` deliberately does NOT include the
 * file path. The edit pipeline propagates `err.message` straight to the
 * browser over the WebSocket; shipping absolute filesystem paths over
 * the wire leaks user-specific information (a concern in --host mode
 * where team members share a dev server). The `filePath` field is
 * preserved for server-side classification and logging, which run
 * inside the trust boundary.
 */
export class ExternalRevertError extends Error {
  readonly filePath: string
  constructor(filePath: string) {
    super('Write was reverted by an external process (e.g. editor auto-save)')
    this.name = 'ExternalRevertError'
    this.filePath = filePath
  }
}

/**
 * Write `content` to `filePath` and verify it lands on disk.
 *
 * Protocol:
 *   1. Write to a sibling temp file (`{filename}.cortex-{pid}-{nonce}.tmp`).
 *   2. `fs.rename` to the target — atomic on POSIX; tolerated-racy on Windows
 *      but never torn.
 *   3. `fs.readFile` immediately; compare bytes to `content`.
 *   4. On mismatch, retry step 2 once. Editor auto-save typically fires once
 *      per user action; a second reversion implies a genuine conflict we
 *      should surface, not paper over.
 *   5. On persistent mismatch, throw `ExternalRevertError`.
 *
 * The temp file lives in the same directory so `rename` stays within the
 * same filesystem (cross-device renames are not atomic). The nonce prevents
 * collisions between concurrent writes to different files in the same dir.
 *
 * Does NOT call `fsync`. Cortex is a dev-time tool; durability across hard
 * shutdowns is not required. The atomic rename eliminates torn-write risk,
 * which is the actually-observed failure mode.
 */
export interface AtomicWriteOptions {
  /** File mode applied when creating the temp file; `rename` preserves the
   *  temp file's inode metadata onto the final path, so this IS the final
   *  mode. Use for secret-bearing files (token, injection.json → 0o600). */
  mode?: number
}

export async function atomicWrite(filePath: string, content: string, options: AtomicWriteOptions = {}): Promise<void> {
  const tmpPath = tempSibling(filePath)
  try {
    await fs.writeFile(tmpPath, content, { encoding: 'utf-8', mode: options.mode })
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    // Best-effort cleanup of the temp file when rename fails. If rename
    // succeeded, tmpPath no longer exists and this unlink is a no-op error
    // that we swallow.
    try { await fs.unlink(tmpPath) } catch { /* already gone */ }
    throw err
  }

  const afterFirst = await fs.readFile(filePath, 'utf-8')
  if (afterFirst === content) return

  // Mismatch: retry the rename once. Re-write the temp and rename again.
  // Typical cause: editor's file-watcher picked up the rename event and
  // flushed its own buffer on top. A second rename right after usually wins
  // because the editor won't re-save in the same tick.
  const retryTmp = tempSibling(filePath)
  try {
    await fs.writeFile(retryTmp, content, { encoding: 'utf-8', mode: options.mode })
    await fs.rename(retryTmp, filePath)
  } catch (err) {
    try { await fs.unlink(retryTmp) } catch { /* already gone */ }
    throw err
  }

  const afterRetry = await fs.readFile(filePath, 'utf-8')
  if (afterRetry === content) return
  throw new ExternalRevertError(filePath)
}

function tempSibling(filePath: string): string {
  const nonce = randomBytes(6).toString('hex')
  return join(dirname(filePath), `.${basename(filePath)}.cortex-${process.pid}-${nonce}.tmp`)
}
