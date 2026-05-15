/**
 * Server-side constants shared by the Vite and Webpack adapters.
 *
 * Both adapters run a WebSocket bridge (browser ↔ dev server ↔ CLI) and MUST
 * agree on the same security and protocol invariants. Before this module the
 * constants were copy-pasted into `vite.ts` and `webpack.ts`; a write type
 * added to one allowlist but not the other is a silent auth-bypass bug. Keeping
 * them here makes that drift structurally impossible — there is one definition.
 */
import type { BrowserToServer } from './types.js'

/** Localhost-only origin allowlist for the CLI/browser WebSocket upgrade check. */
export const ALLOWED_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

/** Message `type` values a CLI (MCP) client is permitted to send. */
export const CLI_ALLOWED_TYPES = new Set(['cortex', 'cortex-close'])

/** WebSocket keepalive ping interval (ms) — dead-connection detection. */
export const HEARTBEAT_INTERVAL = 30_000

/** Max concurrent CLI (MCP) connections per dev server. */
export const MAX_CLI_CONNECTIONS = 5

/** Type literal of all BrowserToServer variants — used by the `satisfies`
 *  clauses below to force tsc to reject any allowlist entry that isn't a real
 *  schema variant, preventing silent drift. */
export type BrowserToServerType = BrowserToServer['type']

/** Browser-to-server message types that should be forwarded to CLI clients (MCP).
 *  High-frequency sync messages (staged-edit-add/-remove/-clear/-sync) are
 *  intentionally NOT forwarded — they're internal browser↔dev-server-cache
 *  sync, not Claude-relevant. Forwarding them would burn bandwidth/CPU on the
 *  MCP process for no consumer (the MCP server's ws.on('message') handler
 *  doesn't branch on those types).
 *
 *  Verified against mcp.ts ws.on('message'): MCP branches on cortex-rpc-result,
 *  cortex-rpc-error, error, cortex, cortex-closed, cortex-status, staged-edits-ready,
 *  annotation-created, annotation-updated. Of those, only cortex-closed and
 *  staged-edits-ready are browser-originated; the rest are server-originated
 *  (forwarded via the channel.send → forwardToCLI path). 'init' is
 *  browser-originated but MCP does not branch on it. */
export const BROWSER_TO_CLI_FORWARD_TYPES_ARRAY = [
  'cortex-closed',
  'staged-edits-ready',
] as const satisfies readonly BrowserToServerType[]
export const BROWSER_TO_CLI_FORWARD_TYPES: ReadonlySet<string> = new Set(BROWSER_TO_CLI_FORWARD_TYPES_ARRAY)

/** Message types that require token auth — all write/mutation operations.
 *  The `satisfies readonly BrowserToServerType[]` clause forces tsc to reject
 *  any entry that isn't a real BrowserToServer variant — preventing silent
 *  drift from the schema. Exported so tests can pin the runtime invariant. */
export const WRITE_TYPES_ARRAY = [
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
export type WriteMessageType = typeof WRITE_TYPES_ARRAY[number]
export const WRITE_TYPES: ReadonlySet<string> = new Set(WRITE_TYPES_ARRAY)
