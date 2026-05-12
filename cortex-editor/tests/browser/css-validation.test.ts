import { describe, it, expect } from 'vitest'
import {
  VALID_PROPERTY,
  VALID_VALUE,
  REJECT_URL,
  REJECT_COMMENT,
} from '../../src/browser/css-validation.js'

/**
 * Direct-surface tests for the browser-side CSS validation regexes.
 *
 * The browser module is a deliberate two-authoritative-copies mirror
 * of `src/core/css-validation.ts`. They live separately because they
 * cross a bundle boundary — the browser validates before sending, the
 * server validates again at the WebSocket trust boundary regardless of
 * what the browser did. Pinning both sides with tests prevents silent
 * drift when a new attack shape is patched on one side only.
 *
 * The two consumers in this bundle (`src/browser/override.ts:108` and
 * `src/browser/state-detector.ts:155`) compose the four regexes as a
 * layered defense:
 *
 *   if (!VALID_VALUE.test(v) || REJECT_URL.test(v) || REJECT_COMMENT.test(v))
 *     // reject
 *
 * VALID_PROPERTY / VALID_VALUE are the **charset gates** (must MATCH
 * to pass). REJECT_URL / REJECT_COMMENT are **vetoes** (must NOT match
 * to pass). The tests below exercise each constant in isolation —
 * integration of the layered gate is covered by the consumers' own
 * tests.
 *
 * Cross-reference: the server-side analog lives at
 * `tests/core/css-validation.test.ts`. New attack shapes added there
 * should be reflected here (and vice versa).
 */

describe('VALID_PROPERTY regex', () => {
  // Falsifiability: dropping the trailing `$` anchor would let
  // `font-size;color:red` pass — that test below would flip true.
  // Dropping `[a-zA-Z]` anchor would let leading digits through —
  // `1px` test would flip true.

  it('accepts standard CSS property names', () => {
    expect(VALID_PROPERTY.test('font-size')).toBe(true)
    expect(VALID_PROPERTY.test('background-image')).toBe(true)
    expect(VALID_PROPERTY.test('padding')).toBe(true)
    expect(VALID_PROPERTY.test('z-index')).toBe(true)
  })

  it('accepts CSS custom properties (--*)', () => {
    expect(VALID_PROPERTY.test('--primary')).toBe(true)
    expect(VALID_PROPERTY.test('--my-token')).toBe(true)
    expect(VALID_PROPERTY.test('--token-1')).toBe(true)
  })

  it('accepts vendor-prefixed properties', () => {
    expect(VALID_PROPERTY.test('-webkit-transform')).toBe(true)
    expect(VALID_PROPERTY.test('-moz-user-select')).toBe(true)
    expect(VALID_PROPERTY.test('-ms-overflow-style')).toBe(true)
  })

  it('rejects JSX attribute breakout shapes', () => {
    expect(VALID_PROPERTY.test('"]injection')).toBe(false)
    expect(VALID_PROPERTY.test('font-size;color:red')).toBe(false)
    expect(VALID_PROPERTY.test('<script>')).toBe(false)
    expect(VALID_PROPERTY.test('color:red')).toBe(false)
  })

  it('rejects empty and whitespace-only', () => {
    expect(VALID_PROPERTY.test('')).toBe(false)
    expect(VALID_PROPERTY.test(' ')).toBe(false)
    expect(VALID_PROPERTY.test('font size')).toBe(false)
  })

  it('rejects properties starting with a digit', () => {
    // The `[a-zA-Z]` anchor after the optional `-{0,2}` requires the
    // first non-hyphen character to be a letter. CSS property names
    // never start with a digit; allowing them would let attackers
    // smuggle in shapes like `1url(evil)`.
    expect(VALID_PROPERTY.test('1px')).toBe(false)
    expect(VALID_PROPERTY.test('9-column')).toBe(false)
  })

  it('rejects properties with three or more leading hyphens', () => {
    // The `-{0,2}` quantifier permits 0, 1, or 2 leading hyphens
    // (vendor prefix `-webkit-`, custom property `--token`). A third
    // hyphen flips the regex to false — sanity guard against malformed
    // selectors slipping through.
    expect(VALID_PROPERTY.test('---triple-leading')).toBe(false)
  })
})

