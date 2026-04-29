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
import { isPathInsideRoot } from '../../src/adapters/vite.js'
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
}

/**
 * Install RPC handler for staged-edit methods on the mock Vite WebSocket.
 * Also returns the store so tests can seed and inspect it.
 */
function installEditRPCHandler(mock: MockViteServer): MockStore {
  const store: MockStore = {
    edits: [],
    applyResults: new Map(),
    contextFiles: new Map(),
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

  it('[C3] cortex_apply_edits — deterministic intent returns applied + removes from buffer', async () => {
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
  // -------------------------------------------------------------------------

  it('[C7] cortex_get_intent_context returns ~20 lines of context around intent location', async () => {
    const store = installEditRPCHandler(mockVite)
    // Create a file with 30+ lines
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}: const x = ${i + 1};`)
    const fileContent = lines.join('\n')
    const filePath = 'src/Hero.tsx'
    store.contextFiles.set(filePath, fileContent)

    const edit = makeEdit({
      intentId: 'ctx-intent',
      source: `${filePath}:15:3`,  // line 15 (1-based)
    })
    store.edits.push(edit)

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
    expect(parsed.context.target).toBe('line 15: const x = 15;')
    // before: lines 5-14 (10 lines)
    expect(parsed.context.before).toHaveLength(10)
    expect(parsed.context.before[0]).toBe('line 5: const x = 5;')
    expect(parsed.context.before[9]).toBe('line 14: const x = 14;')
    // after: lines 16-25 (10 lines)
    expect(parsed.context.after).toHaveLength(10)
    expect(parsed.context.after[0]).toBe('line 16: const x = 16;')
    expect(parsed.context.after[9]).toBe('line 25: const x = 25;')
  })

  // -------------------------------------------------------------------------
  // Spec criterion 8: cortex_get_intent_context includes currentValue
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
    // currentValue is the target line text (line-text fallback)
    expect(typeof parsed.currentValue).toBe('string')
    expect(parsed.currentValue).toBe('style={{ color: "red" }}')
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

  // -------------------------------------------------------------------------
  // Edge case: getIntentContext near top of file — before array is shorter (clamped)
  // -------------------------------------------------------------------------

  it('[EDGE] cortex_get_intent_context near top of file — before array is clamped', async () => {
    const store = installEditRPCHandler(mockVite)
    const filePath = 'src/Top.tsx'
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    store.contextFiles.set(filePath, lines.join('\n'))
    store.edits.push(makeEdit({ intentId: 'top-intent', source: `${filePath}:2:1` }))

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'top-intent' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      context: { before: string[]; target: string; after: string[] }
    }
    // Line 2 → only 1 line before (line 1), not 10
    expect(parsed.context.before.length).toBeLessThan(10)
    expect(parsed.context.before).not.toContain(undefined)
    expect(parsed.context.target).toBe('line 2')
  })

  // -------------------------------------------------------------------------
  // Edge case: getIntentContext near end of file — after array is shorter (clamped)
  // -------------------------------------------------------------------------

  it('[EDGE] cortex_get_intent_context near end of file — after array is clamped', async () => {
    const store = installEditRPCHandler(mockVite)
    const filePath = 'src/Bottom.tsx'
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`)
    store.contextFiles.set(filePath, lines.join('\n'))
    // Line 11 of 12 — only 1 line after
    store.edits.push(makeEdit({ intentId: 'bot-intent', source: `${filePath}:11:1` }))

    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    await new Promise(r => setTimeout(r, 50))

    const result = await client.callTool({
      name: 'cortex_get_intent_context',
      arguments: { intentId: 'bot-intent' },
    })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
      context: { before: string[]; target: string; after: string[] }
    }
    expect(parsed.context.target).toBe('line 11')
    // Only 1 line after (line 12)
    expect(parsed.context.after).toHaveLength(1)
    expect(parsed.context.after[0]).toBe('line 12')
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
