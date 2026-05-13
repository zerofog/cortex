import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import { CortexSession } from '../core/session.js'
import { resolveAnnotationsFilePath } from './annotations-path-resolver.js'
import { TailwindResolver } from '../core/tailwind-resolver.js'
import { TailwindRewriter } from '../core/rewriter/tailwind.js'
import { InlineStyleRewriter } from '../core/rewriter/inline-style.js'
import { HMRVerifier } from '../core/hmr-verifier.js'
import { EditPipeline } from '../core/edit-pipeline.js'
import { StyleDetector, type DetectionResult } from '../core/rewriter/detector.js'
import { computeCapabilities, type ResolverState } from '../core/capabilities.js'
import { CSSModulesRewriter } from '../core/rewriter/css-modules.js'
import { RuntimeCSSResolver } from '../core/rewriter/runtime-resolver.js'
import { UndoStack } from '../core/session/undo-stack.js'
import { applyEditsCore, checkIntentFileSize, parseIntentSource, sliceIntentContext } from '../core/staged-edits.js'
import { atomicWrite } from './atomic-write.js'
import { shouldSuppressHmr } from './vite.js'
import { shouldExcludeCortexSource } from './source-loader-utils.js'
import type { BrowserToServer, ServerChannel, ServerToBrowser } from './types.js'
import {
  browserToServerSchema,
  cliRpcRequestSchema,
  cortexAcknowledgeInputSchema,
  cortexApplyEditsInputSchema,
  cortexDismissInputSchema,
  cortexDiscardEditsInputSchema,
  cortexGetDetailsInputSchema,
  cortexGetIntentContextInputSchema,
  cortexResolveInputSchema,
  cortexRespondInputSchema,
  formatIssues,
  parseOrFail,
  pendingEditSchema,
  serverToBrowserSchema,
} from '../schemas/index.js'

const PLUGIN_NAME = 'CortexWebpackPlugin'
const CORTEX_BROWSER_PATH = '/@cortex/browser.js'
const CLI_WS_PATH = '/@cortex/ws'
const BROWSER_WS_PATH = '/cortex'
const HEARTBEAT_INTERVAL = 30_000
const MAX_CLI_CONNECTIONS = 5
const ALLOWED_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const DEFAULT_TOGGLE_SHORTCUT = '$mod+Shift+Period'
const VALID_SHORTCUT = /^\$mod\+(?:Shift\+)?(?:Alt\+)?(?:Key[A-Z]|Digit\d|Period|Comma|Slash|Backslash|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Minus|Equal)$/

type BrowserToServerType = BrowserToServer['type']
const WRITE_TYPES_ARRAY = [
  'edit',
  'undo',
  'redo',
  'comment',
  'comment-reply',
  'clear_server_undo',
  'staged-edit-add',
  'staged-edit-remove',
  'staged-edit-clear',
  'staged-edits-sync',
  'staged-edits-ready',
] as const satisfies readonly BrowserToServerType[]
const WRITE_TYPES: ReadonlySet<string> = new Set(WRITE_TYPES_ARRAY)

const BROWSER_TO_CLI_FORWARD_TYPES_ARRAY = [
  'cortex-closed',
  'staged-edits-ready',
] as const satisfies readonly BrowserToServerType[]
const BROWSER_TO_CLI_FORWARD_TYPES: ReadonlySet<string> = new Set(BROWSER_TO_CLI_FORWARD_TYPES_ARRAY)

const CLI_ALLOWED_TYPES = new Set(['cortex', 'cortex-close'])
const ALLOWED_RPC_METHODS = new Set([
  'getPending', 'getDetails', 'acknowledge', 'resolve', 'dismiss', 'respond',
  'getPendingEdits', 'applyEdits', 'discardEdits', 'getIntentContext',
])

const RPC_METHOD_SCHEMAS = {
  applyEdits: cortexApplyEditsInputSchema,
  discardEdits: cortexDiscardEditsInputSchema,
  getIntentContext: cortexGetIntentContextInputSchema,
  getDetails: cortexGetDetailsInputSchema,
  acknowledge: cortexAcknowledgeInputSchema,
  resolve: cortexResolveInputSchema,
  dismiss: cortexDismissInputSchema,
  respond: cortexRespondInputSchema,
  getPending: null,
  getPendingEdits: null,
} as const

export interface CortexWebpackOptions {
  /** Project root. Defaults to compiler.context/options.context/process.cwd(). */
  projectRoot?: string
  /** Port for the standalone Cortex WebSocket bridge. Defaults to an available port. */
  port?: number
  /** Resolve JSX CSS Module aliases. Example: { '@': '/abs/project/src' }. */
  resolveAlias?: Record<string, string>
  /** Package names in node_modules to instrument. */
  includeNodeModules?: string[]
  /** Keyboard shortcut for toggling the editor. */
  toggleShortcut?: string
}

interface WebpackRuleSet {
  test: RegExp
  exclude?: (resourcePath: string) => boolean
  enforce?: string
  use: Array<{ loader: string; options: Record<string, unknown> }>
}

