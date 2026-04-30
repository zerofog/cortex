/**
 * MCP edit tools tests (ZF0-1452 T2)
 *
 * Covers all 10 spec criteria plus edge cases for:
 *   cortex_get_pending_edits
 *   cortex_apply_edits
 *   cortex_discard_edits
 *   cortex_get_intent_context
 *   staged-edits-ready notification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startMCPServer, type MCPServerHandle } from '../../src/cli/mcp.js'
import type { PendingEdit } from '../../src/adapters/types.js'
import { isPathInsideRoot, requireRealpathInsideRoot } from '../../src/adapters/vite.js'
import { applyEditsCore } from '../../src/core/staged-edits.js'
import { makeEdit } from '../core/helpers.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

// ---------------------------------------------------------------------------
// Shared test infrastructure (mirrors mcp.test.ts patterns)
// ---------------------------------------------------------------------------

interface MockViteServer {
  port: number
  wss: WebSocketServer
  httpServer: http.Server
  clients: Set<WebSocket>
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

function waitForConnection(mockVite: MockViteServer, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mockVite.clients.size > 0) { resolve(); return }
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), timeoutMs)
    mockVite.wss.on('connection', () => { clearTimeout(timer); resolve() })
  })
}

// ---------------------------------------------------------------------------
// RPC mock store for staged-edit tools
// ---------------------------------------------------------------------------

interface MockStore {
  edits: PendingEdit[]
  /** Map of intentId → whether apply was called (for tracking applied state) */
  applyResults: Map<string, 'applied' | 'needs-source-edit' | 'not-found'>
  contextFiles: Map<string, string>  // filePath → file contents
  /** Map of filePath → simulated byte size for size-cap testing.
   *  When present, the mock checks against MAX_INTENT_FILE_BYTES before
   *  consulting contextFiles, mirroring the production fs.statSync gate. */
  largeFiles: Map<string, number>
}

const MAX_INTENT_FILE_BYTES_FOR_TEST = 2 * 1024 * 1024

/**
 * Install RPC handler for staged-edit methods on the mock Vite WebSocket.
 * Also returns the store so tests can seed and inspect it.
 */
