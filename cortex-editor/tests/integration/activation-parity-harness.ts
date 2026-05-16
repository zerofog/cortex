/**
 * Harness for the activation parity matrix integration test.
 *
 * Wires together:
 * 1. The real Vite plugin (cortexEditor) attached to an in-process HTTP server
 *    so `_getActiveStateForTesting()` reflects server-side state changes.
 * 2. The real MCP server (startMCPServer) connecting over WebSocket to the Vite
 *    plugin's /@cortex/ws endpoint, so cortex_activate / cortex_deactivate are
 *    real code paths.
 * 3. The cortexAppReducer used directly (no Preact mount) to track browser-side
 *    state from the server's outbound broadcasts — simulating what the browser
 *    would do when it receives cortex/active-changed.
 * 4. A plain object that simulates document.documentElement's attribute API so
 *    the harness can assert the data-cortex-active contract without a DOM.
 *
 * Entry points:
 * - keyboard-toggle: injects the exact cortex/set-active message that the
 *   keyboard handler sends into the Vite plugin's hot channel. The keyboard
 *   handler itself (guarded by e.isTrusted) lives in the browser and cannot
 *   be exercised from Node — but the server-side protocol it drives can be.
 * - mcp-activate / mcp-deactivate: calls cortex_activate / cortex_deactivate
 *   on the real MCP server.
 * - esc-key / close-button: these require a Preact component mounted inside a
 *   shadow root with real focus handling. happy-dom cannot simulate shadow-root
 *   focus dispatch, and this test runs in a Node environment (no DOM at all).
 *   fireEntryPoint returns a typed sentinel for these entries; the test file
 *   uses it.skip so they show as honest skips rather than tautological passes.
 *
 * NOTE on data-cortex-active simulation:
 * The production writer is `CortexApp.tsx`'s `useEffect` on the `active` slice
 * of reducer state. Mounting the full Preact tree here would add ~500ms/test
 * and require shadow-root DOM setup in a Node environment. Instead, the harness
 * simulates that useEffect inline: after every entry point, it reads
 * `browser.reducerState.active` and updates `browser.documentElement`
 * accordingly.
 *
 * This is a SHADOW COPY of the production useEffect (CortexApp.tsx:1434-1441).
 * Per the project's test anti-patterns rule (CLAUDE.md), this is documented and
 * justified: the integration test verifies the protocol end-to-end (entry point
 * → server state machine → outbound broadcast → reducer action). The DOM mirror
 * (reducer.active → data-cortex-active) is a separate concern verified by
 * the component-level useEffect in the browser test suite. Specifically,
 * `tests/browser/cortex-app.test.tsx` cleanup code (line 79-82) removes the
 * attribute after each test, confirming the component does write it — but no
 * dedicated unit test currently asserts "active=true → attribute set, active=false
 * → attribute removed". If you add one, add it to cortex-app.test.tsx and cite
 * CortexApp.tsx:1434-1441 in the comment.
 *
 * Integration-test environment: Node (no DOM, no happy-dom).
 */