interface WebpackCompiler {
  context?: string
  options: {
    context?: string
    mode?: string
    module?: { rules?: unknown[] }
    plugins?: unknown[]
  }
  hooks: {
    beforeRun?: { tapPromise(name: string, fn: () => Promise<void>): void }
    watchRun?: { tapPromise(name: string, fn: () => Promise<void>): void }
    thisCompilation?: { tap(name: string, fn: (compilation: WebpackCompilation) => void): void }
    done?: { tap(name: string, fn: (stats: WebpackStats) => void): void }
    shutdown?: { tapPromise?(name: string, fn: () => Promise<void>): void }
  }
  webpack?: {
    sources?: {
      RawSource?: new (source: string) => unknown
    }
  }
  watching?: {
    invalidate?: () => void
  }
}

interface WebpackCompilation {
  hooks?: {
    processAssets?: {
      tapPromise(
        options: { name: string; stage?: number } | string,
        fn: () => Promise<void>,
      ): void
    }
  }
  emitAsset?: (name: string, source: unknown) => void
  assets?: Record<string, unknown>
  compiler?: WebpackCompiler
}

interface WebpackStats {
  compilation?: {
    modifiedFiles?: Iterable<string>
    fileDependencies?: Iterable<string>
  }
}

interface HtmlWebpackPluginHooks {
  beforeEmit?: {
    tapPromise(
      name: string,
      fn: (data: { html: string; [key: string]: unknown }) => Promise<{ html: string; [key: string]: unknown }>,
    ): void
  }
}

interface InjectionState {
  port: number
  token: string
  sessionId: string
  browserScriptUrl: string
  toggleShortcut: string
}

function resolveBrowserIIFEPath(): string {
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, '..', 'browser', 'index.js')
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'browser', 'index.js')
}

function resolveSourceLoaderPath(): string {
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, 'source-loader.cjs')
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'source-loader.cjs')
}

function safeJSONForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function validateToggleShortcut(shortcut: string): string {
  if (!VALID_SHORTCUT.test(shortcut)) {
    throw new Error(
      `[cortex] Invalid toggleShortcut: "${shortcut}". ` +
      `Expected format: "$mod+[Alt+][Shift+]KeyCode" (e.g., "$mod+Shift+Period"). ` +
      `See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code`,
    )
  }
  return shortcut
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

function isAllowedWebSocketOrigin(origin: string | undefined): boolean {
  return origin === undefined || ALLOWED_ORIGINS.test(origin)
}

function isPathInsideRoot(resolved: string, root: string): boolean {
  const normalizedRoot = path.resolve(root)
  return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep)
}

function requireRealpathInsideRoot(
  resolved: string,
  root: string,
  realpathFn: (p: string) => string = fs.realpathSync.native,
): { ok: true; real: string; realRoot: string } | { ok: false; error: string } {
  let real: string
  let realRoot: string
  try {
    real = realpathFn(resolved)
    realRoot = realpathFn(root)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    return { ok: false, error: `Could not resolve symlinks${code ? ` (${code})` : ''}` }
  }
  if (!isPathInsideRoot(real, realRoot)) return { ok: false, error: 'Path outside project root (symlink-resolved)' }
  return { ok: true, real, realRoot }
}

function getElementSourceFile(elementSource: string): string {
  const lastColon = elementSource.lastIndexOf(':')
  const secondLastColon = elementSource.lastIndexOf(':', lastColon - 1)
  return secondLastColon > 0
    ? elementSource.slice(0, secondLastColon)
    : elementSource.split(':')[0] ?? elementSource
}

function isFixRequestSourceInsideRoot(elementSource: string, root: string): boolean {
  const sourceFile = getElementSourceFile(elementSource)
  const resolved = path.resolve(root, sourceFile)
  if (!isPathInsideRoot(resolved, root)) return false

  let realRoot: string
  try {
    realRoot = fs.realpathSync.native(root)
  } catch {
    realRoot = root
  }

  try {
    const realResolved = fs.realpathSync.native(resolved)
    return isPathInsideRoot(realResolved, realRoot)
  } catch {
    try {
      const realParent = fs.realpathSync.native(path.dirname(resolved))
      return isPathInsideRoot(realParent, realRoot)
    } catch {
      return isPathInsideRoot(resolved, root)
    }
  }
}

export function createManualInjectionSnippet(state: InjectionState): string {
  const config = safeJSONForScript({ toggleShortcut: state.toggleShortcut })
  const scriptUrl = safeJSONForScript(state.browserScriptUrl)
  return `<script>
window.__cortex_ws_port__=${state.port};
window.__CORTEX_TOKEN__=${safeJSONForScript(state.token)};
window.__CORTEX_SESSION_ID__=${safeJSONForScript(state.sessionId)};
if (!Object.prototype.hasOwnProperty.call(window, '__cortex_toggle_registered__')) {
  Object.defineProperty(window, '__cortex_toggle_registered__', {
    value: true, writable: false, configurable: false,
  });
  var __cortexConfig = ${config};
  var __cortexParts = __cortexConfig.toggleShortcut.split('+');
  var __cortexCode = __cortexParts[__cortexParts.length - 1];
  var __cortexNeedShift = __cortexParts.includes('Shift');
  var __cortexNeedAlt = __cortexParts.includes('Alt');
  window.addEventListener('keydown', function(e) {
    if (!e.isTrusted) return;
    var mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (__cortexNeedShift && !e.shiftKey) return;
    if (!__cortexNeedShift && e.shiftKey) return;
    if (__cortexNeedAlt && !e.altKey) return;
    if (!__cortexNeedAlt && e.altKey) return;
    if (e.code !== __cortexCode) return;
    e.preventDefault();
    e.stopPropagation();
    var active = document.documentElement.hasAttribute('data-cortex-active');
    var msg = { type: 'cortex-toggle', active: !active };
    if (active) {
      document.documentElement.removeAttribute('data-cortex-active');
    } else {
      document.documentElement.setAttribute('data-cortex-active', '');
    }
    if (window.__cortex_channel__) {
      window.__cortex_channel__.handleServerMessage(msg);
    } else {
      window.__cortex_pending_toggle__ = msg;
    }
  }, { capture: true });
}
if (!document.querySelector('[data-cortex-host]')) {
  var __cortexScript = document.createElement('script');
  __cortexScript.src = ${scriptUrl};
  __cortexScript.onerror = function() { console.error('[cortex] Failed to load browser UI.'); };
  document.head.appendChild(__cortexScript);
}
</script>`
}

