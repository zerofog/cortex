/**
 * Shared types and helpers for Panel v2 section components.
 *
 * Every section emits the same change payload shape through its
 * onChange / onScrub / onScrubEnd callbacks. Panel.tsx routes all
 * of them through a single `applyOverride(property, value, commit)`
 * bottleneck — the section-specific aliases exist purely for
 * documentation, not for type narrowing.
 */

/** CSS property change emitted by any section or sub-control. */
export interface SectionChange {
  property: string
  value: string
}

/**
 * Returns true when ANY of the given CSS properties appear in
 * the dimmed set (properties that changed in the current forced
 * interaction state vs the element's default state).
 *
 * Usage in sections:
 * ```
 * const dimmed = isDimmed(dimmedProperties, 'opacity', 'visibility')
 * <div class={`cortex-row${dimmed ? ' cortex-control--dimmed' : ''}`}>
 * ```
 */
export function isDimmed(
  dimmedProperties: Set<string> | undefined,
  ...props: string[]
): boolean {
  if (!dimmedProperties) return false
  return props.some(p => dimmedProperties.has(p))
}
