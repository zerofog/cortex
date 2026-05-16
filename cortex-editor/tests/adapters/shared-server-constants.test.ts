import { describe, it, expect } from 'vitest'
import { browserToServerSchema } from '../../src/schemas/index.js'
import {
  WRITE_TYPES_ARRAY,
  BROWSER_TO_CLI_FORWARD_TYPES_ARRAY,
  WRITE_TYPES,
  BROWSER_TO_CLI_FORWARD_TYPES,
  CLI_ALLOWED_TYPES,
} from '../../src/adapters/shared-server-constants.js'

// These constants are shared by the Vite and Webpack adapters. The
// `as const satisfies readonly BrowserToServerType[]` clause on each array is
// the compile-time drift guard; these tests pin the same invariant at runtime.
// Imports the ACTUAL exported arrays (no shadow copy) — if a future ticket adds
// a write-type that isn't a real schema variant, this fails.

describe('shared-server-constants — allowlist arrays are schema-derived', () => {
  it('every WRITE_TYPES_ARRAY entry is a real BrowserToServer variant from the schema', () => {
    const allTypes = browserToServerSchema.options.map((opt) => opt.shape.type.value)
    for (const t of WRITE_TYPES_ARRAY) {
      expect(allTypes).toContain(t)
    }
  })

  it('every BROWSER_TO_CLI_FORWARD_TYPES_ARRAY entry is a real BrowserToServer variant from the schema', () => {
    const allTypes = browserToServerSchema.options.map((opt) => opt.shape.type.value)
    for (const t of BROWSER_TO_CLI_FORWARD_TYPES_ARRAY) {
      expect(allTypes).toContain(t)
    }
  })

  it('the derived Sets contain exactly their source arrays', () => {
    expect(WRITE_TYPES.size).toBe(WRITE_TYPES_ARRAY.length)
    for (const t of WRITE_TYPES_ARRAY) expect(WRITE_TYPES.has(t)).toBe(true)
    expect(BROWSER_TO_CLI_FORWARD_TYPES.size).toBe(BROWSER_TO_CLI_FORWARD_TYPES_ARRAY.length)
    for (const t of BROWSER_TO_CLI_FORWARD_TYPES_ARRAY) expect(BROWSER_TO_CLI_FORWARD_TYPES.has(t)).toBe(true)
  })
})

// Pillar 1: CLI_ALLOWED_TYPES additions (Task 5)
describe('CLI_ALLOWED_TYPES — Pillar 1 additions', () => {
  it('includes cortex/set-active (new unified activation shape)', () => {
    expect(CLI_ALLOWED_TYPES.has('cortex/set-active')).toBe(true)
  })

  it('still includes legacy cortex (dual-mode period)', () => {
    expect(CLI_ALLOWED_TYPES.has('cortex')).toBe(true)
  })

  it('still includes legacy cortex-close (dual-mode period)', () => {
    expect(CLI_ALLOWED_TYPES.has('cortex-close')).toBe(true)
  })
})

// Pillar 1: WRITE_TYPES includes cortex/set-active (auth gate)
describe('WRITE_TYPES — Pillar 1 additions', () => {
  it('includes cortex/set-active so auth token is required from browser', () => {
    expect(WRITE_TYPES.has('cortex/set-active')).toBe(true)
  })

  it('every WRITE_TYPES_ARRAY entry including cortex/set-active is a real BrowserToServer schema variant', () => {
    const allTypes = browserToServerSchema.options.map((opt) => opt.shape.type.value)
    for (const t of WRITE_TYPES_ARRAY) {
      expect(allTypes, `expected "${t}" to be a BrowserToServer schema variant`).toContain(t)
    }
  })
})
