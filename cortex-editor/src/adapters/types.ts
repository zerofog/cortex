import type { Server as HttpServer } from 'http'

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

// === Message protocol ===

export type BrowserToServer =
  | { type: 'init' }
  | { type: 'cortex-closed' }
  | { type: 'edit'; protocolVersion?: number; editId: string; property: string; value: string; source: string; elementSelector: string }
  | { type: 'undo'; protocolVersion?: number; editId?: string }
  | { type: 'redo'; protocolVersion?: number; editId?: string }
  | { type: 'comment'; protocolVersion?: number; elementSource: string; text: string; elementContext?: ElementContext; currentStyles?: Record<string, string>; pinPosition?: { x: number; y: number } }
  | { type: 'comment-reply'; annotationId: string; text: string }

export type ServerToBrowser =
  | { type: 'cortex' }
  | { type: 'cortex-close' }
  | { type: 'hello'; protocolVersion: number; sessionId: string; swatches?: string[] }
  | { type: 'error'; code: string; message: string; editId?: string }
  | { type: 'edit_status'; editId: string; status: 'writing' | 'done' | 'failed'; newToken?: string; reason?: string }
  | { type: 'undo_status'; status: 'done'; restoredFile: string }
  | { type: 'redo_status'; status: 'done'; restoredFile: string }
  | { type: 'hmr_verified'; editId: string; match: boolean; expected?: string; actual?: string }
  | { type: 'annotation-created'; annotation: Annotation }
  | { type: 'annotation-updated'; annotation: Annotation }
  | { type: 'agent-status'; connected: boolean }
  | { type: 'activity-entry'; entry: ActivityEntry }

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

export interface CortexChannel {
  send(msg: BrowserToServer): void
  onMessage(handler: (msg: ServerToBrowser) => void): () => void
  readonly connected: boolean
  /** Clean up resources (WebSocket, timers). Optional — Vite channel has nothing to dispose. */
  dispose?: () => void
}
