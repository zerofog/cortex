import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cortexWebpack,
  createManualInjectionSnippet,
  injectWebpackHtml,
} from '../../src/adapters/webpack.js'

const cleanupDirs: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('cortexWebpack adapter', () => {
  it('adds the shared source loader as a pre-rule', () => {
    const plugin = cortexWebpack({
      projectRoot: '/project',
      resolveAlias: { '@': '/project/src' },
      includeNodeModules: ['@acme/ui'],
    })
    const compiler = createMockCompiler('/project')

    plugin.apply(compiler)

    expect(compiler.options.module.rules).toHaveLength(1)
    const rule = compiler.options.module.rules[0] as {
      test: RegExp
      enforce: string
      exclude: (resourcePath: string) => boolean
      use: Array<{ loader: string; options: Record<string, unknown> }>
    }
    expect(rule.test).toEqual(/\.[jt]sx$/)
    expect(rule.enforce).toBe('pre')
    expect(rule.exclude('/project/node_modules/react/index.jsx')).toBe(true)
    expect(rule.exclude('/project/node_modules/@acme/ui/Button.tsx')).toBe(false)
    expect(rule.use[0]!.loader).toMatch(/source-loader/)
    expect(rule.use[0]!.options).toMatchObject({
      projectRoot: '/project',
      resolveAlias: { '@': '/project/src' },
      includeNodeModules: ['@acme/ui'],
    })
  })

  it('does not mutate compiler config or start Cortex during production builds', async () => {
    const plugin = cortexWebpack({ projectRoot: '/project' })
    const compiler = createMockCompiler('/project')
    compiler.options.mode = 'production'

    plugin.apply(compiler)

    expect(compiler.options.module.rules).toHaveLength(0)
    await compiler.hooks.watchRun.run()
    expect(fs.existsSync('/project/.cortex/port')).toBe(false)
  })

  it('injects token, session, WebSocket port, and browser script before head close', () => {
    const result = injectWebpackHtml('<html><head><title>x</title></head><body></body></html>', {
      port: 34567,
      token: 'token-1',
      sessionId: 'session-1',
      browserScriptUrl: 'http://localhost:34567/@cortex/browser.js',
      toggleShortcut: '$mod+Shift+Period',
    })

    expect(result).toContain('window.__cortex_ws_port__=34567')
    expect(result).toContain('window.__CORTEX_TOKEN__="token-1"')
    expect(result).toContain('window.__CORTEX_SESSION_ID__="session-1"')
    expect(result).toContain('__cortex_toggle_registered__')
    expect(result).toContain('__cortexScript.src = "http://localhost:34567/@cortex/browser.js"')
    expect(result.indexOf('__cortex_ws_port__')).toBeLessThan(result.indexOf('</head>'))
  })

  it('leaves HTML unchanged when </head> is absent', () => {
    const html = '<html><body>no head close</body></html>'

    expect(injectWebpackHtml(html, {
      port: 34567,
      token: 'token-1',
      sessionId: 'session-1',
      browserScriptUrl: 'http://localhost:34567/@cortex/browser.js',
      toggleShortcut: '$mod+Shift+Period',
    })).toBe(html)
  })

  it('provides a manual snippet for HtmlWebpackPlugin-free projects', () => {
    const snippet = createManualInjectionSnippet({
      port: 34567,
      token: 'token-1',
      sessionId: 'session-1',
      browserScriptUrl: 'http://localhost:34567/@cortex/browser.js',
      toggleShortcut: '$mod+Shift+Slash',
    })

    expect(snippet).toContain('window.__cortex_ws_port__=34567')
    expect(snippet).toContain('window.__CORTEX_TOKEN__="token-1"')
    expect(snippet).toContain('"$mod+Shift+Slash"')
    expect(snippet).toContain('/@cortex/browser.js')
  })

  it('rejects invalid Webpack toggle shortcuts before mutating compiler config', () => {
    expect(() => cortexWebpack({ toggleShortcut: 'Command+X' })).toThrow('[cortex] Invalid toggleShortcut')
  })

  it('registers HtmlWebpackPlugin beforeEmit injection when HtmlWebpackPlugin is present', async () => {
    const root = makeTempProject()
    const beforeEmit = createAsyncWaterfallHook<{ html: string }>()
    class HtmlWebpackPluginMock {
      static getHooks() {
        return { beforeEmit }
      }
    }
    const compiler = createMockCompiler(root)
    compiler.options.plugins = [new HtmlWebpackPluginMock()]
    const plugin = cortexWebpack({ projectRoot: root })
    const compilation = createMockCompilation()

    plugin.apply(compiler)
    compiler.hooks.thisCompilation.run(compilation)
    const result = await beforeEmit.run({ html: '<html><head></head><body></body></html>' })

    expect(result.html).toContain('window.__cortex_ws_port__=')
    expect(result.html).toContain('window.__CORTEX_TOKEN__=')
    expect(result.html).toContain('/@cortex/browser.js')

    await compiler.hooks.shutdown.run()
  })

  it('starts the Webpack bridge, writes discovery files, and cleans them on shutdown', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()

    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const tokenPath = path.join(root, '.cortex', 'token')
    expect(Number(port)).toBeGreaterThan(0)
    expect(fs.readFileSync(tokenPath, 'utf8').trim()).toHaveLength(36)

    await compiler.hooks.shutdown.run()

    expect(fs.existsSync(path.join(root, '.cortex', 'port'))).toBe(false)
    expect(fs.existsSync(tokenPath)).toBe(false)
  })

  it('keeps the bridge running when discovery files cannot be written', async () => {
    const root = makeTempProject()
    fs.writeFileSync(path.join(root, '.cortex'), 'not a directory')
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      plugin.apply(compiler)
      await expect(compiler.hooks.watchRun.run()).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(
        '[cortex] Could not create .cortex/ directory:',
        expect.any(String),
      )
    } finally {
      warnSpy.mockRestore()
      await compiler.hooks.shutdown.run()
    }
  })

  it('accepts MCP connections on /@cortex/ws and returns status', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const ws = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(ws)
      ws.send(JSON.stringify({ type: 'cortex-status-request', token }))
      const message = await nextMessageOfType(ws, 'cortex-status')
      expect(message).toMatchObject({
        type: 'cortex-status',
        editorActive: false,
        browserConnected: false,
      })
    } finally {
      ws.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects MCP status requests without the discovery token', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const ws = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(ws)
      ws.send(JSON.stringify({ type: 'cortex-status-request' }))
      const message = await nextMessageOfType(ws, 'error')
      expect(message).toMatchObject({
        type: 'error',
        code: 'AUTH_FAILED',
      })
    } finally {
      ws.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects browser WebSocket connections from non-local origins', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const ws = new WebSocket(`ws://localhost:${port}/cortex`, {
      headers: { origin: 'https://example.com' },
    })

    try {
      await expectRejectedConnection(ws)
    } finally {
      ws.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects browser init handshakes without the discovery token', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const ws = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(ws)
      ws.send(JSON.stringify({ type: 'init' }))
      const message = await nextMessage(ws)
      expect(message).toMatchObject({
        type: 'error',
        code: 'AUTH_FAILED',
      })
    } finally {
      ws.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('does not broadcast server messages to browser sockets before token-gated init', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const unauthenticatedBrowser = new WebSocket(`ws://localhost:${port}/cortex`)
    const authenticatedBrowser = new WebSocket(`ws://localhost:${port}/cortex`)
    const cli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(unauthenticatedBrowser)
      await waitForOpen(authenticatedBrowser)
      authenticatedBrowser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(authenticatedBrowser, 'hello')

      await waitForOpen(cli)
      cli.send(JSON.stringify({ type: 'cortex', token }))

      await nextMessageOfType(authenticatedBrowser, 'cortex')
      await expectNoMessageOfType(unauthenticatedBrowser, 'cortex')
    } finally {
      cli.close()
      authenticatedBrowser.close()
      unauthenticatedBrowser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('accepts browser WebSocket init on /cortex and sends hello', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const ws = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(ws)
      ws.send(JSON.stringify({ type: 'init', token }))
      const message = await nextMessage(ws)
      expect(message).toMatchObject({ type: 'hello', protocolVersion: 1 })
      expect(message.sessionId).toHaveLength(36)
    } finally {
      ws.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('ignores cortex-closed messages from browser sockets before token-gated init', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)
    const unauthenticatedBrowser = new WebSocket(`ws://localhost:${port}/cortex`)
    const cli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)
    const statusClient = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      cli.send(JSON.stringify({ type: 'cortex', token }))
      await nextMessageOfType(browser, 'cortex')

      await waitForOpen(unauthenticatedBrowser)
      unauthenticatedBrowser.send(JSON.stringify({ type: 'cortex-closed' }))

      await waitForOpen(statusClient)
      statusClient.send(JSON.stringify({ type: 'cortex-status-request', token }))
      const status = await nextMessageOfType(statusClient, 'cortex-status')
      expect(status).toMatchObject({
        type: 'cortex-status',
        editorActive: true,
        browserConnected: true,
      })
    } finally {
      statusClient.close()
      cli.close()
      unauthenticatedBrowser.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('clears browserConnected when the initialized browser socket disconnects', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)
    let cli: WebSocket | null = null
    let statusClient: WebSocket | null = null

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessage(browser)
      cli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)
      await waitForOpen(cli)
      cli.send(JSON.stringify({ type: 'cortex', token }))
      browser.close()
      await waitForClose(browser)

      statusClient = new WebSocket(`ws://localhost:${port}/@cortex/ws`)
      await waitForOpen(statusClient)
      statusClient.send(JSON.stringify({ type: 'cortex-status-request', token }))
      const status = await nextMessageOfType(statusClient, 'cortex-status')
      expect(status).toMatchObject({
        type: 'cortex-status',
        editorActive: false,
        browserConnected: false,
      })
    } finally {
      statusClient?.close()
      cli?.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('does not mark CLI connected until a token-authenticated message is received', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)
    const unauthenticatedCli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)
    const authenticatedCli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(browser)
      const helloPromise = nextMessageOfType(browser, 'hello')
      const initialAgentStatusPromise = nextMessageOfType(browser, 'agent-status')
      browser.send(JSON.stringify({ type: 'init', token }))
      await helloPromise
      const initialAgentStatus = await initialAgentStatusPromise
      expect(initialAgentStatus).toMatchObject({ type: 'agent-status', connected: false })

      await waitForOpen(unauthenticatedCli)
      await expectNoMessageOfType(browser, 'agent-status')
      unauthenticatedCli.send(JSON.stringify({ type: 'cortex-status-request' }))
      await nextMessageOfType(unauthenticatedCli, 'error')
      await expectNoMessageOfType(browser, 'agent-status')

      await waitForOpen(authenticatedCli)
      const authenticatedAgentStatusPromise = nextMessageOfType(browser, 'agent-status')
      authenticatedCli.send(JSON.stringify({ type: 'cortex-status-request', token }))
      const authenticatedAgentStatus = await authenticatedAgentStatusPromise
      expect(authenticatedAgentStatus).toMatchObject({ type: 'agent-status', connected: true })
    } finally {
      authenticatedCli.close()
      unauthenticatedCli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects fix-request comments whose elementSource resolves outside project root', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)
    const cli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessage(browser)
      browser.send(JSON.stringify({
        type: 'comment',
        token,
        kind: 'fix-request',
        elementSource: '../outside.ts:1:1',
        text: 'Please fix this',
      }))

      await waitForOpen(cli)
      const pending = await rpc(cli, token, 'getPending')
      expect(pending).toEqual([])
    } finally {
      browser.close()
      cli.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('does not use fileDependencies as an HMR changed-file fallback', () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })
    const compilation = {
      get fileDependencies(): Iterable<string> {
        throw new Error('fileDependencies should not be read as a changed-file set')
      },
    }

    plugin.apply(compiler)

    expect(() => compiler.hooks.done.run({ compilation })).not.toThrow()
  })
})

