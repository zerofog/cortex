import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import WebSocket from 'ws'
import fs from 'node:fs'
import path from 'node:path'
import { version } from '../version.js'

export interface MCPServerOptions {
  port?: number
  /** Override transport for testing. Defaults to StdioServerTransport. */
  transport?: Transport
}

export interface MCPServerHandle {
  close(): void
}

export function discoverPort(): number | null {
  const portFile = path.join(process.cwd(), '.cortex', 'port')
  try {
    const content = fs.readFileSync(portFile, 'utf8').trim()
    const port = Math.trunc(Number(content))
    return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : null
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    process.stderr.write(`[cortex] Failed to read port file: ${err instanceof Error ? err.message : String(err)}\n`)
    return null
  }
}

export async function startMCPServer(options: MCPServerOptions = {}): Promise<MCPServerHandle> {
  const port = options.port ?? discoverPort() ?? 5173
  const wsUrl = `ws://127.0.0.1:${port}/@cortex/ws`

  let ws: WebSocket | null = null
  let connected = false
  let editorActive = false
  let browserConnected = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let retryCount = 0
  let closed = false

  function connect(): void {
    ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      connected = true
      retryCount = 0
      process.stderr.write(`[cortex] Connected to Vite server at ${wsUrl}\n`)
    })

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (typeof msg.type !== 'string') return

      // Vite server is single source of truth for state
      if (msg.type === 'cortex') editorActive = true
      if (msg.type === 'cortex-closed') editorActive = false
      if (msg.type === 'cortex-status') {
        editorActive = Boolean(msg.editorActive)
        browserConnected = Boolean(msg.browserConnected)
      }
    })

    ws.on('close', () => {
      connected = false
      if (closed) return
      const clampedRetry = Math.min(retryCount, 15)
      const delay = Math.min(1000 * 2 ** clampedRetry, 30_000)
      retryCount++
      reconnectTimer = setTimeout(connect, delay)
      reconnectTimer.unref()
    })

    ws.on('error', (err) => {
      process.stderr.write(`[cortex] WebSocket error: ${err.message}\n`)
    })
  }

  connect()

  // MCP server
  const server = new McpServer(
    { name: 'cortex', version },
    { capabilities: { tools: {} } },
  )

  server.registerTool(
    'cortex_activate',
    { description: 'Activate the Cortex visual editor in the browser. The user must have their dev server running and the page open.' },
    async () => {
      if (!connected || !ws) {
        return {
          content: [{ type: 'text' as const, text: `Cannot connect to Vite dev server at ${wsUrl}. Start your dev server first: npm run dev` }],
          isError: true,
        }
      }
      try {
        ws.send(JSON.stringify({ type: 'cortex' }))
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to send activation command: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text' as const, text: 'Activation command sent. The editor should appear in the browser shortly.' }],
      }
    },
  )

  server.registerTool(
    'cortex_deactivate',
    { description: 'Deactivate the Cortex visual editor in the browser.' },
    async () => {
      if (!connected || !ws) {
        return {
          content: [{ type: 'text' as const, text: `Cannot connect to Vite dev server at ${wsUrl}. Start your dev server first: npm run dev` }],
          isError: true,
        }
      }
      try {
        ws.send(JSON.stringify({ type: 'cortex-close' }))
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to send deactivation command: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text' as const, text: 'Deactivation command sent.' }],
      }
    },
  )

  server.registerTool(
    'cortex_status',
    { description: 'Check Cortex connection status: whether the dev server is reachable, browser is connected, and editor is active.' },
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          devServerConnected: connected,
          browserConnected,
          editorActive,
          devServerUrl: `http://127.0.0.1:${port}`,
        }, null, 2),
      }],
    }),
  )

  const transport = options.transport ?? new StdioServerTransport()
  await server.connect(transport)

  return {
    close() {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
      server.close().catch(() => {})
    },
  }
}
