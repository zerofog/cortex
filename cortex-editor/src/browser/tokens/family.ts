// Token family union — forces explicit per-call-site declarations.
// v1 only wires 'spacing' and 'none'; other families are reserved for follow-up tickets.
export type TokenFamily = 'spacing' | 'sizing' | 'fontSize' | 'borderWidth' | 'radius' | 'none'

export interface SpacingPreset {
  readonly name: string
  readonly valuePx: number
}

// Canonical spacing scale sourced from --cx-sp-* definitions in styles.css.
// xs=4 (--cx-sp-2), sm=6 (--cx-sp-3), md=8 (--cx-sp-4), lg=12 (--cx-sp-5), xl=16 (--cx-sp-6).
// Sorted ascending by valuePx; none (0) is first.
export const SPACING_PRESETS: readonly SpacingPreset[] = [
  { name: 'none', valuePx: 0 },
  { name: 'xs', valuePx: 4 },
  { name: 'sm', valuePx: 6 },
  { name: 'md', valuePx: 8 },
  { name: 'lg', valuePx: 12 },
  { name: 'xl', valuePx: 16 },
]

// Matches CSS custom property names that look like a USER's spacing token.
// Patterns: --spacing-, --sp-, --gap-, --space- (each requires a trailing dash
// so bare --spacing / --sp etc. are rejected).
// Does NOT match cortex-editor's internal --cx-* tokens.
// Case-sensitive — CSS custom properties are case-sensitive per spec.
// Whitespace anywhere is rejected (not a valid CSS ident).
const SPACING_PATTERN = /^--(spacing|sp|gap|space)-\S*$/

export function matchesSpacingPattern(name: string): boolean {
  return SPACING_PATTERN.test(name)
}
