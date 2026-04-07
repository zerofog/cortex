import type { Server as HttpServer } from 'http'
import type { StyleCapability } from '../core/capabilities.js'

// === Server-side adapter interface ===
// Each framework adapter (Vite, Next.js) implements this.
// Core code depends on this abstraction only.

export interface FrameworkAdapter {
  /** Add Cortex <script> tag to HTML response */
  injectScripts(html: string): string

  /** Add data-cortex-source="file:line:col" attributes to JSX elements */
  transformSource(code: string, id: string): TransformResult | null

  /** Mount MCP + transport on the framework's HTTP server */
  mount(httpServer: HttpServer): void

  /** Register callback for when HMR updates complete; returns unsubscribe */
  onHMRUpdate(callback: (updatedFiles: string[]) => void): () => void

  /** Create the bidirectional channel for browser↔server communication */
  createChannel(): ServerChannel

  /** Clean up resources (listeners, file watchers, etc.) */
  dispose(): Promise<void>
}

export interface SourceMap {
  file?: string
  mappings: string
  names?: string[]
  sources?: (string | null)[]
  sourcesContent?: (string | null)[]
  version: 3
}

export interface SourceTransformOptions {
  /** Set to 'production' to disable instrumentation. Default: 'development'. */
  mode?: 'development' | 'production'
  /** Called when the parser fails to parse a file. */
  onParseError?: (id: string, error: unknown) => void
  /** Resolve import aliases (e.g., @/ → src/) synchronously. Return null if unresolvable. */
  resolveAlias?: (specifier: string) => string | null
  /** Package names in node_modules to instrument (for library component detection). */
  includeNodeModules?: string[]
}

export interface TransformResult {
  code: string
  map: SourceMap | null
}

// === Server-side channel (adapter provides) ===

export interface ServerChannel {
  send(msg: ServerToBrowser): void
  onMessage(handler: (msg: BrowserToServer) => void): () => void
  broadcast(msg: ServerToBrowser): void
  dispose(): Promise<void>
}

/** Write kind for HMR verification — determines override removal timing in the browser.
 *  'immediate': CSS-only edit, override cleared synchronously (stylesheet already applied).
 *  'jsx-immediate': JSX inline style edit, override cleared after a MutationObserver
 *                   confirms React applied the new inline style to the DOM element.
 *  'deferred': AI/deferred edit, override cleared after double-rAF (framework re-render). */
export type EditKind = 'immediate' | 'jsx-immediate' | 'deferred'

// === Message protocol ===

export type BrowserToServer =
  | { type: 'init'; sessionId?: string }
  | { type: 'cortex-closed' }
  | { type: 'edit'; token?: string; protocolVersion?: number; editId: string; property: string; value: string; source: string; elementSelector: string; cssMapping?: string; scope?: 'instance' | 'all'; instanceSources?: string[]; currentClass?: string }
  | { type: 'undo'; token?: string; protocolVersion?: number; editId?: string }
  | { type: 'redo'; token?: string; protocolVersion?: number; editId?: string }
  | { type: 'comment'; token?: string; protocolVersion?: number; elementSource: string; text: string; elementContext?: ElementContext; currentStyles?: Record<string, string>; pinPosition?: { x: number; y: number } }
  | { type: 'comment-reply'; token?: string; protocolVersion?: number; annotationId: string; text: string }
  | { type: 'clear_server_undo'; token?: string; protocolVersion?: number }

export type ServerToBrowser =
  | { type: 'cortex' }
  | { type: 'cortex-close' }
  | { type: 'cortex-toggle'; active: boolean }
  | { type: 'hello'; protocolVersion: number; sessionId: string; swatches?: string[] }
  | { type: 'error'; code: string; message: string; editId?: string }
  | { type: 'edit_status'; editId: string; status: 'writing' | 'done' | 'failed' | 'cancelled'; newToken?: string; reason?: string; strategy?: 'immediate' | 'deferred' }
  | { type: 'undo_sync_status'; status: 'done' | 'failed'; reason?: string; reason_code?: 'empty_stack' | 'stale' | 'write_failed' }
  | { type: 'redo_sync_status'; status: 'done' | 'failed'; reason?: string; reason_code?: 'empty_stack' | 'stale' | 'write_failed' }
  | { type: 'hmr_verified'; editId: string; match: boolean; expected?: string; actual?: string; kind?: EditKind }
  | { type: 'hmr-applied' }
  | { type: 'annotation-created'; annotation: Annotation }
  | { type: 'annotation-updated'; annotation: Annotation }
  | { type: 'agent-status'; connected: boolean }
  | { type: 'activity-entry'; entry: ActivityEntry }
  | { type: 'capabilities'; systems: StyleCapability[] }

export interface ElementContext {
  tagName: string
  componentName: string | null
  domSelector: string
  textPreview: string
}

export type AnnotationStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed'

export interface Annotation {
  id: string
  status: AnnotationStatus
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }
  createdAt: number
  updatedAt: number
  resolution?: { summary: string }
  dismissReason?: string
  thread: ThreadMessage[]
}

export interface ThreadMessage {
  id: string
  from: 'user' | 'agent'
  text: string
  timestamp: number
}

export interface CreateAnnotationParams {
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }
}

export interface ActivityEntry {
  id: string
  type: 'edit' | 'comment' | 'status-change'
  timestamp: number
  elementSource?: string
  description: string
  details?: Record<string, unknown>
}

// === Browser-side channel (injected by adapter) ===
// Implemented in src/browser/channel.ts (Phase 2).
// Defined here so both server and browser code share the same contract.

/** Connection lifecycle state emitted by channels. */
export type ConnectionState =
  | { status: 'connected' }
  | { status: 'reconnecting'; retryCount: number; maxRetries: number }
  | { status: 'disconnected' }

export interface CortexChannel {
  send(msg: BrowserToServer): void
  onMessage(handler: (msg: ServerToBrowser) => void): () => void
  onConnectionChange(handler: (state: ConnectionState) => void): () => void
  readonly connected: boolean
  /** Clean up resources (WebSocket, timers). Optional — Vite channel has nothing to dispose. */
  dispose?: () => void
}

export type { StyleCapability }
