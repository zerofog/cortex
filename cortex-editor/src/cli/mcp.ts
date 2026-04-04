import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import WebSocket from 'ws'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { version } from '../version.js'

/** Exponential backoff with cap for WebSocket reconnection. Exported for testing. */
export function calculateReconnectDelay(retryCount: number): number {
  const clamped = Math.min(retryCount, 15)
  return Math.min(1000 * 2 ** clamped, 30_000)
}

export interface MCPServerOptions {
  port?: number
  /** Override transport for testing. Defaults to StdioServerTransport. */
  transport?: Transport
}

export interface MCPServerHandle {
  close(): void
}

/** Read a .cortex discovery file, returning null on ENOENT or empty content. */
function readDiscoveryFile(name: string): string | null {
  const filePath = path.join(process.cwd(), '.cortex', name)
  try {
    return fs.readFileSync(filePath, 'utf8').trim() || null
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    process.stderr.write(`[cortex] Failed to read ${name} file: ${err instanceof Error ? err.message : String(err)}\n`)
    return null
  }
}

export function discoverPort(): number | null {
  const content = readDiscoveryFile('port')
  if (!content) return null
  const port = Math.trunc(Number(content))
  return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : null
}

export function discoverToken(): string | null {
  return readDiscoveryFile('token')
}

export async function startMCPServer(options: MCPServerOptions = {}): Promise<MCPServerHandle> {
  const port = options.port ?? discoverPort() ?? 5173
  const wsUrl = `ws://localhost:${port}/@cortex/ws`

  let ws: WebSocket | null = null
  let connected = false
  let editorActive = false
  let browserConnected = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let retryCount = 0
  let closed = false
  let token: string | null = null

  // RPC infrastructure for annotation tool queries
  const pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason: Error) => void
  }>()

  function connect(): void {
    ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      connected = true
      retryCount = 0
      // Re-read token on each connection — token changes on Vite server restart
      token = discoverToken()
      process.stderr.write(`[cortex] Connected to Vite server at ${wsUrl}${token ? '' : ' (token not found — writes will be rejected)'}\n`)
    })

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (typeof msg.type !== 'string') return

      // RPC response dispatching
      if (msg.type === 'cortex-rpc-result' || msg.type === 'cortex-rpc-error') {
        const pending = pendingRequests.get(msg.requestId as string)
        if (!pending) return
        pendingRequests.delete(msg.requestId as string)
        if (msg.type === 'cortex-rpc-result') pending.resolve((msg as Record<string, unknown>).result)
        else pending.reject(new Error((msg as Record<string, unknown>).error as string))
        return
      }

      // Handle auth failures — re-read token file in case of startup race or server restart
      if (msg.type === 'error' && msg.code === 'AUTH_FAILED') {
        const newToken = discoverToken()
        if (newToken && newToken !== token) {
          token = newToken
          process.stderr.write('[cortex] Token refreshed after AUTH_FAILED — future requests will use new token\n')
        } else {
          process.stderr.write('[cortex] AUTH_FAILED — token may be stale or missing. Try restarting the dev server.\n')
        }
        // Reject all pending RPC requests — they were sent with the stale token
        // and the server discards them before extracting requestId.
        for (const [id, pending] of pendingRequests) {
          pending.reject(new Error('AUTH_FAILED: invalid or missing auth token'))
          pendingRequests.delete(id)
        }
        return
      }

      // Vite server is single source of truth for state
      if (msg.type === 'cortex') editorActive = true
      if (msg.type === 'cortex-closed') editorActive = false
      if (msg.type === 'cortex-status') {
        editorActive = Boolean(msg.editorActive)
        browserConnected = Boolean(msg.browserConnected)
      }
    })

    ws.on('close', () => {
      // Reject all pending RPC requests on disconnect
      for (const [, pending] of pendingRequests) {
        pending.reject(new Error('WebSocket disconnected'))
      }
      pendingRequests.clear()

      connected = false
      editorActive = false
      browserConnected = false
      if (closed) return
      const delay = calculateReconnectDelay(retryCount)
      retryCount++
      reconnectTimer = setTimeout(connect, delay)
      reconnectTimer.unref()
    })

    ws.on('error', (err) => {
      process.stderr.write(`[cortex] WebSocket error: ${err.message}\n`)
    })
  }

  connect()

  function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const socket = ws
    if (!connected || !socket) return Promise.reject(new Error('Not connected to Vite dev server'))
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error('RPC timeout'))
      }, 10_000)
      pendingRequests.set(requestId, {
        resolve: (v: unknown) => { clearTimeout(timer); resolve(v) },
        reject: (e: Error) => { clearTimeout(timer); reject(e) },
      })
      socket.send(JSON.stringify({ type: 'cortex-rpc', requestId, method, params, token }))
    })
  }

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
        ws.send(JSON.stringify({ type: 'cortex', token }))
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
        ws.send(JSON.stringify({ type: 'cortex-close', token }))
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
          devServerUrl: `http://localhost:${port}`,
        }, null, 2),
      }],
    }),
  )

  // --- Annotation tools (Phase 7) ---

  server.registerTool(
    'cortex_get_pending',
    { description: 'List all pending annotations (comments awaiting agent action). Workflow: get_pending → acknowledge → (optional respond for clarification) → resolve or dismiss.' },
    async () => {
      try {
        const result = await rpc('getPending', {})
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
  )

  server.registerTool(
    'cortex_get_details',
    {
      description: 'Get full details of an annotation including thread history.',
      inputSchema: { annotationId: z.string().describe('Annotation ID') },
    },
    async ({ annotationId }) => {
      try {
        const result = await rpc('getDetails', { annotationId })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
  )

  server.registerTool(
    'cortex_acknowledge',
    {
      description: 'Mark an annotation as "working on it" (pending → acknowledged). Must be called before cortex_resolve. Returns null if annotation is not in pending state.',
      inputSchema: { annotationId: z.string().describe('Annotation ID') },
    },
    async ({ annotationId }) => {
      try {
        const result = await rpc('acknowledge', { annotationId })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
  )

  server.registerTool(
    'cortex_resolve',
    {
      description: 'Mark an annotation as resolved/applied (acknowledged → resolved). Requires cortex_acknowledge first. Returns null if not in acknowledged state. Terminal — no further updates possible.',
      inputSchema: {
        annotationId: z.string().describe('Annotation ID'),
        summary: z.string().describe('Summary of the change that was applied'),
      },
    },
    async ({ annotationId, summary }) => {
      try {
        const result = await rpc('resolve', { annotationId, summary })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
  )

  server.registerTool(
    'cortex_dismiss',
    {
      description: 'Skip an annotation without implementing it (pending/acknowledged → dismissed). Can be called before or after acknowledge. Returns null if already resolved/dismissed. Terminal state.',
      inputSchema: {
        annotationId: z.string().describe('Annotation ID'),
        reason: z.string().optional().describe('Reason for dismissing'),
      },
    },
    async ({ annotationId, reason }) => {
      try {
        const result = await rpc('dismiss', { annotationId, reason })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
  )

  server.registerTool(
    'cortex_respond',
    {
      description: 'Send a clarification or reply to an annotation thread. Only works for pending/acknowledged annotations. Returns null if annotation is resolved/dismissed or thread is full (100 messages max).',
      inputSchema: {
        annotationId: z.string().describe('Annotation ID'),
        text: z.string().describe('Message text'),
      },
    },
    async ({ annotationId, text }) => {
      try {
        const result = await rpc('respond', { annotationId, text })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
      }
    },
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