export function injectWebpackHtml(html: string, state: InjectionState): string {
  const snippet = createManualInjectionSnippet(state)
  const injected = html.replace(/<\/head>/i, `${snippet}\n</head>`)
  return injected === html ? html : injected
}

function detectNextProject(root: string): boolean {
  const nextConfig = [
    'next.config.js', 'next.config.cjs', 'next.config.mjs',
    'next.config.ts', 'next.config.cts', 'next.config.mts',
  ].some(name => fs.existsSync(path.join(root, name)))
  if (nextConfig) return true
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return Boolean(pkg.dependencies?.next || pkg.devDependencies?.next)
  } catch {
    return false
  }
}

class CortexWebpackRuntime {
  private readonly root: string
  private readonly mode: string
  private readonly requestedPort?: number
  private readonly toggleShortcut: string
  private readonly invalidate?: () => void
  private readonly browserIIFEPath: string
  private session: CortexSession | null = null
  private httpServer: HttpServer | null = null
  private browserWss: WebSocketServer | null = null
  private cliWss: WebSocketServer | null = null
  private browserClients = new Set<WebSocket>()
  private initializedBrowserClients = new Set<WebSocket>()
  private startPromise: Promise<void> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: { root: string; mode: string; port?: number; toggleShortcut: string; invalidate?: () => void }) {
    this.root = options.root
    this.mode = options.mode
    this.requestedPort = options.port
    this.toggleShortcut = options.toggleShortcut
    this.invalidate = options.invalidate
    this.browserIIFEPath = resolveBrowserIIFEPath()
  }

  get started(): boolean {
    return Boolean(this.session && this.httpServer)
  }

  get injectionState(): InjectionState | null {
    const session = this.session
    const port = this.port
    if (!session || !port) return null
    return {
      port,
      token: session.token,
      sessionId: session.sessionId,
      browserScriptUrl: `http://localhost:${port}${CORTEX_BROWSER_PATH}`,
      toggleShortcut: this.toggleShortcut,
    }
  }

  get port(): number {
    const addr = this.httpServer?.address()
    return typeof addr === 'object' && addr ? addr.port : 0
  }

  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.startInternal().catch(async err => {
      await this.dispose().catch(() => {})
      this.startPromise = null
      throw err
    })
    return this.startPromise
  }

  private async startInternal(): Promise<void> {
    if (this.session || this.httpServer) return
    // Annotations persistence opt-in lives in resolveAnnotationsFilePath —
    // shared by the vite adapter and unit-tested without a webpack runtime.
    const annotationsFilePath = resolveAnnotationsFilePath({ root: this.root })

    const session = new CortexSession({
      root: this.root,
      mode: this.mode,
      annotationsFilePath,
    })
    this.session = session

    this.browserWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
    this.cliWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
    session.cliWss = this.cliWss
    session.channel = this.createChannel(session)

    this.browserWss.on('connection', (ws) => this.handleBrowserConnection(session, ws))
    this.cliWss.on('connection', (ws) => this.handleCliConnection(session, ws))

    this.httpServer = createServer((req, res) => {
      if (req.url === CORTEX_BROWSER_PATH) {
        try {
          const content = fs.readFileSync(this.browserIIFEPath, 'utf8')
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(content)
        } catch (err) {
          res.statusCode = 500
          res.end(`[cortex] Browser bundle not found: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }
      res.statusCode = 404
      res.end('Not found')
    })

    this.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!isLoopbackRequest(req)) {
        socket.destroy()
        return
      }
      const host = req.headers.host
      if (!host || !ALLOWED_ORIGINS.test(`http://${host}`)) {
        socket.destroy()
        return
      }
      if (!isAllowedWebSocketOrigin(req.headers.origin)) {
        socket.destroy()
        return
      }
      if (req.url === BROWSER_WS_PATH && this.browserWss) {
        this.browserWss.handleUpgrade(req, socket, head, (ws) => this.browserWss!.emit('connection', ws, req))
        return
      }
      if (req.url === CLI_WS_PATH && this.cliWss) {
        this.cliWss.handleUpgrade(req, socket, head, (ws) => this.cliWss!.emit('connection', ws, req))
        return
      }
      socket.destroy()
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      this.httpServer!.once('error', onError)
      this.httpServer!.listen(this.requestedPort ?? 0, '127.0.0.1', () => {
        this.httpServer!.removeListener('error', onError)
        resolve()
      })
    })

    this.writeDiscoveryFiles(session)
    this.startHeartbeat(session)
    this.initializePipeline(session)
  }

  private createChannel(session: CortexSession): ServerChannel {
    const send = (msg: ServerToBrowser): void => {
      this.sendToInitializedBrowsers(session, msg, 'webpack.channel.send')
      this.forwardToCLI(session, msg)
    }
    return {
      send,
      broadcast: send,
      onMessage: () => () => {},
      dispose: async () => {},
    }
  }

  private writeDiscoveryFiles(session: CortexSession): void {
    const cortexDir = path.join(this.root, '.cortex')
    const portFilePath = path.join(cortexDir, 'port')
    const tokenFilePath = path.join(cortexDir, 'token')
    try {
      fs.mkdirSync(cortexDir, { recursive: true, mode: 0o700 })
    } catch (err) {
      console.warn('[cortex] Could not create .cortex/ directory:', err instanceof Error ? err.message : err)
      return
    }
    try {
      fs.writeFileSync(portFilePath, String(this.port))
      session.portFilePath = portFilePath
    } catch (err) {
      console.warn('[cortex] Could not write port file:', err instanceof Error ? err.message : err)
    }
    try {
      fs.writeFileSync(tokenFilePath, session.token, { mode: 0o600 })
      fs.chmodSync(tokenFilePath, 0o600)
      session.tokenFilePath = tokenFilePath
    } catch (err) {
      console.error('[cortex] Could not write token file — CLI authentication will fail:', err instanceof Error ? err.message : err)
    }
  }

  private startHeartbeat(session: CortexSession): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of session.cliClients) {
        if (!session.aliveFlags.get(client)) {
          client.terminate()
          this.removeCliClient(session, client)
          continue
        }
        session.aliveFlags.set(client, false)
        try { client.ping() } catch { this.removeCliClient(session, client) }
      }
    }, HEARTBEAT_INTERVAL)
    this.heartbeatTimer.unref()
    session.heartbeatTimer = this.heartbeatTimer
  }

  private initializePipeline(session: CortexSession): void {
    const channel = session.channel
    if (!channel) return
    const projectRoot = this.root
    const rewriter = new TailwindRewriter()
    const inlineStyleRewriter = new InlineStyleRewriter()
    const verifier = new HMRVerifier(channel)
    const cssModulesRewriter = new CSSModulesRewriter({
      readFile: (p) => fs.promises.readFile(p, 'utf-8'),
    })
    const runtimeResolver = new RuntimeCSSResolver()
    const undoStack = new UndoStack()
    const detector = new StyleDetector()

    const detectionPromise = detector.detect(projectRoot).catch((err) => {
      console.warn('[cortex] Style detection failed:', err instanceof Error ? err.message : err)
      return { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasPlainCSS: true, hasComponentLibrary: false, summary: 'Detection failed' } satisfies DetectionResult
    })
    const resolverPromise = TailwindResolver.fromConfig(projectRoot).catch((err) => {
      console.warn('[cortex] Tailwind config resolution failed:', err instanceof Error ? err.message : err)
      return null
    })

    Promise.all([detectionPromise, resolverPromise]).then(([detection, resolver]) => {
      if (!this.session || this.session !== session || session.isDisposed) return
      session.pipeline?.dispose()
      session.hmrUnsubscribe?.()
      session.pipeline = new EditPipeline({
        channel,
        resolver: resolver ?? TailwindResolver.fromTheme({}),
        rewriter,
        inlineStyleRewriter,
        verifier,
        cssModulesRewriter,
        detector: detection,
        runtimeResolver,
        undoStack,
        writeFile: async (intent) => {
          await atomicWrite(intent.filePath, intent.content)
          if (!shouldSuppressHmr(intent)) this.invalidate?.()
        },
        readFile: (p) => fs.promises.readFile(p, 'utf-8'),
        projectRoot,
      })
      session.hmrUnsubscribe = this.onHMRUpdate(session, files => verifier.onHMRUpdate(files))
      const resolverState: ResolverState = {
        resolverAvailable: resolver !== null,
        aiAvailable: false,
        inlineStyleAvailable: true,
      }
      const capabilities = computeCapabilities(detection, resolverState)
      session.capabilitiesCache = capabilities.length > 0 ? capabilities : null
      if (session.capabilitiesCache) channel.send({ type: 'capabilities', systems: session.capabilitiesCache })
    }).catch((err) => {
      console.error('[cortex] Failed to initialize edit pipeline:', err instanceof Error ? err.message : err)
    })
  }

  private onHMRUpdate(session: CortexSession, cb: (files: string[]) => void): () => void {
    session.hmrCallbacks.push(cb)
    return () => {
      const idx = session.hmrCallbacks.indexOf(cb)
      if (idx >= 0) session.hmrCallbacks.splice(idx, 1)
    }
  }

  notifyHMR(files: string[]): void {
    const callbacks = [...(this.session?.hmrCallbacks ?? [])]
    for (const cb of callbacks) {
      try { cb(files) } catch (err) {
        console.warn('[cortex] HMR callback error:', err instanceof Error ? err.message : err)
      }
    }
  }

  private dropBrowserClient(session: CortexSession, ws: WebSocket): void {
    const wasInitialized = this.initializedBrowserClients.delete(ws)
    this.browserClients.delete(ws)
    session.browserConnected = this.initializedBrowserClients.size > 0
    if (wasInitialized && !session.browserConnected) {
      session.editorActive = false
      this.forwardToCLI(session, { type: 'cortex-closed' })
    }
  }

  private sendToBrowser(session: CortexSession, ws: WebSocket, msg: ServerToBrowser, context: string): void {
    const parsed = parseOrFail(serverToBrowserSchema, msg, context)
    if (parsed === null) return
    if (ws.readyState !== WebSocket.OPEN) {
      this.dropBrowserClient(session, ws)
      return
    }
    try {
      ws.send(JSON.stringify(parsed))
    } catch {
      this.dropBrowserClient(session, ws)
    }
  }

  private sendToInitializedBrowsers(session: CortexSession, msg: ServerToBrowser, context: string): void {
    const parsed = parseOrFail(serverToBrowserSchema, msg, context)
    if (parsed === null) return
    const data = JSON.stringify(parsed)
    for (const ws of this.initializedBrowserClients) {
      if (ws.readyState !== WebSocket.OPEN) {
        this.dropBrowserClient(session, ws)
        continue
      }
      try {
        ws.send(data)
      } catch {
        this.dropBrowserClient(session, ws)
      }
    }
  }

  private handleBrowserConnection(session: CortexSession, ws: WebSocket): void {
    this.browserClients.add(ws)
    const disconnect = () => this.dropBrowserClient(session, ws)
    ws.on('close', disconnect)
    ws.on('error', disconnect)
    ws.on('message', (raw) => this.handleBrowserMessage(session, ws, raw.toString()))
  }

  private handleBrowserMessage(session: CortexSession, ws: WebSocket, raw: string): void {
    if (session.isDisposed) return
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return }
    const data = parseOrFail(browserToServerSchema, parsed, 'webpack.browserMessage')
    if (data === null) {
      const issues = browserToServerSchema.safeParse(parsed)
      const message = issues.success ? 'Schema validation failed' : formatIssues(issues.error.issues)
      this.sendToBrowser(session, ws, { type: 'error', code: 'SCHEMA_VIOLATION', message }, 'webpack.browserMessage.schemaError')
      return
    }
    if (data.type !== 'init' && !this.initializedBrowserClients.has(ws)) {
      this.sendToBrowser(session, ws, { type: 'error', code: 'AUTH_FAILED', message: 'Browser socket is not initialized' }, 'webpack.browserMessage.auth')
      return
    }
    if (WRITE_TYPES.has(data.type)) {
      if (!('token' in data) || data.token !== session.token) {
        this.sendToBrowser(session, ws, { type: 'error', code: 'AUTH_FAILED', message: 'Invalid or missing auth token' }, 'webpack.browserMessage.auth')
        return
      }
    }

    const { token: _token, ...forwardData } = data as Record<string, unknown>
    if (BROWSER_TO_CLI_FORWARD_TYPES.has(data.type)) {
      const forwarded = this.forwardToCLI(session, forwardData)
      if (data.type === 'staged-edits-ready' && forwarded) {
        const ackMsg: ServerToBrowser = { type: 'staged-edits-acked', requestId: data.requestId }
        this.sendToInitializedBrowsers(session, ackMsg, 'webpack.stagedEditsAck')
      }
    }

    if (data.type === 'cortex-closed') session.editorActive = false
    if (data.type === 'init') {
      const msgToken = (parsed as Record<string, unknown>).token
      if (typeof msgToken !== 'string' || msgToken !== session.token) {
        this.sendToBrowser(session, ws, { type: 'error', code: 'AUTH_FAILED', message: 'Invalid or missing auth token' }, 'webpack.browserMessage.initAuth')
        return
      }
      this.initializedBrowserClients.add(ws)
      session.browserConnected = true
      this.sendToBrowser(session, ws, {
        type: 'hello',
        protocolVersion: 1,
        sessionId: session.sessionId,
      }, 'webpack.browserMessage.initHello')
      this.sendToBrowser(session, ws, { type: 'agent-status', connected: session.cliClients.size > 0 }, 'webpack.browserMessage.initAgentStatus')
      if (session.editorActive) this.sendToBrowser(session, ws, { type: 'cortex' }, 'webpack.browserMessage.initCortex')
      if (session.capabilitiesCache) this.sendToBrowser(session, ws, { type: 'capabilities', systems: session.capabilitiesCache }, 'webpack.browserMessage.initCapabilities')
      // Hydrate the browser with annotations the server has in memory.
      // Always emit — even an empty snapshot is authoritative. A reconnecting
      // browser (network blip, HMR re-mount) needs to know the server's current
      // state so any stale local annotations get replaced. The reducer performs
      // a full Map replacement on this message.
      this.sendToBrowser(
        session,
        ws,
        { type: 'annotations-snapshot', annotations: session.annotations.getAll() },
        'webpack.browserMessage.initAnnotationsSnapshot',
      )
      return
    }
    if (data.type === 'comment') {
      if (data.kind === 'fix-request' && !isFixRequestSourceInsideRoot(data.elementSource, this.root)) {
        console.warn(`[cortex] Rejected fix-request: elementSource "${getElementSourceFile(data.elementSource)}" is outside project root`)
        return
      }
      const annotation = session.annotations.create({
        elementSource: data.elementSource,
        text: data.text,
        elementContext: data.elementContext,
        currentStyles: data.currentStyles,
        pinPosition: data.pinPosition,
        kind: data.kind,
        fixMeta: data.fixMeta,
      })
      session.channel?.send({ type: 'annotation-created', annotation })
      return
    }
    if (data.type === 'comment-reply') {
      const annotation = session.annotations.addMessage(data.annotationId, { from: 'user', text: data.text })
      if (annotation) session.channel?.send({ type: 'annotation-updated', annotation })
      return
    }
    if (data.type === 'staged-edit-add') {
      session.stagedEdits.append(data.edit)
      return
    }
    if (data.type === 'staged-edit-remove') {
      session.stagedEdits.remove(data.intentIds)
      return
    }
    if (data.type === 'staged-edit-clear') {
      session.stagedEdits.clear()
      return
    }
    if (data.type === 'staged-edits-sync') {
      const results = data.edits.map(edit => pendingEditSchema.safeParse(edit))
      const validEdits = results.flatMap(result => result.success ? [result.data] : [])
      session.stagedEdits.mergeFullSync(validEdits)
      return
    }
    if (data.type === 'edit') {
      if (session.pipeline) session.pipeline.handleEdit(data)
      else session.channel?.send({ type: 'edit_status', editId: data.editId, status: 'failed', reason: 'Editor is still initializing. Please try again.' })
      return
    }
    if (data.type === 'undo') {
      if (session.pipeline) session.pipeline.handleUndo()
      else session.channel?.send({ type: 'undo_sync_status', status: 'failed', reason: 'Editor is still initializing.' })
      return
    }
    if (data.type === 'redo') {
      if (session.pipeline) session.pipeline.handleRedo()
      else session.channel?.send({ type: 'redo_sync_status', status: 'failed', reason: 'Editor is still initializing.' })
      return
    }
    if (data.type === 'clear_server_undo') session.pipeline?.clearUndoStack()
  }

  private forwardToCLI(session: CortexSession, msg: unknown): boolean {
    if (session.cliClients.size === 0) return false
    let data: string
    try { data = JSON.stringify(msg) } catch { return false }
    let delivered = false
    for (const client of session.cliClients) {
      if (client.readyState !== WebSocket.OPEN) continue
      try {
        client.send(data)
        delivered = true
      } catch {
        this.removeCliClient(session, client)
      }
    }
    return delivered
  }

  private markCliAuthenticated(session: CortexSession, ws: WebSocket): boolean {
    if (session.cliClients.has(ws)) {
      session.aliveFlags.set(ws, true)
      return true
    }
    if (session.cliClients.size >= MAX_CLI_CONNECTIONS) {
      ws.close(1013, 'Too many CLI connections')
      return false
    }
    session.cliClients.add(ws)
    session.aliveFlags.set(ws, true)
    this.sendToInitializedBrowsers(session, { type: 'agent-status', connected: true }, 'webpack.cliAgentStatus')
    return true
  }

  private removeCliClient(session: CortexSession, ws: WebSocket): void {
    const removed = session.cliClients.delete(ws)
    session.aliveFlags.delete(ws)
    if (removed) {
      this.sendToInitializedBrowsers(session, { type: 'agent-status', connected: session.cliClients.size > 0 }, 'webpack.cliAgentStatus')
    }
  }

  private handleCliConnection(session: CortexSession, ws: WebSocket): void {
    ws.on('pong', () => {
      if (session.cliClients.has(ws)) session.aliveFlags.set(ws, true)
    })
    ws.on('message', raw => void this.handleCliMessage(session, ws, raw.toString()))
    ws.on('close', () => this.removeCliClient(session, ws))
    ws.on('error', () => this.removeCliClient(session, ws))
  }

  private async handleCliMessage(session: CortexSession, ws: WebSocket, raw: string): Promise<void> {
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return }
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return
    const type = (parsed as { type: unknown }).type
    if (typeof type !== 'string') return

    const msgToken = (parsed as Record<string, unknown>).token
    if (typeof msgToken !== 'string' || msgToken !== session.token) {
      try { ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Invalid or missing auth token' })) } catch {}
      this.removeCliClient(session, ws)
      return
    }
    if (!this.markCliAuthenticated(session, ws)) return

    if (type === 'cortex-status-request') {
      try {
        ws.send(JSON.stringify({ type: 'cortex-status', editorActive: session.editorActive, browserConnected: session.browserConnected }))
      } catch {
        this.removeCliClient(session, ws)
        ws.terminate()
      }
      return
    }

    if (type === 'cortex-rpc') {
      const rpcMsg = parseOrFail(cliRpcRequestSchema, parsed, 'webpack.cliDispatcher.cortex-rpc')
      if (rpcMsg === null) {
        try { ws.send(JSON.stringify({ type: 'error', code: 'SCHEMA_VIOLATION', message: 'Invalid cortex-rpc envelope' })) } catch {}
        return
      }
      const { requestId, method } = rpcMsg
      let params = rpcMsg.params
      if (!ALLOWED_RPC_METHODS.has(method)) {
        try { ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: `Unknown RPC method: ${method}` })) } catch {}
        return
      }
      try {
        const methodSchema = RPC_METHOD_SCHEMAS[method as keyof typeof RPC_METHOD_SCHEMAS]
        if (methodSchema !== null && methodSchema !== undefined) {
          const schemaResult = (methodSchema as import('zod').ZodType<unknown>).safeParse(params)
          if (!schemaResult.success) {
            const formatted = formatIssues(schemaResult.error.issues)
            try { ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: `SCHEMA_VIOLATION: ${formatted}` })) } catch {}
            return
          }
          params = schemaResult.data as Record<string, unknown>
        }
        const result = await Promise.resolve(this.handleRPC(session, method, params))
        try { ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result })) } catch {}
      } catch (err) {
        try { ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: err instanceof Error ? err.message : String(err) })) } catch {}
      }
      return
    }

    if (type === 'cortex') session.editorActive = true
    if (type === 'cortex-close') session.editorActive = false
    if (!CLI_ALLOWED_TYPES.has(type)) return
    session.channel?.send({ type } as ServerToBrowser)
  }

  private handleRPC(session: CortexSession, method: string, params: Record<string, unknown>): unknown {
    const id = params.annotationId as string | undefined ?? ''
    switch (method) {
      case 'getPending': return session.annotations.getPending()
      case 'getDetails': return session.annotations.getById(id)
      case 'acknowledge': return session.annotations.acknowledge(id)
      case 'resolve': return session.annotations.resolve(id, params.summary as string)
      case 'dismiss': return session.annotations.dismiss(id, params.reason as string | undefined)
      case 'respond': return session.annotations.addMessage(id, { from: 'agent', text: params.text as string })
      case 'getPendingEdits': {
        const intents = session.stagedEdits.list()
        return { intents, count: intents.length }
      }
      case 'applyEdits': {
        const intentIds = params.intentIds as string[]
        if (!session.pipeline) {
          return {
            results: intentIds.map(intentId => ({
              intentId,
              status: 'failed' as const,
              error: 'Editor is still initializing. Please try again.',
            })),
            browserNotified: true,
          }
        }
        const stagedEdits = session.stagedEdits
        const pipeline = session.pipeline
        const channel = session.channel
        return applyEditsCore(stagedEdits, intentIds, pipeline).then(results => {
          const appliedIds = results.filter(result => result.status === 'applied').map(result => result.intentId)
          let browserNotified = appliedIds.length === 0
          if (appliedIds.length > 0 && channel) {
            channel.send({ type: 'staged-edits-discard', intentIds: appliedIds })
            browserNotified = true
          }
          return { results, browserNotified }
        })
      }
      case 'discardEdits': {
        const intentIds = params.intentIds as string[]
        session.stagedEdits.remove(intentIds)
        session.channel?.send({ type: 'staged-edits-discard', intentIds })
        return { discarded: intentIds, browserNotified: Boolean(session.channel) }
      }
      case 'getIntentContext': {
        const intentId = params.intentId as string
        const intent = session.stagedEdits.getById(intentId)
        if (!intent) return { error: 'intent not found' }
        const parsed = parseIntentSource(intent.source)
        if (!parsed.ok) return { error: parsed.error }
        const resolvedPath = path.resolve(this.root, parsed.filePath)
        if (!isPathInsideRoot(resolvedPath, this.root)) return { error: 'Path outside project root' }
        const containment = requireRealpathInsideRoot(resolvedPath, this.root)
        if (!containment.ok) return { error: containment.error.includes('outside') ? containment.error : `${containment.error} in: ${parsed.filePath}` }
        let stats: fs.Stats
        try {
          stats = fs.statSync(containment.real)
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code
          return { error: `Could not stat file: ${parsed.filePath}${code ? ` (${code})` : ''}` }
        }
        const sizeCheck = checkIntentFileSize(parsed.filePath, stats.size)
        if (sizeCheck) return sizeCheck
        let fileContent: string
        try {
          fileContent = fs.readFileSync(containment.real, 'utf8')
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code
          return { error: `Could not read file: ${parsed.filePath}${code ? ` (${code})` : ''}` }
        }
        const slice = sliceIntentContext(fileContent, parsed.line)
        return {
          intentId,
          context: { before: slice.before, target: slice.target, after: slice.after },
          currentValue: slice.currentValue,
        }
      }
      default: throw new Error(`Unknown RPC method: ${method}`)
    }
  }

  async dispose(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const ws of this.browserClients) ws.terminate()
    this.browserClients.clear()
    const browserWss = this.browserWss
    const httpServer = this.httpServer
    this.browserWss = null
    this.httpServer = null
    await this.session?.dispose()
    this.session = null
    await new Promise<void>(resolve => {
      browserWss?.close(() => {
        httpServer?.close(() => resolve())
        if (!httpServer) resolve()
      })
      if (!browserWss) {
        httpServer?.close(() => resolve())
        if (!httpServer) resolve()
      }
    })
    this.startPromise = null
  }
}

