/**
 * Extract Tailwind utility classes from an element's className string.
 *
 * Given "bg-red-500 pt-4 text-white flex rounded-lg", returns:
 *   { 'background-color': 'bg-red-500', 'padding-top': 'pt-4', 'color': 'text-white',
 *     'display': 'flex', 'border-radius': 'rounded-lg' }
 *
 * This enables the "direct class path": instead of reverse-engineering computed
 * CSS values back to class names, we read the class directly from the DOM.
 */

// ── Static keyword utilities (exact class → property) ───────────────

const STATIC_CLASSES: Record<string, string> = {
  // display
  'block': 'display', 'flex': 'display', 'grid': 'display',
  'inline': 'display', 'inline-flex': 'display', 'inline-grid': 'display',
  'inline-block': 'display', 'hidden': 'display',
  // visibility
  'visible': 'visibility', 'invisible': 'visibility',
  // flex-direction
  'flex-row': 'flex-direction', 'flex-row-reverse': 'flex-direction',
  'flex-col': 'flex-direction', 'flex-col-reverse': 'flex-direction',
  // justify-content
  'justify-start': 'justify-content', 'justify-center': 'justify-content',
  'justify-end': 'justify-content', 'justify-between': 'justify-content',
  'justify-around': 'justify-content', 'justify-evenly': 'justify-content',
  // align-items
  'items-start': 'align-items', 'items-center': 'align-items',
  'items-end': 'align-items', 'items-stretch': 'align-items',
  'items-baseline': 'align-items',
  // text-align
  'text-left': 'text-align', 'text-center': 'text-align',
  'text-right': 'text-align', 'text-justify': 'text-align',
  // border-style
  'border-solid': 'border-style', 'border-dashed': 'border-style',
  'border-dotted': 'border-style', 'border-double': 'border-style',
  'border-none': 'border-style',
  // overflow
  'overflow-visible': 'overflow', 'overflow-hidden': 'overflow',
  'overflow-scroll': 'overflow', 'overflow-auto': 'overflow',
  // cursor
  'cursor-auto': 'cursor', 'cursor-default': 'cursor', 'cursor-pointer': 'cursor',
  'cursor-text': 'cursor', 'cursor-move': 'cursor', 'cursor-grab': 'cursor',
  'cursor-not-allowed': 'cursor', 'cursor-crosshair': 'cursor', 'cursor-none': 'cursor',
}

// ── Prefix-based utilities (prefix-{value} → property) ──────────────
// Ordered longest-first so "gap-x-" matches before "gap-"

const PREFIX_RULES: Array<{ prefix: string; property: string; isColor?: boolean }> = [
  // Spacing — unambiguous prefixes
  { prefix: 'pt-', property: 'padding-top' },
  { prefix: 'pr-', property: 'padding-right' },
  { prefix: 'pb-', property: 'padding-bottom' },
  { prefix: 'pl-', property: 'padding-left' },
  { prefix: 'mt-', property: 'margin-top' },
  { prefix: 'mr-', property: 'margin-right' },
  { prefix: 'mb-', property: 'margin-bottom' },
  { prefix: 'ml-', property: 'margin-left' },
  { prefix: 'gap-x-', property: 'column-gap' },
  { prefix: 'gap-y-', property: 'row-gap' },
  { prefix: 'gap-', property: 'gap' },
  { prefix: 'w-', property: 'width' },
  { prefix: 'h-', property: 'height' },
  { prefix: 'min-w-', property: 'min-width' },
  { prefix: 'min-h-', property: 'min-height' },
  { prefix: 'max-w-', property: 'max-width' },
  { prefix: 'max-h-', property: 'max-height' },
  // Shorthand padding/margin — EXCLUDED from direct class path.
  // Replacing px-4 with pl-N silently drops padding-right. Let the
  // legacy resolver path handle shorthands safely.
  // (px-, py-, p-, mx-, my-, m- are NOT listed here)

  // Colors — unambiguous prefixes
  // NOTE: bg-clip-*, bg-opacity-*, bg-gradient-*, bg-no-repeat, etc. are
  // handled by the exclusion set in extractUtilities, not here.
  { prefix: 'bg-', property: 'background-color', isColor: true },

  // Typography — font- is handled by resolveAmbiguous (not here) because
  // font-sans/font-mono are font-family, not font-weight.
  { prefix: 'leading-', property: 'line-height' },

  // Border radius — longest-first, individual corners only
  { prefix: 'rounded-tl-', property: 'border-top-left-radius' },
  { prefix: 'rounded-tr-', property: 'border-top-right-radius' },
  { prefix: 'rounded-br-', property: 'border-bottom-right-radius' },
  { prefix: 'rounded-bl-', property: 'border-bottom-left-radius' },

  // Opacity
  { prefix: 'opacity-', property: 'opacity' },

  // Effects
  { prefix: 'shadow-', property: 'box-shadow' },
  { prefix: 'backdrop-blur-', property: 'backdrop-filter' },
  { prefix: 'blur-', property: 'filter' },
]

