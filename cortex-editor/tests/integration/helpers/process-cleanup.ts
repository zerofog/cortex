import type { ChildProcess } from 'node:child_process'

/**
 * Kill a child process with SIGTERM, escalating to SIGKILL after `timeoutMs`.
 * Resolves once the child has exited.
 *
 * Safe on already-exited children (no-op, returns immediately).
 *
 * Handles three race conditions:
 *  1. Child died before we were called (top-of-fn check)
 *  2. Child died between top-of-fn check and 'exit' listener registration
 *     (re-check after attaching listener)
 *  3. SIGKILL is sent to an already-dead PID (kill() returns false, no 'exit'
 *     fires) — re-check after kill() and resolve if the child is already gone.
 */
export async function killChildGracefully(
  child: ChildProcess,
  timeoutMs = 2000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }

    const timer = setTimeout(() => {
      if (settled) return
      // Force-kill. If the child is already dead, kill() returns false and no
      // 'exit' event fires — resolve directly to avoid a permanent hang.
      child.kill('SIGKILL')
      if (child.exitCode !== null || child.signalCode !== null) finish()
    }, timeoutMs)

    child.once('exit', finish)

    // Race-protection: if the child died between the top-of-function check
    // and listener registration, the 'exit' event already fired. Detect that
    // and resolve immediately.
    if (child.exitCode !== null || child.signalCode !== null) {
      finish()
      return
    }

    child.kill('SIGTERM')
  })
}
