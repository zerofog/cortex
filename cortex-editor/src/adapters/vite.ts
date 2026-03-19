import type { Plugin, ResolvedConfig, HmrContext } from 'vite'
import type { SourceMapInput } from 'rollup'
import { createSourceTransform } from './source-transform.js'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from './types.js'
import { TailwindResolver } from '../core/tailwind-resolver.js'

export interface CortexEditorOptions {
  /** Package names in node_modules to instrument (for library component detection). */
  includeNodeModules?: string[]
}

const CORTEX_CLIENT_PATH = '/@cortex/client.js'
const VIRTUAL_CORTEX_CLIENT = '\0cortex-client'
const CORTEX_MSG_EVENT = 'cortex:msg'

const CLIENT_SCRIPT = `\
if (import.meta.hot) {
  import.meta.hot.on('${CORTEX_MSG_EVENT}', (data) => {
    window.__cortex_channel__?.handleServerMessage(data);
  });
  window.__cortex_send__ = (msg) => import.meta.hot.send('${CORTEX_MSG_EVENT}', msg);
}
`

let channelInstance: ServerChannel | null = null
const hmrCallbacks: ((files: string[]) => void)[] = []

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
}

export function cortexEditor(_options?: CortexEditorOptions): Plugin {
  let config: ResolvedConfig
  let transformSource: ReturnType<typeof createSourceTransform>
  const messageHandlers: ((msg: BrowserToServer) => void)[] = []

  return {
    name: 'cortex-editor',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved
      transformSource = createSourceTransform(config.root, {
        includeNodeModules: _options?.includeNodeModules,
      })
    },

    resolveId(id) {
      if (id === CORTEX_CLIENT_PATH) return VIRTUAL_CORTEX_CLIENT
    },

    load(id) {
      if (id === VIRTUAL_CORTEX_CLIENT) return CLIENT_SCRIPT
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
        // Don't forward 'init' to application message handlers
        if (data.type === 'init') return
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
      channelInstance = {
        send(msg: ServerToBrowser) {
          server.hot.send(CORTEX_MSG_EVENT, msg)
        },
        broadcast(msg: ServerToBrowser) {
          server.hot.send(CORTEX_MSG_EVENT, msg)
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
    },

    handleHotUpdate({ modules }: HmrContext) {
      if (modules.length > 0) {
        const files = modules
          .map(m => m.file)
          .filter((f): f is string => f != null && /\.[jt]sx$/.test(f))
        if (files.length > 0) {
          const cbs = [...hmrCallbacks]
          for (const cb of cbs) {
            try { cb(files) } catch (err) {
              console.warn('[cortex] HMR callback error:', err instanceof Error ? err.message : err)
            }
          }
        }
      }
    },
  }
}