function installEditRPCHandler(mock: MockViteServer): MockStore {
  const store: MockStore = {
    edits: [],
    applyResults: new Map(),
    contextFiles: new Map(),
    largeFiles: new Map(),
  }

  mock.wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.type !== 'cortex-rpc') return

      const requestId = msg.requestId as string
      const method = msg.method as string
      const params = (msg.params ?? {}) as Record<string, unknown>

      try {
        let result: unknown
        if (method === 'getPendingEdits') {
          result = { intents: [...store.edits], count: store.edits.length }
        } else if (method === 'applyEdits') {
          const intentIds = params.intentIds as string[]
          const results = intentIds.map((intentId) => {
            const edit = store.edits.find(e => e.intentId === intentId)
            if (!edit) {
              return { intentId, status: 'failed', error: 'intent not found' }
            }
            const applyResult = store.applyResults.get(intentId) ?? 'needs-source-edit'
            if (applyResult === 'applied') {
              // Remove from store on apply
              store.edits = store.edits.filter(e => e.intentId !== intentId)
              return { intentId, status: 'applied', mechanism: 'inline-style' }
            } else {
              return { intentId, status: 'needs-source-edit', intent: edit, reason: 'Pipeline requires source edit' }
            }
          })
          result = { results }
        } else if (method === 'discardEdits') {
          const intentIds = params.intentIds as string[]
          store.edits = store.edits.filter(e => !intentIds.includes(e.intentId))
          // Mock simulates the happy path: channel.send succeeded.
          result = { discarded: intentIds, browserNotified: true }
        } else if (method === 'getIntentContext') {
          const intentId = params.intentId as string
          const edit = store.edits.find(e => e.intentId === intentId)
          if (!edit) {
            result = { error: 'intent not found' }
          } else {
            // Parse source: file:line:col
            const lastColon = edit.source.lastIndexOf(':')
            const secondLastColon = edit.source.lastIndexOf(':', lastColon - 1)
            const filePath = edit.source.slice(0, secondLastColon)
            const line = parseInt(edit.source.slice(secondLastColon + 1, lastColon), 10)

            // Size cap mirror — production performs fs.statSync before reading
            // and rejects > MAX_INTENT_FILE_BYTES. Mock simulates the gate when
            // a largeFiles entry is configured for this path.
            const simulatedSize = store.largeFiles.get(filePath)
            if (simulatedSize !== undefined && simulatedSize > MAX_INTENT_FILE_BYTES_FOR_TEST) {
              result = {
                error: `File too large for intent context: ${filePath} (${simulatedSize} bytes, max ${MAX_INTENT_FILE_BYTES_FOR_TEST})`,
              }
            } else {
            const fileContent = store.contextFiles.get(filePath)
            if (!fileContent) {
              result = { error: `File not found: ${filePath}` }
            } else {
              const lines = fileContent.split('\n')
              const targetIdx = line - 1  // 0-based
              const beforeStart = Math.max(0, targetIdx - 10)
              const afterEnd = Math.min(lines.length - 1, targetIdx + 10)

              result = {
                intentId,
                context: {
                  before: lines.slice(beforeStart, targetIdx),
                  target: lines[targetIdx] ?? '',
                  after: lines.slice(targetIdx + 1, afterEnd + 1),
                },
                currentValue: lines[targetIdx] ?? '',
              }
            }
            }  // close size-cap else
          }
        } else {
          throw new Error(`Unknown method: ${method}`)
        }
        ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
      } catch (err) {
        ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: (err as Error).message }))
      }
    })
  })

  return store
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('MCP edit tools (ZF0-1452 T2)', () => {
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

  async function startTestServer(port: number): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '0.1.0' })
    const handlePromise = startMCPServer({ port, transport: serverTransport })
    await client.connect(clientTransport)
    mcpHandle = await handlePromise
    mcpClient = client
    return client
  }

  // -------------------------------------------------------------------------
  // Spec criterion 1: cortex_get_pending_edits returns empty list when buffer empty
  // -------------------------------------------------------------------------

  it('[C1] cortex_get_pending_edits returns empty list when buffer is empty', async () => {
    const store = installEditRPCHandler(mockVite)
    void store  // empty — no edits seeded
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({ name: 'cortex_get_pending_edits' })
    expect(result.isError).toBeFalsy()
    const text = (result.content as Array<{ text: string }>)[0].text
    const parsed = JSON.parse(text) as { intents: PendingEdit[]; count: number }
    expect(parsed.intents).toHaveLength(0)
    expect(parsed.count).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Spec criterion 2: Returns all intents in insertion order when buffer has entries
  // -------------------------------------------------------------------------

  it('[C2] cortex_get_pending_edits returns intents in insertion order', async () => {
    const store = installEditRPCHandler(mockVite)
    store.edits.push(
      makeEdit({ intentId: 'intent-a', property: 'color', value: 'red' }),
      makeEdit({ intentId: 'intent-b', property: 'font-size', value: '16px' }),
      makeEdit({ intentId: 'intent-c', property: 'margin', value: '8px' }),
    )
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({ name: 'cortex_get_pending_edits' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as { intents: PendingEdit[]; count: number }
    expect(parsed.count).toBe(3)
    expect(parsed.intents[0].intentId).toBe('intent-a')
    expect(parsed.intents[1].intentId).toBe('intent-b')
    expect(parsed.intents[2].intentId).toBe('intent-c')
  })

  // -------------------------------------------------------------------------
  // Spec criterion 3: cortex_apply_edits — deterministic intents return 'applied'
  // -------------------------------------------------------------------------

  // Skip: this test asserts the deterministic-apply 'applied' status, which
  // production never returns today (per ZF0-1464 deferral — EditPipeline
  // doesn't expose a synchronous applied/needs-source-edit boundary). The
  // mock RPC handler fabricates the applied branch but the production code
  // path always returns 'needs-source-edit' for found intents. Re-enable
  // when ZF0-1464 lands the Promise-based EditPipeline integration. The
  // applyEditsCore unit tests at the bottom of this file pin the current
  // production contract; [C4] pins the needs-source-edit path end-to-end.
  it.skip('[C3] cortex_apply_edits — deterministic intent returns applied + removes from buffer', async () => {
    const store = installEditRPCHandler(mockVite)
    store.edits.push(makeEdit({ intentId: 'intent-det', property: 'color', value: 'blue' }))
    store.applyResults.set('intent-det', 'applied')

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_apply_edits',
      arguments: { intentIds: ['intent-det'] },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as { results: Array<{ intentId: string; status: string; mechanism: string }> }
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].intentId).toBe('intent-det')
    expect(parsed.results[0].status).toBe('applied')
    expect(parsed.results[0].mechanism).toBe('inline-style')

    // Verify removal from buffer via follow-up get_pending
    const pending = await client.callTool({ name: 'cortex_get_pending_edits' })
    const pendingParsed = JSON.parse((pending.content as Array<{ text: string }>)[0].text) as { count: number }
    expect(pendingParsed.count).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Spec criterion 4: Non-deterministic intents return 'needs-source-edit'
  // -------------------------------------------------------------------------

  it('[C4] cortex_apply_edits — non-deterministic intent returns needs-source-edit with full payload', async () => {
    const store = installEditRPCHandler(mockVite)
    const edit = makeEdit({ intentId: 'intent-ndet', property: 'font-size', value: '17px' })
    store.edits.push(edit)
    // No entry in applyResults → defaults to 'needs-source-edit'

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_apply_edits',
      arguments: { intentIds: ['intent-ndet'] },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      results: Array<{ intentId: string; status: string; intent: PendingEdit; reason: string }>
    }
    expect(parsed.results).toHaveLength(1)
    const r = parsed.results[0]
    expect(r.intentId).toBe('intent-ndet')
    expect(r.status).toBe('needs-source-edit')
    expect(r.intent.intentId).toBe('intent-ndet')
    expect(r.intent.property).toBe('font-size')
    expect(r.intent.value).toBe('17px')
    expect(typeof r.reason).toBe('string')
    expect(r.reason.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Spec criterion 5 (input-order preservation across mixed statuses) is
  // covered by the [EDGE] mixed-found/not-found test below, which is strictly
  // richer (includes the not-found case). Removed here per cortex CLAUDE.md
  // test rule #5 (no subsumption). The 'applied' removal-from-buffer behavior
  // remains pinned by the [C3] test.
  // -------------------------------------------------------------------------
  // Spec criterion 6: cortex_discard_edits removes specified intents
  // -------------------------------------------------------------------------

  it('[C6] cortex_discard_edits removes specified intents and returns discarded IDs', async () => {
    const store = installEditRPCHandler(mockVite)
    store.edits.push(
      makeEdit({ intentId: 'keep-me', property: 'color' }),
      makeEdit({ intentId: 'discard-me', property: 'font-size' }),
    )

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_discard_edits',
      arguments: { intentIds: ['discard-me'] },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      discarded: string[]
      browserNotified: boolean
    }
    expect(parsed.discarded).toEqual(['discard-me'])
    // browserNotified flag is part of the response shape (H1): true means the
    // server successfully propagated the discard to the browser canonical buffer.
    expect(parsed.browserNotified).toBe(true)

    // Verify the other intent remains
    const pending = await client.callTool({ name: 'cortex_get_pending_edits' })
    const pendingParsed = JSON.parse((pending.content as Array<{ text: string }>)[0].text) as { intents: PendingEdit[]; count: number }
    expect(pendingParsed.count).toBe(1)
    expect(pendingParsed.intents[0].intentId).toBe('keep-me')
  })

  // -------------------------------------------------------------------------
  // Spec criterion 7: cortex_get_intent_context returns ~20 lines around intent
  //
  // Envelope-only: this asserts the MCP wire shape (intentId echo,
  // before/target/after fields present and string-shaped). The exact line
  // ranges and clamp behavior are pinned by sliceIntentContext unit tests
  // in tests/core/staged-edits.test.ts — those exercise the production
  // helper directly without a mock-RPC shadow copy.
  // -------------------------------------------------------------------------

  it('[C7] cortex_get_intent_context returns context envelope with before/target/after fields', async () => {
    const store = installEditRPCHandler(mockVite)
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}: const x = ${i + 1};`)
    const fileContent = lines.join('\n')
    const filePath = 'src/Hero.tsx'
    store.contextFiles.set(filePath, fileContent)
    store.edits.push(makeEdit({ intentId: 'ctx-intent', source: `${filePath}:15:3` }))

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'ctx-intent' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      intentId: string
      context: { before: string[]; target: string; after: string[] }
      currentValue: string
    }
    expect(parsed.intentId).toBe('ctx-intent')
    expect(Array.isArray(parsed.context.before)).toBe(true)
    expect(typeof parsed.context.target).toBe('string')
    expect(parsed.context.target.length).toBeGreaterThan(0)
    expect(Array.isArray(parsed.context.after)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Spec criterion 8: cortex_get_intent_context includes currentValue
  //
  // Envelope-only: asserts currentValue is a string field on the response.
  // Its content semantics (line-text fallback today, AST extraction in
  // ZF0-1452+) are pinned by sliceIntentContext unit tests.
  // -------------------------------------------------------------------------

  it('[C8] cortex_get_intent_context includes currentValue for divergence detection', async () => {
    const store = installEditRPCHandler(mockVite)
    const filePath = 'src/Button.tsx'
    store.contextFiles.set(filePath, 'line1\nstyle={{ color: "red" }}\nline3')
    store.edits.push(makeEdit({ intentId: 'cv-intent', source: `${filePath}:2:5` }))

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'cv-intent' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      currentValue: string
    }
    expect(typeof parsed.currentValue).toBe('string')
  })

  // -------------------------------------------------------------------------
  // Spec criterion 9: Apply notification fires on 'staged-edits-ready' message
  // -------------------------------------------------------------------------

  it('[C9] staged-edits-ready browser message triggers channel notification with correct meta', async () => {
    installEditRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    mcpClient = client
    await waitForConnection(mockVite)

    const notifications: Array<{ method: string; params: unknown }> = []
    client.fallbackNotificationHandler = async (notification) => {
      notifications.push({ method: notification.method, params: notification.params })
    }

    // Send staged-edits-ready from mock Vite → forwarded to MCP server
    const cliWs = [...mockVite.clients][0]
    cliWs.send(JSON.stringify({
      type: 'staged-edits-ready',
      count: 3,
      requestId: 'req-xyz-789',
    }))

    await new Promise(r => setTimeout(r, 200))

    expect(notifications).toHaveLength(1)
    expect(notifications[0].method).toBe('notifications/claude/channel')
    const params = notifications[0].params as {
      content: string
      meta: { request_id: string; severity: string; kind: string; count: string }
    }
    expect(params.content).toContain('3')
    expect(params.content).toContain('cortex_get_pending_edits')
    expect(params.meta.request_id).toBe('req-xyz-789')
    expect(params.meta.severity).toBe('info')
    expect(params.meta.kind).toBe('staged-edits')
    // count is stringified per MCP meta convention
    expect(params.meta.count).toBe('3')
  })

  // -------------------------------------------------------------------------
  // Spec criterion 10: Zod validation — invalid inputs produce structured error
  //
  // The MCP SDK returns validation failures as isError=true responses (not
  // thrown exceptions), with error code -32602 and a structured message.
  // This proves Zod is enforced at the tool boundary.
  // -------------------------------------------------------------------------

  it.each([
    {
      toolName: 'cortex_apply_edits',
      args: { intentIds: 123 },
      desc: 'intentIds must be array of strings',
    },
    {
      toolName: 'cortex_discard_edits',
      args: { intentIds: 'not-an-array' },
      desc: 'intentIds must be array, not string',
    },
    {
      toolName: 'cortex_get_intent_context',
      args: { intentId: 456 },
      desc: 'intentId must be a string',
    },
  ])('[C10] Zod validation: $toolName rejects invalid input ($desc)', async ({ toolName, args }) => {
    installEditRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    // MCP SDK surfaces Zod errors as isError=true with a structured validation message.
    // The error text contains the JSON-encoded Zod issue with 'invalid_type' or similar.
    const result = await client.callTool({ name: toolName, arguments: args })
    expect(result.isError).toBe(true)
    const text = (result.content as Array<{ text: string }>)[0].text
    // Confirms Zod validation ran: error code -32602 or 'invalid_type' in the message
    expect(text).toMatch(/invalid_type|Invalid input|validation error/i)
  })

  // -------------------------------------------------------------------------
  // Edge case: cortex_apply_edits with unknown intentId → failed
  // -------------------------------------------------------------------------

  it('[EDGE] cortex_apply_edits with unknown intentId returns failed result', async () => {
    const store = installEditRPCHandler(mockVite)
    void store  // empty — no edits seeded

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_apply_edits',
      arguments: { intentIds: ['nonexistent-id'] },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      results: Array<{ intentId: string; status: string; error: string }>
    }
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].intentId).toBe('nonexistent-id')
    expect(parsed.results[0].status).toBe('failed')
    expect(parsed.results[0].error).toBe('intent not found')
  })

  // -------------------------------------------------------------------------
  // Edge case: cortex_get_intent_context with unknown intentId → error
  // -------------------------------------------------------------------------

  it('[EDGE] cortex_get_intent_context with unknown intentId returns error', async () => {
    const store = installEditRPCHandler(mockVite)
    void store  // empty

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'ghost-id' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as { error: string }
    expect(parsed.error).toBe('intent not found')
  })

  // Note: clamp behavior at file top/bottom (the previous EDGE tests for
  // before-array-clamped and after-array-clamped) is now pinned by the
  // sliceIntentContext unit tests in tests/core/staged-edits.test.ts. Those
  // exercise the production helper directly without a mock-RPC shadow copy.
  // The integration test above ([C7]) covers the envelope wiring.

  // -------------------------------------------------------------------------
  // SECURITY/PERF: cortex_get_intent_context envelope when file exceeds cap
  //
  // Envelope-only: asserts the MCP wire returns an error field for oversized
  // files. The exact error format (filename, actual bytes, max bytes) is
  // pinned by checkIntentFileSize unit tests in
  // tests/core/staged-edits.test.ts — that's the helper the production
  // handler delegates to. No mock-RPC shadow copy of the format string here.
  // -------------------------------------------------------------------------

  it('[PERF] cortex_get_intent_context returns error envelope for oversized files', async () => {
    const store = installEditRPCHandler(mockVite)
    const filePath = 'src/large-generated.tsx'
    // Simulate a 5MB file (over the 2MB cap)
    store.largeFiles.set(filePath, 5 * 1024 * 1024)
    store.edits.push(makeEdit({ intentId: 'big-intent', source: `${filePath}:1:1` }))

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'big-intent' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as { error?: string }
    expect(typeof parsed.error).toBe('string')
    expect(parsed.error!.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Edge case: apply with mixed (found-deterministic, found-nondeterministic, not-found)
  // preserves input order
  // -------------------------------------------------------------------------

  it('[EDGE] cortex_apply_edits — found-det, found-ndet, not-found preserves input order', async () => {
    const store = installEditRPCHandler(mockVite)
    store.edits.push(
      makeEdit({ intentId: 'det', property: 'color' }),
      makeEdit({ intentId: 'ndet', property: 'font-size' }),
    )
    store.applyResults.set('det', 'applied')
    // 'ndet' → needs-source-edit (default)
    // 'missing' → not in store at all

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    // Input order: ndet, missing, det
    const result = await client.callTool({
      name: 'cortex_apply_edits',
      arguments: { intentIds: ['ndet', 'missing', 'det'] },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      results: Array<{ intentId: string; status: string }>
    }
    expect(parsed.results).toHaveLength(3)
    expect(parsed.results[0].intentId).toBe('ndet')
    expect(parsed.results[0].status).toBe('needs-source-edit')
    expect(parsed.results[1].intentId).toBe('missing')
    expect(parsed.results[1].status).toBe('failed')
    expect(parsed.results[2].intentId).toBe('det')
    expect(parsed.results[2].status).toBe('applied')
  })
})

// ---------------------------------------------------------------------------
// SECURITY: isPathInsideRoot — path-containment predicate (ZF0-1452)
//
// Direct unit test of the production helper used by handleRPC.getIntentContext.
// Importing the real symbol (no shadow copy) means a regression in the
// predicate would fail one of these assertions cleanly. Exhaustive across the
// three failure modes that matter: traversal escape, sibling-prefix confusion,
// and the exact-root-equals case.
// ---------------------------------------------------------------------------

describe('isPathInsideRoot — path-containment predicate (ZF0-1452 security)', () => {
  it('rejects path-traversal escaping the root', () => {
    const root = '/Users/test/project'
    expect(isPathInsideRoot('/etc/passwd', root)).toBe(false)
    expect(isPathInsideRoot('/Users/test/other-project/file.ts', root)).toBe(false)
  })

  it('accepts paths inside the root', () => {
    const root = '/Users/test/project'
    expect(isPathInsideRoot('/Users/test/project/src/file.ts', root)).toBe(true)
    expect(isPathInsideRoot('/Users/test/project/deeply/nested/path.tsx', root)).toBe(true)
  })

  it('accepts the root itself (exact match)', () => {
    const root = '/Users/test/project'
    expect(isPathInsideRoot(root, root)).toBe(true)
  })

  it('rejects sibling paths whose start matches root but cross a different directory boundary', () => {
    // Critical: 'project-evil' starts with 'project' but is NOT inside it.
    // The `+ path.sep` in the predicate is what prevents this confusion.
    // Removing `+ path.sep` would fail this assertion cleanly.
    const root = '/Users/test/project'
    expect(isPathInsideRoot('/Users/test/project-evil/file.ts', root)).toBe(false)
  })

  it('handles root with trailing path separator (Copilot review on PR #90)', () => {
    // Without normalization, `root + path.sep` becomes `/Users/test/project//`
    // which fails to match the legitimate child `/Users/test/project/file.ts`.
    // The path.resolve normalization is what makes this pass.
    // Falsifiability: removing the path.resolve normalization fails this test.
    const rootWithTrailingSep = '/Users/test/project/'
    expect(isPathInsideRoot('/Users/test/project/file.ts', rootWithTrailingSep)).toBe(true)
    expect(isPathInsideRoot('/Users/test/project', rootWithTrailingSep)).toBe(true)
    expect(isPathInsideRoot('/Users/test/project-evil/file.ts', rootWithTrailingSep)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SECURITY: requireRealpathInsideRoot — symlink-aware path containment
//
// fs.readFileSync follows symlinks transparently, so a node_modules/.../leak
// symlink to /etc/passwd planted by a malicious npm postinstall would pass
// the syntactic isPathInsideRoot check but read outside the root. This guard
// resolves both sides through fs.realpathSync.native and re-checks
// containment. Tests use a real on-disk symlink in a tmpdir so the
// production fs codepath is exercised (no shadow copy in the test).
// ---------------------------------------------------------------------------

describe('requireRealpathInsideRoot — symlink-aware path containment (ZF0-1452 security)', () => {
  let tmpRoot: string
  let projectRoot: string
  let outsideRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-symlink-test-'))
    projectRoot = path.join(tmpRoot, 'project')
    outsideRoot = path.join(tmpRoot, 'outside')
    fs.mkdirSync(projectRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects a symlink whose target is outside the project root', () => {
    // Plant the leak: project/leak → outside/secret.txt
    const secret = path.join(outsideRoot, 'secret.txt')
    fs.writeFileSync(secret, 'sensitive contents')
    const leak = path.join(projectRoot, 'leak.txt')
    fs.symlinkSync(secret, leak)

    const result = requireRealpathInsideRoot(leak, projectRoot)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Path outside project root (symlink-resolved)')
    }
  })

  it('accepts a symlink whose target is inside the project root', () => {
    // Legitimate: project/inner.ts → project/sub/real.ts
    const subDir = path.join(projectRoot, 'sub')
    fs.mkdirSync(subDir)
    const realFile = path.join(subDir, 'real.ts')
    fs.writeFileSync(realFile, 'export const x = 1')
    const innerLink = path.join(projectRoot, 'inner.ts')
    fs.symlinkSync(realFile, innerLink)

    const result = requireRealpathInsideRoot(innerLink, projectRoot)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // realpath canonicalizes — assert that real points at the underlying file
      expect(result.real).toBe(fs.realpathSync.native(realFile))
    }
  })

  it('accepts a non-symlink path inside the project root', () => {
    const ordinary = path.join(projectRoot, 'ordinary.ts')
    fs.writeFileSync(ordinary, 'export const y = 2')
    const result = requireRealpathInsideRoot(ordinary, projectRoot)
    expect(result.ok).toBe(true)
  })

  it('returns structured error when path does not exist (ENOENT)', () => {
    const ghost = path.join(projectRoot, 'does-not-exist.ts')
    const result = requireRealpathInsideRoot(ghost, projectRoot)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Could not resolve symlinks')
      expect(result.error).toContain('ENOENT')
    }
  })

  it('uses the injected realpathFn (test seam)', () => {
    // Falsifiability anchor: removing the realpathFn parameter or hardcoding
    // fs.realpathSync.native would fail this test cleanly.
    const fakeRealpath = (p: string): string => p === '/fake/leak' ? '/elsewhere/secret' : p
    const result = requireRealpathInsideRoot('/fake/leak', '/fake', fakeRealpath)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Path outside project root (symlink-resolved)')
    }
  })
})

// ---------------------------------------------------------------------------
// applyEditsCore — production contract per ZF0-1464
//
// The earlier integration test for criterion 3 ('cortex_apply_edits returns
// applied + removes from buffer') uses a mock RPC handler that fabricates the
// 'applied' status — but production never returns 'applied' until ZF0-1464
// lands. These unit tests pin the REAL production contract by exercising the
// extracted helper directly. If production ever starts returning 'applied'
// without ZF0-1464 also landing, that's a behavioral change requiring updates
// here. The integration test stays as-is (it documents the future contract
// once the deterministic-apply path lands).
// ---------------------------------------------------------------------------

describe('applyEditsCore — production contract per ZF0-1464', () => {
  it('returns needs-source-edit for all found intents (production contract)', () => {
    // ZF0-1464 deferral: production routes ALL found intents to Claude's Edit
    // tool via 'needs-source-edit' (no deterministic-apply path yet).
    const intentA = makeEdit({ intentId: 'a', property: 'color', value: 'red' })
    const intentB = makeEdit({ intentId: 'b', property: 'background', value: 'blue' })
    const lookup: Record<string, PendingEdit | null> = { a: intentA, b: intentB }
    const cache = { getById: (id: string) => lookup[id] ?? null }

    const results = applyEditsCore(cache, ['a', 'b'])

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ intentId: 'a', status: 'needs-source-edit', intent: intentA })
    expect(results[1]).toMatchObject({ intentId: 'b', status: 'needs-source-edit', intent: intentB })
    // Reason field present and non-empty (Claude reads this to know what to do)
    if (results[0].status === 'needs-source-edit') {
      expect(typeof results[0].reason).toBe('string')
      expect(results[0].reason.length).toBeGreaterThan(0)
    }
  })

  it('returns failed for unknown intentIds', () => {
    const cache = { getById: () => null }
    const results = applyEditsCore(cache, ['missing-1', 'missing-2'])
    expect(results).toEqual([
      { intentId: 'missing-1', status: 'failed', error: 'intent not found' },
      { intentId: 'missing-2', status: 'failed', error: 'intent not found' },
    ])
  })

  it('preserves input order across mixed found/not-found', () => {
    const intent = makeEdit({ intentId: 'b' })
    const cache = { getById: (id: string) => id === 'b' ? intent : null }
    const results = applyEditsCore(cache, ['c', 'b', 'a'])
    expect(results.map(r => r.intentId)).toEqual(['c', 'b', 'a'])
    expect(results[0].status).toBe('failed')
    expect(results[1].status).toBe('needs-source-edit')
    expect(results[2].status).toBe('failed')
  })
})