describe('VALID_VALUE regex (charset allowlist)', () => {
  // VALID_VALUE is permissive on its own — the charset includes
  // characters (`/`, `(`, `)`) that would be dangerous in a `url(...)`
  // context. The dangerous shapes are caught by REJECT_URL /
  // REJECT_COMMENT in the consumer's layered check. These tests
  // exercise the CHARSET BOUNDARY only.
  //
  // Falsifiability: dropping the `+` quantifier would let empty
  // strings through — the empty-string test below would flip true.
  // Adding `;` to the charset would let injection separators through —
  // the semicolon test below would flip true.

  it('accepts design-token aliases (alpha-only)', () => {
    expect(VALID_VALUE.test('xs')).toBe(true)
    expect(VALID_VALUE.test('sm')).toBe(true)
    expect(VALID_VALUE.test('md')).toBe(true)
    expect(VALID_VALUE.test('lg')).toBe(true)
    expect(VALID_VALUE.test('xl')).toBe(true)
  })

  it('accepts numeric values with units', () => {
    expect(VALID_VALUE.test('14px')).toBe(true)
    expect(VALID_VALUE.test('1.5rem')).toBe(true)
    expect(VALID_VALUE.test('100%')).toBe(true)
    expect(VALID_VALUE.test('0')).toBe(true)
  })

  it('accepts hex colors', () => {
    expect(VALID_VALUE.test('#fff')).toBe(true)
    expect(VALID_VALUE.test('#3a4b5c')).toBe(true)
  })

  it('accepts functional notation (calc, rgba, linear-gradient)', () => {
    expect(VALID_VALUE.test('rgba(255, 0, 0, 0.5)')).toBe(true)
    expect(VALID_VALUE.test('calc(100% - 10px)')).toBe(true)
    expect(VALID_VALUE.test('linear-gradient(to right, #fff, #000)')).toBe(true)
  })

  it('accepts quoted font-family strings', () => {
    expect(VALID_VALUE.test('"Helvetica Neue", sans-serif')).toBe(true)
    expect(VALID_VALUE.test("'Inter'")).toBe(true)
  })

  it('rejects empty strings (charset requires ≥1 char)', () => {
    expect(VALID_VALUE.test('')).toBe(false)
  })

  it('rejects semicolons (CSS statement separator — injection vector)', () => {
    // Single-invariant falsifiability anchor: only `;` is outside the
    // charset here, so adding `;` to the charset would flip this to
    // true. A reader can prove this regex actually constrains `;`.
    expect(VALID_VALUE.test('14px;')).toBe(false)
    // Realistic attacker shape — smuggle a second declaration past the
    // value boundary. (Also rejected because `:` is outside the
    // charset; the line above is the falsifiability proof for `;`.)
    expect(VALID_VALUE.test('red;color:blue')).toBe(false)
  })

  it('rejects colons, angle brackets, and entity characters', () => {
    // Single-invariant anchors (each input has exactly ONE non-charset
    // character). Adding any one to the charset would flip exactly one
    // assertion — proving each character is genuinely constrained.
    expect(VALID_VALUE.test('a:b')).toBe(false)
    expect(VALID_VALUE.test('a<b')).toBe(false)
    expect(VALID_VALUE.test('a>b')).toBe(false)
    expect(VALID_VALUE.test('a&b')).toBe(false)
    // Realistic compound shapes (XSS, HTML entity) — kept as
    // documentation alongside the single-invariant anchors above.
    expect(VALID_VALUE.test('<script>')).toBe(false)
    expect(VALID_VALUE.test('a&amp;b')).toBe(false)
  })

  it('rejects backslash (blocks CSS Unicode escape bypass)', () => {
    // CSS tokenizes `\75 ` to `u` at parse time. A value of
    // `\75 rl(evil)` would decode to `url(evil)` after VALID_VALUE
    // checked it as a literal string. Excluding `\` from the charset
    // closes that bypass before any decoding happens.
    expect(VALID_VALUE.test('\\75 rl')).toBe(false)
    expect(VALID_VALUE.test('\\')).toBe(false)
  })

  it('rejects bracket and brace characters', () => {
    // Square brackets and curly braces appear in CSS attribute
    // selectors and at-rule blocks — neither is valid inside a single
    // declaration value.
    //
    // Single-invariant anchors first (each input has exactly ONE
    // non-charset character):
    expect(VALID_VALUE.test('a[b')).toBe(false)
    expect(VALID_VALUE.test('a]b')).toBe(false)
    expect(VALID_VALUE.test('a{b')).toBe(false)
    expect(VALID_VALUE.test('a}b')).toBe(false)
    // Realistic compound shapes — kept as documentation:
    expect(VALID_VALUE.test('[attr=evil]')).toBe(false)
    expect(VALID_VALUE.test('{ font-size: 10px }')).toBe(false)
  })

  it('rejects other punctuation outside the charset', () => {
    // Spot-check a few common attack-shape characters not covered by
    // the dedicated tests above. Charset includes `'"` for font names
    // but excludes the rest.
    expect(VALID_VALUE.test('a=b')).toBe(false)
    expect(VALID_VALUE.test('a?b')).toBe(false)
    expect(VALID_VALUE.test('a!b')).toBe(false)
    expect(VALID_VALUE.test('a|b')).toBe(false)
  })
})

