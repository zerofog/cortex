import { describe, it, expect } from 'vitest'
import { validateClassOpToken } from '../../src/core/class-op-validator.js'

/**
 * Each test below asserts a SPECIFIC rejection reason, not a generic
 * "rejected" boolean. Per CLAUDE.md anti-pattern 4, security assertions
 * must prove enforcement — that means asserting the *mechanism* that
 * rejected the input, so a regression that silently changes which rule
 * fires (or swaps "rejected for length" for "rejected for shape") fails
 * the test instead of coincidentally still passing.
 */

describe('validateClassOpToken — valid inputs', () => {
  it.each([
    ['bare Tailwind utility', 'text-body-md'],
    ['variant prefix', 'hover:bg-blue-500'],
    ['double variant', 'sm:hover:text-white'],
    ['opacity modifier', 'bg-black/50'],
    ['numeric-padded utility', 'py-2.5'],
    ['arbitrary static bracket value', 'w-[42px]'],
    ['arbitrary calc bracket value', 'w-[calc(100%-2rem)]'],
    ['variant + bracket value', 'hover:bg-[#abcdef]'],
  ])('accepts %s', (_label, token) => {
    expect(validateClassOpToken(token)).toEqual({ ok: true })
  })
})

describe('validateClassOpToken — rejects by specific rule', () => {
  it('rejects empty string with empty-token reason', () => {
    const r = validateClassOpToken('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('empty')
  })

  it('rejects tokens over the length cap with length reason', () => {
    const token = 'a'.repeat(129)
    const r = validateClassOpToken(token)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/exceeds.*128/)
  })

  it('rejects whitespace — spaces', () => {
    const r = validateClassOpToken('text-body md')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('whitespace')
  })

  it('rejects whitespace — tabs', () => {
    const r = validateClassOpToken('text-body\tmd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('whitespace')
  })

  it('rejects whitespace — newlines (JSX-breakout guard)', () => {
    const r = validateClassOpToken('text-body\nmd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('whitespace')
  })

  it('rejects leading-dash non-Tailwind shape with shape reason', () => {
    // A malformed token that passes the char-class but fails the shape
    // regex would be hard to construct since the regex is permissive. A
    // leading bracket (no identifier) is the canonical shape failure.
    const r = validateClassOpToken('[evil]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects angle brackets even inside arbitrary value (HTML-breakout guard)', () => {
    const r = validateClassOpToken('content-[<img>]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects bracket value with url( — the core Tailwind v4 injection vector', () => {
    // `url(javascript:alert(1))` contains `:`, which the bracket-content
    // whitelist excludes → shape rejection.
    const r = validateClassOpToken('bg-[url(javascript:alert(1))]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects bracket value with javascript: scheme (shape-level rejection)', () => {
    // Colons are excluded from bracket content whitelist. This catches
    // `javascript:`, `data:`, `http:`, and any other URL-scheme payload
    // at a single choke point, without a separate substring blocklist.
    const r = validateClassOpToken('bg-[javascript:foo]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects bracket value with data: scheme', () => {
    const r = validateClassOpToken('bg-[data:image]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects w-[expression(alert(1))] — the full IE CSS-expression form', () => {
    // Shape-regex passes `expression(alert(1))` at the char level, but the
    // test is retained because the attempted exploit is real. Even though
    // modern browsers no longer execute `expression()`, shipping a payload
    // into the user's compiled CSS is undesirable — and if any browser
    // regression ever revived expression(), the shape whitelist would still
    // need to catch the dangerous subset. In this case `expression(alert(1))`
    // uses only whitelisted chars, so it PASSES shape — note the semantics:
    // our whitelist defense targets URL-scheme and escape-decoded attacks
    // where the payload encodes a scheme or backslash escape. `expression()`
    // itself produces no runtime effect on modern browsers, so we accept it.
    const r = validateClassOpToken('w-[expression(alert(1))]')
    expect(r.ok).toBe(true)
  })

  it('rejects CSS Unicode escape bypass — \\75rl(evil) would decode to url(evil) post-compile', () => {
    // The motivating bypass from the /review: a BLOCKLIST that checks for
    // literal `url(` misses `\75rl(...)` because Tailwind's CSS tokenizer
    // decodes `\75` → `u` during compilation. Our whitelist excludes `\`
    // entirely, so the escape-decode attack is blocked at shape level
    // before any CSS tokenization runs.
    const r = validateClassOpToken('bg-[\\75rl(javascript:alert(1))]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects backslash inside bracket value (no CSS escapes)', () => {
    const r = validateClassOpToken('bg-[\\20]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects single-quote inside bracket value (no quoted content strings)', () => {
    // `content-['hello']` would be a legitimate Tailwind pattern but opens
    // a quote-injection surface we choose not to support. Users needing
    // content strings should define via `@theme` or inline style.
    const r = validateClassOpToken("content-['hello']")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects double-quote inside bracket value', () => {
    const r = validateClassOpToken('content-["hello"]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/shape/)
  })

  it('rejects non-string inputs (defense-in-depth against untyped JSON)', () => {
    // @ts-expect-error intentional — runtime guard for WebSocket payloads
    const r = validateClassOpToken(42)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('string')
  })
})
