/**
 * Pure shadow parse/serialize utilities — no browser or UI dependencies.
 * Shared between TailwindResolver (normalization) and ShadowSection (editing).
 */

export interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

/**
 * Split a box-shadow string on commas, respecting parentheses in rgba() values.
 * "2px 4px 8px rgba(0, 0, 0, 0.1), inset 1px 2px 3px #000"
 * -> ["2px 4px 8px rgba(0, 0, 0, 0.1)", "inset 1px 2px 3px #000"]
 */
export function splitShadows(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

/**
 * Parse a single shadow string into a Shadow object.
 * Handles both authored format (color last) and browser computed format (color first):
 *   Authored: "2px 4px 8px 0 rgba(0, 0, 0, 0.1)"
 *   Browser:  "rgba(0, 0, 0, 0.1) 2px 4px 8px 0px"
 */
export function parseSingleShadow(raw: string): Shadow {
  let s = raw.trim()

  // Check for 'inset' keyword
  const inset = /\binset\b/i.test(s)
  if (inset) {
    s = s.replace(/\binset\b/i, '').trim()
  }

  // Extract color — try end first (authored), then start (browser computed style)
  const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/
  const colorEndMatch = s.match(new RegExp(`(${COLOR_PATTERN.source})\\s*$`))
  let color = 'rgba(0, 0, 0, 0.1)'
  if (colorEndMatch && colorEndMatch.index !== undefined) {
    color = colorEndMatch[1] ?? color
    s = s.slice(0, colorEndMatch.index).trim()
  } else {
    const colorStartMatch = s.match(new RegExp(`^(${COLOR_PATTERN.source})\\s+`))
    if (colorStartMatch) {
      color = colorStartMatch[1] ?? color
      s = s.slice(colorStartMatch[0].length).trim()
    }
  }

  // Extract numeric values from the remaining part
  const nums = s.match(/-?[\d.]+/g)?.map(Number) ?? []

  return {
    inset,
    x: nums[0] ?? 0,
    y: nums[1] ?? 0,
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    color,
  }
}

/** Parse a CSS box-shadow value into an array of Shadow objects. */
export function parseBoxShadow(value: string): Shadow[] {
  const trimmed = value.trim()
  if (trimmed === 'none' || trimmed === '') return []
  return splitShadows(trimmed).map(parseSingleShadow)
}

/** Serialize an array of Shadow objects to a CSS box-shadow string. */
export function serializeBoxShadow(shadows: Shadow[]): string {
  if (shadows.length === 0) return 'none'
  return shadows
    .map((s) => {
      const parts: string[] = []
      if (s.inset) parts.push('inset')
      parts.push(`${s.x}px`, `${s.y}px`, `${s.blur}px`, `${s.spread}px`, s.color)
      return parts.join(' ')
    })
    .join(', ')
}
