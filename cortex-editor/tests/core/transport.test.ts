import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { CortexTransport } from '../../src/core/transport.js'

// Helper: connect a WebSocket client and wait for open
async function connectClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  return ws
}

describe('CortexTransport', () => {
  let transport: CortexTransport

  afterEach(async () => {
    await transport?.dispose()
  })

  it('starts on an OS-assigned port', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()
    expect(transport.port).toBeGreaterThan(0)
  })

  it('accepts WebSocket connections', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()
    const ws = await connectClient(transport.port)
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('routes messages from client to handlers', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const received: unknown[] = []
    transport.onMessage((msg) => received.push(msg))

    const ws = await connectClient(transport.port)
    const msg = { type: 'edit', editId: '1', property: 'padding', value: 'md', source: 'App.tsx:1:1', elementSelector: 'div' }
    ws.send(JSON.stringify(msg))

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toEqual(msg)
    ws.close()
  })

  it('broadcasts messages to all connected clients', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws1 = await connectClient(transport.port)
    const ws2 = await connectClient(transport.port)

    const received1: string[] = []
    const received2: string[] = []
    ws1.on('message', (data) => received1.push(data.toString()))
    ws2.on('message', (data) => received2.push(data.toString()))

    const msg = { type: 'hello' as const, protocolVersion: 1, sessionId: 'test' }
    transport.broadcast(msg)

    await vi.waitFor(() => {
      expect(received1).toHaveLength(1)
      expect(received2).toHaveLength(1)
    })

    expect(JSON.parse(received1[0]!)).toEqual(msg)
    expect(JSON.parse(received2[0]!)).toEqual(msg)

    ws1.close()
    ws2.close()
  })

  it('removes disconnected clients from the set', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = await connectClient(transport.port)

    const received: string[] = []
    ws.on('message', (data) => received.push(data.toString()))
    transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'a' })
    await vi.waitFor(() => expect(received).toHaveLength(1))

    ws.close()
    await new Promise((r) => setTimeout(r, 50))

    transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'b' })
  })

  it('ignores malformed JSON messages without crashing', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const received: unknown[] = []
    transport.onMessage((msg) => received.push(msg))

    const ws = await connectClient(transport.port)
    ws.send('not valid json {{{')
    ws.send(JSON.stringify({ type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }))

    await vi.waitFor(() => expect(received).toHaveLength(1))
    ws.close()
  })

  it('sends heartbeat pings at configured interval', async () => {
    transport = new CortexTransport({ port: 0, heartbeatInterval: 50 })
    await transport.start()

    const ws = await connectClient(transport.port)
    const pingReceived = new Promise<void>((resolve) => {
      ws.on('ping', () => resolve())
    })

    await pingReceived
    ws.close()
  })

  it('removes non-OPEN connections during heartbeat sweep', async () => {
    transport = new CortexTransport({ port: 0, heartbeatInterval: 50 })
    await transport.start()

    const ws = await connectClient(transport.port)

    const received: string[] = []
    ws.on('message', (data) => received.push(data.toString()))
    transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'a' })
    await vi.waitFor(() => expect(received).toHaveLength(1))

    ws.terminate()
    await new Promise((r) => setTimeout(r, 100))

    transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'b' })
  })

  it('dispose() resolves after full teardown', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()
    const port = transport.port

    await connectClient(port)
    await transport.dispose()

    const ws2 = new WebSocket(`ws://localhost:${port}`)
    const error = await new Promise<Error>((resolve) => {
      ws2.on('error', resolve)
    })
    expect(error).toBeDefined()
  })

  it('rejects WebSocket connections with non-localhost Origin', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = new WebSocket(`ws://localhost:${transport.port}`, {
      headers: { Origin: 'https://evil.com' },
    })
    const statusCode = await new Promise<number>((resolve, reject) => {
      ws.on('unexpected-response', (_request, response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
      ws.on('error', reject)
    })
    expect(statusCode).toBe(403)
  })

  it('accepts WebSocket connections with localhost Origin', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = new WebSocket(`ws://localhost:${transport.port}`, {
      headers: { Origin: 'http://localhost:3000' },
    })
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('accepts WebSocket connections with 127.0.0.1 Origin', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = new WebSocket(`ws://localhost:${transport.port}`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    })
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('accepts WebSocket connections with IPv6 [::1] Origin (bug #11)', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = new WebSocket(`ws://localhost:${transport.port}`, {
      headers: { Origin: 'http://[::1]:5173' },
    })
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('rejects WebSocket connections with null Origin (sandboxed iframe)', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const ws = new WebSocket(`ws://localhost:${transport.port}`, {
      headers: { Origin: 'null' },
    })
    const statusCode = await new Promise<number>((resolve, reject) => {
      ws.on('unexpected-response', (_request, response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
      ws.on('error', reject)
    })
    expect(statusCode).toBe(403)
  })

  it('onMessage returns unsubscribe function', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const received: unknown[] = []
    const unsub = transport.onMessage((msg) => received.push(msg))

    const ws = await connectClient(transport.port)
    ws.send(JSON.stringify({ type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }))
    await vi.waitFor(() => expect(received).toHaveLength(1))

    unsub()
    ws.send(JSON.stringify({ type: 'edit', editId: '2', property: 'p', value: 'v', source: 's', elementSelector: 'e' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toHaveLength(1)
    ws.close()
  })

  it('double dispose() does not throw', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    await transport.dispose()
    await transport.dispose() // should not throw
  })

  it('handler exception does not prevent other handlers from receiving', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()

    const received: unknown[] = []
    transport.onMessage(() => { throw new Error('boom') })
    transport.onMessage((msg) => received.push(msg))

    const ws = await connectClient(transport.port)
    ws.send(JSON.stringify({ type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }))
    await vi.waitFor(() => expect(received).toHaveLength(1))
    ws.close()
  })
})
