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

  beforeAll(async () => {
    await ensureCliBuilt()
    transport = new StdioClientTransport({
      command: 'node',
      args: [CLI_DIST, 'mcp'],
      stderr: 'pipe',
    })
    client = new Client({ name: 'cortex-layer5-test', version: '0.0.0' }, { capabilities: {} })
    await client.connect(transport)
  }, 180_000)

  afterAll(async () => {
    if (client) await client.close()
    if (transport) await transport.close()
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

  beforeAll(async () => {
    await ensureCliBuilt()

    httpServer = createServer()
    wss = new WebSocketServer({ server: httpServer, path: '/@cortex/ws' })
    wss.on('connection', (sock) => { cliWs = sock })

    port = await new Promise<number>((resolvePort, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address()
        if (typeof addr === 'object' && addr) resolvePort(addr.port)
        else reject(new Error('failed to bind ephemeral port'))
      })
    })

    transport = new StdioClientTransport({
      command: 'node',
      args: [CLI_DIST, 'mcp', `--port=${port}`],
      stderr: 'pipe',
    })
    // Drain stderr to avoid backpressure (per T2 quality review nit).
    transport.stderr?.on('data', () => {})

    client = new Client({ name: 'cortex-layer5-notify-test', version: '0.0.0' }, { capabilities: {} })
    await client.connect(transport)

    // Wait up to 5s for the CLI's WS to connect to our fake Vite server.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CLI did not connect to fake Vite WS within 5s')), 5000)
      const tick = (): void => {
        if (cliWs) { clearTimeout(timeout); resolve() } else setTimeout(tick, 50)
      }
      tick()
    })
  }, 180_000)

  afterAll(async () => {
    if (client) await client.close()
    if (transport) await transport.close()
    if (cliWs) cliWs.terminate()
    if (wss && httpServer) {
      await new Promise<void>((resolve) => wss.close(() => httpServer.close(() => resolve())))
    }
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
    // Exact method name confirmed from first run: src/cli/mcp.ts sends
    // server.server.notification({ method: 'notifications/claude/channel', ... }).
    // Falsifiability: corrupt the forwarder in src/cli/mcp.ts (the
    // server.notification(...) for 'staged-edits-ready') — must fail with
    // 'no notification received within 2s'.
    expect(received[0].method).toBe('notifications/claude/channel')
  })
})
