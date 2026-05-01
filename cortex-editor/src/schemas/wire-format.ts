import { z } from 'zod'
import { pendingEditSchema, MAX_INTENT_ID_BYTES } from './pending-edit.js'

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const classOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add'), add: z.string() }),
  z.object({ kind: z.literal('remove'), remove: z.string() }),
  z.object({ kind: z.literal('swap'), remove: z.string(), add: z.string() }),
])

const elementContextSchema = z.object({
  tagName: z.string(),
  componentName: z.string().nullable(),
  domSelector: z.string(),
  textPreview: z.string(),
})

const fixMetaSchema = z.object({
  property: z.string(),
  value: z.string(),
  reason: z.string(),
})

const annotationKindSchema = z.enum(['comment', 'fix-request'])

const annotationStatusSchema = z.enum(['pending', 'acknowledged', 'resolved', 'dismissed'])

const threadMessageSchema = z.object({
  id: z.string(),
  from: z.enum(['user', 'agent']),
  text: z.string(),
  timestamp: z.number(),
})

const annotationSchema = z.object({
  id: z.string(),
  status: annotationStatusSchema,
  elementSource: z.string(),
  text: z.string(),
  elementContext: elementContextSchema.optional(),
  currentStyles: z.record(z.string(), z.string()).optional(),
  pinPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  resolution: z.object({ summary: z.string() }).optional(),
  dismissReason: z.string().optional(),
  thread: z.array(threadMessageSchema),
  kind: annotationKindSchema.optional(),
  fixMeta: fixMetaSchema.optional(),
})

const activityEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['edit', 'comment', 'status-change']),
  timestamp: z.number(),
  elementSource: z.string().optional(),
  description: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

const styleCapabilitySchema = z.object({
  name: z.string(),
  status: z.enum(['supported', 'preview-only', 'ai-required']),
  reason: z.string().optional(),
})

const editKindSchema = z.enum(['immediate', 'jsx-immediate', 'deferred'])

// ---------------------------------------------------------------------------
// BrowserToServer — all 13 variants from types.ts:92-146
// ---------------------------------------------------------------------------

