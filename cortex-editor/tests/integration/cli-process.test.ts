import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ensureCliBuilt } from './helpers/cli-build.js'
import { WebSocketServer, type WebSocket as WSClient } from 'ws'
import { createServer, type Server } from 'node:http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '../..')
const CLI_DIST = resolve(REPO_ROOT, 'dist/cli/index.js')

describe('cortex CLI — built-process integration (Layer 5)', () => {
  let client: Client
  let transport: StdioClientTransport
  let capturedPid: number | null = null

  beforeAll(async () => {
    await ensureCliBuilt()
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_DIST, 'mcp'],
      stderr: 'pipe',
    })
    // Drain stderr to avoid pipe-buffer backpressure (matches describe 2's pattern).
    transport.stderr?.on('data', () => {})
    transport.stderr?.on('error', (err) => { console.error('[layer5] stderr error', err) })

    client = new Client({ name: 'cortex-layer5-test', version: '0.0.0' }, { capabilities: {} })
    await client.connect(transport)
    capturedPid = (transport as unknown as { pid?: number }).pid ?? null
  }, 180_000)

  afterAll(async () => {
    // Promise.allSettled so one cleanup failure doesn't skip the rest
    const results = await Promise.allSettled([
      client?.close(),
      transport?.close(),
    ])
    const errs = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    // AC #5 enforcement: verify the spawned CLI actually exited.
    // process.kill(pid, 0) throws ESRCH if the process is gone — exactly what we want.
    if (capturedPid !== null) {
      // Brief grace period for OS to reap the child after transport.close()
      await new Promise(r => setTimeout(r, 100))
      let exitedCleanly = false
      try {
        process.kill(capturedPid, 0)
        // process still alive — bad
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') exitedCleanly = true
      }
      if (!exitedCleanly) errs.push({ status: 'rejected', reason: new Error(`AC #5: child ${capturedPid} did not exit`) })
    }
    if (errs.length > 0) throw errs[0].reason
  })

  it('built CLI launches and accepts MCP handshake', async () => {
    // If beforeAll's connect() succeeded, the handshake (initialize → initialized)
    // completed over real stdio against the BUILT artifact. Assert we're talking
    // to the right server.
    //
    // Falsifiability: corrupt dist/cli/index.js (e.g., delete it after the build,
    // or write a syntax error) — the spawn fails and beforeAll's connect() rejects.
    const serverInfo = client.getServerVersion()
    expect(serverInfo).toBeTruthy()
    expect(serverInfo?.name).toBe('cortex')
  })

  it('exposes the expected MCP tools across the process boundary', async () => {
    // Reuses the client + transport opened by Test 1's beforeAll.
    const result = await client.listTools()
    const names = result.tools.map(t => t.name).sort()
    expect(names).toEqual([
      'cortex_acknowledge',
      'cortex_acknowledge_source_edit',
      'cortex_activate',
      'cortex_apply_edits',
      'cortex_channel_test',
      'cortex_deactivate',
      'cortex_discard_edits',
      'cortex_dismiss',
      'cortex_get_details',
      'cortex_get_intent_context',
      'cortex_get_pending',
      'cortex_get_pending_edits',
      'cortex_list_active',
      'cortex_report_source_edit_failed',
      'cortex_resolve',
      'cortex_respond',
      'cortex_status',
    ])
    // Falsifiability: comment out any `server.registerTool(...)` call in
    // src/cli/mcp.ts — this assertion will fail with the missing name.
  })
})

