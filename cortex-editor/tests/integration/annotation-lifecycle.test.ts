import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startMCPServer, type MCPServerHandle } from '../../src/cli/mcp.js'
import { AnnotationStore } from '../../src/core/annotations.js'
import http from 'node:http'

describe('annotation lifecycle integration', () => {
  let httpServer: http.Server
  let wss: WebSocketServer
  let port: number
  let mcpHandle: MCPServerHandle | null = null
  let mcpClient: Client | null = null
  let annotationStore: AnnotationStore
  let cliClients: Set<WebSocket>

  beforeEach(async () => {
    annotationStore = new AnnotationStore()
    cliClients = new Set()

    httpServer = http.createServer()
    wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url !== '/@cortex/ws') { socket.destroy(); return }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    })

    wss.on('connection', (ws) => {
      cliClients.add(ws)
      ws.send(JSON.stringify({ type: 'cortex-status', editorActive: false, browserConnected: true }))

      ws.on('message', (raw) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(raw.toString()) } catch { return }

        if (msg.type === 'cortex-rpc') {
          const requestId = msg.requestId as string
          const method = msg.method as string
          const params = (msg.params || {}) as Record<string, unknown>
          const id = typeof params.annotationId === 'string' ? params.annotationId : ''

          try {
            let result: unknown
            switch (method) {
              case 'getActive':   result = annotationStore.getActive(); break
              case 'getPending':  result = annotationStore.getPending(); break
              case 'getDetails':  result = annotationStore.getById(id); break
              case 'acknowledge': result = annotationStore.acknowledge(id); break
              case 'resolve':     result = annotationStore.resolve(id, params.summary as string); break
              case 'dismiss':     result = annotationStore.dismiss(id, params.reason as string | undefined); break
              case 'respond':     result = annotationStore.addMessage(id, { from: 'agent', text: params.text as string }); break
              default:            throw new Error(`Unknown method: ${method}`)
            }
            ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
          } catch (err) {
            ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: (err as Error).message }))
          }
        }
      })

      ws.on('close', () => cliClients.delete(ws))
    })

    port = await new Promise<number>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address()
        resolve(typeof addr === 'object' && addr ? addr.port : 0)
      })
    })
  })

  afterEach(async () => {
    mcpHandle?.close()
    mcpHandle = null
    await mcpClient?.close()
    mcpClient = null
    for (const c of cliClients) c.terminate()
    await new Promise<void>(r => wss.close(() => httpServer.close(() => r())))
  })

  /** Start real MCP server connected to mock Vite via InMemoryTransport. */
  async function startTestMCP(): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '0.1.0' })
    const handlePromise = startMCPServer({ port, transport: serverTransport })
    await client.connect(clientTransport)
    mcpHandle = await handlePromise
    mcpClient = client
    // Wait for MCP's internal WS to connect to our mock server
    await new Promise<void>((resolve) => {
      if (cliClients.size > 0) { resolve(); return }
      wss.once('connection', () => resolve())
    })
    // Allow the cortex-status message to be processed by the MCP server
    await new Promise(r => setTimeout(r, 50))
    return client
  }

  it('full annotation lifecycle: create → get → acknowledge → respond → resolve → empty', async () => {
    // Pre-seed an annotation (simulating a browser comment)
    annotationStore.create({ elementSource: 'App.tsx:10:5', text: 'Make the header blue' })

    const client = await startTestMCP()

    // 1. Get pending — should contain our annotation
    const pending = await client.callTool({ name: 'cortex_get_pending' })
    expect(pending.isError).toBeFalsy()
    const pendingList = JSON.parse((pending.content as Array<{ text: string }>)[0].text)
    expect(pendingList).toHaveLength(1)
    expect(pendingList[0].text).toBe('Make the header blue')
    const annotationId: string = pendingList[0].id

    // 2. Get details — status should be pending
    const details = await client.callTool({ name: 'cortex_get_details', arguments: { annotationId } })
    expect(details.isError).toBeFalsy()
    const detailObj = JSON.parse((details.content as Array<{ text: string }>)[0].text)
    expect(detailObj.status).toBe('pending')
    expect(detailObj.elementSource).toBe('App.tsx:10:5')

    // 3. Acknowledge — status transitions to acknowledged
    const ack = await client.callTool({ name: 'cortex_acknowledge', arguments: { annotationId } })
    expect(ack.isError).toBeFalsy()
    const ackObj = JSON.parse((ack.content as Array<{ text: string }>)[0].text)
    expect(ackObj.status).toBe('acknowledged')

    // 4. Respond (agent asks clarification) — thread grows
    const resp = await client.callTool({ name: 'cortex_respond', arguments: { annotationId, text: 'Which shade of blue?' } })
    expect(resp.isError).toBeFalsy()
    const respObj = JSON.parse((resp.content as Array<{ text: string }>)[0].text)
    expect(respObj.thread).toHaveLength(1)
    expect(respObj.thread[0].text).toBe('Which shade of blue?')
    expect(respObj.thread[0].from).toBe('agent')

    // 5. Resolve — status transitions to resolved, resolution summary recorded
    const resolveResult = await client.callTool({ name: 'cortex_resolve', arguments: { annotationId, summary: 'Changed header bg to #3b82f6' } })
    expect(resolveResult.isError).toBeFalsy()
    const resolveObj = JSON.parse((resolveResult.content as Array<{ text: string }>)[0].text)
    expect(resolveObj.status).toBe('resolved')
    expect(resolveObj.resolution.summary).toBe('Changed header bg to #3b82f6')

    // 6. Get pending — should be empty (resolved annotations are not pending)
    const empty = await client.callTool({ name: 'cortex_get_pending' })
    expect(empty.isError).toBeFalsy()
    const emptyList = JSON.parse((empty.content as Array<{ text: string }>)[0].text)
    expect(emptyList).toHaveLength(0)
  })

  it('dismiss flow: create → dismiss → verify dismissed + no longer pending', async () => {
    annotationStore.create({ elementSource: 'Nav.tsx:5:3', text: 'Too bright' })

    const client = await startTestMCP()

    const pending = await client.callTool({ name: 'cortex_get_pending' })
    const id: string = JSON.parse((pending.content as Array<{ text: string }>)[0].text)[0].id

    const dismiss = await client.callTool({ name: 'cortex_dismiss', arguments: { annotationId: id, reason: 'Intentional design choice' } })
    expect(dismiss.isError).toBeFalsy()
    const obj = JSON.parse((dismiss.content as Array<{ text: string }>)[0].text)
    expect(obj.status).toBe('dismissed')
    expect(obj.dismissReason).toBe('Intentional design choice')

    const empty = await client.callTool({ name: 'cortex_get_pending' })
    expect(JSON.parse((empty.content as Array<{ text: string }>)[0].text)).toHaveLength(0)
  })

  it('multiple annotations: only pending ones appear in cortex_get_pending', async () => {
    const ann1 = annotationStore.create({ elementSource: 'App.tsx:1:1', text: 'First comment' })
    annotationStore.create({ elementSource: 'App.tsx:2:1', text: 'Second comment' })
    annotationStore.create({ elementSource: 'App.tsx:3:1', text: 'Third comment' })

    // Pre-resolve ann1 directly in the store (bypasses RPC, tests store directly)
    annotationStore.acknowledge(ann1.id)
    annotationStore.resolve(ann1.id, 'Already handled')

    const client = await startTestMCP()

    const pending = await client.callTool({ name: 'cortex_get_pending' })
    const list = JSON.parse((pending.content as Array<{ text: string }>)[0].text)
    // Only the two non-resolved annotations should appear
    expect(list).toHaveLength(2)
    const texts = list.map((a: { text: string }) => a.text).sort()
    expect(texts).toEqual(['Second comment', 'Third comment'])
  })

  it('cortex_get_details returns null for unknown annotation id', async () => {
    const client = await startTestMCP()

    const result = await client.callTool({ name: 'cortex_get_details', arguments: { annotationId: 'nonexistent-id' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed).toBeNull()
  })

  it('resolve is blocked when annotation is still pending (not acknowledged)', async () => {
    const ann = annotationStore.create({ elementSource: 'App.tsx:5:1', text: 'Skip ack test' })

    const client = await startTestMCP()

    // Attempt to resolve without acknowledging first — AnnotationStore.resolve requires acknowledged status
    const resolveResult = await client.callTool({ name: 'cortex_resolve', arguments: { annotationId: ann.id, summary: 'Should not work' } })
    expect(resolveResult.isError).toBeFalsy()
    // AnnotationStore.resolve returns null when status !== 'acknowledged'
    const parsed = JSON.parse((resolveResult.content as Array<{ text: string }>)[0].text)
    expect(parsed).toBeNull()

    // Annotation should still be pending in the store
    const details = await client.callTool({ name: 'cortex_get_details', arguments: { annotationId: ann.id } })
    const detailObj = JSON.parse((details.content as Array<{ text: string }>)[0].text)
    expect(detailObj.status).toBe('pending')
  })
})