function createMockCompiler(root: string) {
  const beforeRun = createAsyncHook()
  const watchRun = createAsyncHook()
  const shutdown = createAsyncHook()
  const thisCompilation = createSyncHook<[ReturnType<typeof createMockCompilation>]>()
  const done = createSyncHook<[Record<string, unknown>]>()
  return {
    context: root,
    options: {
      context: root,
      mode: 'development',
      module: { rules: [] as unknown[] },
      plugins: [],
    },
    hooks: {
      beforeRun,
      watchRun,
      thisCompilation,
      done,
      shutdown,
    },
    watching: { invalidate: vi.fn() },
  }
}

function createMockCompilation() {
  return {
    hooks: {
      processAssets: createAsyncHook(),
    },
    emitAsset: vi.fn(),
  }
}

function createAsyncHook() {
  const callbacks: Array<() => Promise<void>> = []
  return {
    tapPromise(_name: string, fn: () => Promise<void>) {
      callbacks.push(fn)
    },
    async run() {
      for (const fn of callbacks) await fn()
    },
  }
}

function createSyncHook<TArgs extends unknown[]>() {
  const callbacks: Array<(...args: TArgs) => void> = []
  return {
    tap(_name: string, fn: (...args: TArgs) => void) {
      callbacks.push(fn)
    },
    run(...args: TArgs) {
      for (const fn of callbacks) fn(...args)
    },
  }
}

