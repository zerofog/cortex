import { describe, it, expect } from 'vitest'
import { browserToServerSchema } from '../../src/schemas/index.js'
import {
  WRITE_TYPES_ARRAY,
  BROWSER_TO_CLI_FORWARD_TYPES_ARRAY,
  WRITE_TYPES,
  BROWSER_TO_CLI_FORWARD_TYPES,
  CLI_ALLOWED_TYPES,
  tokensEqual,
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

// Pillar 1: cortex/set-active is intentionally NOT in WRITE_TYPES.
// Browser keyboard handler emits it without a token (browsers have no access
// to the auth token), and same-origin HMR is already trusted at the transport
// layer. CLI-side auth is enforced separately by the cliWss token check.
describe('WRITE_TYPES — Pillar 1 exclusion', () => {
  it('does NOT include cortex/set-active (browser path must work without token)', () => {
    expect(WRITE_TYPES.has('cortex/set-active')).toBe(false)
  })

  it('every WRITE_TYPES_ARRAY entry is a real BrowserToServer schema variant', () => {
    const allTypes = browserToServerSchema.options.map((opt) => opt.shape.type.value)
    for (const t of WRITE_TYPES_ARRAY) {
      expect(allTypes, `expected "${t}" to be a BrowserToServer schema variant`).toContain(t)
    }
  })
})

// Security review finding P2-2: auth-token comparison must be constant-time.
// tokensEqual replaces plain `!==` (which short-circuits on the first differing
// byte, leaking timing) with crypto.timingSafeEqual. These tests pin the
// functional contract; the timing property itself isn't unit-assertable.
describe('tokensEqual — constant-time auth token comparison', () => {
  const token = '11111111-2222-4333-8444-555555555555' // UUID shape, fixed length

  it('returns true for an exact match', () => {
    expect(tokensEqual(token, token)).toBe(true)
    expect(tokensEqual(String(token), token)).toBe(true) // distinct instance
  })

  it('returns false for a different same-length token', () => {
    const other = '99999999-2222-4333-8444-555555555555'
    expect(other.length).toBe(token.length)
    expect(tokensEqual(other, token)).toBe(false)
  })

  it('returns false for non-string actual (off-the-wire payloads are untyped)', () => {
    expect(tokensEqual(undefined, token)).toBe(false)
    expect(tokensEqual(null, token)).toBe(false)
    expect(tokensEqual(42, token)).toBe(false)
    expect(tokensEqual({ token }, token)).toBe(false)
    expect(tokensEqual([token], token)).toBe(false)
  })

  it('returns false (does NOT throw) on length mismatch', () => {
    // timingSafeEqual throws on unequal-length buffers; the length guard must
    // catch this first and return false rather than crash the message handler.
    expect(() => tokensEqual('short', token)).not.toThrow()
    expect(tokensEqual('short', token)).toBe(false)
    expect(tokensEqual(token + 'extra', token)).toBe(false)
    expect(tokensEqual('', token)).toBe(false)
  })

  it('handles multibyte correctly via byte-length (not char-length)', () => {
    // '✓' is 3 UTF-8 bytes; a 1-char actual must not be treated as equal-length.
    expect(tokensEqual('✓', 'abc')).toBe(false)
  })
})
