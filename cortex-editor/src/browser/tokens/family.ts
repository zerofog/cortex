// Token family union — forces explicit per-call-site declarations.
// v1 only wires 'spacing'; the rest are reserved for follow-up tickets.
// Absence (omitting the prop) is the canonical "no popover" state.
export type TokenFamily = 'spacing' | 'sizing' | 'fontSize' | 'borderWidth' | 'radius'

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