describe('cortex CLI — built-process notification round-trip (Layer 5)', () => {
  let httpServer: Server
  let wss: WebSocketServer
  let cliWs: WSClient | null = null
  let client: Client
  let transport: StdioClientTransport
  let port: number
  let capturedPid: number | null = null

  beforeAll(async () => {
    await ensureCliBuilt()

    httpServer = createServer()
    wss = new WebSocketServer({ server: httpServer, path: '/@cortex/ws' })
    wss.on('error', (err) => { console.error('[layer5] wss error', err) })
    wss.on('connection', (sock) => {
      sock.on('error', (err) => { console.error('[layer5] cliWs error', err) })
      cliWs = sock
    })

    port = await new Promise<number>((resolvePort, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address()
        if (typeof addr === 'object' && addr) resolvePort(addr.port)
        else reject(new Error('failed to bind ephemeral port'))
      })
    })
    // Long-lived error handler after successful listen
    httpServer.on('error', (err) => { console.error('[layer5] httpServer error', err) })

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_DIST, 'mcp', `--port=${port}`],
      stderr: 'pipe',
    })
    // Drain stderr to avoid backpressure (per T2 quality review nit).
    transport.stderr?.on('data', () => {})
    transport.stderr?.on('error', (err) => { console.error('[layer5] stderr error', err) })

    client = new Client({ name: 'cortex-layer5-notify-test', version: '0.0.0' }, { capabilities: {} })
    await client.connect(transport)
    capturedPid = (transport as unknown as { pid?: number }).pid ?? null

    // Wait up to 5s for the CLI's WS to connect to our fake Vite server.
    // The recursive `tick` chain stops on `stopped` so a 5s reject doesn't
    // continue accruing timers in the background.
    await new Promise<void>((resolve, reject) => {
      let stopped = false
      const timeout = setTimeout(() => {
        stopped = true
        reject(new Error('CLI did not connect to fake Vite WS within 5s'))
      }, 5000)
      const tick = (): void => {
        if (stopped) return
        if (cliWs) { clearTimeout(timeout); resolve() }
        else setTimeout(tick, 50)
      }
      tick()
    })
  }, 180_000)

  afterAll(async () => {
    if (cliWs) cliWs.terminate()
    const results = await Promise.allSettled([
      client?.close(),
      transport?.close(),
      new Promise<void>((resolve) => {
        if (!wss || !httpServer) return resolve()
        wss.close(() => httpServer.close(() => resolve()))
      }),
    ])
    const errs = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    // AC #5 enforcement: verify the spawned CLI actually exited.
    // process.kill(pid, 0) throws ESRCH if the process is gone — exactly what we want.
    if (capturedPid !== null) {
      // Brief grace period for OS to reap the child after transport.close()
      await new Promise(r => setTimeout(r, 100))
      let exitedCleanly = false
      try {
        process.kill(capturedPid, 0)
        // process still alive — bad
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') exitedCleanly = true
      }
      if (!exitedCleanly) errs.push({ status: 'rejected', reason: new Error(`AC #5: child ${capturedPid} did not exit`) })
    }
    if (errs.length > 0) throw errs[0].reason
  })

  it('forwards staged-edits-ready notification when Vite client sends one', async () => {
    expect(cliWs).not.toBeNull()

    const received: Array<{ method: string; params: unknown }> = []
    client.fallbackNotificationHandler = async (n) => {
      received.push({ method: n.method, params: n.params })
    }

    cliWs!.send(JSON.stringify({
      type: 'staged-edits-ready',
      count: 3,
      requestId: 'layer5-test-1',
    }))

    // Wait up to 2s for notification to arrive (per ticket's per-test budget).
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 2000
      const tick = (): void => {
        if (received.length > 0) resolve()
        else if (Date.now() > deadline) reject(new Error('no notification received within 2s'))
        else setTimeout(tick, 25)
      }
      tick()
    })

    expect(received).toHaveLength(1)
    expect(received[0].method).toBe('notifications/claude/channel')
    // The method is shared by three forwarder branches in src/cli/mcp.ts —
    // pin the assertion to fields unique to staged-edits-ready (meta.kind),
    // and fields we sent in (request_id, count) so a regression that
    // re-routes the message through a different branch is caught.
    //
    // Falsifiability: corrupt the staged-edits-ready forwarder in
    // src/cli/mcp.ts (or change meta.kind to a different string) — this
    // assertion fails with a clear meta.kind mismatch.
    const params = received[0].params as {
      content: string
      meta: { kind: string; request_id: string; count: string }
    }
    expect(params.meta.kind).toBe('staged-edits')
    expect(params.meta.request_id).toBe('layer5-test-1')
    expect(params.meta.count).toBe('3')
    expect(params.content).toContain('3')
    expect(typeof params.content).toBe('string')
    expect(params.content.length).toBeGreaterThan(0)
  })

  it('cortex_apply_edits exposes a wired-up inputSchema via the SDK boundary', async () => {
    // Layer-5-unique assertion: the BUILT artifact's tool registration must
    // include the schema. Layer 4 (tests/cli/mcp.test.ts:723-733) already
    // proves the schema rejects bad input via SDK round-trip; Layer 3
    // (tests/schemas/mcp-tool-inputs.test.ts) already proves the schema
    // itself rejects bad shape. What's UNIQUE here: the schema is bundled
    // and registered correctly in dist/cli/index.js.
    const result = await client.listTools()
    const applyEdits = result.tools.find(t => t.name === 'cortex_apply_edits')
    expect(applyEdits).toBeTruthy()
    expect(applyEdits!.inputSchema).toBeTruthy()
    expect(applyEdits!.inputSchema.type).toBe('object')
    expect(applyEdits!.inputSchema.properties).toBeTruthy()
    expect((applyEdits!.inputSchema.properties as Record<string, unknown>).intentIds).toBeTruthy()
    // Falsifiability: drop `inputSchema: cortexApplyEditsInputSchema.shape`
    // from the tool registration in src/cli/mcp.ts — this assertion fails
    // because the built artifact's tool definition won't expose properties.intentIds.
  })
})
