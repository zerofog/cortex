import { z } from 'zod'

// ---------------------------------------------------------------------------
// PendingEdit schema — canonical source for the staging-buffer wire format and
// its size bounds. core/staged-edits.ts imports MAX_FULL_SYNC_SIZE and
// pendingEditSchema from this module; types.ts re-exports z.infer<typeof pendingEditSchema>.
//
// If you need to change a size bound, change it here. The imperative validator
// isValidPendingEdit (now @deprecated thin wrapper at core/staged-edits.ts) delegates
// to pendingEditSchema.safeParse, so consistency is structural.
// ---------------------------------------------------------------------------

export const MAX_INTENT_VALUE_BYTES = 4096
export const MAX_INTENT_SOURCE_BYTES = 1024
export const MAX_INTENT_ID_BYTES = 256
export const MAX_INTENT_PROPERTY_BYTES = 256
export const MAX_INTENT_INSTANCE_SOURCES = 100

/** Defensive cap on staged-edits-sync batch size — 2× browser MAX_ENTRIES (500).
 *  Mirrors the cap enforced by StagedEditsCache.mergeFullSync at runtime.
 *  Defined here (not in core/staged-edits.ts) to keep schemas/ a leaf module
 *  with no upward imports — wire-format.ts uses it for envelope-level rejection
 *  before per-element validation runs. The runtime cache's cap is re-exported
 *  from this constant; both must stay in sync. */
export const MAX_FULL_SYNC_SIZE = 1000

// ---------------------------------------------------------------------------
// UTF-8 byte helpers
//
// JS string.length measures UTF-16 code units, not UTF-8 bytes. The constants
// above are intentionally named *_BYTES to express byte limits. TextEncoder
// is available in Node 16+ and all modern browsers.
// ---------------------------------------------------------------------------

/** Count UTF-8 bytes in a string. Uses TextEncoder which is available in all
 *  modern JS environments (Node 16+, browsers, Deno). */
export const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length

/**
 * Zod schema for PendingEdit.
 *
 * Enforces both shape and UTF-8 byte size bounds.
 * The `.finite()` check on timestamp rejects NaN/Infinity,
 * matching the `!Number.isFinite(v.timestamp)` guard.
 *
 * Size fields use `.refine(utf8Bytes(v) <= N)` rather than `.max(N)` so that
 * multi-byte characters (e.g. 4-byte emoji at 4 UTF-8 bytes each) are counted
 * correctly — JS `.max(N)` measures UTF-16 code units, not bytes.
 */
export const pendingEditSchema = z.object({
  intentId: z.string().min(1).refine((v) => utf8Bytes(v) <= MAX_INTENT_ID_BYTES, { message: `intentId exceeds ${MAX_INTENT_ID_BYTES} UTF-8 bytes` }),
  source: z.string().min(1).refine((v) => utf8Bytes(v) <= MAX_INTENT_SOURCE_BYTES, { message: `source exceeds ${MAX_INTENT_SOURCE_BYTES} UTF-8 bytes` }),
  property: z.string().min(1).refine((v) => utf8Bytes(v) <= MAX_INTENT_PROPERTY_BYTES, { message: `property exceeds ${MAX_INTENT_PROPERTY_BYTES} UTF-8 bytes` }),
  value: z.string().refine((v) => utf8Bytes(v) <= MAX_INTENT_VALUE_BYTES, { message: `value exceeds ${MAX_INTENT_VALUE_BYTES} UTF-8 bytes` }),
  previousValue: z.string().refine((v) => utf8Bytes(v) <= MAX_INTENT_VALUE_BYTES, { message: `previousValue exceeds ${MAX_INTENT_VALUE_BYTES} UTF-8 bytes` }),
  pseudo: z.enum(['::before', '::after']).optional(),
  scope: z.enum(['instance', 'all']).optional(),
  instanceSources: z
    .array(z.string().refine((v) => utf8Bytes(v) <= MAX_INTENT_SOURCE_BYTES, { message: `instanceSources element exceeds ${MAX_INTENT_SOURCE_BYTES} UTF-8 bytes` }))
    .max(MAX_INTENT_INSTANCE_SOURCES)
    .optional(),
  timestamp: z.number().finite(),
})

export type PendingEditSchema = z.infer<typeof pendingEditSchema>
