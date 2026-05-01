/**
 * Type-compatibility regression test (compile-time only, no runtime assertions).
 *
 * Proves that z.infer<typeof browserToServerSchema> and BrowserToServer from
 * types.ts are structurally compatible in both directions. If the two diverge,
 * `npx tsc --noEmit` fails here before any runtime test runs.
 *
 * Also proves ServerToBrowserSchema ↔ ServerToBrowser structural compatibility.
 */
import type { BrowserToServer, ServerToBrowser } from '../../src/adapters/types.js'
import type { BrowserToServerSchema, ServerToBrowserSchema } from '../../src/schemas/wire-format.js'

// ---- BrowserToServer ↔ BrowserToServerSchema ----

// Schema → TS type (schema output assignable to existing TS type)
declare const btsSchema: BrowserToServerSchema
const _btsFromSchema: BrowserToServer = btsSchema

// TS type → Schema type (existing TS type assignable to schema output)
declare const btsType: BrowserToServer
const _btsFromType: BrowserToServerSchema = btsType

// ---- ServerToBrowser ↔ ServerToBrowserSchema ----

// Schema → TS type
declare const stbSchema: ServerToBrowserSchema
const _stbFromSchema: ServerToBrowser = stbSchema

// TS type → Schema type
declare const stbType: ServerToBrowser
const _stbFromType: ServerToBrowserSchema = stbType

// Suppress unused-variable warnings
void _btsFromSchema
void _btsFromType
void _stbFromSchema
void _stbFromType
