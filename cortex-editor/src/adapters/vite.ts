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
import type { EditRequest } from '../core/edit-pipeline.js'
import { StyleDetector } from '../core/rewriter/detector.js'
import type { DetectionResult } from '../core/rewriter/detector.js'
import { computeCapabilities } from '../core/capabilities.js'
import type { ResolverState } from '../core/capabilities.js'
import { CSSModulesRewriter } from '../core/rewriter/css-modules.js'
import { RuntimeCSSResolver } from '../core/rewriter/runtime-resolver.js'
import { UndoStack } from '../core/session/undo-stack.js'
import { AIWriter } from '../core/ai-writer.js'
import { DeferredWriter } from '../core/deferred-writer.js'
import { CortexSession } from '../core/session.js'

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
const ALLOWED_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const CLI_ALLOWED_TYPES = new Set(['cortex', 'cortex-close'])
/** Message types that require token auth — all write/mutation operations.
 *  Update this union when adding new write message types to BrowserToServer. */
type WriteMessageType = 'edit' | 'undo' | 'redo' | 'comment' | 'comment-reply' | 'clear_server_undo'
const WRITE_TYPES: Set<WriteMessageType> = new Set(['edit', 'undo', 'redo', 'comment', 'comment-reply', 'clear_server_undo'])
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

let currentSession: CortexSession | null = null

// Single shutdown handler registered on both SIGINT and SIGTERM, tracked for cleanup on re-entry
let shutdownHandler: (() => void) | null = null

// Annotation RPC dispatch
const ALLOWED_RPC_METHODS = new Set(['getPending', 'getDetails', 'acknowledge', 'resolve', 'dismiss', 'respond'])

