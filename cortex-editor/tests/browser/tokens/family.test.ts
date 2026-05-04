import { describe, expect, it } from 'vitest'
import { SPACING_PRESETS, matchesSpacingPattern } from '../../../src/browser/tokens/family'

// ── TokenFamily type ────────────────────────────────────────────────────────
// The union is a compile-time type; structural integrity is verified via the
// SPACING_PRESETS shape and exhaustiveness patterns below.

// ── SPACING_PRESETS ─────────────────────────────────────────────────────────
describe('SPACING_PRESETS', () => {
  it('includes exactly the required named entries in order', () => {
    const names = SPACING_PRESETS.map((p) => p.name)
    expect(names).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'xl'])
  })

  it('is sorted ascending by valuePx', () => {
    const values = SPACING_PRESETS.map((p) => p.valuePx)
    const sorted = [...values].sort((a, b) => a - b)
    expect(values).toEqual(sorted)
  })

  it('none has valuePx 0', () => {
    const none = SPACING_PRESETS.find((p) => p.name === 'none')
    expect(none?.valuePx).toBe(0)
  })

  // Exact pixel values sourced from --cx-sp-* in styles.css:
  //   --cx-sp-2: 4px  → xs
  //   --cx-sp-3: 6px  → sm
  //   --cx-sp-4: 8px  → md
  //   --cx-sp-5: 12px → lg
  //   --cx-sp-6: 16px → xl
  it.each([
    ['xs', 4],
    ['sm', 6],
    ['md', 8],
    ['lg', 12],
    ['xl', 16],
  ] as const)('%s has valuePx %i (matching --cx-sp-* scale)', (name, expected) => {
    const preset = SPACING_PRESETS.find((p) => p.name === name)
    expect(preset?.valuePx).toBe(expected)
  })
})

// ── matchesSpacingPattern ────────────────────────────────────────────────────
// The function is case-sensitive — CSS custom property names are case-sensitive
// per spec (`--Spacing-sm` and `--spacing-sm` are distinct variables).

describe('matchesSpacingPattern', () => {
  describe('returns true for user spacing token patterns', () => {
    it.each([
      // --spacing- prefix
      '--spacing-sm',
      '--spacing-md',
      '--spacing-lg',
      '--spacing-0',
      '--spacing-',
      // --sp- prefix
      '--sp-4',
      '--sp-12',
      '--sp-base',
      '--sp-',
      // --gap- prefix
      '--gap-lg',
      '--gap-0',
      '--gap-',
      // --space- prefix
      '--space-2',
      '--space-xs',
      '--space-',
    ])('matches %s', (name) => {
      expect(matchesSpacingPattern(name)).toBe(true)
    })
  })

  describe('returns false for non-spacing or cortex-internal tokens', () => {
    it.each([
      // cortex-editor internal tokens — the --cx- prefix must block them
      '--cx-sp-1',
      '--cx-sp-2',
      '--cx-spacing-sm',
      '--cx-gap-md',
      // other property families
      '--color-primary',
      '--font-size-base',
      '--radius-sm',
      '--border-width-md',
      // structural edge cases
      '',
      '--',
      '--spacing',      // no trailing dash — ambiguous partial match
      '--sp',           // no trailing dash
      '--gap',          // no trailing dash
      '--space',        // no trailing dash
      'spacing-sm',     // no leading --
      '-spacing-sm',    // single dash
      '--SPACING-sm',   // wrong case (CSS custom properties are case-sensitive)
      '--Spacing-sm',   // wrong case
      '--spacing-sm ',  // trailing whitespace — not a valid CSS ident
      ' --spacing-sm',  // leading whitespace
    ])('does not match %s', (name) => {
      expect(matchesSpacingPattern(name)).toBe(false)
    })
  })
})
