import { describe, expect, it } from 'vitest'
import { matchesSpacingPattern } from '../../../src/browser/tokens/family'

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
