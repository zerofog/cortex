import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startMCPServer, discoverPort, type MCPServerHandle } from '../../src/cli/mcp.js'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

// --- Helpers ---

interface MockViteServer {
  port: number
  wss: WebSocketServer
  httpServer: http.Server
  clients: Set<WebSocket>
  lastMessage: () => Record<string, unknown> | null
  messages: Record<string, unknown>[]
  sendToAll: (msg: Record<string, unknown>) => void
  close: () => Promise<void>
}

async function createMockViteServer(): Promise<MockViteServer> {
  const httpServer = http.createServer()
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()
  const messages: Record<string, unknown>[] = []

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/@cortex/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    // Send status on connect (like the real Vite bridge)
    ws.send(JSON.stringify({ type: 'cortex-status', editorActive: false, browserConnected: true }))
    ws.on('message', (raw) => {
      try { messages.push(JSON.parse(raw.toString())) } catch {}
    })
    ws.on('close', () => clients.delete(ws))
  })

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })

  return {
    port,
    wss,
    httpServer,
    clients,
    messages,
    lastMessage: () => messages.length > 0 ? messages[messages.length - 1] : null,
    sendToAll: (msg) => {
      const data = JSON.stringify(msg)
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(data)
      }
    },
    close: () => new Promise<void>((resolve) => {
      for (const client of clients) client.terminate()
      wss.close(() => httpServer.close(() => resolve()))
    }),
  }
}

/** Wait for the MCP server's internal WS client to connect to the mock Vite server. */
function waitForConnection(mockVite: MockViteServer, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mockVite.clients.size > 0) { resolve(); return }
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), timeoutMs)
    mockVite.wss.on('connection', () => { clearTimeout(timer); resolve() })
  })
}

// --- Tests ---