export class CortexWebpackPlugin {
  private readonly options: CortexWebpackOptions
  private readonly toggleShortcut: string

  constructor(options: CortexWebpackOptions = {}) {
    this.options = options
    this.toggleShortcut = validateToggleShortcut(options.toggleShortcut ?? DEFAULT_TOGGLE_SHORTCUT)
  }

  apply(compiler: WebpackCompiler): void {
    const projectRoot = path.resolve(this.options.projectRoot ?? compiler.options.context ?? compiler.context ?? process.cwd())
    if (compiler.options.mode === 'production' || process.env.NODE_ENV === 'production') return
    if (detectNextProject(projectRoot)) {
      console.warn('[cortex] Next.js project detected. Use withCortex() from cortex-editor/next instead of cortexWebpack().')
    }
    this.addSourceLoaderRule(compiler, projectRoot)

    const runtime = new CortexWebpackRuntime({
      root: projectRoot,
      mode: compiler.options.mode ?? 'development',
      port: this.options.port,
      toggleShortcut: this.toggleShortcut,
      invalidate: () => compiler.watching?.invalidate?.(),
    })

    compiler.hooks.beforeRun?.tapPromise(PLUGIN_NAME, () => runtime.start())
    compiler.hooks.watchRun?.tapPromise(PLUGIN_NAME, () => runtime.start())
    compiler.hooks.thisCompilation?.tap(PLUGIN_NAME, compilation => this.configureCompilation(compilation, compiler, runtime))
    compiler.hooks.done?.tap(PLUGIN_NAME, stats => {
      const modifiedFiles = stats.compilation?.modifiedFiles
      if (!modifiedFiles) return
      const files = Array.from(modifiedFiles)
        .filter(file => /\.[jt]sx$|\.css$/.test(file))
      if (files.length === 0) return
      runtime.notifyHMR(files)
    })
    compiler.hooks.shutdown?.tapPromise?.(PLUGIN_NAME, () => runtime.dispose())
  }

