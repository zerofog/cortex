/**
 * Type-compatibility regression test (compile-time only, no runtime assertions).
 *
 * Proves that `z.infer<typeof browserToServerSchema>` and `BrowserToServer`
 * from `adapters/types.ts` are structurally compatible in both directions.
 * Same for `ServerToBrowserSchema` ↔ `ServerToBrowser`.
 *
 * **How this gate runs.** The root `tsconfig.json` excludes `tests/`, and
 * vitest's include glob is `\*.test.ts` (so this file is not collected as
 * a runtime test). Instead, `cortex-editor/tests/tsconfig.json` includes
 * the schemas directory and is invoked by `npm run typecheck` (see
 * `package.json`). If the schema-derived types diverge from the existing
 * TS types, `npm run typecheck` fails on the `tests/tsconfig.json` step.
 *
 * **Filename note.** This file is `.types.ts`, not `.test-d.ts`, because
 * TypeScript treats any `*.d.ts` suffix (including `.test-d.ts`) as a
 * declaration file and rejects value statements like `const x: T = y`. The
 * `.test-d.ts` suffix is only meaningful to vitest's typecheck plugin,
 * which we do not run.
 *
 * To verify the gate fires, introduce a deliberate mismatch (e.g. add a
 * required field to one of the schemas in `wire-format.ts` that's not in
 * the corresponding type in `adapters/types.ts`) and run
 * `npm run typecheck` — it must error here before reverting the mismatch.
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
