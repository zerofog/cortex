import { parseColor } from '../controls/ColorInput.js'

export interface FillValues {
  backgroundColor: string
  backgroundImage: string
}

/** Extract fill-related values from a CSSStyleDeclaration. */
export function parseFillValues(cs: CSSStyleDeclaration): FillValues {
  return {
    backgroundColor: cs.backgroundColor ?? 'rgba(0, 0, 0, 0)',
    backgroundImage: cs.backgroundImage ?? 'none',
  }
}

export function summarizeFill(values: FillValues): string {
  const bgImg = values.backgroundImage
  if (bgImg && bgImg !== 'none') {
    if (parseLinearGradient(bgImg)) return 'Gradient'
    return 'Image'
  }
  const { hex, alpha } = parseColor(values.backgroundColor)
  if (alpha === 0) return 'transparent'
  return alpha < 100 ? `${hex} ${alpha}%` : hex
}

/** Parse a linear-gradient CSS value into angle + color stops. */
export function parseLinearGradient(css: string): { angle: number; stops: Array<{ color: string; position: number }> } | null {
  if (!css.startsWith('linear-gradient(')) return null
  // Extract the argument list inside linear-gradient(...)
  const inner = css.slice('linear-gradient('.length, -1)
  // Split on top-level commas (not inside parentheses)
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(inner.slice(start).trim())

  if (parts.length < 2) return null

  // First part might be angle or a color stop
  let angle = 180
  let stopStart = 0
  const angleMatch = parts[0]!.match(/^(-?[\d.]+)deg$/)
  const dirMatch = parts[0]!.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?$/)
  if (angleMatch) {
    angle = parseFloat(angleMatch[1]!)
    stopStart = 1
  } else if (dirMatch) {
    const primary = dirMatch[1]!
    const secondary = dirMatch[2]
    if (!secondary) {
      const dirs: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 }
      angle = dirs[primary] ?? 180
    } else {
      const pair = new Set([primary, secondary])
      if (pair.has('top') && pair.has('right')) angle = 45
      else if (pair.has('bottom') && pair.has('right')) angle = 135
      else if (pair.has('bottom') && pair.has('left')) angle = 225
      else if (pair.has('top') && pair.has('left')) angle = 315
      else return null // contradictory (e.g. "to top bottom")
    }
    stopStart = 1
  }

  const stops: Array<{ color: string; position: number }> = []
  for (let i = stopStart; i < parts.length; i++) {
    const part = parts[i]!
    // Extract position percentage from end
    const posMatch = part.match(/([\d.]+)%\s*$/)
    const position = posMatch ? parseFloat(posMatch[1]!) : (i - stopStart) / Math.max(1, parts.length - stopStart - 1) * 100
    // Color is everything before the position
    const color = posMatch ? part.slice(0, part.length - posMatch[0]!.length).trim() : part.trim()
    stops.push({ color, position })
  }

  return stops.length >= 2 ? { angle, stops } : null
}
