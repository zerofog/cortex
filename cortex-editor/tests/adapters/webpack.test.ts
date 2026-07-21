import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cortexWebpack,
  createManualInjectionSnippet,
  injectWebpackHtml,
  CortexWebpackRuntime,
  _getActiveStateForTesting,
  _getInjectedClientScriptForTesting,
} from '../../src/adapters/webpack.js'
import { isRuntimeDisabled, markRuntimeDisabled } from '../../src/adapters/source-loader-utils.js'

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

  it('dispose() serializes with an in-flight discovery write (no orphaned files)', async () => {
    // Codex P2: writeDiscoveryFiles became async; a dispose racing it could
    // remove the files and release the lock, after which the pending write
    // resumes and re-creates orphaned discovery files. dispose must WAIT for
    // the in-flight write, so all files it needs to remove exist and are
    // removed. Deterministic via a held rename on injection.json.
    const { promises: fsPromises } = await import('node:fs')
    const realRename = fsPromises.rename.bind(fsPromises)
    let releaseRename!: () => void
    let renameHeld = false
    const renameSpy = vi.spyOn(fsPromises, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('injection.json')) {
        renameHeld = true
        await new Promise<void>((res) => { releaseRename = res })
      }
      return realRename(from as string, to as string)
    })
    const root = makeTempProject()
    const runtime = new CortexWebpackRuntime({
      root, mode: 'development', toggleShortcut: '$mod+Shift+Period', runtimeId: 'rt-dispose-race',
    })
    try {
      const startPromise = runtime.start()
      await vi.waitFor(() => { if (!renameHeld) throw new Error('rename not reached yet') }, { timeout: 5000 })
      const disposePromise = runtime.dispose()
      // Give dispose a beat: without serialization it would already have
      // removed port/token and released the lock by now.
      await new Promise((r) => setTimeout(r, 25))
      releaseRename()
      await Promise.all([startPromise, disposePromise])

      // Serialized order: write landed, THEN dispose removed the full set.
      expect(fs.existsSync(path.join(root, '.cortex', 'injection.json'))).toBe(false)
      expect(fs.existsSync(path.join(root, '.cortex', 'port'))).toBe(false)
      expect(fs.existsSync(path.join(root, '.cortex', '.lock'))).toBe(false)
    } finally {
      renameSpy.mockRestore()
      await runtime.dispose()
    }
  })

  it('same-family lock refusal is SILENT and keeps instrumentation ENABLED', async () => {
    // The normal `next dev` double evaluation: a sibling process of the same
    // boot owns the lock (its nonce was inherited via __CORTEX_LOCK_FAMILY).
    // The loser must not warn — this was the spurious "[cortex] Another cortex
    // instance…" on real boots — and must keep its source-loader transforms
    // on, because it may be the compiling process pairing its attributes with
    // the sibling's discovery files.
    const root = makeTempProject()
    const cortexDir = path.join(root, '.cortex')
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(
      path.join(cortexDir, '.lock'),
      JSON.stringify({ pid: process.ppid, nonce: 'fam-nonce', startedAt: Date.now() }),
    )
    const familyBackup = process.env.__CORTEX_LOCK_FAMILY
    process.env.__CORTEX_LOCK_FAMILY = 'fam-nonce'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = new CortexWebpackRuntime({
      root, mode: 'development', toggleShortcut: '$mod+Shift+Period', runtimeId: 'rt-samefamily-test',
    })
    // Pre-set a stale disabled flag (as left by an EARLIER foreign-conflict
    // loss in this process): the same-family branch must assert enabled
    // explicitly, not merely refrain from disabling (delta review P3).
    markRuntimeDisabled('rt-samefamily-test')
    try {
      await runtime.start()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(runtime.started).toBe(false)
      expect(isRuntimeDisabled('rt-samefamily-test')).toBe(false)
    } finally {
      if (familyBackup === undefined) delete process.env.__CORTEX_LOCK_FAMILY
      else process.env.__CORTEX_LOCK_FAMILY = familyBackup
      errorSpy.mockRestore()
      await runtime.dispose()
    }
  })

  it('silently retries ONCE after a foreign refusal and self-heals when the transient holder vanishes', async () => {
    // The realistic foreign holder during a Ctrl+C→restart is a short-lived
    // config evaluator (Next's telemetry flusher) that won the just-freed lock
    // for a second or two. Without a retry the real dev server stays inert for
    // its whole session; with it, one silent unref'd re-attempt takes the lock
    // back once the transient drains.
    const root = makeTempProject()
    const cortexDir = path.join(root, '.cortex')
    fs.mkdirSync(cortexDir, { recursive: true })
    const lockPath = path.join(cortexDir, '.lock')
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, nonce: 'transient-holder', startedAt: Date.now() }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = new CortexWebpackRuntime({
      root, mode: 'development', toggleShortcut: '$mod+Shift+Period', runtimeId: 'rt-retry-test', conflictRetryDelayMs: 60,
    })
    try {
      await runtime.start()
      expect(runtime.started).toBe(false)
      expect(errorSpy).toHaveBeenCalledTimes(1)

      fs.unlinkSync(lockPath) // transient holder drained and released

      await vi.waitFor(() => { if (!runtime.started) throw new Error('retry has not healed yet') }, { timeout: 5000 })
      expect(isRuntimeDisabled('rt-retry-test')).toBe(false)
      expect(errorSpy).toHaveBeenCalledTimes(1) // the retry was silent
    } finally {
      errorSpy.mockRestore()
      await runtime.dispose()
    }
  })

  it('foreign lock refusal logs ONE actionable conflict and disables instrumentation', async () => {
    const root = makeTempProject()
    const cortexDir = path.join(root, '.cortex')
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(
      path.join(cortexDir, '.lock'),
      JSON.stringify({ pid: process.ppid, nonce: 'someone-elses-boot', startedAt: Date.now() }),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = new CortexWebpackRuntime({
      root, mode: 'development', toggleShortcut: '$mod+Shift+Period', runtimeId: 'rt-foreign-test',
    })
    try {
      await runtime.start()
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Another cortex instance'))
      expect(isRuntimeDisabled('rt-foreign-test')).toBe(true)
    } finally {
      errorSpy.mockRestore()
      await runtime.dispose()
    }
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

  // Change 6 — mcp-session-hello security + forwarding (ZF0-1869, Task 12)
  // mcp-session-hello triggers a DESTRUCTIVE buffer.clear() on the browser.
  // The per-message token is the actual auth (the /@cortex/ws upgrade is only
  // Origin-checked at connect). These three tests pin that:
  //   1. untokened/wrong-token messages are rejected (AUTH_FAILED) and never forwarded
  //   2. a valid-token message is forwarded to initialized browser clients, with token stripped

  it('rejects untokened mcp-session-hello and does NOT forward it to the browser (Change 6 security)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const VALID_UUID = '00000000-0000-4000-a000-000000000001'
      // Send WITHOUT token — must be AUTH_FAILED
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: VALID_UUID }))
      const response = await nextMessage(cli)

      // The CLI client gets a specific AUTH_FAILED rejection
      expect(response.type).toBe('error')
      expect(response.code).toBe('AUTH_FAILED')
      // And critically: nothing forwarded to the browser channel
      await expectNoMessageOfType(browser, 'mcp-session-hello')
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects wrong-token mcp-session-hello and does NOT forward it to the browser (Change 6 security)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const VALID_UUID = '00000000-0000-4000-a000-000000000002'
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: VALID_UUID, token: 'wrong-token' }))
      const response = await nextMessage(cli)

      expect(response.type).toBe('error')
      expect(response.code).toBe('AUTH_FAILED')
      await expectNoMessageOfType(browser, 'mcp-session-hello')
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('forwards a valid-token mcp-session-hello to the browser with token stripped (Change 6)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const VALID_UUID = '00000000-0000-4000-a000-000000000003'
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: VALID_UUID, token }))

      const forwarded = await nextMessageOfType(browser, 'mcp-session-hello')
      expect(forwarded.sessionId).toBe(VALID_UUID)
      // Token must be stripped — never leaked to the browser
      expect('token' in forwarded).toBe(false)
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // ─── Fix 1 (ZF0-1869 Review): UUID-change-gated server-side clear ──────────
  // The server must mirror the browser's lastSessionIdRef logic:
  //   (a) first mcp-session-hello (lastMcpSessionId === null) → adopt UUID, do NOT clear
  //   (b) same UUID again (transient reconnect) → do NOT clear
  //   (c) different UUID (genuine new Claude session) → MUST clear
  //
  // Tests (a) and (b) FAIL against the unconditional-clear code and PASS after Fix 1.
  // Test (c) passes before and after — clearing on UUID-change is the correct behavior.

  it('mcp-session-hello first-adopt (no prior UUID) does NOT clear server stagedEdits (Fix 1 TDD-a)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      // Seed one edit before the first hello
      const edit = { intentId: 'keep-me-a', source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: '', timestamp: Date.now() }
      browser.send(JSON.stringify({ type: 'staged-edit-add', edit, token }))

      await waitForOpen(cli)
      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(1)
      }, { timeout: 1000 })

      // First mcp-session-hello — first adoption, do NOT clear.
      const UUID_A = '11111111-0000-4000-a000-000000000001'
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: UUID_A, token }))
      // Wait for browser to receive the hello (proves handler ran)
      await nextMessageOfType(browser, 'mcp-session-hello')

      // Cache must be intact
      const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
      expect(result.count).toBe(1)
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('mcp-session-hello same-UUID reconnect does NOT clear server stagedEdits (Fix 1 TDD-b)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const UUID_A = '11111111-0000-4000-a000-000000000002'

      // First hello — adopt UUID (no clear on first adopt)
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: UUID_A, token }))
      await nextMessageOfType(browser, 'mcp-session-hello')

      // Seed edit AFTER first hello so it survives that no-op.
      const edit = { intentId: 'keep-me-b', source: 'Hero.tsx:5:3', property: 'color', value: 'blue', previousValue: '', timestamp: Date.now() }
      browser.send(JSON.stringify({ type: 'staged-edit-add', edit, token }))
      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(1)
      }, { timeout: 1000 })

      // Second hello — same UUID (transient reconnect). Must NOT clear.
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: UUID_A, token }))
      // Drain the second forwarded hello from the browser queue
      await nextMessageOfType(browser, 'mcp-session-hello')

      // Cache must still have the edit
      const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
      expect(result.count).toBe(1)
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('mcp-session-hello different-UUID DOES clear server stagedEdits (Fix 1 TDD-c / Fix 2 successor)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const UUID_A = '11111111-0000-4000-a000-000000000003'
      const UUID_B = '22222222-0000-4000-a000-000000000003'

      // First hello — adopt UUID_A (first adopt, no clear).
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: UUID_A, token }))
      await nextMessageOfType(browser, 'mcp-session-hello')

      // Seed stale intent from prior session.
      const staleEdit = { intentId: 'stale-fix1c', source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: '', timestamp: Date.now() }
      browser.send(JSON.stringify({ type: 'staged-edit-add', edit: staleEdit, token }))
      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(1)
      }, { timeout: 1000 })

      // Second hello — DIFFERENT UUID → genuine new Claude session → MUST clear.
      cli.send(JSON.stringify({ type: 'mcp-session-hello', sessionId: UUID_B, token }))

      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(0)
      }, { timeout: 1000 })
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // Fix 6 (ZF0-1869 Round-1): webpack RPC tests for acknowledgeSourceEdit and
  // reportSourceEditFailed, mirroring the vite.test.ts patterns.

  it('acknowledgeSourceEdit RPC removes intent from stagedEdits and notifies browser (Fix 6)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      // Seed an intent
      const edit = {
        intentId: 'ack-intent-1',
        source: 'Hero.tsx:5:3',
        property: 'fontSize',
        value: '1rem',
        previousValue: '',
        timestamp: Date.now(),
      }
      browser.send(JSON.stringify({ type: 'staged-edit-add', edit, token }))

      await waitForOpen(cli)
      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(1)
      }, { timeout: 1000 })

      // Call acknowledgeSourceEdit — must remove intent + send staged-edits-discard to browser
      const discardPromise = nextMessageOfType(browser, 'staged-edits-discard')
      const result = await rpc(cli, token, 'acknowledgeSourceEdit', { intentIds: ['ack-intent-1'] }) as {
        acknowledged: string[]
        browserNotified: boolean
      }

      expect(result.acknowledged).toEqual(['ack-intent-1'])
      expect(result.browserNotified).toBe(true)

      // Intent removed from cache
      const afterAck = await rpc(cli, token, 'getPendingEdits') as { count: number }
      expect(afterAck.count).toBe(0)

      // Browser received staged-edits-discard
      const discardMsg = await discardPromise
      expect(discardMsg.intentIds).toEqual(['ack-intent-1'])
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // ── Pillar 1: cortex/set-active from browser (Task 8 — mirror of Chunk B) ───

  it('first browser tab activation sets editorActive=true and activeBrowserId, broadcasts cortex/active-changed (Pillar 1)', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)
    const statusCli = new WebSocket(`ws://localhost:${port}/@cortex/ws`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      const activeChangedPromise = nextMessageOfType(browser, 'cortex/active-changed')
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      const msg = await activeChangedPromise

      expect(msg.type).toBe('cortex/active-changed')
      expect(msg.active).toBe(true)
      expect(msg.targetTabId).toBe('tab-A')

      await waitForOpen(statusCli)
      statusCli.send(JSON.stringify({ type: 'cortex-status-request', token }))
      const status = await nextMessageOfType(statusCli, 'cortex-status')
      expect(status.editorActive).toBe(true)
    } finally {
      statusCli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('second tab activation while first is active emits cortex/inactive-tab and preserves original state (Pillar 1)', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      // tab-A activates first
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')

      // tab-B attempts to activate — should get cortex/inactive-tab rejection
      const inactiveTabPromise = nextMessageOfType(browser, 'cortex/inactive-tab')
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-B', token }))
      const rejection = await inactiveTabPromise

      expect(rejection.type).toBe('cortex/inactive-tab')
      expect(rejection.targetTabId).toBe('tab-B')
      expect(String(rejection.message)).toMatch(/another tab/i)
    } finally {
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('idempotent — second activation from same tab does not re-broadcast cortex/active-changed (Pillar 1)', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')

      // Second identical request — must NOT broadcast again
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      await expectNoMessageOfType(browser, 'cortex/active-changed')
    } finally {
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // Pillar 1 (ZF0-1881 codex P2.2): browser-originated activations (with
  // targetTabId) must NOT emit the untargeted legacy fan-out — see vite.ts
  // applySetActiveResult for the rationale. These tests assert the gate
  // suppression by waiting for the cortex/active-changed broadcast and then
  // verifying that NO legacy cortex/cortex-close shape arrives in a small
  // grace window. The CLI path (no tabId) still emits legacy — covered by
  // a separate test below.
  it('does NOT emit legacy cortex fan-out for browser-originated activation (single-tab gate)', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      const received: Array<{ type: string }> = []
      browser.on('message', (raw) => {
        try { received.push(JSON.parse(raw.toString())) } catch {}
      })

      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      // Wait for the new-shape broadcast to confirm the activation landed.
      await nextMessageOfType(browser, 'cortex/active-changed')
      // Grace window for any legacy broadcast to follow.
      await new Promise((r) => setTimeout(r, 100))

      expect(received.find((m) => m.type === 'cortex')).toBeUndefined()
    } finally {
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('does NOT emit legacy cortex-close fan-out for browser-originated deactivation', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(browser)
      browser.send(JSON.stringify({ type: 'init', token }))
      await nextMessageOfType(browser, 'hello')

      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')

      const received: Array<{ type: string }> = []
      browser.on('message', (raw) => {
        try { received.push(JSON.parse(raw.toString())) } catch {}
      })

      browser.send(JSON.stringify({ type: 'cortex/set-active', active: false, tabId: 'tab-A', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')
      await new Promise((r) => setTimeout(r, 100))

      expect(received.find((m) => m.type === 'cortex-close')).toBeUndefined()
    } finally {
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // ── Pillar 1: cortex/set-active from CLI/MCP (Task 8 — mirror of Chunk B CLI tests) ──

  it('activates editor when MCP sends cortex/set-active true (Pillar 1)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      const activeChangedPromise = nextMessageOfType(browser, 'cortex/active-changed')
      cli.send(JSON.stringify({ type: 'cortex/set-active', active: true, token }))
      const broadcast = await activeChangedPromise

      expect(broadcast.active).toBe(true)
      // CLI has no tabId — no targetTabId in broadcast
      expect('targetTabId' in broadcast).toBe(false)

      const state = _getActiveStateForTesting()
      expect(state).not.toBeNull()
      expect(state!.editorActive).toBe(true)
      expect(state!.activeBrowserId).toBeNull()
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('deactivates editor when MCP sends cortex/set-active false (Pillar 1)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      cli.send(JSON.stringify({ type: 'cortex/set-active', active: true, token }))
      await nextMessageOfType(browser, 'cortex/active-changed')

      cli.send(JSON.stringify({ type: 'cortex/set-active', active: false, token }))
      const deactivateBroadcast = await nextMessageOfType(browser, 'cortex/active-changed')

      expect(deactivateBroadcast.active).toBe(false)
      expect(_getActiveStateForTesting()!.editorActive).toBe(false)
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('legacy cortex / cortex-close from MCP still update activeState via dual-mode path (Pillar 1)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      cli.send(JSON.stringify({ type: 'cortex', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')
      expect(_getActiveStateForTesting()!.editorActive).toBe(true)

      cli.send(JSON.stringify({ type: 'cortex-close', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')
      expect(_getActiveStateForTesting()!.editorActive).toBe(false)
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('rejects cortex/set-active from CLI without token — activeState unchanged (auth gate, Pillar 1)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      await waitForOpen(cli)
      // Send without token — must be AUTH_FAILED
      cli.send(JSON.stringify({ type: 'cortex/set-active', active: true }))
      const rejection = await nextMessage(cli)
      expect(rejection.type).toBe('error')
      expect(rejection.code).toBe('AUTH_FAILED')

      // activeState must be unchanged
      expect(_getActiveStateForTesting()!.editorActive).toBe(false)
      await expectNoMessageOfType(browser, 'cortex/active-changed')
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  // ── Pillar 1: init takeover — fresh tab resets the active-tab gate (Task 8) ──

  it('init with a different tabId resets activeBrowserId gate, allowing fresh tab to claim activation (Pillar 1)', async () => {
    const root = makeTempProject()
    const compiler = createMockCompiler(root)
    const plugin = cortexWebpack({ projectRoot: root })

    plugin.apply(compiler)
    await compiler.hooks.watchRun.run()
    const port = fs.readFileSync(path.join(root, '.cortex', 'port'), 'utf8').trim()
    const token = fs.readFileSync(path.join(root, '.cortex', 'token'), 'utf8').trim()
    const browser = new WebSocket(`ws://localhost:${port}/cortex`)

    try {
      await waitForOpen(browser)
      // tab-A adopts activation
      browser.send(JSON.stringify({ type: 'init', token, tabId: 'tab-A' }))
      await nextMessageOfType(browser, 'hello')
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A', token }))
      await nextMessageOfType(browser, 'cortex/active-changed')
      expect(_getActiveStateForTesting()!.activeBrowserId).toBe('tab-A')

      // tab-A refreshes: sends init with a different tabId
      browser.send(JSON.stringify({ type: 'init', token, tabId: 'tab-A2' }))
      // Drain the hello from re-init
      await nextMessageOfType(browser, 'hello')
      // Gate should now be cleared
      expect(_getActiveStateForTesting()!.activeBrowserId).toBeNull()

      // tab-A2 should be able to activate now
      const reActivatePromise = nextMessageOfType(browser, 'cortex/active-changed')
      browser.send(JSON.stringify({ type: 'cortex/set-active', active: true, tabId: 'tab-A2', token }))
      const reActivate = await reActivatePromise
      expect(reActivate.active).toBe(true)
      expect(reActivate.targetTabId).toBe('tab-A2')
    } finally {
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })

  it('reportSourceEditFailed RPC sends source-edit-failed to browser but does NOT remove intent (Fix 6)', async () => {
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
      await nextMessageOfType(browser, 'hello')

      // Seed an intent
      const edit = {
        intentId: 'fail-intent-1',
        source: 'Hero.tsx:5:3',
        property: 'color',
        value: 'blue',
        previousValue: '',
        timestamp: Date.now(),
      }
      browser.send(JSON.stringify({ type: 'staged-edit-add', edit, token }))

      await waitForOpen(cli)
      await vi.waitFor(async () => {
        const result = await rpc(cli, token, 'getPendingEdits') as { count: number }
        expect(result.count).toBe(1)
      }, { timeout: 1000 })

      // Call reportSourceEditFailed — must NOT remove intent, but must notify browser
      const failedPromise = nextMessageOfType(browser, 'source-edit-failed')
      const result = await rpc(cli, token, 'reportSourceEditFailed', {
        intentIds: ['fail-intent-1'],
        reason: 'pattern not found at Hero.tsx:31',
      }) as {
        reported: string[]
        browserNotified: boolean
      }

      expect(result.reported).toEqual(['fail-intent-1'])
      expect(result.browserNotified).toBe(true)

      // Intent MUST still be in cache (failure path keeps the intent)
      const afterReport = await rpc(cli, token, 'getPendingEdits') as { count: number }
      expect(afterReport.count).toBe(1)

      // Browser received source-edit-failed with correct fields
      const failedMsg = await failedPromise
      expect(failedMsg.intentIds).toEqual(['fail-intent-1'])
      expect(failedMsg.reason).toBe('pattern not found at Hero.tsx:31')
    } finally {
      cli.close()
      browser.close()
      await compiler.hooks.shutdown.run()
    }
  })
})

// ── Pillar 1: injected client script — keyboard handler (Task 8 — mirror of Chunk C) ──

describe('webpack injected client — Pillar 1 (keyboard handler emits cortex/set-active)', () => {
  it('no longer writes data-cortex-active imperatively', () => {
    const injected = _getInjectedClientScriptForTesting({ toggleShortcut: '$mod+Shift+Period' })
    expect(injected).not.toMatch(/setAttribute\(['"]data-cortex-active['"]/)
    expect(injected).not.toMatch(/removeAttribute\(['"]data-cortex-active['"]/)
  })

  it('emits cortex/set-active with a tab ID', () => {
    const injected = _getInjectedClientScriptForTesting({ toggleShortcut: '$mod+Shift+Period' })
    expect(injected).toMatch(/cortex\/set-active/)
    expect(injected).toMatch(/__cortex_tab_id__/)
  })

  it('reads current active state from __cortex_active_cache__ rather than the DOM attribute', () => {
    const injected = _getInjectedClientScriptForTesting({ toggleShortcut: '$mod+Shift+Period' })
    expect(injected).toMatch(/__cortex_active_cache__/)
    expect(injected).not.toMatch(/hasAttribute\(['"]data-cortex-active['"]\)/)
  })

  it('preserves the __cortex_toggle_registered__ idempotency guard', () => {
    const injected = _getInjectedClientScriptForTesting({ toggleShortcut: '$mod+Shift+Period' })
    expect(injected).toMatch(/__cortex_toggle_registered__/)
  })

  it('preserves the XSS-hardening Object.defineProperty patterns for new Pillar 1 globals', () => {
    const injected = _getInjectedClientScriptForTesting({ toggleShortcut: '$mod+Shift+Period' })
    // tab ID, active cache, and toggle-registered should all use Object.defineProperty
    // with writable: false to prevent XSS-injected overrides.
    const defineCount = (injected.match(/Object\.defineProperty\(window/g) ?? []).length
    expect(defineCount).toBeGreaterThanOrEqual(3)
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
