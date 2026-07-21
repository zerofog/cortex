/**
 * Zombie-process regression barrier (P0, 0.3.0 activation review).
 *
 * Next evaluates next.config with PHASE_DEVELOPMENT_SERVER in processes that
 * are NOT the dev server and that rely on natural event-loop drain to exit —
 * the detached telemetry flusher (telemetry/detached-flush.js) and the exiting
 * `next dev` CLI parent (handleSessionStop). If the bridge's listening handle
 * is ref'd, such a process NEVER exits: a detached zombie holding a live
 * .cortex/.lock that turns every subsequent `next dev` inert and feeds
 * <CortexDevScripts/> a stale port/token.
 *
 * This spec reproduces that shape directly: a bare node process loads the
 * PACKAGED CJS artifact (the build Next actually requires for next.config.ts),
 * evaluates the phase function with the dev phase — which starts a REAL bridge
 * — and then has nothing else to do. It must drain and exit on its own, and
 * its process-exit handler must release the lock. Without httpServer.unref()
 * this hangs until the timeout.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { expect, test } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..', '..')
const nextCjs = path.join(packageRoot, 'dist', 'next', 'next.cjs')

test('a config-inspecting process that starts the bridge exits on event-loop drain (no zombie)', async () => {
  test.setTimeout(60_000)
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-inspector-exit-'))
  try {
    const script = `
      const { withCortex } = require(${JSON.stringify(nextCjs)})
      const config = withCortex({})('phase-development-server', { defaultConfig: {} })
      if (typeof config.then === 'function') throw new Error('object config must resolve synchronously')
      // Hold the loop open ~3s (ref'd timer) so the test can CONNECT a client
      // to the bridge while this process is alive — proving accepted sockets
      // are unref'd too (codex P1: a connected MCP client would otherwise
      // re-pin a draining inspector forever). After the timer fires, nothing
      // but cortex's own handles remain — exactly like Next's detached
      // telemetry flusher after its upload completes.
      setTimeout(() => {}, 3000)
    `
    // Sanitize inherited state that would suppress or misclassify the bridge:
    // a CORTEX_BRIDGE=0 opt-out or leaked __CORTEX_LOCK_FAMILY in the
    // developer's shell must not make this spec vacuous or flaky.
    const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' }
    delete childEnv.CORTEX_BRIDGE
    delete childEnv.__CORTEX_LOCK_FAMILY
    const child = spawn(process.execPath, ['-e', script], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    })
    let output = ''
    child.stdout!.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr!.on('data', (d: Buffer) => { output += d.toString() })

    // While the child's hold-open timer runs, connect a raw TCP client to its
    // bridge port and KEEP it open. Accepted sockets are unref'd, so the child
    // must still exit when its timer fires — without that, this held
    // connection pins the process forever (the resurrected-zombie path).
    const portFile = path.join(projectDir, '.cortex', 'port')
    await expect
      .poll(() => fs.existsSync(portFile), { timeout: 10_000, message: 'bridge never wrote its port file' })
      .toBe(true)
    const bridgePort = Number(fs.readFileSync(portFile, 'utf8').trim())
    const client = new net.Socket()
    await new Promise<void>((resolve) => {
      client.on('error', () => resolve()) // a refused connect still leaves the timer path valid
      client.connect(bridgePort, '127.0.0.1', () => resolve())
    })

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(
          `config-inspector process did not exit — the bridge is pinning its event loop (zombie regression).\n${output}`,
        ))
      }, 30_000)
      child.on('exit', (code) => { clearTimeout(timer); resolve(code) })
      child.on('error', (err) => { clearTimeout(timer); reject(err) })
    })

    client.destroy()
    expect(exitCode, output).toBe(0)
    // (Startup falsifiability is proven ABOVE: the port-file poll succeeded
    // while the child was alive, so the bridge fully started — lazy import →
    // lock → listen → unref → discovery writes — before the drain.)
    //
    // Exit hygiene: the process-exit handlers release the lock AND remove the
    // discovery files, so a transient evaluator leaves .cortex/ clean — no
    // stale port/token residue for the liveness gate to have to refuse.
    expect(fs.existsSync(path.join(projectDir, '.cortex', '.lock'))).toBe(false)
    expect(fs.existsSync(path.join(projectDir, '.cortex', 'port'))).toBe(false)
    expect(fs.existsSync(path.join(projectDir, '.cortex', 'injection.json'))).toBe(false)
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
})
