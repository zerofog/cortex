import type { ChildProcess } from 'node:child_process'

export async function killChildGracefully(
  child: ChildProcess,
  timeoutMs = 2000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  return new Promise<void>((resolve) => {
    let settled = false
    const onExit = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      if (settled) return
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('exit', onExit)
    child.kill('SIGTERM')
  })
}