describe('REJECT_URL regex', () => {
  // REJECT_URL is a veto — a MATCH means "reject". The pattern allows
  // arbitrary whitespace between `url` and `(`, and is case-insensitive.
  //
  // Falsifiability: removing the `\s*` would miss `url (` — the
  // whitespace-before-paren test below would flip false. Removing the
  // `i` flag would miss `URL(` — the case-insensitivity test below
  // would flip false.

  it('matches url( with no whitespace', () => {
    expect(REJECT_URL.test('url(evil.gif)')).toBe(true)
  })

  it('matches URL( case-insensitively', () => {
    expect(REJECT_URL.test('URL(evil.gif)')).toBe(true)
    expect(REJECT_URL.test('uRl(evil.gif)')).toBe(true)
  })

  it('matches url with whitespace before paren', () => {
    expect(REJECT_URL.test('url (evil.gif)')).toBe(true)
    expect(REJECT_URL.test('url   (evil.gif)')).toBe(true)
    expect(REJECT_URL.test('url\t(evil.gif)')).toBe(true)
  })

  it('matches url(...) embedded inside a value-shaped string', () => {
    // Per the consumer contract at src/browser/override.ts:108, the
    // input to REJECT_URL is a CSS VALUE (not a declaration). These
    // shapes pass VALID_VALUE's charset (no `:` boundary) but require
    // REJECT_URL to veto them.
    expect(REJECT_URL.test('image-set(url(evil.gif) 1x)')).toBe(true)
    expect(REJECT_URL.test('url(evil.gif) center')).toBe(true)
    expect(REJECT_URL.test('  url(x)  ')).toBe(true)
  })

  it('does not match url substrings not followed by paren', () => {
    expect(REJECT_URL.test('burl')).toBe(false)
    expect(REJECT_URL.test('curly-url')).toBe(false)
    expect(REJECT_URL.test('blurb')).toBe(false)
  })

  it('does not match url followed by non-paren character', () => {
    expect(REJECT_URL.test('urls')).toBe(false)
    expect(REJECT_URL.test('url-name')).toBe(false)
    expect(REJECT_URL.test('url{x}')).toBe(false)
  })
})

describe('REJECT_COMMENT regex', () => {
  // REJECT_COMMENT is a veto — a MATCH means "reject". It catches
  // the `/*` open-comment marker. The CSS tokenizer strips comments
  // during tokenization, so a value like `url/**/(evil)` would
  // tokenize down to `url(evil)` after both VALID_VALUE and
  // REJECT_URL had checked it as a literal string. Blocking `/*` at
  // the character level closes that decode-time bypass.
  //
  // Falsifiability: dropping the regex would let the comment-injection
  // bypass shape through — the `'/*'` and `'url/*evil'` assertions
  // would flip false. (Note: the `url/**/(evil)` shape contains BOTH
  // `/*` and `*/`, so a regex that mistakenly matched `*/` instead of
  // `/*` would still match it. The `url/*evil` assertion is the
  // single-invariant anchor that catches that mutation.)

  it('matches a literal /* sequence', () => {
    expect(REJECT_COMMENT.test('/*')).toBe(true)
    expect(REJECT_COMMENT.test('14px /* injected */')).toBe(true)
  })

  it('matches /* embedded inside a url-bypass shape', () => {
    // `url/**/(evil)` is the canonical comment-injection bypass:
    // REJECT_URL's `/url\s*\(/i` requires whitespace-or-nothing
    // between `url` and `(` and `/**/` is non-whitespace, so
    // REJECT_URL alone misses this shape. REJECT_COMMENT catches it.
    expect(REJECT_COMMENT.test('url/**/(evil)')).toBe(true)
    // Single-invariant falsifiability anchor: `/*` with NO closing
    // `*/`. Without this line, an inverted regex matching `*/` instead
    // of `/*` would still pass the line above (which contains both
    // markers). This input has only the open marker, so the test will
    // fail if anyone reverses the regex direction.
    expect(REJECT_COMMENT.test('url/*evil')).toBe(true)
  })

  it('does not match close-comment marker alone', () => {
    // The regex is `/\/\*/` (slash + literal asterisk). `*/`
    // (asterisk + slash) is not the open marker — the CSS tokenizer
    // only enters comment state on `/*`.
    expect(REJECT_COMMENT.test('*/')).toBe(false)
  })

  it('does not match isolated slash or asterisk', () => {
    expect(REJECT_COMMENT.test('/')).toBe(false)
    expect(REJECT_COMMENT.test('*')).toBe(false)
    expect(REJECT_COMMENT.test('14 / 2')).toBe(false)
    expect(REJECT_COMMENT.test('a * b')).toBe(false)
  })

  it('does not match slash and asterisk separated by a character', () => {
    // `/ *` (with a space between) is not the comment-open marker.
    // CSS tokenizer requires the two characters to be adjacent.
    expect(REJECT_COMMENT.test('/ *')).toBe(false)
    expect(REJECT_COMMENT.test('/x*')).toBe(false)
  })
})
