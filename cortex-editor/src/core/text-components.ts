/**
 * A text-component bundle requires ALL FOUR sub-properties present in @theme:
 *   --text-{name}                    → fontSize
 *   --text-{name}--line-height       → lineHeight
 *   --text-{name}--letter-spacing    → letterSpacing
 *   --text-{name}--font-weight       → fontWeight
 *
 * Partial tokens (e.g. `--text-sm: 14px` alone) are NOT bundles — the
 * Typography panel must render them as unlinked raw controls, not as a pill.
 *
 * Font-family is optional. Projects with a single family won't define it
 * per bundle; projects with multiple families can opt-in via
 * `--text-{name}--font-family`.
 */
export interface TextComponent {
  name: string
  fontSize: string
  lineHeight: string
  letterSpacing: string
  fontWeight: string
  fontFamily?: string
}

/**
 * Extract text-component bundles from a flat @theme property map.
 * Properties are produced by `extractThemeProperties` in tailwind-v4-parser.ts.
 *
 * Output is sorted by numeric font-size ascending so that picker UIs render
 * a natural small→large ordering without additional sort logic.
 */
export function extractTextComponents(properties: Map<string, string>): TextComponent[] {
  const candidates = new Map<string, Partial<TextComponent>>()

  for (const [prop, value] of properties) {
    if (!prop.startsWith('--text-')) continue
    // --text-shadow-* belongs to text-shadow utilities, never to typography bundles
    if (prop.startsWith('--text-shadow-')) continue

    const rest = prop.slice('--text-'.length)
    const dashDash = rest.indexOf('--')

    if (dashDash < 0) {
      const name = rest
      const entry = candidates.get(name) ?? {}
      entry.name = name
      entry.fontSize = value
      candidates.set(name, entry)
    } else {
      const name = rest.slice(0, dashDash)
      const sub = rest.slice(dashDash + 2)
      const entry = candidates.get(name) ?? {}
      entry.name = name
      if (sub === 'line-height') entry.lineHeight = value
      else if (sub === 'letter-spacing') entry.letterSpacing = value
      else if (sub === 'font-weight') entry.fontWeight = value
      else if (sub === 'font-family') entry.fontFamily = value
      candidates.set(name, entry)
    }
  }

  const bundles: TextComponent[] = []
  for (const entry of candidates.values()) {
    if (
      entry.name &&
      entry.fontSize !== undefined &&
      entry.lineHeight !== undefined &&
      entry.letterSpacing !== undefined &&
      entry.fontWeight !== undefined
    ) {
      bundles.push(entry as TextComponent)
    }
  }

  bundles.sort((a, b) => parseFloat(a.fontSize) - parseFloat(b.fontSize))
  return bundles
}
