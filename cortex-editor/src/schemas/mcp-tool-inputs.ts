import { z } from 'zod'
import { intentIdSchema } from './pending-edit.js'

// ---------------------------------------------------------------------------
// MCP tool input schemas — canonical source consumed by the registerTool calls
// in src/cli/mcp.ts via .shape. The 6 tools without inputs (cortex_activate,
// cortex_deactivate, cortex_status, cortex_get_pending, cortex_get_pending_edits,
// cortex_channel_test) have no schemas here; their registerTool calls in mcp.ts
// use empty z.object({}) as required by the MCP SDK.
// ---------------------------------------------------------------------------

// intentIdField is the shared intentIdSchema — centralised in pending-edit.ts to
// prevent the F2/F14 class of UTF-16-vs-byte drift across trust boundaries.
const intentIdField = intentIdSchema

// --- Annotation tools ---

/** cortex_get_details input */
export const cortexGetDetailsInputSchema = z.object({
  annotationId: z.string().describe('Annotation ID'),
})

/** cortex_acknowledge input */
export const cortexAcknowledgeInputSchema = z.object({
  annotationId: z.string().describe('Annotation ID'),
})

/** cortex_resolve input */
export const cortexResolveInputSchema = z.object({
  annotationId: z.string().describe('Annotation ID'),
  summary: z.string().describe('Summary of the change that was applied'),
})

/** cortex_dismiss input */
export const cortexDismissInputSchema = z.object({
  annotationId: z.string().describe('Annotation ID'),
  reason: z.string().optional().describe('Reason for dismissing'),
})

/** cortex_respond input */
export const cortexRespondInputSchema = z.object({
  annotationId: z.string().describe('Annotation ID'),
  text: z.string().describe('Message text'),
})

// --- Staged-edit tools (ZF0-1452) ---

/** cortex_apply_edits input */
export const cortexApplyEditsInputSchema = z.object({
  intentIds: z
    .array(intentIdField)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'duplicate intentIds in single apply request',
    })
    .describe('IDs of intents to apply'),
})

/** cortex_discard_edits input */
export const cortexDiscardEditsInputSchema = z.object({
  intentIds: z.array(intentIdField).describe('IDs of intents to discard'),
})

/** cortex_get_intent_context input */
export const cortexGetIntentContextInputSchema = z.object({
  intentId: intentIdField.describe('ID of the intent to get context for'),
})

// --- Inferred types ---

export type CortexGetDetailsInput = z.infer<typeof cortexGetDetailsInputSchema>
export type CortexAcknowledgeInput = z.infer<typeof cortexAcknowledgeInputSchema>
export type CortexResolveInput = z.infer<typeof cortexResolveInputSchema>
export type CortexDismissInput = z.infer<typeof cortexDismissInputSchema>
export type CortexRespondInput = z.infer<typeof cortexRespondInputSchema>
export type CortexApplyEditsInput = z.infer<typeof cortexApplyEditsInputSchema>
export type CortexDiscardEditsInput = z.infer<typeof cortexDiscardEditsInputSchema>
export type CortexGetIntentContextInput = z.infer<typeof cortexGetIntentContextInputSchema>