// Prefixes of bg-* classes that are NOT background-color.
// Checked via token.startsWith() to handle multi-segment names like bg-no-repeat.
const BG_NON_COLOR_PREFIXES = [
  'bg-opacity', 'bg-clip', 'bg-gradient', 'bg-no-repeat', 'bg-repeat',
  'bg-cover', 'bg-contain', 'bg-center', 'bg-bottom', 'bg-top',
  'bg-left', 'bg-right', 'bg-fixed', 'bg-local', 'bg-scroll',
  'bg-origin', 'bg-blend', 'bg-none',
]

// Prefixes of border-* classes that are NOT border-color or border-width.
const BORDER_NON_STYLE_PREFIXES = [
  'border-opacity', 'border-collapse', 'border-separate', 'border-spacing',
  'border-x', 'border-y',
]


// Known font-size scale keys (to disambiguate text-{size} from text-{color})
const FONT_SIZE_KEYS = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
])

// Known font-weight keys (to disambiguate font-{weight} from font-{family})
const FONT_WEIGHT_KEYS = new Set([
  'thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black',
])

/**
 * Disambiguate classes with shared prefixes.
 *
 * "text-lg" → font-size, "text-red-500" → color
 * "border-2" → border-width, "border-red-500" → border-color, "border-solid" → border-style
 * "rounded" → border-radius (bare prefix, defaultBare)
 */
function resolveAmbiguous(token: string): { property: string; className: string } | null {
  // text-{suffix}: font-size if suffix is a known size key, color otherwise
  if (token.startsWith('text-')) {
    const suffix = token.slice(5)
    if (FONT_SIZE_KEYS.has(suffix)) return { property: 'font-size', className: token }
    if (suffix === 'left' || suffix === 'center' || suffix === 'right' || suffix === 'justify') {
      return null // handled by STATIC_CLASSES
    }
    return { property: 'color', className: token }
  }

  // border-{suffix}: width if numeric/keyword, color if color-like, style handled by static
  if (token.startsWith('border-') && !token.startsWith('border-t-') && !token.startsWith('border-b-')
    && !token.startsWith('border-l-') && !token.startsWith('border-r-')) {
    const suffix = token.slice(7)
    // Already in STATIC_CLASSES (border-solid, etc.)
    if (STATIC_CLASSES[token]) return null
    // Skip non-style/non-color border utilities (border-x-2, border-collapse, etc.)
    if (BORDER_NON_STYLE_PREFIXES.some(p => token.startsWith(p))) return null
    // Numeric suffix → border-width
    if (/^\d+$/.test(suffix)) return { property: 'border-width', className: token }
    // Color-like suffix → border-color
    return { property: 'border-color', className: token }
  }

  // font-{suffix}: weight if known weight key
  if (token.startsWith('font-')) {
    const suffix = token.slice(5)
    if (FONT_WEIGHT_KEYS.has(suffix)) return { property: 'font-weight', className: token }
    return null // font-sans, font-mono → not editable properties
  }

  // rounded/rounded-{suffix}: border-radius (exclude multi-corner shorthands like rounded-l-lg, rounded-r-lg)
  if (token === 'rounded') return { property: 'border-radius', className: token }
  if (token.startsWith('rounded-')
    && !token.startsWith('rounded-t-') && !token.startsWith('rounded-b-')
    && !token.startsWith('rounded-l-') && !token.startsWith('rounded-r-')
    && !token.startsWith('rounded-tl-') && !token.startsWith('rounded-tr-')
    && !token.startsWith('rounded-bl-') && !token.startsWith('rounded-br-')) {
    return { property: 'border-radius', className: token }
  }

  // blur (bare) / shadow (bare)
  if (token === 'blur') return { property: 'filter', className: token }
  if (token === 'shadow') return { property: 'box-shadow', className: token }
  if (token === 'border') return { property: 'border-width', className: token }

  return null
}

/**
 * Extract Tailwind utility classes from a className string.
 * Returns a map of CSS property → Tailwind class name.
 *
 * Only extracts base utilities (no responsive/state variants).
 * First match per property wins (leftmost class in the string).
 */
export function extractUtilities(className: string): Map<string, string> {
  const result = new Map<string, string>()
  const tokens = className.split(/\s+/).filter(Boolean)

  for (const token of tokens) {
    // Skip responsive/state variants (md:, hover:, dark:, etc.)
    if (token.includes(':')) continue

    // 1. Check static class map (exact match)
    const staticProp = STATIC_CLASSES[token]
    if (staticProp && !result.has(staticProp)) {
      result.set(staticProp, token)
      continue
    }

    // 2. Check prefix rules (longest match first)
    //    Skip known non-color/non-value prefixes that share the same start
    let matched = false
    for (const rule of PREFIX_RULES) {
      if (!token.startsWith(rule.prefix) || result.has(rule.property)) continue
      // Filter bg-{non-color} classes (bg-clip-text, bg-no-repeat, bg-opacity-50, etc.)
      if (rule.prefix === 'bg-' && BG_NON_COLOR_PREFIXES.some(p => token.startsWith(p))) continue
      result.set(rule.property, token)
      matched = true
      break
    }
    if (matched) continue

    // 3. Handle ambiguous prefixes (text-, border-, font-, rounded, etc.)
    const ambig = resolveAmbiguous(token)
    if (ambig && !result.has(ambig.property)) {
      result.set(ambig.property, ambig.className)
    }
  }

  return result
}
