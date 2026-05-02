import { z } from 'zod'
import { SchemaViolationError, formatIssues } from './errors.js'

// ---------------------------------------------------------------------------
// isTestMode — dual-flag, environment-aware helper.
//
// Browser-only path: esbuild defines __CORTEX_TEST_BUILD__ in browser bundles
// as `true` or `false` at build time. In non-browser environments it would
// be a ReferenceError if accessed bare, but `typeof` is the safe probe.
//
// Server/CLI path: reads process.env flags. VITEST is set automatically by
// vitest; CORTEX_TEST_BUILD is set by `build:test` in package.json;
// NODE_ENV=test is the Jest/Jest-like convention.
// ---------------------------------------------------------------------------

declare const __CORTEX_TEST_BUILD__: boolean | undefined

function isTestMode(): boolean {
  if (typeof __CORTEX_TEST_BUILD__ !== 'undefined') return __CORTEX_TEST_BUILD__
  return (
    process.env['CORTEX_TEST_BUILD'] === 'true' ||
    process.env['VITEST'] === 'true' ||
    process.env['NODE_ENV'] === 'test'
  )
}

/**
 * Parse `value` against `schema`.
 *
 * - **Test mode** (VITEST, CORTEX_TEST_BUILD, NODE_ENV=test, or browser test build):
 *   throws `SchemaViolationError` so test failures are loud and immediate.
 * - **Production mode**: logs a `console.warn` and returns `null` so user
 *   sessions are not disrupted by unexpected messages.
 *
 * @param schema  Zod schema to validate against
 * @param value   Untrusted input (typically parsed JSON)
 * @param context Human-readable call site label used in error messages (e.g. `'vite.hotHandler'`)
 * @returns parsed + typed data, or `null` on validation failure in prod
 */
export function parseOrFail<T>(schema: z.ZodType<T>, value: unknown, context: string): T | null {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const formatted = formatIssues(result.error.issues)
  if (isTestMode()) {
    throw new SchemaViolationError(`${context}: ${formatted}`, result.error.issues, context)
  }
  console.warn(`[cortex] schema violation at ${context}:`, formatted)
  return null
}
