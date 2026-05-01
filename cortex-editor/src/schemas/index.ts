// ---------------------------------------------------------------------------
// cortex-editor/src/schemas — public surface
//
// T2 (ZF0-1500) imports: browserToServerSchema, serverToBrowserSchema,
//   pendingEditSchema, parseOrFail, SchemaViolationError, formatIssues,
//   toSchemaViolation, cliRpc* schemas
// T3 (ZF0-1501) imports: all of the above + loadWireFormatFixture
// ---------------------------------------------------------------------------

// Structured error types + helpers
export {
  SchemaViolationError,
  formatIssues,
  toSchemaViolation,
} from './errors.js'
export type { SchemaViolation } from './errors.js'

// Test/prod gating
export { parseOrFail } from './gating.js'

// PendingEdit schema
export {
  pendingEditSchema,
  MAX_INTENT_VALUE_BYTES,
  MAX_INTENT_SOURCE_BYTES,
  MAX_INTENT_ID_BYTES,
  MAX_INTENT_PROPERTY_BYTES,
  MAX_INTENT_INSTANCE_SOURCES,
} from './pending-edit.js'
export type { PendingEditSchema } from './pending-edit.js'

// Wire-format schemas (browser↔server)
export {
  browserToServerSchema,
  serverToBrowserSchema,
  cliRpcRequestSchema,
  cliRpcResultSchema,
  cliRpcErrorSchema,
  cliStatusSchema,
} from './wire-format.js'
export type {
  BrowserToServerSchema,
  ServerToBrowserSchema,
  CliRpcRequest,
  CliRpcResult,
  CliRpcError,
  CliStatus,
} from './wire-format.js'

// MCP tool input schemas
export {
  cortexGetDetailsInputSchema,
  cortexAcknowledgeInputSchema,
  cortexResolveInputSchema,
  cortexDismissInputSchema,
  cortexRespondInputSchema,
  cortexApplyEditsInputSchema,
  cortexDiscardEditsInputSchema,
  cortexGetIntentContextInputSchema,
} from './mcp-tool-inputs.js'
export type {
  CortexGetDetailsInput,
  CortexAcknowledgeInput,
  CortexResolveInput,
  CortexDismissInput,
  CortexRespondInput,
  CortexApplyEditsInput,
  CortexDiscardEditsInput,
  CortexGetIntentContextInput,
} from './mcp-tool-inputs.js'

// Fixture loader (Node-only, test utilities)
export { loadWireFormatFixture } from './load-fixture.js'