  private addSourceLoaderRule(compiler: WebpackCompiler, projectRoot: string): void {
    compiler.options.module ??= {}
    compiler.options.module.rules ??= []
    const rules = compiler.options.module.rules
    if (rules.some(rule => ruleUsesCortexSourceLoader(rule))) return
    const rule: WebpackRuleSet = {
      test: /\.[jt]sx$/,
      exclude: resourcePath => shouldExcludeCortexSource(resourcePath, this.options.includeNodeModules),
      enforce: 'pre',
      use: [{
        loader: resolveSourceLoaderPath(),
        options: {
          projectRoot,
          resolveAlias: this.options.resolveAlias,
          includeNodeModules: this.options.includeNodeModules,
        },
      }],
    }
    rules.push(rule)
  }

  private configureCompilation(
    compilation: WebpackCompilation,
    compiler: WebpackCompiler,
    runtime: CortexWebpackRuntime,
  ): void {
    const hooks = findHtmlWebpackPluginHooks(compilation, compiler.options.plugins ?? [])
    if (hooks?.beforeEmit) {
      hooks.beforeEmit.tapPromise(PLUGIN_NAME, async data => {
        await runtime.start()
        const state = runtime.injectionState
        return state ? { ...data, html: injectWebpackHtml(data.html, state) } : data
      })
      return
    }

    compilation.hooks?.processAssets?.tapPromise({ name: PLUGIN_NAME }, async () => {
      await runtime.start()
      const state = runtime.injectionState
      if (!state) return
      const snippet = createManualInjectionSnippet(state)
      emitAsset(compilation, compiler, 'cortex-manual-injection.html', snippet)
      console.warn(
        '[cortex] HtmlWebpackPlugin not detected; automatic script injection is unavailable. ' +
        'Add the snippet emitted at cortex-manual-injection.html to your dev HTML template.',
      )
    })
  }
}