function createAsyncWaterfallHook<T>() {
  const callbacks: Array<(data: T) => Promise<T>> = []
  return {
    tapPromise(_name: string, fn: (data: T) => Promise<T>) {
      callbacks.push(fn)
    },
    async run(initial: T): Promise<T> {
      let data = initial
      for (const fn of callbacks) data = await fn(data)
      return data
    },
  }
}

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-webpack-'))
  cleanupDirs.push(dir)
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"test"}')
  return dir
}

function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
}

function waitForClose(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise((resolve, reject) => {
    ws.once('close', () => resolve())
    ws.once('error', reject)
  })
}

function expectRejectedConnection(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for rejected websocket connection')), 1000)
    ws.once('open', () => {
      clearTimeout(timer)
      ws.close()
      reject(new Error('websocket connection unexpectedly opened'))
    })
    ws.once('error', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for websocket message')), 1000)
    ws.once('message', raw => {
      clearTimeout(timer)
      resolve(JSON.parse(raw.toString()) as Record<string, unknown>)
    })
    ws.once('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    void waitForOpen(ws).catch(err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function nextMessageOfType(ws: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for websocket message of type ${type}`)), 1000)
    const cleanup = () => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    const onMessage = (raw: WebSocket.RawData) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      if (parsed.type !== type) return
      cleanup()
      resolve(parsed)
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
    void waitForOpen(ws).catch(err => {
      cleanup()
      reject(err)
    })
  })
}

async function expectNoMessageOfType(ws: WebSocket, type: string, timeoutMs = 100): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      ws.off('error', onError)
      resolve()
    }, timeoutMs)
    const onMessage = (raw: WebSocket.RawData) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      if (parsed.type !== type) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(new Error(`unexpected websocket message of type ${type}`))
    }
    const onError = (err: Error) => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

async function rpc(
  ws: WebSocket,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const requestId = `r-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timeout waiting for rpc result: ${method}`))
    }, 1000)
    const cleanup = () => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    const onMessage = (raw: WebSocket.RawData) => {
      let message: Record<string, unknown>
      try {
        message = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      if (message.requestId !== requestId) return
      cleanup()
      if (message.type === 'cortex-rpc-result') {
        resolve(message.result)
        return
      }
      if (message.type === 'cortex-rpc-error') {
        reject(new Error(String(message.error)))
      }
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId,
      method,
      params,
      token,
    }))
  })
}
