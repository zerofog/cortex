import { describe, it, expect } from 'vitest'
import {
  VALID_CSS_PROPERTY_NAME,
  REJECT_URL,
  validatePropertyName,
  rejectCommonInjectionPatterns,
} from '../../src/core/css-validation.js'

/**
 * Direct-surface tests for the shared server-side CSS validation module.
 * The module consolidates regex constants + two helper functions that
 * previously lived duplicated across class-op-validator.ts and
 * edit-pipeline.ts. Tests here pin the contract so both callers get
 * identical enforcement — a new attack shape discovered later needs
 * ONE patch here, not two coordinated patches that risk drift.
 */

describe('VALID_CSS_PROPERTY_NAME regex', () => {
  it('accepts standard CSS property names', () => {
    expect(VALID_CSS_PROPERTY_NAME.test('font-size')).toBe(true)
    expect(VALID_CSS_PROPERTY_NAME.test('background-image')).toBe(true)
    expect(VALID_CSS_PROPERTY_NAME.test('padding')).toBe(true)
  })

  it('accepts CSS custom properties', () => {
    expect(VALID_CSS_PROPERTY_NAME.test('--primary')).toBe(true)
    expect(VALID_CSS_PROPERTY_NAME.test('--my-token')).toBe(true)
  })

  it('accepts vendor-prefixed properties', () => {
    expect(VALID_CSS_PROPERTY_NAME.test('-webkit-transform')).toBe(true)
    expect(VALID_CSS_PROPERTY_NAME.test('-moz-user-select')).toBe(true)
  })

  it('rejects JSX attribute breakout shapes', () => {
    expect(VALID_CSS_PROPERTY_NAME.test('"]injection')).toBe(false)
    expect(VALID_CSS_PROPERTY_NAME.test('font-size;color:red')).toBe(false)
    expect(VALID_CSS_PROPERTY_NAME.test('<script>')).toBe(false)
  })

  it('rejects empty and whitespace', () => {
    expect(VALID_CSS_PROPERTY_NAME.test('')).toBe(false)
    expect(VALID_CSS_PROPERTY_NAME.test(' ')).toBe(false)
    expect(VALID_CSS_PROPERTY_NAME.test('font size')).toBe(false)
  })
})

describe('REJECT_URL regex', () => {
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
  })

  it('does not match url substrings not followed by paren', () => {
    expect(REJECT_URL.test('burl')).toBe(false)
    expect(REJECT_URL.test('curly-url')).toBe(false)
  })
})

describe('validatePropertyName', () => {
  it('returns null for valid names', () => {
    expect(validatePropertyName('font-size', 64, 'ctx')).toBeNull()
    expect(validatePropertyName('--primary', 64, 'ctx')).toBeNull()
    expect(validatePropertyName('-webkit-transform', 64, 'ctx')).toBeNull()
  })

  it('rejects empty with ctx-prefixed message', () => {
    const err = validatePropertyName('', 64, 'inlineSets')
    expect(err).toBe('inlineSets has empty property name')
  })

  it('rejects over-length with ctx-prefixed message', () => {
    const longName = 'a'.repeat(100)
    const err = validatePropertyName(longName, 64, 'inlineSets')
    expect(err).toContain('exceeds 64 chars')
    expect(err).toContain('inlineSets')
  })

  it('rejects invalid shape with ctx-prefixed message', () => {
    const err = validatePropertyName('"]injection', 64, 'inlineRemoves')
    expect(err).toContain('invalid shape')
    expect(err).toContain('inlineRemoves')
  })

  it('handles non-string input defensively', () => {
    // @ts-expect-error testing runtime type defensiveness
    const err = validatePropertyName(null, 64, 'ctx')
    expect(err).toBe('ctx has empty property name')
  })
})

describe('rejectCommonInjectionPatterns', () => {
  it('returns null for legitimate CSS values', () => {
    expect(rejectCommonInjectionPatterns('14px', 'value')).toBeNull()
    expect(rejectCommonInjectionPatterns('rgba(255, 0, 0, 0.5)', 'value')).toBeNull()
    expect(rejectCommonInjectionPatterns('linear-gradient(to right, #fff, #000)', 'value')).toBeNull()
    expect(rejectCommonInjectionPatterns('"Helvetica Neue", sans-serif', 'value')).toBeNull()
  })

  it('rejects literal url()', () => {
    const err = rejectCommonInjectionPatterns('url(evil.gif)', 'inlineSets value')
    expect(err).toContain('url()')
    expect(err).toContain('inlineSets value')
  })

  it('rejects protocol-relative //', () => {
    const err = rejectCommonInjectionPatterns('//evil.com/track', 'classOp token')
    expect(err).toContain('protocol-relative')
    expect(err).toContain('classOp token')
  })

  it('rejects backslash (CSS Unicode escape bypass)', () => {
    const err = rejectCommonInjectionPatterns('\\75 rl(evil)', 'inlineSets value')
    expect(err).toContain('backslash')
  })

  it('rejects /* (CSS comment injection bypass)', () => {
    // `url/**/(evil)` — the REJECT_URL regex is `/url\s*\(/i` which
    // requires whitespace-OR-nothing between `url` and `(`. The `/**/`
    // is non-whitespace, so REJECT_URL does NOT match. Falls through
    // to the `/*` check, which catches the comment-injection shape.
    // The CSS tokenizer would strip the comment during tokenization
    // and produce `url(evil)` — blocking `/*` closes that path.
    const err = rejectCommonInjectionPatterns('url/**/(evil)', 'inlineSets value')
    expect(err).toContain('/*')
  })

  it('rejects standalone /* without url', () => {
    const err = rejectCommonInjectionPatterns('red /* injected */ !important', 'value')
    expect(err).toContain('/*')
  })

  it('check order: url() takes precedence over other checks', () => {
    // `url(//evil)` matches both url() and // — url() is reported first.
    const err = rejectCommonInjectionPatterns('url(//evil.com/x)', 'value')
    expect(err).toContain('url()')
  })
})