import { createServer, type Server as HttpServer } from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  cortexEditor,
  _getActiveStateForTesting,
  _resetForTesting,
  _getSessionTokenForTesting,
} from '../../src/adapters/vite.js'
import { startMCPServer } from '../../src/cli/mcp.js'
import {
  cortexAppReducer,
  initialCortexAppReducerState,
  type CortexAppReducerState,
} from '../../src/browser/cortex-app-reducer.js'
import type { ActiveState } from '../../src/adapters/cortex-active-state.js'

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Simulates document.documentElement's attribute API without a real DOM. */
export interface MockDocumentElement {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** Broadcast message recorded from server.hot.send / channel.send */
export interface RecordedBroadcast {
  type: string
  active?: boolean
  targetTabId?: string
}

/** Server-side observable state surface. */
export interface ServerSurface {
  /** Current activation state from the Vite plugin's ActiveState machine. */
  readonly activeState: ActiveState
  /** All messages sent via server.hot.send (populated by the mockServer). */
  readonly _sent: Array<{ event: string; data: unknown }>
}

/** Browser-side observable state surface. */
export interface BrowserSurface {
  /** Latest state of cortexAppReducer, updated after each entry point fires. */
  readonly reducerState: CortexAppReducerState
  /** Simulated document.documentElement for data-cortex-active assertions. */
  readonly documentElement: MockDocumentElement
}

export interface ParityHarness {
  server: ServerSurface
  browser: BrowserSurface
  /** All cortex/active-changed broadcasts captured during the harness lifetime. */
  broadcasts: RecordedBroadcast[]
  /**
   * Fire one of the five activation entry points.
   *
   * For esc-key and close-button, this throws an error describing why they
   * cannot be implemented in a Node integration test. The test file wraps these
   * in `it.skip` so they show as documented skips, not failures.
   */
  fireEntryPoint(
    entry: 'keyboard-toggle' | 'mcp-activate' | 'mcp-deactivate' | 'esc-key' | 'close-button',
  ): Promise<void>
  /**
   * Convenience helper: activates via mcp-activate so tests that assert
   * deactivation can start from a known active state.
   */
  activateAsBaseline(): Promise<void>
  dispose(): Promise<void>
}

// ---------------------------------------------------------------------------
// Internal Vite mock helpers (mirrors the pattern in vite.test.ts)
// ---------------------------------------------------------------------------

function buildMockServer(httpServer: HttpServer) {
  const handlers = new Map<string, Function>()
  const offHandlers = new Map<string, Function>()
  const sent: { event: string; data: unknown }[] = []
  return {
    middlewares: { use: () => {} },
    httpServer,
    hot: {
      on(event: string, handler: Function) { handlers.set(event, handler) },
      off(event: string, handler: Function) { offHandlers.set(event, handler) },
      send(event: string, data: unknown) { sent.push({ event, data }) },
      _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
    },
    _handlers: handlers,
    _sent: sent,
  }
}

// ---------------------------------------------------------------------------
// Internal: wait helper
// ---------------------------------------------------------------------------

function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (predicate()) { resolve(); return }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitUntil timed out'))
        return
      }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

/**
 * Set up the full parity harness.
 *
 * Lifecycle:
 * 1. Create a real HTTP server and attach the real Vite plugin.
 * 2. Start the MCP server connected to the HTTP server's WebSocket endpoint.
 * 3. Wait for MCP's internal WS client to connect.
 * 4. Return the harness; call dispose() in afterEach.
 */