export const browserToServerSchema = z.discriminatedUnion('type', [
  // 1. init
  z.object({
    type: z.literal('init'),
    sessionId: z.string().optional(),
  }),

  // 2. cortex-closed
  z.object({
    type: z.literal('cortex-closed'),
  }),

  // 3. edit (class-op and inline-style variants share this schema)
  z.object({
    type: z.literal('edit'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
    editId: z.string(),
    property: z.string(),
    value: z.string(),
    source: z.string(),
    elementSelector: z.string(),
    cssMapping: z.string().optional(),
    scope: z.enum(['instance', 'all']).optional(),
    instanceSources: z.array(z.string()).optional(),
    currentClass: z.string().optional(),
    classOp: classOpSchema.optional(),
    inlineSets: z.array(z.object({ property: z.string(), value: z.string() })).readonly().optional(),
    inlineRemoves: z.array(z.object({ property: z.string() })).readonly().optional(),
  }),

  // 4. undo
  z.object({
    type: z.literal('undo'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
    editId: z.string().optional(),
  }),

  // 5. redo
  z.object({
    type: z.literal('redo'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
    editId: z.string().optional(),
  }),

  // 6. comment (plain and fix-request variants)
  z.object({
    type: z.literal('comment'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
    elementSource: z.string(),
    text: z.string(),
    elementContext: elementContextSchema.optional(),
    currentStyles: z.record(z.string(), z.string()).optional(),
    pinPosition: z.object({ x: z.number(), y: z.number() }).optional(),
    kind: annotationKindSchema.optional(),
    fixMeta: fixMetaSchema.optional(),
  }),

  // 7. comment-reply
  z.object({
    type: z.literal('comment-reply'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
    annotationId: z.string(),
    text: z.string(),
  }),

  // 8. clear_server_undo
  z.object({
    type: z.literal('clear_server_undo'),
    token: z.string().optional(),
    protocolVersion: z.number().optional(),
  }),

  // 9. staged-edit-add
  z.object({
    type: z.literal('staged-edit-add'),
    edit: pendingEditSchema,
    token: z.string(),
  }),

  // 10. staged-edit-remove
  z.object({
    type: z.literal('staged-edit-remove'),
    intentIds: z.array(z.string().min(1).max(MAX_INTENT_ID_BYTES)),
    token: z.string(),
  }),

  // 11. staged-edit-clear
  z.object({
    type: z.literal('staged-edit-clear'),
    token: z.string(),
  }),

  // 12. staged-edits-sync — envelope-only validation (graceful degradation).
  // Per-element validation is intentionally deferred to the consumer (vite.ts):
  // a single malformed entry in a 500-edit multi-tab merge sync should NOT
  // reject the entire batch and lose 499 valid edits. Consumer filters
  // per-element via pendingEditSchema.safeParse and warns on drops.
  z.object({
    type: z.literal('staged-edits-sync'),
    edits: z.array(z.unknown()),
    token: z.string(),
  }),

  // 13. staged-edits-ready
  z.object({
    type: z.literal('staged-edits-ready'),
    count: z.number(),
    requestId: z.string(),
    token: z.string(),
  }),
])

export type BrowserToServerSchema = z.infer<typeof browserToServerSchema>

// ---------------------------------------------------------------------------
// ServerToBrowser — all 16 variants from types.ts:148-203
// ---------------------------------------------------------------------------

export const serverToBrowserSchema = z.discriminatedUnion('type', [
  // 1. cortex (CLI activation ack)
  z.object({ type: z.literal('cortex') }),

  // 2. cortex-close (CLI deactivation ack)
  z.object({ type: z.literal('cortex-close') }),

  // 3. cortex-toggle
  z.object({
    type: z.literal('cortex-toggle'),
    active: z.boolean(),
  }),

  // 4. hello
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number(),
    sessionId: z.string(),
    swatches: z.array(z.string()).optional(),
    colorChips: z.array(z.object({ name: z.string(), hex: z.string() })).optional(),
    textComponents: z
      .array(
        z.object({
          name: z.string(),
          fontSize: z.string(),
          lineHeight: z.string(),
          letterSpacing: z.string(),
          fontWeight: z.string(),
          fontFamily: z.string().optional(),
        }),
      )
      .optional(),
  }),

  // 5. error
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    editId: z.string().optional(),
  }),

  // 6. edit_status
  z.object({
    type: z.literal('edit_status'),
    editId: z.string(),
    status: z.enum(['writing', 'done', 'failed', 'cancelled']),
    newToken: z.string().optional(),
    reason: z.string().optional(),
    reason_code: z
      .enum(['external_revert', 'invalid_class_token', 'write_failed', 'rewriter_failed', 'parse_failed', 'read_failed'])
      .optional(),
    strategy: z.enum(['immediate', 'deferred']).optional(),
  }),

  // 7. undo_sync_status
  z.object({
    type: z.literal('undo_sync_status'),
    status: z.enum(['done', 'failed']),
    reason: z.string().optional(),
    reason_code: z.enum(['empty_stack', 'stale', 'write_failed']).optional(),
  }),

  // 8. redo_sync_status
  z.object({
    type: z.literal('redo_sync_status'),
    status: z.enum(['done', 'failed']),
    reason: z.string().optional(),
    reason_code: z.enum(['empty_stack', 'stale', 'write_failed']).optional(),
  }),

  // 9. hmr_verified
  z.object({
    type: z.literal('hmr_verified'),
    editId: z.string(),
    match: z.boolean(),
    expected: z.string().optional(),
    actual: z.string().optional(),
    kind: editKindSchema.optional(),
  }),

  // 10. hmr-applied
  z.object({
    type: z.literal('hmr-applied'),
    files: z.array(z.string()).optional(),
  }),

  // 11. annotation-created
  z.object({
    type: z.literal('annotation-created'),
    annotation: annotationSchema,
  }),

  // 12. annotation-updated
  z.object({
    type: z.literal('annotation-updated'),
    annotation: annotationSchema,
  }),

  // 13. agent-status
  z.object({
    type: z.literal('agent-status'),
    connected: z.boolean(),
  }),

  // 14. activity-entry
  z.object({
    type: z.literal('activity-entry'),
    entry: activityEntrySchema,
  }),

  // 15. capabilities
  z.object({
    type: z.literal('capabilities'),
    systems: z.array(styleCapabilitySchema),
  }),

  // 16. staged-edits-discard
  z.object({
    type: z.literal('staged-edits-discard'),
    intentIds: z.array(z.string().min(1).max(MAX_INTENT_ID_BYTES)),
  }),

  // 17. staged-edits-acked
  z.object({
    type: z.literal('staged-edits-acked'),
    requestId: z.string(),
  }),
])

export type ServerToBrowserSchema = z.infer<typeof serverToBrowserSchema>

// ---------------------------------------------------------------------------
// CLI WebSocket envelopes (server↔CLI, not part of browser protocol)
// These are inline JSON shapes used in vite.ts and mcp.ts.
// ---------------------------------------------------------------------------

/** Sent by the CLI to the Vite server to invoke an RPC method. */
export const cliRpcRequestSchema = z.object({
  type: z.literal('cortex-rpc'),
  requestId: z.string(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()),
  token: z.string(),
})

/** Sent by the Vite server back to the CLI with the RPC result. */
export const cliRpcResultSchema = z.object({
  type: z.literal('cortex-rpc-result'),
  requestId: z.string(),
  result: z.unknown(),
})

/** Sent by the Vite server back to the CLI when an RPC call fails. */
export const cliRpcErrorSchema = z.object({
  type: z.literal('cortex-rpc-error'),
  requestId: z.string(),
  error: z.string(),
})

/** Sent by the Vite server to the CLI immediately on connection. */
export const cliStatusSchema = z.object({
  type: z.literal('cortex-status'),
  editorActive: z.boolean(),
  browserConnected: z.boolean(),
})

export type CliRpcRequest = z.infer<typeof cliRpcRequestSchema>
export type CliRpcResult = z.infer<typeof cliRpcResultSchema>
export type CliRpcError = z.infer<typeof cliRpcErrorSchema>
export type CliStatus = z.infer<typeof cliStatusSchema>
