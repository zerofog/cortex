import { z } from 'zod'

// ---------------------------------------------------------------------------
// Size constants mirrored from cortex-editor/src/core/staged-edits.ts.
// These must stay in sync with isValidPendingEdit — the schema subsumes it.
// ---------------------------------------------------------------------------

export const MAX_INTENT_VALUE_BYTES = 4096
export const MAX_INTENT_SOURCE_BYTES = 1024
export const MAX_INTENT_ID_BYTES = 256
export const MAX_INTENT_PROPERTY_BYTES = 256
export const MAX_INTENT_INSTANCE_SOURCES = 100

/**
 * Zod schema for PendingEdit.
 *
 * Enforces both shape and size bounds from isValidPendingEdit.
 * The `.finite()` check on timestamp rejects NaN/Infinity,
 * matching the `!Number.isFinite(v.timestamp)` guard.
 */
export const pendingEditSchema = z.object({
  intentId: z.string().min(1).max(MAX_INTENT_ID_BYTES),
  source: z.string().min(1).max(MAX_INTENT_SOURCE_BYTES),
  property: z.string().min(1).max(MAX_INTENT_PROPERTY_BYTES),
  value: z.string().max(MAX_INTENT_VALUE_BYTES),
  previousValue: z.string().max(MAX_INTENT_VALUE_BYTES),
  pseudo: z.enum(['::before', '::after']).optional(),
  scope: z.enum(['instance', 'all']).optional(),
  instanceSources: z
    .array(z.string().max(MAX_INTENT_SOURCE_BYTES))
    .max(MAX_INTENT_INSTANCE_SOURCES)
    .optional(),
  timestamp: z.number().finite(),
})

export type PendingEditSchema = z.infer<typeof pendingEditSchema>
