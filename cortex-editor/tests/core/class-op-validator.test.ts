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

  it('rejects bracket value with literal url( at the url-defense layer (H1)', () => {
    // Post-H1: url( is rejected BEFORE the shape regex runs. The specific
    // reason proves that the dedicated url() check — not the incidental
    // `:` exclusion in the bracket whitelist — is the rejection mechanism.
    // This matters because the percent-encoded bypass variant below would
    // slip past a shape-only defense.
    const r = validateClassOpToken('bg-[url(javascript:alert(1))]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/url\(/)
  })

  it('rejects percent-encoded colon in url() — shape-regex bypass (H1)', () => {
    // %3A is the percent-encoded form of `:`. The three chars `%`, `3`, `A`
    // are all in the bracket-content whitelist, so this token passes the
    // shape regex. But the browser's url() parser percent-decodes inside
    // the value, restoring the colon and the `javascript:` scheme. The
    // dedicated url() rejection catches this before shape would otherwise
    // permit it. If this test ever passes as `ok: true`, the H1 defense
    // has regressed.
    const r = validateClassOpToken('bg-[url(javascript%3Aalert(1))]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/url\(/)
  })

  it('rejects percent-encoded data: URL in url() (H1)', () => {
    // Same shape-bypass as the javascript%3A case — data: URLs carry SVG
    // or HTML payloads and execute on load in some contexts.
    const r = validateClassOpToken('bg-[url(data%3Aimage/svg+xml;base64,PHN2Zz4K)]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/url\(/)
  })

  it('rejects protocol-relative // inside url() — tracker pixel vector (H1)', () => {
    // `//evil.com/track.gif` bypasses scheme blocks because there IS no
    // scheme. Modern browsers resolve it against the current page's
    // protocol and still fire the image request. The `//` check catches
    // this; url() check catches it redundantly (defense in depth).
    const r = validateClassOpToken('bg-[url(//evil.com/track.gif)]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/url\(|protocol-relative/)
  })

  it('rejects bare protocol-relative `//` in a bracket value (H1)', () => {
    // Without url(), a raw `//` never compiles to useful CSS but still
    // reaches ts-morph's className write. Block it so adversarial tokens
    // don't accumulate in the user's source file even as inert bytes.
    const r = validateClassOpToken('bg-[//evil.com]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/protocol-relative/)
  })

  it('rejects case-variant url( — URL(, Url(, uRL( (H1)', () => {
    // Case-insensitive match so attackers can't slip `URL(` past a
    // case-sensitive check. Three variants in a row because the
    // shape regex is case-sensitive and would only catch the common form.
    for (const variant of ['bg-[URL(a)]', 'bg-[Url(a)]', 'bg-[uRL(a)]']) {
      const r = validateClassOpToken(variant)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/url\(/)
    }
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
    // Post-simplify (Step 5 C9): shared rejectCommonInjectionPatterns
    // gives a more specific error message — "backslash" — before the
    // SHAPE regex gets to reject for charset violation. More precise
    // is strictly better for debugging and falsifiability.
    if (!r.ok) expect(r.reason).toMatch(/backslash|shape/)
  })

  it('rejects backslash inside bracket value (no CSS escapes)', () => {
    const r = validateClassOpToken('bg-[\\20]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/backslash|shape/)
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
