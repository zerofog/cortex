/** Result of validating a classOp token. Discriminated union so callers can
 *  surface the specific failure reason in `edit_status: failed`. */
export type ClassOpValidationResult = { ok: true } | { ok: false; reason: string }

/** Maximum token length. 128 chars is generous for bracket-form arbitrary
 *  values (e.g. `w-[calc(100%-2rem)]`) while rejecting payload-style inputs.
 *  Standard Tailwind utilities are typically < 40 chars. */
const MAX_LEN = 128

/** Overall shape: a leading token of Tailwind-allowed chars, optionally
 *  followed by a single bracket block with an EXPLICIT whitelist of chars.
 *
 *  Leading (outside brackets) allows:
 *   - Letters, digits, `:` (variants like `hover:`, `sm:`, `peer-focus:`)
 *   - `_`, `-` (kebab-case + underscore-escapes)
 *   - `/` (opacity modifiers like `bg-black/50`)
 *   - `.`, `%` (rare but legal in some utility names)
 *
 *  Bracket content allows (INTENTIONALLY restrictive):
 *   - Letters, digits, `_`, `.`, `-`, `+`, `*`, `/`, `#`, `%`, `(`, `)`, `,`
 *
 *  Bracket content rejects:
 *   - `\` (blocks CSS Unicode escapes like `\75rl(...)` that decode to `url(...)`
 *     during Tailwind's CSS compilation and bypass a naive substring blocklist).
 *   - `:` (blocks URL schemes — `javascript:`, `data:`, `http:` — at shape level
 *     so no later blocklist is needed).
 *   - `<`, `>` (HTML-breakout guard, though ts-morph already escapes these).
 *   - `]`, `[`, `{`, `}` (unbalanced brackets / nested arbitrary values).
 *   - `'`, `"`, `` ` `` (quote injection).
 *   - `&`, `?`, `=`, `!`, `~`, `^`, `|`, `@`, `$`, `;` (no legitimate Tailwind
 *     use inside arbitrary values; each blocks a different attack shape).
 *
 *  Tradeoff: `content-['hello']` (quoted-string content utility) is rejected.
 *  Users needing content strings should route through `@theme` definitions or
 *  inline style. Every other common Tailwind arbitrary-value pattern
 *  (`#fff`, `calc()`, `rgba(...)`, `repeat(3,minmax(0,1fr))`,
 *  `linear-gradient(to_right,red,blue)`) is preserved.
 *
 *  Why whitelist over blocklist: a BLOCKLIST catches named escape vectors
 *  (`url(`, `javascript:`) but is bypassable via CSS Unicode escapes
 *  (`\75 rl(...)` → `url(...)` post-compilation). A WHITELIST that excludes
 *  `\` and `:` eliminates the entire class of escape-decoding attacks at
 *  the shape-validation layer, before any CSS tokenization occurs. */
const SHAPE = /^[a-zA-Z0-9:_\-\/\.%]+(?:\[[a-zA-Z0-9_.\-+*/#%(),]{1,100}\])?$/

/** Injection-shape rejection (url(), //, backslash, /*) is centralized
 *  in src/core/css-validation.ts as rejectCommonInjectionPatterns.
 *  That module also documents the full attack-class rationale: percent-
 *  encoded colons in url(), protocol-relative URLs, CSS Unicode escape
 *  decoding (`\75 rl(...)` → `url(...)`), and CSS comment injection
 *  (`url/**\/(...)` → `url(...)`). Single source of truth across the
 *  classOp token path and the inline-style value path. */
import { rejectCommonInjectionPatterns } from './css-validation.js'

/**
 * Validate that `token` is safe to pass into the classOp pipeline —
 * concretely, that it will be written into a `className` string attribute
 * by ts-morph and subsequently compiled by Tailwind without creating an
 * injection vector.
 *
 * ts-morph's `setLiteralValue` is escape-safe for quotes/backslashes/
 * newlines, so JSX-breakout is not possible through this path. The attack
 * surface that remains is Tailwind v4's **arbitrary-value bracket syntax**:
 * `bg-[url(javascript:alert(1))]` compiles to a CSS rule whose `url(...)`
 * executes in the user's browser on next load. That bypasses JSX escaping
 * because the payload is a legitimate CSS value string.
 *
 * Rules (each failure cites a specific reason for UX + debuggability):
 *   1. Length: 1 <= len <= 128.
 *   2. No whitespace anywhere (classOp tokens are single utility tokens).
 *   3. No `url(` sequence — defense-in-depth vs percent-encoded scheme
 *      smuggling that the shape-regex cannot catch.
 *   4. No `//` sequence — blocks protocol-relative paths.
 *   5. Shape regex: allowed leading chars + optional bracket block with
 *      a strict char whitelist (no `\`, no `:`, no quotes, no HTML chars).
 */
export function validateClassOpToken(token: string): ClassOpValidationResult {
  if (typeof token !== 'string') {
    return { ok: false, reason: 'classOp token must be a string' }
  }
  if (token.length === 0) {
    return { ok: false, reason: 'classOp token must not be empty' }
  }
  if (token.length > MAX_LEN) {
    return { ok: false, reason: `classOp token exceeds ${MAX_LEN} chars` }
  }
  if (/\s/.test(token)) {
    return { ok: false, reason: 'classOp token must not contain whitespace' }
  }
  const injectErr = rejectCommonInjectionPatterns(token, 'classOp token')
  if (injectErr) {
    return { ok: false, reason: injectErr }
  }
  if (!SHAPE.test(token)) {
    return { ok: false, reason: 'classOp token has invalid shape (expected Tailwind utility)' }
  }
  return { ok: true }
}