function findHtmlWebpackPluginHooks(
  compilation: WebpackCompilation,
  plugins: unknown[],
): HtmlWebpackPluginHooks | null {
  for (const plugin of plugins) {
    const ctor = (plugin as { constructor?: { getHooks?: (compilation: WebpackCompilation) => HtmlWebpackPluginHooks } }).constructor
    if (typeof ctor?.getHooks === 'function') return ctor.getHooks(compilation)
  }
  return null
}

function emitAsset(
  compilation: WebpackCompilation,
  compiler: WebpackCompiler,
  name: string,
  source: string,
): void {
  const RawSource = compiler.webpack?.sources?.RawSource
  const asset = RawSource
    ? new RawSource(source)
    : { source: () => source, size: () => source.length }
  if (typeof compilation.emitAsset === 'function') {
    compilation.emitAsset(name, asset)
  } else {
    compilation.assets ??= {}
    compilation.assets[name] = asset
  }
}

function ruleUsesCortexSourceLoader(rule: unknown): boolean {
  if (!rule || typeof rule !== 'object') return false
  const candidate = rule as {
    loader?: unknown
    use?: unknown
    oneOf?: unknown
    rules?: unknown
  }

  if (loaderLooksLikeCortexSourceLoader(candidate.loader)) return true
  if (loaderLooksLikeCortexSourceLoader(candidate.use)) return true
  if (Array.isArray(candidate.use) && candidate.use.some(loaderLooksLikeCortexSourceLoader)) return true
  if (Array.isArray(candidate.oneOf) && candidate.oneOf.some(ruleUsesCortexSourceLoader)) return true
  if (Array.isArray(candidate.rules) && candidate.rules.some(ruleUsesCortexSourceLoader)) return true
  return false
}

function loaderLooksLikeCortexSourceLoader(loader: unknown): boolean {
  if (typeof loader === 'string') return /(?:^|[/\\])(?:next-)?source-loader\.cjs$/.test(loader)
  if (!loader || typeof loader !== 'object') return false
  return loaderLooksLikeCortexSourceLoader((loader as { loader?: unknown }).loader)
}

export function cortexWebpack(options?: CortexWebpackOptions): CortexWebpackPlugin {
  return new CortexWebpackPlugin(options)
}

export default cortexWebpack
