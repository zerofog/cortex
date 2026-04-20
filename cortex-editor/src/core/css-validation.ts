// src/core/css-validation.ts
//
// Server-side CSS validation primitives. Mirrors the browser-side
// module at src/browser/css-validation.ts but lives separately
// because the two cross a bundle boundary. This is a deliberate
// TWO-authoritative-copies design, not a shadow copy: the browser
// validates before sending; the server validates at the WebSocket
// trust boundary regardless of whether the browser did.
//
// Before this module existed, the server-side regexes were
// duplicated across class-op-validator.ts (REJECT_URL) and
// edit-pipeline.ts (REJECT_URL_IN_INLINE, VALID_INLINE_PROP_NAME).
// Consolidation closes drift risk: a new attack shape discovered
// later now gets ONE patch instead of two that risk diverging.

/** CSS property name whitelist. Matches:
 *  - Standard properties: `font-size`, `background-image`
 *  - CSS custom properties: `--primary`, `--my-token`
 *  - Vendor-prefixed: `-webkit-transform`, `-moz-user-select`
 *
 *  Rejects anything outside `[a-zA-Z0-9-]` to block JSX attribute
 *  breakout shapes like `"]injection` — defense-in-depth even
 *  though ts-morph's AST writer escapes them at serialization. */
export const VALID_CSS_PROPERTY_NAME = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/

/** Reject `url(` token — same defense across classOp tokens and
 *  inline style values. The CSS tokenizer decodes Unicode escapes
 *  (`\75 ` → `u`) at CSSOM setProperty time, so a server-side
 *  substring check for `url(` alone is insufficient — must also
 *  reject `\` and `/*` (see rejectCommonInjectionPatterns). */
export const REJECT_URL = /url\s*\(/i

/** Three-check validator for CSS property names. Returns a rejection
 *  reason string or null on success. Accepts a `ctx` prefix so callers
 *  can surface tailored error messages ("inlineSets", "inlineRemoves",
 *  "classOp token") without duplicating the three-check idiom.
 *
 *  The three invariants checked:
 *    1. Must be a non-empty string
 *    2. Must not exceed maxLen (caller-specified bound)
 *    3. Must match the VALID_CSS_PROPERTY_NAME charset
 */
export function validatePropertyName(
  name: string,
  maxLen: number,
  ctx: string,
): string | null {
  if (typeof name !== 'string' || name.length === 0) {
    return `${ctx} has empty property name`
  }
  if (name.length > maxLen) {
    return `${ctx} property name exceeds ${maxLen} chars`
  }
  if (!VALID_CSS_PROPERTY_NAME.test(name)) {
    return `${ctx} property name has invalid shape (must match CSS property name charset)`
  }
  return null
}

/** Defense-in-depth injection guards for CSS property VALUES.
 *  Returns a rejection reason string or null on success.
 *
 *  Checks (in order):
 *    - REJECT_URL: blocks `url(` tokens for background-image /
 *      cursor / etc. Necessary because url() can fire network
 *      requests and (on some browser/property combos) execute
 *      javascript: schemes.
 *    - `//` substring: blocks protocol-relative URLs that remain
 *      exploitable even inside url().
 *    - `\\` substring: blocks CSS Unicode escape bypass
 *      (`\75 rl(...)` → `url(...)` at CSS tokenization).
 *    - `/*` substring: blocks CSS comment injection
 *      (`url/**\/(...)` → `url(...)` at CSS tokenization).
 *    - `;` substring: brings inlineSets value strictness to parity
 *      with the regular property-keyed path, whose VALID_VALUE
 *      charset gate excludes `;`. JSON.stringify at serialization
 *      neutralizes the actual CSS injection for React style props,
 *      so this is defense-in-depth consistency rather than an
 *      exploit block — but the two paths should validate
 *      identically. Checked last so the more-specific url/`///`\/`\*`
 *      reasons surface first for shapes that match multiple rules.
 *
 *  These checks together close the vulnerability class of
 *  attacker-controlled values flowing into inline styles or
 *  classOp tokens and being decoded into `url(...)` at render
 *  time. The `ctx` prefix tailors the error for the caller's
 *  trust boundary ("inlineSets value", "classOp token"). */
export function rejectCommonInjectionPatterns(
  value: string,
  ctx: string,
): string | null {
  if (REJECT_URL.test(value)) {
    return `${ctx} must not contain url() — use @theme or static asset imports for images`
  }
  if (value.includes('//')) {
    return `${ctx} must not contain protocol-relative //`
  }
  if (value.includes('\\')) {
    return `${ctx} must not contain backslash (blocks CSS Unicode escape bypass)`
  }
  if (value.includes('/*')) {
    return `${ctx} must not contain /* (blocks CSS comment-injection bypass)`
  }
  if (value.includes(';')) {
    return `${ctx} must not contain semicolon (charset parity with regular-value path)`
  }
  return null
}