export async function setupParityHarness(): Promise<ParityHarness> {
  // ── Temp dir for port/token files ──────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-parity-'))

  // ── Spy on process.cwd so MCP's discoverToken() finds the token file ──
  // The Vite plugin writes .cortex/token under config.root (tmpDir). MCP's
  // discoverToken() reads from process.cwd()/.cortex/token. Pointing cwd at
  // tmpDir makes both agree on the same token file without changing production
  // code — mirrors the pattern used in mcp.test.ts (line 257).
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

  // ── Vite plugin + HTTP server ───────────────────────────────────────────
  const plugin = cortexEditor()
  ;(plugin.configResolved as Function)({
    command: 'serve',
    root: tmpDir,
  })

  const httpServer = createServer()
  const mockServer = buildMockServer(httpServer)
  ;(plugin.configureServer as Function)(mockServer)

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = httpServer.address()
  const serverPort = (typeof addr === 'object' && addr) ? addr.port : 0

  // Wait for the Vite plugin to write .cortex/token (it writes on 'listening').
  // _getSessionTokenForTesting() reads from the in-memory session, so we use it
  // to get the canonical token for browser hot-channel injection.
  await waitUntil(() => _getSessionTokenForTesting() !== null, 1000)
  const sessionToken = _getSessionTokenForTesting()!

  // ── MCP server ──────────────────────────────────────────────────────────
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcpClient = new Client({ name: 'parity-test-client', version: '0.1.0' })
  const mcpHandlePromise = startMCPServer({ port: serverPort, transport: serverTransport })
  await mcpClient.connect(clientTransport)
  const mcpHandle = await mcpHandlePromise

  // Wait for MCP's internal WS client to connect to the mock Vite server.
  // The Vite plugin sends agent-status (connected: true) via server.hot.send
  // when a CLI client connects — this is the first message in _sent that
  // reliably signals the CLI WS handshake is complete. (cortex-status is sent
  // directly to the WS socket, not through server.hot.send, so it won't appear
  // in _sent.)
  await waitUntil(
    () => mockServer._sent.some((s) => (s.data as any)?.type === 'agent-status'),
    2000,
  )
  // Brief settle for the MCP client to process the cortex-status message
  // and complete its internal state initialization.
  await new Promise(r => setTimeout(r, 80))

  // ── Browser reducer state ───────────────────────────────────────────────
  let reducerState: CortexAppReducerState = initialCortexAppReducerState
  const attributes = new Map<string, string>()

  const documentElement: MockDocumentElement = {
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  }

  /** Apply a server broadcast message to the browser reducer. */
  function applyBroadcastToReducer(msg: Record<string, unknown>): void {
    const type = msg.type as string
    // cortex/active-changed — Pillar 1 new shape
    if (type === 'cortex/active-changed') {
      const active = msg.active as boolean
      const { state } = cortexAppReducer(reducerState, { type: 'set-active', active })
      reducerState = state
    }
    // Legacy cortex/cortex-close dual-mode broadcasts — also update reducer
    // so both wire shapes reflect the same result during the dual-mode period.
    if (type === 'cortex') {
      const { state } = cortexAppReducer(reducerState, { type: 'cortex' })
      reducerState = state
    }
    if (type === 'cortex-close') {
      const { state } = cortexAppReducer(reducerState, { type: 'cortex-close' })
      reducerState = state
    }
  }

  // Broadcasts captured during the harness lifetime.
  const broadcasts: RecordedBroadcast[] = []

  // Initialize drain offset AFTER all setup messages have landed so that
  // fireEntryPoint only sees messages produced by the entry points themselves,
  // not agent-status / cortex-status messages from the CLI connect handshake.
  let drainOffset = mockServer._sent.length

  /**
   * After any entry point fires, drain any new messages from mockServer._sent
   * and apply them to the browser reducer + documentElement.
   *
   * HARNESS-ONLY simulation of CortexApp's data-cortex-active useEffect.
   * Mounting the full Preact tree against a Node environment would require
   * happy-dom and shadow-root setup impossible in the integration project.
   * The integration test verifies the *protocol* end-to-end (entry → server
   * state machine → reducer). The DOM mirror (reducer.active →
   * data-cortex-active) is asserted to match reducer state here — the unit-
   * test that the useEffect itself works belongs in cortex-app.test.tsx
   * (see CortexApp.tsx:1434-1441 and the afterEach cleanup at line 82 which
   * confirms the attribute is written during tests).
   */
  function drainBroadcasts(): void {
    const newMsgs = mockServer._sent.slice(drainOffset)
    drainOffset = mockServer._sent.length
    for (const { data } of newMsgs) {
      const msg = data as Record<string, unknown>
      if (!msg || typeof msg.type !== 'string') continue
      // Record cortex/active-changed broadcasts for test assertions.
      if (msg.type === 'cortex/active-changed') {
        broadcasts.push({
          type: 'cortex/active-changed',
          active: msg.active as boolean,
          targetTabId: msg.targetTabId as string | undefined,
        })
      }
      applyBroadcastToReducer(msg)
    }
    // HARNESS-ONLY simulation of the data-cortex-active useEffect.
    if (reducerState.active) {
      documentElement.setAttribute('data-cortex-active', '')
    } else {
      documentElement.removeAttribute('data-cortex-active')
    }
  }

  // ── Server surface ──────────────────────────────────────────────────────
  const server: ServerSurface = {
    get activeState() {
      return _getActiveStateForTesting() ?? { editorActive: false, activeBrowserId: null }
    },
    _sent: mockServer._sent,
  }

  // ── Browser surface ─────────────────────────────────────────────────────
  const browser: BrowserSurface = {
    get reducerState() { return reducerState },
    documentElement,
  }

  // ── Entry point dispatch ────────────────────────────────────────────────
  async function fireEntryPoint(
    entry: 'keyboard-toggle' | 'mcp-activate' | 'mcp-deactivate' | 'esc-key' | 'close-button',
  ): Promise<void> {
    // Reset broadcast drain cursor to current length so we only see new messages.
    drainOffset = mockServer._sent.length

    switch (entry) {
      case 'keyboard-toggle': {
        // The browser's keyboard handler (CortexApp injection in vite.ts:246-269)
        // sends exactly this message when the user presses cmd+shift+. The handler
        // reads __cortex_active_cache__.active to decide nextActive. In the
        // harness, the server starts inactive so nextActive=true on first toggle.
        // This simulates the PROTOCOL path the keyboard sends, not the keyboard
        // event itself (which requires e.isTrusted — untestable in Node).
        //
        // cortex/set-active is a WRITE_TYPE so the hotHandler requires a token.
        // The browser includes the token because it received it via the hello
        // handshake (or the channel setup). We supply the session token here.
        const nextActive = !server.activeState.editorActive
        mockServer.hot._trigger('cortex:msg', {
          type: 'cortex/set-active',
          active: nextActive,
          tabId: 'parity-test-tab',
          token: sessionToken,
        })
        break
      }

      case 'mcp-activate': {
        const result = await mcpClient.callTool({ name: 'cortex_activate' })
        if (result.isError) {
          throw new Error(
            `cortex_activate MCP call failed: ${(result.content as Array<{ text: string }>)[0]?.text ?? 'unknown error'}`,
          )
        }
        // Give the MCP client's WS message time to reach the plugin and
        // the response to propagate back.
        await new Promise(r => setTimeout(r, 80))
        break
      }

      case 'mcp-deactivate': {
        const result = await mcpClient.callTool({ name: 'cortex_deactivate' })
        if (result.isError) {
          throw new Error(
            `cortex_deactivate MCP call failed: ${(result.content as Array<{ text: string }>)[0]?.text ?? 'unknown error'}`,
          )
        }
        await new Promise(r => setTimeout(r, 80))
        break
      }

      case 'esc-key':
        throw new Error(
          'esc-key not implementable in Node integration environment — use it.skip in the test. ' +
          'The Esc handler lives inside the Preact CortexApp shadow root and requires real shadow-root ' +
          'focus dispatching that cannot be simulated without a browser DOM. ' +
          '// TODO: requires real CSSOM/focus — would need e2e test in a real browser.',
        )

      case 'close-button':
        throw new Error(
          'close-button not implementable in Node integration environment — use it.skip in the test. ' +
          'The close button is rendered by the Preact CortexApp component inside a shadow DOM; ' +
          'simulating a click requires mounting the component in a real or happy-dom environment. ' +
          '// TODO: requires real CSSOM/focus — would need e2e test or browser project test.',
        )
    }

    // Drain any new broadcasts and update reducer + DOM.
    drainBroadcasts()
  }

  async function activateAsBaseline(): Promise<void> {
    await fireEntryPoint('mcp-activate')
  }

  async function dispose(): Promise<void> {
    cwdSpy.mockRestore()
    mcpHandle.close()
    await mcpClient.close()
    await _resetForTesting()
    await new Promise<void>((resolve) => {
      if (httpServer.listening) {
        httpServer.close(() => resolve())
      } else {
        resolve()
      }
    })
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  return { server, browser, broadcasts, fireEntryPoint, activateAsBaseline, dispose }
}
