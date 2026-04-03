import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { WebSocketServer, WebSocket } from 'ws'
import { CortexSession } from '../../src/core/session.js'
import type { ResolvedConfig } from 'vite'

/** Minimal ResolvedConfig stub — only the fields CortexSession needs. */
function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { root: '/tmp/test-project', ...overrides } as unknown as ResolvedConfig
}

/** Create a fake WebSocket with a terminate() stub. */
function fakeWs(): InstanceType<typeof WebSocket> {
  return { terminate: vi.fn(), readyState: 1 } as unknown as InstanceType<typeof WebSocket>
}

/** Create a fake WebSocketServer with a close() stub. */
function fakeWss(): InstanceType<typeof WebSocketServer> {
  return { close: vi.fn() } as unknown as InstanceType<typeof WebSocketServer>
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
      expect(session.annotations).toBeDefined()
      expect(session.annotations.getAll()).toEqual([])
    })

    it('initializes activity log', () => {
      expect(session.activityLog).toBeDefined()
      expect(session.activityLog.count).toBe(0)
    })

    it('initializes empty collections', () => {
      expect(session.cliClients.size).toBe(0)
      expect(session.hmrCallbacks).toEqual([])
      expect(session.recentEditWrites.size).toBe(0)
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
      // Point at a file that doesn't exist — unlinkSync will throw ENOENT
      session.portFilePath = path.join(os.tmpdir(), 'cortex-nonexistent-port-file')

      // Should not throw
      await session.dispose()
      expect(session.portFilePath).toBeNull()
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
      session.channel = { dispose, send: vi.fn(), broadcast: vi.fn(), onMessage: vi.fn() }

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
      session.recentEditWrites.add('file.tsx')
      session.capabilitiesCache = [{ system: 'tailwind', status: 'ready', label: 'Tailwind' }] as typeof session.capabilitiesCache

      await session.dispose()

      expect(session.editorActive).toBe(false)
      expect(session.browserConnected).toBe(false)
      expect(session.hmrCallbacks).toHaveLength(0)
      expect(session.recentEditWrites.size).toBe(0)
      expect(session.capabilitiesCache).toBeNull()
      expect(session.upgradeHandlerRef).toBeNull()
    })

    it('awaits channel dispose before completing', async () => {
      const order: string[] = []
      const dispose = vi.fn(() => new Promise<void>(resolve => {
        order.push('channel-dispose-start')
        setTimeout(() => { order.push('channel-dispose-end'); resolve() }, 10)
      }))
      session.channel = { dispose, send: vi.fn(), broadcast: vi.fn(), onMessage: vi.fn() }

      await session.dispose()
      order.push('session-dispose-done')

      expect(order).toEqual(['channel-dispose-start', 'channel-dispose-end', 'session-dispose-done'])
    })

    it('exposes isDisposed state', async () => {
      expect(session.isDisposed).toBe(false)
      await session.dispose()
      expect(session.isDisposed).toBe(true)
    })

    it('is idempotent — second dispose is a no-op', async () => {
      const wss = fakeWss()
      session.cliWss = wss

      await session.dispose()
      await session.dispose() // should not throw

      expect(wss.close).toHaveBeenCalledTimes(1)
    })
  })
})
