import { loadEnv, type Plugin, type ResolvedConfig, type HmrContext } from 'vite'
import type { SourceMapInput } from 'rollup'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer, WebSocket } from 'ws'
import { createSourceTransform } from './source-transform.js'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from './types.js'
import { TailwindResolver } from '../core/tailwind-resolver.js'
import { TailwindRewriter } from '../core/rewriter/tailwind.js'
import { InlineStyleRewriter } from '../core/rewriter/inline-style.js'
import { HMRVerifier } from '../core/hmr-verifier.js'
import { EditPipeline } from '../core/edit-pipeline.js'
import type { EditRequest, WriteIntent } from '../core/edit-pipeline.js'
import { StyleDetector } from '../core/rewriter/detector.js'
import type { DetectionResult } from '../core/rewriter/detector.js'
import { computeCapabilities } from '../core/capabilities.js'
import type { ResolverState, StyleCapability } from '../core/capabilities.js'
import { CSSModulesRewriter } from '../core/rewriter/css-modules.js'
import { RuntimeCSSResolver } from '../core/rewriter/runtime-resolver.js'
import { UndoStack } from '../core/session/undo-stack.js'
import { AIWriter } from '../core/ai-writer.js'
import { DeferredWriter } from '../core/deferred-writer.js'
import { AnnotationStore } from '../core/annotations.js'
import { ActivityLog } from '../core/session/activity-log.js'

export interface CortexEditorOptions {
  /** Package names in node_modules to instrument (for library component detection). */
  includeNodeModules?: string[]
  /** Keyboard shortcut for toggling the editor. Uses KeyboardEvent.code values.
   *  Default: '$mod+Shift+Period' (Cmd+Shift+. on Mac, Ctrl+Shift+. on Windows/Linux).
   *  See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code */
  toggleShortcut?: string
}

const CORTEX_CLIENT_PATH = '/@cortex/client.js'
const CORTEX_BROWSER_PATH = '/@cortex/browser.js'
const VIRTUAL_CORTEX_CLIENT = '\0cortex-client'
const CORTEX_MSG_EVENT = 'cortex:msg'

// CLI WebSocket bridge constants
const ALLOWED_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const CLI_ALLOWED_TYPES = new Set(['cortex', 'cortex-close'])
const HEARTBEAT_INTERVAL = 30_000
const MAX_CLI_CONNECTIONS = 5

// Resolve browser IIFE path relative to this file (dist/vite/vite.js → dist/browser/index.js)
// CJS: __dirname is reliable. ESM: use import.meta.url.
function resolveBrowserIIFEPath(): string {
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, '..', 'browser', 'index.js')
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'browser', 'index.js')
}

const VALID_SHORTCUT = /^\$mod\+(?:Shift\+)?(?:Alt\+)?(?:Key[A-Z]|Digit\d|Period|Comma|Slash|Backslash|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Minus|Equal)$/

export function validateToggleShortcut(shortcut: string): string {
  if (!VALID_SHORTCUT.test(shortcut)) {
    throw new Error(
      `[cortex] Invalid toggleShortcut: "${shortcut}". ` +
      `Expected format: "$mod+Shift+KeyCode" (e.g., "$mod+Shift+Period"). ` +
      `See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code`
    )
  }
  return shortcut
}

/** Escape JSON for safe embedding in <script> context. */
function safeJSONForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function getClientScript(options: { toggleShortcut: string }): string {
  const config = safeJSONForScript({ toggleShortcut: options.toggleShortcut })
  return `\
if (import.meta.hot) {
  import.meta.hot.on('${CORTEX_MSG_EVENT}', (data) => {
    window.__cortex_channel__?.handleServerMessage(data);
  });
  // Notify browser when HMR stylesheet update is applied — override clearing
  // must wait for this to avoid flash (hmr_verified arrives before HMR applies).
  import.meta.hot.on('vite:afterUpdate', () => {
    window.__cortex_channel__?.handleServerMessage({ type: 'hmr-applied' });
  });
  if (!Object.prototype.hasOwnProperty.call(window, '__cortex_send__')) {
    Object.defineProperty(window, '__cortex_send__', {
      value: (msg) => import.meta.hot.send('${CORTEX_MSG_EVENT}', msg),
      writable: false, configurable: false,
    });
  }
}
// Toggle shortcut — capture phase, always active
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
  __cortexScript.src = '${CORTEX_BROWSER_PATH}';
  __cortexScript.onerror = function() { console.error('[cortex] Failed to load browser UI.'); };
  document.head.appendChild(__cortexScript);
}
`
}

