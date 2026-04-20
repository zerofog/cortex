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

/** Discriminated union for className mutations. The `kind` discriminator
 *  forces callers to declare intent; pipeline routing reads only the
 *  fields guaranteed present for each variant. */
export type ClassOp =
  | { kind: 'add'; add: string }
  | { kind: 'remove'; remove: string }
  | { kind: 'swap'; remove: string; add: string }

// === Message protocol ===

export type BrowserToServer =
  | { type: 'init'; sessionId?: string }
  | { type: 'cortex-closed' }
  | {
      type: 'edit'
      token?: string
      protocolVersion?: number
      editId: string
      property: string
      value: string
      source: string
      elementSelector: string
      cssMapping?: string
      scope?: 'instance' | 'all'
      instanceSources?: string[]
      currentClass?: string
      /** When present, the pipeline treats this as a className mutation.
       *  `property` and `value` are ignored on the classOp branch.
       *
       *  Discriminated by `kind`:
       *    - 'add': pure class addition (e.g., linking a new text-component
       *      with no prior class on the element)
       *    - 'remove': pure class removal (e.g., unlinking to clear styles)
       *    - 'swap': atomic remove-then-add (e.g., swapping text-body-md
       *      for text-heading-1 in one gesture)
       *
       *  The kind makes caller intent explicit at the type level. Pipeline
       *  routing and downstream rewriter calls unambiguously read the
       *  required fields — no more optional-both-optional-neither ambiguity. */
      classOp?: ClassOp
      /** ZF0-1215 C2: compound-edit extension. When `classOp` AND at
       *  least one of `inlineSets` / `inlineRemoves` is populated, the
       *  pipeline routes to `handleCompoundEdit` which applies the
       *  className mutation + the inline-style mutations to the same
       *  JSX element in ONE read-mutate-write cycle, producing ONE
       *  UndoFileChange entry. This makes a full user gesture (e.g.,
       *  "unlink a text bundle" = remove class + write preserving
       *  inline styles) atomic for undo purposes. */
      inlineSets?: ReadonlyArray<{ property: string; value: string }>
      /** Companion to inlineSets: properties to REMOVE from the JSX
       *  element's inline style object (if present). Lands in the
       *  same compound edit so "link a bundle while clearing stale
       *  inline styles" is also atomic. */
      inlineRemoves?: ReadonlyArray<{ property: string }>
    }
  | { type: 'undo'; token?: string; protocolVersion?: number; editId?: string }
  | { type: 'redo'; token?: string; protocolVersion?: number; editId?: string }
  | { type: 'comment'; token?: string; protocolVersion?: number; elementSource: string; text: string; elementContext?: ElementContext; currentStyles?: Record<string, string>; pinPosition?: { x: number; y: number }; kind?: AnnotationKind; fixMeta?: FixMeta }
  | { type: 'comment-reply'; token?: string; protocolVersion?: number; annotationId: string; text: string }
  | { type: 'clear_server_undo'; token?: string; protocolVersion?: number }

export type ServerToBrowser =
  | { type: 'cortex' }
  | { type: 'cortex-close' }
  | { type: 'cortex-toggle'; active: boolean }
  | {
      type: 'hello'
      protocolVersion: number
      sessionId: string
      /** Back-compat: flat hex list used by the v1 color swatch row. */
      swatches?: string[]
      /** Named design-system chips (token name + browser-ready hex). */
      colorChips?: Array<{ name: string; hex: string }>
      /** Typography bundles — all four sub-properties present per entry. */
      textComponents?: Array<{
        name: string
        fontSize: string
        lineHeight: string
        letterSpacing: string
        fontWeight: string
        fontFamily?: string
      }>
    }
  | { type: 'error'; code: string; message: string; editId?: string }
  | { type: 'edit_status'; editId: string; status: 'writing' | 'done' | 'failed' | 'cancelled'; newToken?: string; reason?: string; reason_code?: 'external_revert' | 'invalid_class_token' | 'write_failed' | 'rewriter_failed' | 'parse_failed'; strategy?: 'immediate' | 'deferred' }
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

export type AnnotationKind = 'comment' | 'fix-request'

export interface FixMeta {
  property: string
  value: string
  reason: string
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
  kind?: AnnotationKind
  fixMeta?: FixMeta
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
  kind?: AnnotationKind
  fixMeta?: FixMeta
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

/** UI display state for connection indicator. Extends ConnectionState with transient 'reconnected'. */
export type ConnectionDisplay = ConnectionState | { status: 'reconnected' }

export interface CortexChannel {
  send(msg: BrowserToServer): void
  onMessage(handler: (msg: ServerToBrowser) => void): () => void
  onConnectionChange(handler: (state: ConnectionState) => void): () => void
  readonly connected: boolean
  /** Clean up resources (WebSocket, timers). Optional — Vite channel has nothing to dispose. */
  dispose?: () => void
}

export type { StyleCapability }
