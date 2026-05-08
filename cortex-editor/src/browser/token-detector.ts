import type { TextComponent } from '../core/text-components.js'

export interface ColorChip {
  name: string
  hex: string
  aliases?: string[]
  source?: 'page' | 'theme'
}

/**
 * Return the text-component bundle whose `text-{name}` form appears as a
 * class in `className`, or null if none match.
 *
 * Match is Tailwind v4 utility form: a `@theme` definition of
 * `--text-body-md: ...` emits `.text-body-md`, not `.body-md`. We match the
 * compiled utility so detection aligns with the CSS rules actually applied.
 *
 * Match is token-set membership, not substring — `text-sm` does not match a
 * bundle named `sm`, and `text-body-md-alt` does not match `body-md`.
 *
 * When multiple bundles match (unsupported usage), the first in registry
 * order wins. This keeps the function deterministic for consumers that do
 * nothing special with duplicates.
 */
export function detectTextComponent(
  className: string,
  bundles: readonly TextComponent[],
): TextComponent | null {
  if (bundles.length === 0) return null
  const bundleByName = new Map(bundles.map((b) => [b.name, b]))
  const tokens = className.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    if (!token.startsWith('text-')) continue
    const name = token.slice('text-'.length)
    const bundle = bundleByName.get(name)
    if (bundle) return bundle
  }
  return null
}

/**
 * Return the color chip whose `text-{name}` form appears as a class in
 * `className`, or null if none match.
 *
 * Only `text-*` prefixes are matched here — `bg-gray-900` and
 * `border-brand-500` are out of scope because the Typography section's color
 * group controls text color specifically. Matching other prefixes would
 * confuse which section owns which class.
 */
export function detectColorChip(
  className: string,
  chips: readonly ColorChip[],
): ColorChip | null {
  if (chips.length === 0) return null
  const chipByName = new Map(chips.map((c) => [c.name, c]))
  const tokens = className.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    if (!token.startsWith('text-')) continue
    const name = token.slice('text-'.length)
    const chip = chipByName.get(name)
    if (chip) return chip
  }
  return null
}
