// Token family union — forces explicit per-call-site declarations.
// v1 only wires 'spacing'; the rest are reserved for follow-up tickets.
// Absence (omitting the prop) is the canonical "no popover" state.
export type TokenFamily = 'spacing' | 'sizing' | 'fontSize' | 'borderWidth' | 'radius'

export interface SpacingPreset {
  readonly name: string
  readonly valuePx: number
}

// Numeric values mirror --cx-sp-2 through --cx-sp-6 in styles.css — keep in sync.
export const SPACING_PRESETS: readonly SpacingPreset[] = [
  { name: 'none', valuePx: 0 },
  { name: 'xs', valuePx: 4 },
  { name: 'sm', valuePx: 6 },
  { name: 'md', valuePx: 8 },
  { name: 'lg', valuePx: 12 },
  { name: 'xl', valuePx: 16 },
]

// Matches CSS custom property names that look like a USER's spacing token.
// Patterns: --spacing-, --sp-, --gap-, --space- — each requires a trailing dash
// so bare --spacing / --sp / --gap / --space are rejected. The suffix may be
// empty (--spacing- matches) since the dash is the namespace marker, not a
// separator before a required suffix.
// Does NOT match cortex-editor's internal --cx-* tokens.
// Case-sensitive — CSS custom properties are case-sensitive per spec.
// Whitespace anywhere is rejected (not a valid CSS ident).
const SPACING_PATTERN = /^--(spacing|sp|gap|space)-\S*$/

export function matchesSpacingPattern(name: string): boolean {
  return SPACING_PATTERN.test(name)
}