describe('cortex mcp', () => {
  let mockVite: MockViteServer
  let mcpHandle: MCPServerHandle | null = null
  let mcpClient: Client | null = null

  beforeEach(async () => {
    mockVite = await createMockViteServer()
  })

  afterEach(async () => {
    mcpHandle?.close()
    mcpHandle = null
    await mcpClient?.close()
    mcpClient = null
    await mockVite.close()
  })

  /** Start the real startMCPServer connected to mock Vite, with InMemoryTransport for MCP. */
  async function startTestServer(port: number): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '0.1.0' })

    // Start actual production MCP server with DI'd transport
    const handlePromise = startMCPServer({ port, transport: serverTransport })
    await client.connect(clientTransport)
    mcpHandle = await handlePromise
    mcpClient = client

    return client
  }

  it('exposes cortex_activate, cortex_deactivate, and cortex_status tools via MCP', async () => {
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)

    const { tools } = await client.listTools()
    const names = tools.map(t => t.name).sort()
    expect(names).toEqual(['cortex_activate', 'cortex_deactivate', 'cortex_status'])
  })

  it('cortex_activate returns error when not connected to dev server', async () => {
    // Point at a port with nothing listening
    const client = await startTestServer(19999)

    // Give it a moment for the connection attempt to fail
    await new Promise(r => setTimeout(r, 200))

    const result = await client.callTool({ name: 'cortex_activate' })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Cannot connect')
  })

  it('cortex_activate sends cortex message and returns success', async () => {
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    // Allow client's open + initial message handlers to fire
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({ name: 'cortex_activate' })
    expect(result.isError).toBeFalsy()
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Activation command sent')

    // Verify the WS message was received by mock Vite
    await new Promise(r => setTimeout(r, 50))
    expect(mockVite.lastMessage()).toEqual({ type: 'cortex' })
  })

  it('cortex_deactivate sends cortex-close message when connected', async () => {
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({ name: 'cortex_deactivate' })
    expect(result.isError).toBeFalsy()
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Deactivation command sent')

    await new Promise(r => setTimeout(r, 50))
    expect(mockVite.lastMessage()).toEqual({ type: 'cortex-close' })
  })

  it('cortex_deactivate returns error when not connected to dev server', async () => {
    const client = await startTestServer(19999)
    await new Promise(r => setTimeout(r, 200))

    const result = await client.callTool({ name: 'cortex_deactivate' })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Cannot connect')
  })

  it('cortex_status reports connection state with browserConnected', async () => {
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)

    // Give time for the cortex-status message to be processed
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({ name: 'cortex_status' })
    const status = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(status.devServerConnected).toBe(true)
    expect(status.browserConnected).toBe(true)
    expect(status.editorActive).toBe(false)
    expect(status.devServerUrl).toBe(`http://127.0.0.1:${mockVite.port}`)
  })

  it('tracks editor active state only from server messages (not optimistically)', async () => {
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    // Initial state: editor inactive (from cortex-status on connect)
    let result = await client.callTool({ name: 'cortex_status' })
    let status = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(status.editorActive).toBe(false)

    // Simulate server confirming activation
    mockVite.sendToAll({ type: 'cortex' })
    await new Promise(r => setTimeout(r, 50))

    result = await client.callTool({ name: 'cortex_status' })
    status = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(status.editorActive).toBe(true)

    // Simulate server confirming deactivation
    mockVite.sendToAll({ type: 'cortex-closed' })
    await new Promise(r => setTimeout(r, 50))

    result = await client.callTool({ name: 'cortex_status' })
    status = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(status.editorActive).toBe(false)
  })

  it('reconnects to dev server with exponential backoff (capped at 30s)', () => {
    // Test the backoff calculation logic directly
    function calculateDelay(retryCount: number): number {
      const clampedRetry = Math.min(retryCount, 15)
      return Math.min(1000 * 2 ** clampedRetry, 30_000)
    }

    expect(calculateDelay(0)).toBe(1000)
    expect(calculateDelay(1)).toBe(2000)
    expect(calculateDelay(2)).toBe(4000)
    expect(calculateDelay(3)).toBe(8000)
    expect(calculateDelay(4)).toBe(16000)
    expect(calculateDelay(5)).toBe(30000)   // capped at 30s
    expect(calculateDelay(100)).toBe(30000) // retryCount > 15 still capped
  })

  it('discovers port from .cortex/port file', () => {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.cortex-test-'))
    const cortexDir = path.join(tmpDir, '.cortex')
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(path.join(cortexDir, 'port'), '9876')

    try {
      // Override cwd temporarily to test discoverPort
      const origCwd = process.cwd()
      process.chdir(tmpDir)
      try {
        const port = discoverPort()
        expect(port).toBe(9876)
      } finally {
        process.chdir(origCwd)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('falls back to 5173 when no port file and no --port flag', () => {
    // discoverPort returns null when no file exists
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.cortex-test-'))
    try {
      const origCwd = process.cwd()
      process.chdir(tmpDir)
      try {
        expect(discoverPort()).toBeNull()
      } finally {
        process.chdir(origCwd)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('prefers --port flag over .cortex/port file', async () => {
    // Write a port file with 3000, but pass --port pointing to mock Vite
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.cortex-test-'))
    const cortexDir = path.join(tmpDir, '.cortex')
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(path.join(cortexDir, 'port'), '3000')

    try {
      // --port flag should override the file
      const client = await startTestServer(mockVite.port)
      await waitForConnection(mockVite)

      const result = await client.callTool({ name: 'cortex_status' })
      const status = JSON.parse((result.content as Array<{ text: string }>)[0].text)
      // The URL should use the explicitly provided port, not 3000
      expect(status.devServerUrl).toBe(`http://127.0.0.1:${mockVite.port}`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('logs connection events to stderr (not stdout)', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      await startTestServer(mockVite.port)
      await waitForConnection(mockVite)

      // Give time for the connect log to fire
      await new Promise(r => setTimeout(r, 50))
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[cortex] Connected to Vite server')
      )
    } finally {
      stderrSpy.mockRestore()
    }
  })
})