let channelInstance: ServerChannel | null = null
const hmrCallbacks: ((files: string[]) => void)[] = []
let annotationStore = new AnnotationStore()
let activityLog = new ActivityLog()

// CLI WebSocket bridge state
let cliWss: InstanceType<typeof WebSocketServer> | null = null
const cliClients = new Set<InstanceType<typeof WebSocket>>()
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const aliveFlags = new WeakMap<InstanceType<typeof WebSocket>, boolean>()
let upgradeHandlerRef: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null
let portFilePath: string | null = null
let editorActive = false
let browserConnected = false
let pipelineInstance: EditPipeline | null = null
let hmrUnsubscribe: (() => void) | null = null
let capabilitiesCache: StyleCapability[] | null = null

// Annotation RPC dispatch
const ALLOWED_RPC_METHODS = new Set(['getPending', 'getDetails', 'acknowledge', 'resolve', 'dismiss', 'respond'])

function handleAnnotationRPC(method: string, params: Record<string, unknown>): unknown {
  const id = typeof params.annotationId === 'string' ? params.annotationId : ''
  switch (method) {
    case 'getPending': return annotationStore.getPending()
    case 'getDetails': return annotationStore.getById(id)
    case 'acknowledge': {
      const result = annotationStore.acknowledge(id)
      if (result && channelInstance) {
        channelInstance.send({ type: 'annotation-updated', annotation: result })
        const entry = activityLog.add({ type: 'status-change', description: `Acknowledged: ${result.text}`, elementSource: result.elementSource })
        channelInstance.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'resolve': {
      const summary = typeof params.summary === 'string' ? params.summary : ''
      const result = annotationStore.resolve(id, summary)
      if (result && channelInstance) {
        channelInstance.send({ type: 'annotation-updated', annotation: result })
        const entry = activityLog.add({ type: 'status-change', description: `Resolved: ${summary}`, elementSource: result.elementSource })
        channelInstance.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'dismiss': {
      const reason = typeof params.reason === 'string' ? params.reason : undefined
      const result = annotationStore.dismiss(id, reason)
      if (result && channelInstance) {
        channelInstance.send({ type: 'annotation-updated', annotation: result })
        const entry = activityLog.add({ type: 'status-change', description: `Dismissed: ${result.text}`, elementSource: result.elementSource })
        channelInstance.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'respond': {
      const text = typeof params.text === 'string' ? params.text : ''
      const result = annotationStore.addMessage(id, { from: 'agent', text })
      if (result && channelInstance) {
        channelInstance.send({ type: 'annotation-updated', annotation: result })
      }
      return result
    }
    default: throw new Error(`Unknown RPC method: ${method}`)
  }
}

/** Forward a message to all connected CLI WebSocket clients. */
function forwardToCLI(msg: unknown): void {
  if (cliClients.size === 0) return
  let data: string
  try {
    data = JSON.stringify(msg)
  } catch {
    return
  }
  for (const client of cliClients) {
    if (client.readyState !== WebSocket.OPEN) continue
    try {
      client.send(data)
    } catch {
      cliClients.delete(client)
    }
  }
}

export function getChannel(): ServerChannel {
  if (!channelInstance) {
    throw new Error(
      'getChannel() called before the Vite dev server started. ' +
      'Ensure cortexEditor() is in your vite.config.ts plugins[] and you are running `vite dev`.'
    )
  }
  return channelInstance
}

export function onHMRUpdate(cb: (files: string[]) => void): () => void {
  hmrCallbacks.push(cb)
  return () => {
    const idx = hmrCallbacks.indexOf(cb)
    if (idx >= 0) hmrCallbacks.splice(idx, 1)
  }
}

/**
 * Reset module-level state. Exposed for testing only.
 * @internal
 */
export function _resetForTesting(): void {
  channelInstance = null
  hmrCallbacks.length = 0
  // CLI bridge cleanup
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  for (const client of cliClients) client.terminate()
  cliClients.clear()
  if (cliWss) { cliWss.close(); cliWss = null }
  editorActive = false
  browserConnected = false
  if (portFilePath) {
    try { fs.unlinkSync(portFilePath) } catch {}
    portFilePath = null
  }
  upgradeHandlerRef = null
  annotationStore = new AnnotationStore()
  activityLog = new ActivityLog()
  if (pipelineInstance) { pipelineInstance.dispose(); pipelineInstance = null }
  capabilitiesCache = null
}

export function cortexEditor(_options?: CortexEditorOptions): Plugin {
  let config: ResolvedConfig
  let transformSource: ReturnType<typeof createSourceTransform>
  const messageHandlers: ((msg: BrowserToServer) => void)[] = []
  let aliasMap: Record<string, string> = {}
  const validatedToggleShortcut = validateToggleShortcut(_options?.toggleShortcut ?? '$mod+Shift+Period')
  const clientScript = getClientScript({ toggleShortcut: validatedToggleShortcut })
  // Suppress HMR for ALL cortex writes (edit, undo, redo). The override layer
  // owns all visuals during the editing session. Files are saved correctly on
  // disk for git/deployment. The stylesheet stays at page-load values.
  const recentEditWrites = new Set<string>()

  return {
    name: 'cortex-editor',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved

      // Extract aliases for source transform (CSS Module import resolution)
      aliasMap = {}
      const aliases = config.resolve?.alias
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          if (typeof a.find === 'string' && typeof a.replacement === 'string') {
            aliasMap[a.find] = a.replacement
          }
        }
      } else if (aliases && typeof aliases === 'object') {
        for (const [key, val] of Object.entries(aliases)) {
          if (typeof val === 'string') aliasMap[key] = val
        }
      }

      transformSource = createSourceTransform(config.root, {
        includeNodeModules: _options?.includeNodeModules,
        resolveAlias: (spec) => {
          for (const [k, v] of Object.entries(aliasMap)) {
            if (spec === k || spec.startsWith(k + '/')) return v + spec.slice(k.length)
          }
          return null
        },
      })
    },

    resolveId(id) {
      if (id === CORTEX_CLIENT_PATH) return VIRTUAL_CORTEX_CLIENT
    },

    load(id) {
      if (id === VIRTUAL_CORTEX_CLIENT) return clientScript
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (config.command !== 'serve') return html
        const script = `<script type="module" src="${CORTEX_CLIENT_PATH}"></script>`
        const injected = html.replace(/<\/head>/i, `${script}\n</head>`)
        if (injected === html) {
          console.warn('[cortex] transformIndexHtml: </head> not found — client script not injected')
        }
        return injected
      },
    },

    transform(code, id) {
      if (config.command !== 'serve') return null
      const result = transformSource(code, id)
      if (!result) return null
      // Our SourceMap allows nullable optional fields (per source map spec)
      // that Rollup's stricter types reject. Cast the map.
      return { code: result.code, map: result.map as SourceMapInput }
    },

    configureServer(server) {
      // Clean up CLI connections from a previous configureServer() call (Vite restart)
      if (cliClients.size > 0) {
        for (const client of cliClients) client.terminate()
        cliClients.clear()
      }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      if (cliWss) { cliWss.close(); cliWss = null }
      if (upgradeHandlerRef && server.httpServer) {
        server.httpServer.removeListener('upgrade', upgradeHandlerRef)
      }
      editorActive = false
      browserConnected = false
      capabilitiesCache = null

      // Serve browser IIFE — read fresh on each request so rebuilds take effect without restart
      server.middlewares.use(CORTEX_BROWSER_PATH, (_req, res, next) => {
        let content: string
        try {
          content = fs.readFileSync(resolveBrowserIIFEPath(), 'utf8')
        } catch (e) {
          console.error(`[cortex] Browser bundle not found: ${resolveBrowserIIFEPath()}`)
          return next(e instanceof Error ? e : new Error(String(e)))
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(content)
      })

      // Dispose previous channel if configureServer is called again (server restart)
      if (channelInstance) {
        channelInstance.dispose().catch((err) => {
          console.warn('[cortex] Failed to dispose previous channel:', err instanceof Error ? err.message : err)
        })
      }

      // Resolve Tailwind colors at server start — promise awaited in hotHandler
      const swatchesPromise = TailwindResolver.resolveColors(config.root).catch(() => null)

      // Vite 5.1+ API: server.hot replaces deprecated server.ws
      let helloSent = false
      const hotHandler = (data: BrowserToServer) => {
        // Forward ALL browser messages to CLI clients (before init guard)
        forwardToCLI(data)

        // Track state from browser messages
        if (data.type === 'cortex-closed') editorActive = false

        // Send hello with swatches on first message (typically 'init') from browser
        if (!helloSent && channelInstance) {
          helloSent = true // synchronous guard prevents duplicate sends
          const channel = channelInstance
          swatchesPromise.then((colors) => {
            channel.send({
              type: 'hello',
              protocolVersion: 1,
              sessionId: crypto.randomUUID(),
              swatches: colors && colors.length > 0 ? colors : undefined,
            })
          })
        }

        if (data.type === 'comment') {
          const ann = annotationStore.create({
            elementSource: data.elementSource,
            text: data.text,
            elementContext: data.elementContext,
            currentStyles: data.currentStyles,
            pinPosition: data.pinPosition,
          })
          const entry = activityLog.add({ type: 'comment', description: data.text, elementSource: data.elementSource })
          if (channelInstance) {
            channelInstance.send({ type: 'annotation-created', annotation: ann })
            channelInstance.send({ type: 'activity-entry', entry })
          }
        }

        if (data.type === 'comment-reply') {
          const ann = annotationStore.addMessage(data.annotationId, { from: 'user', text: data.text })
          if (ann && channelInstance) {
            const entry = activityLog.add({ type: 'comment', description: data.text, elementSource: ann.elementSource })
            channelInstance.send({ type: 'annotation-updated', annotation: ann })
            channelInstance.send({ type: 'activity-entry', entry })
          }
        }

        // Route edit/undo/redo to EditPipeline (or notify if still initializing)
        if (data.type === 'edit') {
          if (pipelineInstance) pipelineInstance.handleEdit(data as EditRequest)
          else channelInstance?.send({ type: 'edit_status', editId: (data as EditRequest).editId, status: 'failed', reason: 'Editor is still initializing. Please try again.' })
        }
        if (data.type === 'undo') {
          if (pipelineInstance) pipelineInstance.handleUndo()
          else channelInstance?.send({ type: 'undo_status', status: 'failed', restoredFile: '', reason: 'Editor is still initializing.' })
        }
        if (data.type === 'redo') {
          if (pipelineInstance) pipelineInstance.handleRedo()
          else channelInstance?.send({ type: 'redo_status', status: 'failed', restoredFile: '', reason: 'Editor is still initializing.' })
        }

        // Track browser connection + send current agent status on init
        if (data.type === 'init') {
          browserConnected = true
          if (channelInstance) {
            channelInstance.send({ type: 'agent-status', connected: cliClients.size > 0 })
            if (editorActive) channelInstance.send({ type: 'cortex' })
            // Re-send capabilities for late-connecting browsers
            if (capabilitiesCache) {
              channelInstance.send({ type: 'capabilities', systems: capabilitiesCache })
            }
          }
          return
        }

        const handlers = [...messageHandlers]
        for (const h of handlers) {
          try { h(data) } catch (err) {
            console.warn('[cortex] Message handler error:', err instanceof Error ? err.message : err)
          }
        }
      }
      server.hot.on(CORTEX_MSG_EVENT, hotHandler)

      // send() and broadcast() are identical because Vite's server.hot
      // has no per-client targeting — all messages go to all connected tabs.
      // Both retained for intent clarity in calling code.
      // forwardToCLI echoes server→browser messages to connected CLI clients.
      channelInstance = {
        send(msg: ServerToBrowser) {
          server.hot.send(CORTEX_MSG_EVENT, msg)
          forwardToCLI(msg)
        },
        broadcast(msg: ServerToBrowser) {
          server.hot.send(CORTEX_MSG_EVENT, msg)
          forwardToCLI(msg)
        },
        onMessage(handler: (msg: BrowserToServer) => void): () => void {
          messageHandlers.push(handler)
          return () => {
            const idx = messageHandlers.indexOf(handler)
            if (idx >= 0) messageHandlers.splice(idx, 1)
          }
        },
        async dispose() {
          server.hot.off(CORTEX_MSG_EVENT, hotHandler)
          messageHandlers.length = 0

          // CLI WebSocket bridge cleanup
          if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
          for (const client of cliClients) client.terminate()
          cliClients.clear()
          if (cliWss) { cliWss.close(); cliWss = null }
          if (upgradeHandlerRef && server.httpServer) {
            server.httpServer.removeListener('upgrade', upgradeHandlerRef)
            upgradeHandlerRef = null
          }
          if (portFilePath) {
            try { fs.unlinkSync(portFilePath) } catch {}
            portFilePath = null
          }
          if (pipelineInstance) { pipelineInstance.dispose(); pipelineInstance = null }
        },
      }

      // --- Edit pipeline construction ---
      // Build the edit pipeline with all deps. Tailwind deps are lazy/optional.
      const projectRoot = config.root
      const rewriter = new TailwindRewriter()
      const inlineStyleRewriter = new InlineStyleRewriter()
      const verifier = new HMRVerifier(channelInstance)
      const cssModulesRewriter = new CSSModulesRewriter({
        readFile: (p) => fs.promises.readFile(p, 'utf-8'),
      })
      const runtimeResolver = new RuntimeCSSResolver()
      const undoStack = new UndoStack()

      // Style detection + Tailwind resolver are async — kick off in parallel
      const detector = new StyleDetector()
      const detectionPromise = detector.detect(projectRoot).catch((err) => {
        console.warn('[cortex] Style detection failed:', err instanceof Error ? err.message : err)
        return { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: true, summary: 'Detection failed' } satisfies DetectionResult
      })
      const resolverPromise = TailwindResolver.fromConfig(projectRoot).catch((err) => {
        console.warn('[cortex] Tailwind config resolution failed:', err instanceof Error ? err.message : err)
        return null
      })

      const channel = channelInstance
      Promise.all([detectionPromise, resolverPromise]).then(([detection, resolver]) => {
        // Abort if server was disposed or channel was replaced during async init
        if (!channelInstance || channelInstance !== channel) return

        // Dispose previous pipeline + HMR callback (e.g., from server restart)
        if (pipelineInstance) pipelineInstance.dispose()
        if (hmrUnsubscribe) hmrUnsubscribe()

        // AI writer: enabled when CORTEX_API_KEY is set via .env/.env.local or shell
        const env = loadEnv(config.mode, config.root, 'CORTEX_')
        const cortexApiKey = env.CORTEX_API_KEY || process.env.CORTEX_API_KEY
        const aiWriter = cortexApiKey
          ? new AIWriter({ apiKey: cortexApiKey, readFile: (p) => fs.promises.readFile(p, 'utf-8') })
          : undefined

        // Deferred writer: enabled when AI writer is available. The writeFn
        // closure captures pipelineInstance by reference — safe because writeFn
        // only fires after the coalescing window (250ms+), well after assignment.
        const deferredWriter = aiWriter
          ? new DeferredWriter({
            coalescingMs: 250,
            writeFn: async (batch) => {
              if (!pipelineInstance) return { success: false, reason: 'Pipeline not initialized' }
              return pipelineInstance.executeDeferredBatch(batch)
            },
          })
          : undefined

        pipelineInstance = new EditPipeline({
          channel,
          resolver: resolver ?? TailwindResolver.fromTheme({}),
          rewriter,
          inlineStyleRewriter,
          verifier,
          cssModulesRewriter,
          detector: detection,
          runtimeResolver,
          undoStack,
          aiWriter,
          deferredWriter,
          writeFile: async (intent) => {
            if (intent.kind === 'immediate' || intent.kind === 'undo' || intent.kind === 'redo') {
              recentEditWrites.add(intent.filePath)
              setTimeout(() => recentEditWrites.delete(intent.filePath), 500)
            }
            // 'jsx-immediate': write JSX file but allow HMR — React must re-render with new style prop
            // 'deferred': NO HMR suppression — framework must re-render from source
            await fs.promises.writeFile(intent.filePath, intent.content, 'utf-8')
          },
          readFile: (p) => fs.promises.readFile(p, 'utf-8'),
          projectRoot,
        })

        hmrUnsubscribe = onHMRUpdate((files) => verifier.onHMRUpdate(files))

        // Compute and send capability status to browser
        const resolverState: ResolverState = {
          resolverAvailable: resolver !== null,
          aiAvailable: !!aiWriter,
          inlineStyleAvailable: true,
        }
        const capabilities = computeCapabilities(detection, resolverState)
        capabilitiesCache = capabilities.length > 0 ? capabilities : null
        if (capabilitiesCache) {
          channel.send({ type: 'capabilities', systems: capabilitiesCache })
        }
      }).catch((err) => {
        console.error('[cortex] Failed to initialize edit pipeline:', err instanceof Error ? err.message : err)
      })

      // --- CLI WebSocket bridge ---
      // Only set up when httpServer is available (not in middleware mode)
      if (server.httpServer) {
        cliWss = new WebSocketServer({
          noServer: true,
          maxPayload: 64 * 1024,
          verifyClient: ({ origin }: { origin: string }) => {
            if (!origin) return true // non-browser clients (CLI) don't send Origin
            return ALLOWED_ORIGINS.test(origin)
          },
        })

        cliWss.on('connection', (ws) => {
          if (cliClients.size >= MAX_CLI_CONNECTIONS) {
            ws.close(1013, 'Too many CLI connections')
            return
          }

          cliClients.add(ws)
          aliveFlags.set(ws, true)

          // Send current status on connect (untyped JSON — not part of ServerToBrowser protocol)
          try {
            ws.send(JSON.stringify({ type: 'cortex-status', editorActive, browserConnected }))
          } catch {
            cliClients.delete(ws)
            ws.terminate()
            return
          }

          // Notify browser that an agent connected
          if (channelInstance) channelInstance.send({ type: 'agent-status', connected: true })

          ws.on('pong', () => { aliveFlags.set(ws, true) })

          ws.on('message', (raw) => {
            let parsed: unknown
            try { parsed = JSON.parse(raw.toString()) } catch { return }
            if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return
            const type = (parsed as { type: unknown }).type
            if (typeof type !== 'string') return

            // Handle RPC requests from CLI (annotation queries)
            if (type === 'cortex-rpc') {
              const requestId = (parsed as Record<string, unknown>).requestId as string
              const method = (parsed as Record<string, unknown>).method as string
              const params = ((parsed as Record<string, unknown>).params || {}) as Record<string, unknown>
              if (!ALLOWED_RPC_METHODS.has(method)) {
                try { ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: `Unknown RPC method: ${method}` })) } catch {}
                return
              }
              try {
                const result = handleAnnotationRPC(method, params)
                ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
              } catch (err) {
                ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: err instanceof Error ? err.message : String(err) }))
              }
              return
            }

            // Track state from CLI commands
            if (type === 'cortex') editorActive = true
            if (type === 'cortex-close') editorActive = false

            // Reconstruct message — don't forward arbitrary properties from CLI
            if (!CLI_ALLOWED_TYPES.has(type)) return
            if (channelInstance) {
              channelInstance.send({ type } as ServerToBrowser)
            }
          })

          ws.on('close', () => {
            cliClients.delete(ws)
            if (channelInstance) channelInstance.send({ type: 'agent-status', connected: cliClients.size > 0 })
          })
          ws.on('error', () => cliClients.delete(ws))
        })

        // Heartbeat — 30s ping/pong, matching CortexTransport pattern
        heartbeatTimer = setInterval(() => {
          for (const client of cliClients) {
            if (!aliveFlags.get(client)) {
              client.terminate()
              cliClients.delete(client)
              continue
            }
            aliveFlags.set(client, false)
            try { client.ping() } catch { cliClients.delete(client) }
          }
        }, HEARTBEAT_INTERVAL)
        heartbeatTimer.unref()

        // WebSocket upgrade handler — route /@cortex/ws to CLI WSS
        upgradeHandlerRef = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
          if (req.url !== '/@cortex/ws') return
          // Do NOT close the socket for non-matching paths — Vite's HMR handler needs them

          // Loopback enforcement — reject non-local connections (defense-in-depth for --host mode)
          const remote = req.socket.remoteAddress
          if (!remote || !(remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
            socket.destroy()
            return
          }

          // Host header validation — DNS rebinding defense
          const host = req.headers.host
          if (!host || !ALLOWED_ORIGINS.test(`http://${host}`)) {
            socket.destroy()
            return
          }

          if (!cliWss) { socket.destroy(); return }
          cliWss.handleUpgrade(req, socket, head, (ws: InstanceType<typeof WebSocket>) => {
            if (!cliWss) { ws.terminate(); return }
            cliWss.emit('connection', ws, req)
          })
        }

        server.httpServer.on('upgrade', upgradeHandlerRef)

        // Write port file for MCP discovery (non-fatal — convenience for auto-discovery)
        portFilePath = path.join(config.root, '.cortex', 'port')
        server.httpServer.on('listening', () => {
          const addr = server.httpServer!.address()
          if (addr && typeof addr === 'object') {
            try {
              fs.mkdirSync(path.dirname(portFilePath!), { recursive: true })
              fs.writeFileSync(portFilePath!, String(addr.port))
            } catch (err) {
              console.warn('[cortex] Could not write port file for CLI auto-discovery:', err instanceof Error ? err.message : err)
            }
          }
        })
      } else {
        console.warn('[cortex] No httpServer — running in middleware mode. CLI connections unavailable.')
      }
    },

    handleHotUpdate({ modules }: HmrContext) {
      if (modules.length === 0) return

      // Suppress HMR for files cortex just wrote — the override is already
      // showing the correct value. HMR would cause a full-page style recalc
      // + repaint visible as a flash. The override stays until hmr_verified
      // clears it (which is now a no-op since we handled verification above).
      const cortexFiles = modules.filter(m => m.file && recentEditWrites.has(m.file))

      // Only fire HMR callbacks for non-suppressed files — otherwise the
      // verifier would track edits for files whose HMR was intentionally blocked.
      const nonSuppressed = modules.filter(m => !m.file || !recentEditWrites.has(m.file))
      const files = nonSuppressed
        .map(m => m.file)
        .filter((f): f is string => f != null && (/\.[jt]sx$/.test(f) || /\.module\.css$/.test(f)))

      if (files.length > 0) {
        const cbs = [...hmrCallbacks]
        for (const cb of cbs) {
          try { cb(files) } catch (err) {
            console.warn('[cortex] HMR callback error:', err instanceof Error ? err.message : err)
          }
        }
      }

      if (cortexFiles.length > 0) {
        // Return only non-cortex modules — suppresses HMR for cortex-written files
        return nonSuppressed
      }
    },
  }
}
