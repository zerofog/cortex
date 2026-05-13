import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { WebSocketServer, WebSocket } from 'ws'
import type { ServerChannel } from '../../src/adapters/types.js'
import { CortexSession } from '../../src/core/session.js'
import type { CortexConfig } from '../../src/core/session.js'

function makeConfig(overrides: Partial<CortexConfig> = {}): CortexConfig {
  return { root: '/tmp/test-project', mode: 'development', ...overrides }
}

/** Create a fake WebSocket with a terminate() stub. */
function fakeWs(): WebSocket {
  return { terminate: vi.fn(), readyState: 1 } as unknown as WebSocket
}

/** Create a fake WebSocketServer with a close() stub. */
function fakeWss(): WebSocketServer {
  return { close: vi.fn() } as unknown as WebSocketServer
}

/** Create a fake ServerChannel with the given dispose and stubs for everything else. */
function fakeChannel(dispose: ServerChannel['dispose'] = vi.fn().mockResolvedValue(undefined)): ServerChannel {
  return { dispose, send: vi.fn(), broadcast: vi.fn(), onMessage: vi.fn() }
}

describe('CortexSession', () => {
  let session: CortexSession

  beforeEach(() => {
    session = new CortexSession(makeConfig())
  })

  describe('constructor', () => {
    it('stores the config', () => {
      const config = makeConfig({ root: '/my/project' })
      const s = new CortexSession(config)
      expect(s.config).toBe(config)
    })

    it('initializes annotations store', () => {
      expect(session.annotations.getAll()).toEqual([])
    })

    it('initializes activity log', () => {
      expect(session.activityLog.count).toBe(0)
    })

    it('initializes empty collections', () => {
      expect(session.cliClients.size).toBe(0)
      expect(session.hmrCallbacks).toEqual([])
      expect(session.recentEditWriteTimers.size).toBe(0)
    })

    it('initializes nullable state to null', () => {
      expect(session.channel).toBeNull()
      expect(session.cliWss).toBeNull()
      expect(session.heartbeatTimer).toBeNull()
      expect(session.upgradeHandlerRef).toBeNull()
      expect(session.portFilePath).toBeNull()
      expect(session.pipeline).toBeNull()
      expect(session.hmrUnsubscribe).toBeNull()
      expect(session.capabilitiesCache).toBeNull()
    })

    it('initializes boolean flags to false', () => {
      expect(session.editorActive).toBe(false)
      expect(session.browserConnected).toBe(false)
    })
  })

  describe('dispose', () => {
    it('clears the heartbeat interval', async () => {
      const timer = setInterval(() => {}, 30_000)
      session.heartbeatTimer = timer
      const clearSpy = vi.spyOn(globalThis, 'clearInterval')

      await session.dispose()

      expect(clearSpy).toHaveBeenCalledWith(timer)
      expect(session.heartbeatTimer).toBeNull()
      clearSpy.mockRestore()
    })

    it('terminates all CLI clients and clears the set', async () => {
      const ws1 = fakeWs()
      const ws2 = fakeWs()
      session.cliClients.add(ws1)
      session.cliClients.add(ws2)

      await session.dispose()

      expect(ws1.terminate).toHaveBeenCalled()
      expect(ws2.terminate).toHaveBeenCalled()
      expect(session.cliClients.size).toBe(0)
    })

    it('closes the CLI WebSocket server', async () => {
      const wss = fakeWss()
      session.cliWss = wss

      await session.dispose()

      expect(wss.close).toHaveBeenCalled()
      expect(session.cliWss).toBeNull()
    })

    it('removes the port file', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-session-test-'))
      try {
        const portFile = path.join(tmpDir, 'port')
        fs.writeFileSync(portFile, '3000')
        session.portFilePath = portFile

        await session.dispose()

        expect(fs.existsSync(portFile)).toBe(false)
        expect(session.portFilePath).toBeNull()
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('suppresses port file removal errors', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-session-test-'))
      try {
        // Point at a unique path that doesn't exist — unlinkSync will throw ENOENT
        session.portFilePath = path.join(tmpDir, 'nonexistent-port-file')

        // Should not throw
        await session.dispose()
        expect(session.portFilePath).toBeNull()
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('disposes the pipeline', async () => {
      const dispose = vi.fn()
      session.pipeline = { dispose } as unknown as typeof session.pipeline

      await session.dispose()

      expect(dispose).toHaveBeenCalled()
      expect(session.pipeline).toBeNull()
    })

    it('disposes the channel', async () => {
      const dispose = vi.fn().mockResolvedValue(undefined)
      session.channel = fakeChannel(dispose)

      await session.dispose()

      expect(dispose).toHaveBeenCalled()
      expect(session.channel).toBeNull()
    })

    it('calls hmrUnsubscribe', async () => {
      const unsub = vi.fn()
      session.hmrUnsubscribe = unsub

      await session.dispose()

      expect(unsub).toHaveBeenCalled()
      expect(session.hmrUnsubscribe).toBeNull()
    })

    it('resets all mutable state', async () => {
      session.editorActive = true
      session.browserConnected = true
      session.hmrCallbacks.push(() => {})
      // Use a never-firing timer so dispose's clearTimeout path is
      // exercised without a real wait. Value-shape must match the
      // Map's type signature (ReturnType<typeof setTimeout>).
      session.recentEditWriteTimers.set('file.tsx', setTimeout(() => {}, 999999))
      session.capabilitiesCache = [{ name: 'Tailwind', status: 'supported' }]

      await session.dispose()

      expect(session.editorActive).toBe(false)
      expect(session.browserConnected).toBe(false)
      expect(session.hmrCallbacks).toHaveLength(0)
      expect(session.recentEditWriteTimers.size).toBe(0)
      expect(session.capabilitiesCache).toBeNull()
      expect(session.upgradeHandlerRef).toBeNull()
    })

    it('awaits channel dispose before completing', async () => {
      const order: string[] = []
      const dispose = vi.fn(() => new Promise<void>(resolve => {
        order.push('channel-dispose-start')
        setTimeout(() => { order.push('channel-dispose-end'); resolve() }, 10)
      }))
      session.channel = fakeChannel(dispose)

      await session.dispose()
      order.push('session-dispose-done')

      expect(order).toEqual(['channel-dispose-start', 'channel-dispose-end', 'session-dispose-done'])
    })

    it('exposes isDisposed state', async () => {
      expect(session.isDisposed).toBe(false)
      await session.dispose()
      expect(session.isDisposed).toBe(true)
    })

    it('disposes hmrUnsubscribe before pipeline', async () => {
      const order: string[] = []
      session.hmrUnsubscribe = () => { order.push('hmr-unsub') }
      session.pipeline = { dispose: () => { order.push('pipeline') } } as unknown as typeof session.pipeline

      await session.dispose()

      expect(order.indexOf('hmr-unsub')).toBeLessThan(order.indexOf('pipeline'))
    })

    it('disposes pipeline before channel', async () => {
      const order: string[] = []
      session.pipeline = { dispose: () => { order.push('pipeline') } } as unknown as typeof session.pipeline
      session.channel = fakeChannel(async () => { order.push('channel') })

      await session.dispose()

      expect(order).toEqual(['pipeline', 'channel'])
    })

    it('continues cleanup when a step throws', async () => {
      const unsub = vi.fn()
      session.hmrUnsubscribe = unsub
      session.pipeline = {
        dispose: () => { throw new Error('pipeline boom') },
      } as unknown as typeof session.pipeline

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await session.dispose()

      expect(unsub).toHaveBeenCalled() // hmrUnsubscribe ran before pipeline (step 5 vs 6)
      expect(session.pipeline).toBeNull()
      expect(session.editorActive).toBe(false) // step 8 still ran
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('continues cleanup when channel.dispose() rejects', async () => {
      session.editorActive = true
      session.channel = fakeChannel(vi.fn().mockRejectedValue(new Error('channel boom')))

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await session.dispose()

      expect(session.channel).toBeNull()
      expect(session.editorActive).toBe(false) // step 8 still ran
      errorSpy.mockRestore()
    })

    it('is idempotent — second dispose is a no-op', async () => {
      const wss = fakeWss()
      session.cliWss = wss

      await session.dispose()
      await session.dispose() // should not throw

      expect(wss.close).toHaveBeenCalledTimes(1)
    })
  })

  describe('annotations persistence integration', () => {
    let tmpDir: string
    let filePath: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-session-int-'))
      filePath = path.join(tmpDir, 'annotations.json')
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('survives a session restart when annotationsFilePath is set', async () => {
      // Session 1: create + acknowledge + resolve an annotation
      const session1 = new CortexSession({
        root: tmpDir,
        mode: 'development',
        annotationsFilePath: filePath,
      })
      const ann = session1.annotations.create({
        elementSource: 'App.tsx:1:1',
        text: 'survive the restart',
      })
      session1.annotations.acknowledge(ann.id)
      session1.annotations.resolve(ann.id, 'all good')
      await session1.dispose()

      // Session 2: fresh CortexSession, same path → annotation should be hydrated
      const session2 = new CortexSession({
        root: tmpDir,
        mode: 'development',
        annotationsFilePath: filePath,
      })
      const hydrated = session2.annotations.getById(ann.id)
      expect(hydrated).not.toBeNull()
      expect(hydrated?.status).toBe('resolved')
      expect(hydrated?.resolution).toEqual({ summary: 'all good' })
      await session2.dispose()
    })

    it('does NOT persist when annotationsFilePath is unset', async () => {
      const ephemeralSession = new CortexSession({ root: tmpDir, mode: 'development' })
      ephemeralSession.annotations.create({ elementSource: 'App.tsx:1:1', text: 'ephemeral' })
      await ephemeralSession.dispose()

      // No file at the specific path we'd expect, AND nothing else written
      // into tmpDir either — proves the store wasn't asked to persist anywhere,
      // not just that this one path is absent.
      expect(fs.existsSync(filePath)).toBe(false)
      expect(fs.readdirSync(tmpDir)).toEqual([])
    })
  })

  describe('session independence', () => {
    it('new session after dispose has completely independent state', async () => {
      // Populate session A with non-default state
      session.editorActive = true
      session.browserConnected = true
      session.annotations.create({ elementSource: 'div.test', text: 'a comment' })
      session.cliWss = fakeWss()
      session.cliClients.add(fakeWs())

      const tokenA = session.token
      const sessionIdA = session.sessionId

      await session.dispose()

      // Create session B with the same config
      const sessionB = new CortexSession(makeConfig())

      // Session B must have completely fresh state
      expect(sessionB.token).not.toBe(tokenA)
      expect(sessionB.sessionId).not.toBe(sessionIdA)
      expect(sessionB.annotations.getAll()).toEqual([])
      expect(sessionB.activityLog.count).toBe(0)
      expect(sessionB.editorActive).toBe(false)
      expect(sessionB.browserConnected).toBe(false)
      expect(sessionB.cliClients.size).toBe(0)
      expect(sessionB.isDisposed).toBe(false)
    })
  })
})