function handleAnnotationRPC(method: string, params: Record<string, unknown>): unknown {
  const id = typeof params.annotationId === 'string' ? params.annotationId : ''
  switch (method) {
    case 'getPending': return currentSession!.annotations.getPending()
    case 'getDetails': return currentSession!.annotations.getById(id)
    case 'acknowledge': {
      const result = currentSession!.annotations.acknowledge(id)
      if (result && currentSession!.channel) {
        currentSession!.channel.send({ type: 'annotation-updated', annotation: result })
        const entry = currentSession!.activityLog.add({ type: 'status-change', description: `Acknowledged: ${result.text}`, elementSource: result.elementSource })
        currentSession!.channel.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'resolve': {
      const summary = typeof params.summary === 'string' ? params.summary : ''
      const result = currentSession!.annotations.resolve(id, summary)
      if (result && currentSession!.channel) {
        currentSession!.channel.send({ type: 'annotation-updated', annotation: result })
        const entry = currentSession!.activityLog.add({ type: 'status-change', description: `Resolved: ${summary}`, elementSource: result.elementSource })
        currentSession!.channel.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'dismiss': {
      const reason = typeof params.reason === 'string' ? params.reason : undefined
      const result = currentSession!.annotations.dismiss(id, reason)
      if (result && currentSession!.channel) {
        currentSession!.channel.send({ type: 'annotation-updated', annotation: result })
        const entry = currentSession!.activityLog.add({ type: 'status-change', description: `Dismissed: ${result.text}`, elementSource: result.elementSource })
        currentSession!.channel.send({ type: 'activity-entry', entry })
      }
      return result
    }
    case 'respond': {
      const text = typeof params.text === 'string' ? params.text : ''
      const result = currentSession!.annotations.addMessage(id, { from: 'agent', text })
      if (result && currentSession!.channel) {
        currentSession!.channel.send({ type: 'annotation-updated', annotation: result })
      }
      return result
    }
    default: throw new Error(`Unknown RPC method: ${method}`)
  }
}

/** Forward a message to all connected CLI WebSocket clients. */
function forwardToCLI(msg: unknown): void {
  if (!currentSession || currentSession.cliClients.size === 0) return
  let data: string
  try {
    data = JSON.stringify(msg)
  } catch {
    return
  }
  for (const client of currentSession.cliClients) {
    if (client.readyState !== WebSocket.OPEN) continue
    try {
      client.send(data)
    } catch {
      currentSession.cliClients.delete(client)
    }
  }
}

export function getChannel(): ServerChannel {
  if (!currentSession?.channel) {
    throw new Error(
      'getChannel() called before the Vite dev server started. ' +
      'Ensure cortexEditor() is in your vite.config.ts plugins[] and you are running `vite dev`.'
    )
  }
  return currentSession.channel
}

export function onHMRUpdate(cb: (files: string[]) => void): () => void {
  if (!currentSession) throw new Error('onHMRUpdate() called before configureServer')
  const session = currentSession
  session.hmrCallbacks.push(cb)
  return () => {
    const idx = session.hmrCallbacks.indexOf(cb)
    if (idx >= 0) session.hmrCallbacks.splice(idx, 1)
  }
}

/**
 * Get the current session's token. Exposed for testing only.
 * @internal
 */
export function _getSessionTokenForTesting(): string | null {
  return currentSession?.token ?? null
}

/**
 * Reset module-level state. Exposed for testing only.
 * @internal
 */
export async function _resetForTesting(): Promise<void> {
  await currentSession?.dispose()
  currentSession = null
  if (shutdownHandler) {
    process.removeListener('SIGINT', shutdownHandler)
    process.removeListener('SIGTERM', shutdownHandler)
    shutdownHandler = null
  }
}

export function cortexEditor(_options?: CortexEditorOptions): Plugin {
  let config: ResolvedConfig
  let transformSource: ReturnType<typeof createSourceTransform>
  const messageHandlers: ((msg: BrowserToServer) => void)[] = []
  let aliasMap: Record<string, string> = {}
  const validatedToggleShortcut = validateToggleShortcut(_options?.toggleShortcut ?? '$mod+Shift+Period')
  const clientScript = getClientScript({ toggleShortcut: validatedToggleShortcut })

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
        // Inject token + sessionId before the module script so globals are available at import time
        const authScript = currentSession
          ? `<script>window.__CORTEX_TOKEN__=${safeJSONForScript(currentSession.token)};window.__CORTEX_SESSION_ID__=${safeJSONForScript(currentSession.sessionId)}</script>\n`
          : ''
        const script = `<script type="module" src="${CORTEX_CLIENT_PATH}"></script>`
        const injected = html.replace(/<\/head>/i, `${authScript}${script}\n</head>`)
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
      // Dispose previous session (Vite restart / configureServer re-entry)
      // Remove upgrade handler from httpServer before dispose nulls the ref —
      // session can't do this because it doesn't hold an httpServer reference.
      if (currentSession) {
        if (currentSession.upgradeHandlerRef && server.httpServer) {
          server.httpServer.removeListener('upgrade', currentSession.upgradeHandlerRef)
        }
        currentSession.dispose().catch((err) => {
          console.warn('[cortex] Failed to dispose previous session:', err instanceof Error ? err.message : err)
        })
      }

      // Remove old signal handlers before registering new ones
      if (shutdownHandler) {
        process.removeListener('SIGINT', shutdownHandler)
        process.removeListener('SIGTERM', shutdownHandler)
        shutdownHandler = null
      }

      // Create fresh session for this server lifecycle
      currentSession = new CortexSession({ root: config.root, mode: config.mode })

      // Register signal handlers for graceful shutdown.
      // The ?? Promise.resolve() ensures process.exit runs even if currentSession is null
      // (optional chaining would short-circuit the entire .then chain, hanging the process).
      shutdownHandler = () => {
        (currentSession?.dispose() ?? Promise.resolve()).then(
          () => process.exit(0),
          (err) => { console.error('[cortex] Shutdown cleanup failed:', err instanceof Error ? err.message : err); process.exit(1) },
        )
      }
      process.on('SIGINT', shutdownHandler)
      process.on('SIGTERM', shutdownHandler)

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

      // Resolve Tailwind colors at server start — promise awaited in hotHandler
      const swatchesPromise = TailwindResolver.resolveColors(config.root).catch((err) => {
        console.warn('[cortex] Tailwind color resolution failed:', err instanceof Error ? err.message : err)
        return null
      })

      // Vite 5.1+ API: server.hot replaces deprecated server.ws
      let helloSent = false
      const hotHandler = (data: BrowserToServer) => {
        // Guard against race during session disposal or configureServer re-entry
        if (!currentSession || currentSession.isDisposed) return

        // Token validation for write operations — must precede forwardToCLI to prevent
        // unauthenticated messages from being fanned out to CLI clients.
        if (WRITE_TYPES.has(data.type as WriteMessageType)) {
          if (!('token' in data) || data.token !== currentSession.token) {
            if (currentSession.channel) {
              currentSession!.channel.send({ type: 'error', code: 'AUTH_FAILED', message: 'Invalid or missing auth token' })
            }
            return
          }
        }

        // Forward browser messages to CLI clients — after auth so only valid messages propagate.
        // Strip token from forwarded data to avoid leaking it to CLI clients.
        const { token: _stripped, ...forwardData } = data as Record<string, unknown>
        forwardToCLI(forwardData)

        // Track state from browser messages
        if (data.type === 'cortex-closed') currentSession!.editorActive = false

        // Send hello with swatches on first message (typically 'init') from browser
        if (!helloSent && currentSession!.channel) {
          helloSent = true // synchronous guard prevents duplicate sends
          const channel = currentSession!.channel
          swatchesPromise.then((colors) => {
            channel.send({
              type: 'hello',
              protocolVersion: 1,
              sessionId: currentSession!.sessionId,
              swatches: colors && colors.length > 0 ? colors : undefined,
            })
          }).catch((err) => {
            console.warn('[cortex] Failed to send hello:', err instanceof Error ? err.message : err)
          })
        }

        if (data.type === 'comment') {
          const ann = currentSession!.annotations.create({
            elementSource: data.elementSource,
            text: data.text,
            elementContext: data.elementContext,
            currentStyles: data.currentStyles,
            pinPosition: data.pinPosition,
          })
          const entry = currentSession!.activityLog.add({ type: 'comment', description: data.text, elementSource: data.elementSource })
          if (currentSession!.channel) {
            currentSession!.channel.send({ type: 'annotation-created', annotation: ann })
            currentSession!.channel.send({ type: 'activity-entry', entry })
          }
        }

        if (data.type === 'comment-reply') {
          const ann = currentSession!.annotations.addMessage(data.annotationId, { from: 'user', text: data.text })
          if (ann && currentSession!.channel) {
            const entry = currentSession!.activityLog.add({ type: 'comment', description: data.text, elementSource: ann.elementSource })
            currentSession!.channel.send({ type: 'annotation-updated', annotation: ann })
            currentSession!.channel.send({ type: 'activity-entry', entry })
          }
        }

        // Route edit/undo/redo to EditPipeline (or notify if still initializing)
        if (data.type === 'edit') {
          if (currentSession!.pipeline) currentSession!.pipeline.handleEdit(data as EditRequest)
          else currentSession!.channel?.send({ type: 'edit_status', editId: (data as EditRequest).editId, status: 'failed', reason: 'Editor is still initializing. Please try again.' })
        }
        if (data.type === 'undo') {
          if (currentSession!.pipeline) currentSession!.pipeline.handleUndo()
          else currentSession!.channel?.send({ type: 'undo_sync_status', status: 'failed', reason: 'Editor is still initializing.' })
        }
        if (data.type === 'redo') {
          if (currentSession!.pipeline) currentSession!.pipeline.handleRedo()
          else currentSession!.channel?.send({ type: 'redo_sync_status', status: 'failed', reason: 'Editor is still initializing.' })
        }
        if (data.type === 'clear_server_undo') {
          currentSession!.pipeline?.clearUndoStack()
        }

        // Track browser connection + send current agent status on init
        if (data.type === 'init') {
          currentSession!.browserConnected = true
          if (currentSession!.channel) {
            currentSession!.channel.send({ type: 'agent-status', connected: currentSession!.cliClients.size > 0 })
            if (currentSession!.editorActive) currentSession!.channel.send({ type: 'cortex' })
            // Re-send capabilities for late-connecting browsers
            if (currentSession!.capabilitiesCache) {
              currentSession!.channel.send({ type: 'capabilities', systems: currentSession!.capabilitiesCache })
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
      currentSession.channel = {
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
        },
      }

      // --- Edit pipeline construction ---
      // Build the edit pipeline with all deps. Tailwind deps are lazy/optional.
      const projectRoot = config.root
      const rewriter = new TailwindRewriter()
      const inlineStyleRewriter = new InlineStyleRewriter()
      const verifier = new HMRVerifier(currentSession.channel)
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

      const session = currentSession
      const channel = currentSession.channel
      Promise.all([detectionPromise, resolverPromise]).then(([detection, resolver]) => {
        // Abort if server was disposed or session was replaced during async init
        if (!currentSession || currentSession !== session) return

        // Dispose previous pipeline + HMR callback (e.g., from server restart)
        if (currentSession.pipeline) currentSession.pipeline.dispose()
        if (currentSession.hmrUnsubscribe) currentSession.hmrUnsubscribe()

        // AI writer: enabled when CORTEX_API_KEY is set via .env/.env.local or shell
        const env = loadEnv(config.mode, config.root, 'CORTEX_')
        const cortexApiKey = env.CORTEX_API_KEY || process.env.CORTEX_API_KEY
        const aiWriter = cortexApiKey
          ? new AIWriter({ apiKey: cortexApiKey, readFile: (p) => fs.promises.readFile(p, 'utf-8') })
          : undefined

        // Deferred writer: enabled when AI writer is available. The writeFn
        // closure captures currentSession by reference — safe because writeFn
        // only fires after the coalescing window (250ms+), well after assignment.
        const deferredWriter = aiWriter
          ? new DeferredWriter({
            coalescingMs: 250,
            writeFn: async (batch) => {
              if (!currentSession?.pipeline) return { success: false, reason: 'Pipeline not initialized' }
              return currentSession.pipeline.executeDeferredBatch(batch)
            },
          })
          : undefined

        // Surface theme loading failures: if Tailwind was detected but the
        // resolver failed to load, warn clearly so the user knows why edits fail.
        if (!resolver && detection.hasTailwind) {
          console.warn('[cortex] ⚠ Tailwind detected but theme could not be loaded. Class-based editing will be limited. Check that tailwindcss is installed and theme.css is accessible.')
        }

        currentSession.pipeline = new EditPipeline({
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
            // Suppress HMR when the override layer is the complete visual mechanism
            // (immediate CSS edits, undo, redo). The override (!important) already
            // shows the correct value; HMR just causes a repaint flash.
            // Allow HMR for jsx-immediate (React must re-render to apply inline
            // styles) and deferred/AI edits (may rewrite JSX structure, Tailwind
            // classes, or more than the single overridden property).
            const suppress = intent.suppressHmr
              ?? (intent.kind !== 'deferred' && intent.kind !== 'jsx-immediate')
            if (suppress) {
              currentSession?.recentEditWrites.add(intent.filePath)
              setTimeout(() => currentSession?.recentEditWrites.delete(intent.filePath), 500)
            }
            await fs.promises.writeFile(intent.filePath, intent.content, 'utf-8')
          },
          readFile: (p) => fs.promises.readFile(p, 'utf-8'),
          projectRoot,
        })

        currentSession.hmrUnsubscribe = onHMRUpdate((files) => verifier.onHMRUpdate(files))

        // Compute and send capability status to browser
        const resolverState: ResolverState = {
          resolverAvailable: resolver !== null,
          aiAvailable: !!aiWriter,
          inlineStyleAvailable: true,
        }
        const capabilities = computeCapabilities(detection, resolverState)
        currentSession.capabilitiesCache = capabilities.length > 0 ? capabilities : null
        if (currentSession.capabilitiesCache) {
          channel.send({ type: 'capabilities', systems: currentSession.capabilitiesCache })
        }
      }).catch((err) => {
        console.error('[cortex] Failed to initialize edit pipeline:', err instanceof Error ? err.message : err)
      })

      // --- CLI WebSocket bridge ---
      // Only set up when httpServer is available (not in middleware mode)
      if (server.httpServer) {
        currentSession.cliWss = new WebSocketServer({
          noServer: true,
          maxPayload: 64 * 1024,
          verifyClient: ({ origin }: { origin: string }) => {
            if (!origin) return true // non-browser clients (CLI) don't send Origin
            return ALLOWED_ORIGINS.test(origin)
          },
        })

        currentSession.cliWss.on('connection', (ws) => {
          if (currentSession!.cliClients.size >= MAX_CLI_CONNECTIONS) {
            ws.close(1013, 'Too many CLI connections')
            return
          }

          currentSession!.cliClients.add(ws)
          currentSession!.aliveFlags.set(ws, true)

          // Send current status on connect (untyped JSON — not part of ServerToBrowser protocol)
          try {
            ws.send(JSON.stringify({ type: 'cortex-status', editorActive: currentSession!.editorActive, browserConnected: currentSession!.browserConnected }))
          } catch {
            currentSession!.cliClients.delete(ws)
            ws.terminate()
            return
          }

          // Notify browser that an agent connected
          if (currentSession!.channel) currentSession!.channel.send({ type: 'agent-status', connected: true })

          ws.on('pong', () => { currentSession?.aliveFlags.set(ws, true) })

          ws.on('message', (raw) => {
            let parsed: unknown
            try { parsed = JSON.parse(raw.toString()) } catch { return }
            if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return
            const type = (parsed as { type: unknown }).type
            if (typeof type !== 'string') return

            // Token validation for ALL CLI messages
            const msgToken = (parsed as Record<string, unknown>).token
            if (typeof msgToken !== 'string' || msgToken !== currentSession!.token) {
              try {
                ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Invalid or missing auth token' }))
              } catch (sendErr) {
                console.warn('[cortex] Failed to send AUTH_FAILED to CLI client:', sendErr instanceof Error ? sendErr.message : sendErr)
              }
              return
            }

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
                try {
                  ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
                } catch (sendErr) {
                  console.warn('[cortex] Failed to send RPC result to CLI client:', sendErr instanceof Error ? sendErr.message : sendErr)
                }
              } catch (err) {
                try {
                  ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: err instanceof Error ? err.message : String(err) }))
                } catch (sendErr) {
                  console.warn('[cortex] Failed to send RPC error to CLI client:', sendErr instanceof Error ? sendErr.message : sendErr)
                }
              }
              return
            }

            // Track state from CLI commands
            if (type === 'cortex') currentSession!.editorActive = true
            if (type === 'cortex-close') currentSession!.editorActive = false

            // Reconstruct message — don't forward arbitrary properties from CLI
            if (!CLI_ALLOWED_TYPES.has(type)) return
            if (currentSession!.channel) {
              currentSession!.channel.send({ type } as ServerToBrowser)
            }
          })

          ws.on('close', () => {
            currentSession?.cliClients.delete(ws)
            if (currentSession?.channel) currentSession.channel.send({ type: 'agent-status', connected: currentSession.cliClients.size > 0 })
          })
          ws.on('error', () => currentSession?.cliClients.delete(ws))
        })

        // Heartbeat — 30s ping/pong, matching CortexTransport pattern
        currentSession.heartbeatTimer = setInterval(() => {
          if (!currentSession) return
          for (const client of currentSession.cliClients) {
            if (!currentSession.aliveFlags.get(client)) {
              client.terminate()
              currentSession.cliClients.delete(client)
              continue
            }
            currentSession.aliveFlags.set(client, false)
            try { client.ping() } catch { currentSession.cliClients.delete(client) }
          }
        }, HEARTBEAT_INTERVAL)
        currentSession.heartbeatTimer.unref()

        // WebSocket upgrade handler — route /@cortex/ws to CLI WSS
        currentSession.upgradeHandlerRef = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
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

          if (!currentSession?.cliWss) { socket.destroy(); return }
          currentSession.cliWss.handleUpgrade(req, socket, head, (ws: InstanceType<typeof WebSocket>) => {
            if (!currentSession?.cliWss) { ws.terminate(); return }
            currentSession.cliWss.emit('connection', ws, req)
          })
        }

        server.httpServer.on('upgrade', currentSession.upgradeHandlerRef)

        // Write port + token files for MCP discovery
        const cortexDir = path.join(config.root, '.cortex')
        currentSession.portFilePath = path.join(cortexDir, 'port')
        currentSession.tokenFilePath = path.join(cortexDir, 'token')
        server.httpServer.on('listening', () => {
          const addr = server.httpServer!.address()
          if (addr && typeof addr === 'object') {
            try {
              fs.mkdirSync(cortexDir, { recursive: true, mode: 0o700 })
            } catch (err) {
              console.warn('[cortex] Could not create .cortex/ directory:', err instanceof Error ? err.message : err)
              return
            }
            try {
              fs.writeFileSync(currentSession!.portFilePath!, String(addr.port))
            } catch (err) {
              console.warn('[cortex] Could not write port file:', err instanceof Error ? err.message : err)
            }
            try {
              fs.writeFileSync(currentSession!.tokenFilePath!, currentSession!.token, { mode: 0o600 })
              // Ensure 0o600 even if the file pre-existed with looser permissions
              fs.chmodSync(currentSession!.tokenFilePath!, 0o600)
            } catch (err) {
              console.error('[cortex] Could not write token file — CLI authentication will fail:', err instanceof Error ? err.message : err)
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
      const cortexFiles = modules.filter(m => m.file && currentSession?.recentEditWrites.has(m.file))

      // Only fire HMR callbacks for non-suppressed files — otherwise the
      // verifier would track edits for files whose HMR was intentionally blocked.
      const nonSuppressed = modules.filter(m => !m.file || !currentSession?.recentEditWrites.has(m.file))
      const files = nonSuppressed
        .map(m => m.file)
        .filter((f): f is string => f != null && (/\.[jt]sx$/.test(f) || /\.css$/.test(f)))

      if (files.length > 0) {
        const cbs = [...(currentSession?.hmrCallbacks ?? [])]
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
