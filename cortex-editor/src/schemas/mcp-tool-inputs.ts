import { z } from 'zod'

// ---------------------------------------------------------------------------
// MCP tool input schemas — mirrors the inline `inputSchema` blocks in
// cortex-editor/src/cli/mcp.ts. These are the canonical schemas; T2 will
// replace the inline blocks with imports from here.
//
// Tools with NO user inputs (cortex_activate, cortex_deactivate,
// cortex_status, cortex_get_pending, cortex_get_pending_edits,
// cortex_channel_test) use z.object({}) — no export needed as they're empty.
// ---------------------------------------------------------------------------

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
  intentIds: z.array(z.string()).describe('IDs of intents to apply'),
})

/** cortex_discard_edits input */
export const cortexDiscardEditsInputSchema = z.object({
  intentIds: z.array(z.string()).describe('IDs of intents to discard'),
})

/** cortex_get_intent_context input */
export const cortexGetIntentContextInputSchema = z.object({
  intentId: z.string().describe('ID of the intent to get context for'),
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
