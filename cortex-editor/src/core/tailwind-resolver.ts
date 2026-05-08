/**
 * Maps CSS property + computed value → Tailwind class name.
 *
 * At startup, inverts the resolved Tailwind theme into a lookup table:
 *   CSS property → normalized CSS value → Tailwind class
 *
 * This powers deterministic editing: when the user changes padding-top
 * from 8px to 16px, the resolver finds pt-2 → pt-4 without AI.
 *
 * Each property mapping declares two normalizers:
 *   - themeNormalizer: converts raw theme values during invertTheme
 *   - cssNormalizer: converts browser computed values during findClass
 * This handles format differences (e.g., theme stores '8px', browser sends 'blur(8px)').
 */

import { parseBoxShadow, serializeBoxShadow } from './shadow-utils.js'

/**
 * A spacing token resolved from Tailwind v3, v4, or plain CSS variables.
 * Used to populate the spacing preset popover in the Cortex panel.
 */
export interface SpacingToken {
  readonly name: string     // e.g. '--spacing-sm', '--sp-4', '--gap-lg'
  readonly valuePx: number  // resolved px value
  readonly source: 'tailwind-v3' | 'tailwind-v4' | 'css-variable'
}

/** Minimal shape of a resolved Tailwind theme (from resolveConfig) */
export interface ResolvedTheme {
  spacing?: Record<string, string>
  fontSize?: Record<string, string | [string, Record<string, string>]>
  colors?: Record<string, string | Record<string, string>>
  fontWeight?: Record<string, string>
  lineHeight?: Record<string, string>
  borderWidth?: Record<string, string>
  borderRadius?: Record<string, string>
  opacity?: Record<string, string>
  blur?: Record<string, string>
  backdropBlur?: Record<string, string>
  boxShadow?: Record<string, string>
}

type ThemeKey = keyof ResolvedTheme
type ValueNormalizer = 'toPx' | 'identity' | 'normalizeHex' | 'rgbToHex' | 'extractBlur' | 'normalizeShadow'

/** CSS property → Tailwind utility prefix mapping with normalization strategy */
interface UtilityMapping {
  themeKey: ThemeKey
  prefix: string
  themeNormalizer: ValueNormalizer
  cssNormalizer: ValueNormalizer
  nested?: boolean       // flatten color families (e.g., red.500 → red-500)
  defaultBare?: boolean  // DEFAULT key → prefix alone (e.g., 'rounded' not 'rounded-DEFAULT')
}

/** Options for configuring the TailwindResolver. */
export interface ResolverOptions {
  /** Root font size in px. Defaults to 16. */
  remPx?: number
}

/**
 * Static mapping from CSS properties to Tailwind utility info.
 * Each entry maps a CSS property to its theme key, class prefix, and
 * normalization strategy for both theme values and CSS computed values.
 */
const UTILITY_MAP: Record<string, UtilityMapping> = {
  // Spacing
  'padding-top':    { themeKey: 'spacing', prefix: 'pt', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'padding-right':  { themeKey: 'spacing', prefix: 'pr', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'padding-bottom': { themeKey: 'spacing', prefix: 'pb', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'padding-left':   { themeKey: 'spacing', prefix: 'pl', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'margin-top':     { themeKey: 'spacing', prefix: 'mt', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'margin-right':   { themeKey: 'spacing', prefix: 'mr', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'margin-bottom':  { themeKey: 'spacing', prefix: 'mb', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'margin-left':    { themeKey: 'spacing', prefix: 'ml', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'gap':            { themeKey: 'spacing', prefix: 'gap', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'row-gap':        { themeKey: 'spacing', prefix: 'gap-y', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'column-gap':     { themeKey: 'spacing', prefix: 'gap-x', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'width':          { themeKey: 'spacing', prefix: 'w', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'height':         { themeKey: 'spacing', prefix: 'h', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'min-width':      { themeKey: 'spacing', prefix: 'min-w', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'min-height':     { themeKey: 'spacing', prefix: 'min-h', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'max-width':      { themeKey: 'spacing', prefix: 'max-w', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'max-height':     { themeKey: 'spacing', prefix: 'max-h', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'font-size':      { themeKey: 'fontSize', prefix: 'text', themeNormalizer: 'toPx', cssNormalizer: 'toPx' },
  'font-weight':    { themeKey: 'fontWeight', prefix: 'font', themeNormalizer: 'identity', cssNormalizer: 'identity' },
  'line-height':    { themeKey: 'lineHeight', prefix: 'leading', themeNormalizer: 'identity', cssNormalizer: 'identity' },

  // Colors
  'background-color': { themeKey: 'colors', prefix: 'bg', themeNormalizer: 'normalizeHex', cssNormalizer: 'rgbToHex', nested: true },
  'border-color':     { themeKey: 'colors', prefix: 'border', themeNormalizer: 'normalizeHex', cssNormalizer: 'rgbToHex', nested: true },
  'color':            { themeKey: 'colors', prefix: 'text', themeNormalizer: 'normalizeHex', cssNormalizer: 'rgbToHex', nested: true },

  // Border width + radius (DEFAULT → bare prefix)
  'border-width':               { themeKey: 'borderWidth', prefix: 'border', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },
  'border-radius':              { themeKey: 'borderRadius', prefix: 'rounded', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },
  'border-top-left-radius':     { themeKey: 'borderRadius', prefix: 'rounded-tl', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },
  'border-top-right-radius':    { themeKey: 'borderRadius', prefix: 'rounded-tr', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },
  'border-bottom-right-radius': { themeKey: 'borderRadius', prefix: 'rounded-br', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },
  'border-bottom-left-radius':  { themeKey: 'borderRadius', prefix: 'rounded-bl', themeNormalizer: 'toPx', cssNormalizer: 'toPx', defaultBare: true },

  // Opacity (decimal pass-through)
  'opacity': { themeKey: 'opacity', prefix: 'opacity', themeNormalizer: 'identity', cssNormalizer: 'identity' },

  // Filter / backdrop-filter (theme: '8px', browser: 'blur(8px)')
  'filter':          { themeKey: 'blur', prefix: 'blur', themeNormalizer: 'toPx', cssNormalizer: 'extractBlur', defaultBare: true },
  'backdrop-filter': { themeKey: 'backdropBlur', prefix: 'backdrop-blur', themeNormalizer: 'toPx', cssNormalizer: 'extractBlur', defaultBare: true },

  // Box-shadow (whitespace-normalized exact match)
  'box-shadow': { themeKey: 'boxShadow', prefix: 'shadow', themeNormalizer: 'normalizeShadow', cssNormalizer: 'normalizeShadow', defaultBare: true },
}

/**
 * Static utilities with no theme scale — keyword → class mappings.
 * Loaded into the lookup table during invertTheme so findClass and
 * getSnapPoints work without special casing.
 */
const STATIC_MAP: Record<string, Record<string, string>> = {
  'display': {
    'block': 'block', 'flex': 'flex', 'grid': 'grid',
    'inline': 'inline', 'inline-flex': 'inline-flex', 'inline-grid': 'inline-grid',
    'inline-block': 'inline-block', 'none': 'hidden',
  },
  'visibility': { 'visible': 'visible', 'hidden': 'invisible' },
  'flex-direction': {
    'row': 'flex-row', 'row-reverse': 'flex-row-reverse',
    'column': 'flex-col', 'column-reverse': 'flex-col-reverse',
  },
  'justify-content': {
    'flex-start': 'justify-start', 'center': 'justify-center', 'flex-end': 'justify-end',
    'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
  },
  'align-items': {
    'flex-start': 'items-start', 'center': 'items-center', 'flex-end': 'items-end',
    'stretch': 'items-stretch', 'baseline': 'items-baseline',
  },
  'text-align': { 'left': 'text-left', 'center': 'text-center', 'right': 'text-right', 'justify': 'text-justify' },
  'border-style': {
    'solid': 'border-solid', 'dashed': 'border-dashed', 'dotted': 'border-dotted',
    'double': 'border-double', 'none': 'border-none',
  },
  'overflow': {
    'visible': 'overflow-visible', 'hidden': 'overflow-hidden',
    'scroll': 'overflow-scroll', 'auto': 'overflow-auto',
  },
  'cursor': {
    'auto': 'cursor-auto', 'default': 'cursor-default', 'pointer': 'cursor-pointer',
    'text': 'cursor-text', 'move': 'cursor-move', 'grab': 'cursor-grab',
    'not-allowed': 'cursor-not-allowed', 'crosshair': 'cursor-crosshair', 'none': 'cursor-none',
  },
}

// ── Normalizer functions ─────────────────────────────────────────────

/** Convert a CSS value with units to px. Returns null if not convertible. */
function toPx(value: string, remPx: number): string | null {
  if (value.endsWith('px')) return value
  if (value.endsWith('rem')) {
    const num = parseFloat(value)
    if (Number.isNaN(num)) return null
    return `${num * remPx}px`
  }
  if (value === '0') return '0px'
  return null
}

/** Pass-through — returns value as-is. */
function identity(value: string): string | null {
  return value
}

/** Normalize hex to canonical 6-digit lowercase form. Handles #rgb, #rrggbb, #rgba, #rrggbbaa. */
export function normalizeHex(value: string): string | null {
  // 6-digit hex → lowercase
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  // 3-digit short hex → expand (#abc → #aabbcc)
  const short = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (short) {
    const [, r, g, b] = short
    return `#${r!}${r!}${g!}${g!}${b!}${b!}`.toLowerCase()
  }
  // 8-digit hex with alpha → strip alpha, keep RGB
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7).toLowerCase()
  // 4-digit short hex with alpha → expand and strip alpha
  const short4 = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])[0-9a-fA-F]$/)
  if (short4) {
    const [, r, g, b] = short4
    return `#${r!}${r!}${g!}${g!}${b!}${b!}`.toLowerCase()
  }
  return null // reject 5/7-digit and other invalid formats
}

/** Convert rgb(R,G,B) or hex to lowercase 6-digit hex. Returns null for alpha < 1. */
export function rgbToHex(value: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/i.test(value)) return value.toLowerCase()
  // Short hex (#abc → #aabbcc)
  const shortMatch = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/i)
  if (shortMatch) {
    const [, r, g, b] = shortMatch
    return `#${r!}${r!}${g!}${g!}${b!}${b!}`.toLowerCase()
  }
  // rgb/rgba with integer or decimal channels
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/)
  if (!m) return null
  // Reject alpha < 1 (Tailwind separates color from opacity)
  if (m[4] !== undefined) {
    const alpha = Number(m[4])
    if (alpha < 1) return null
  }
  const r = Math.round(Number(m[1]))
  const g = Math.round(Number(m[2]))
  const b = Math.round(Number(m[3]))
  if (r > 255 || g > 255 || b > 255) return null
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/** Extract blur value from filter string, then convert to px. */
function extractBlur(value: string, remPx: number): string | null {
  const m = value.match(/blur\(([^)]+)\)/)
  if (!m) return null
  return toPx(m[1]!, remPx)
}

/** Parse→serialize round-trip for canonical box-shadow comparison. */
function normalizeShadow(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'none') return 'none'
  const parsed = parseBoxShadow(value)
  if (parsed.length === 0) return null
  return serializeBoxShadow(parsed).toLowerCase()
}

/** Dispatch to the appropriate normalizer function. */
function applyNormalizer(normalizer: ValueNormalizer, value: string, remPx: number): string | null {
  switch (normalizer) {
    case 'toPx': return toPx(value, remPx)
    case 'identity': return identity(value)
    case 'normalizeHex': return normalizeHex(value)
    case 'rgbToHex': return rgbToHex(value)
    case 'extractBlur': return extractBlur(value, remPx)
    case 'normalizeShadow': return normalizeShadow(value)
  }
}

/**
 * Flatten a resolved Tailwind colors object into an array of hex strings.
 * Picks shade-500 as the representative for each color family,
 * includes flat custom colors, and skips non-color values.
 * All values normalized to lowercase 6-digit hex and de-duplicated.
 */
export function flattenColors(colors: Record<string, unknown>): string[] {
  const HEX = /^#[0-9a-fA-F]{3,8}$/
  const result: string[] = []
  const seen = new Set<string>()

  function addColor(raw: string): void {
    const normalized = normalizeHex(raw)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }

  for (const [key, value] of Object.entries(colors)) {
    // Skip special values
    if (key === 'inherit' || key === 'current' || key === 'transparent') continue

    if (typeof value === 'string') {
      // Flat color (e.g., brand: '#1a73e8')
      if (HEX.test(value)) addColor(value)
    } else if (value && typeof value === 'object') {
      // Color family (e.g., red: { 50: '...', 500: '...', 900: '...' })
      const shades = value as Record<string, unknown>
      // Prefer 500 shade, fall back to first available
      const representative = shades['500'] ?? shades['DEFAULT'] ?? Object.values(shades).find(v => typeof v === 'string' && HEX.test(v))
      if (typeof representative === 'string' && HEX.test(representative)) {
        addColor(representative)
      }
    }
  }

  return result
}

export class TailwindResolver {
  private lookup = new Map<string, Map<string, string>>()
  private snapCache = new Map<string, readonly string[]>()
  private static readonly EMPTY_FROZEN: readonly string[] = Object.freeze([] as string[])
  private readonly remPx: number

  private constructor(remPx: number = 16) {
    this.remPx = remPx
  }

  /**
   * Create a resolver from an already-resolved Tailwind theme object.
   * Use this in tests or when you already have the resolved config.
   */
  static fromTheme(theme: ResolvedTheme, options?: ResolverOptions): TailwindResolver {
    const resolver = new TailwindResolver(options?.remPx ?? 16)
    resolver.invertTheme(theme)
    return resolver
  }

  /**
   * Create a resolver by loading and resolving the project's tailwind config.
   * Tries v3 first (resolveConfig + config file), then falls back to v4 parser.
   * Returns null if tailwindcss is not installed and no v4 CSS found.
   */
  static async fromConfig(projectRoot: string, options?: ResolverOptions): Promise<TailwindResolver | null> {
    const { isAbsolute } = await import('path')
    if (!isAbsolute(projectRoot)) {
      throw new Error(`projectRoot must be an absolute path, got: ${projectRoot}`)
    }

    // Try v3 first (resolveConfig + config file)
    const v3Result = await TailwindResolver.tryV3(projectRoot, options)
    if (v3Result) return v3Result

    // Fall back to v4 parser (@theme blocks in CSS)
    const { parseV4Theme } = await import('./tailwind-v4-parser.js')
    const v4Theme = await parseV4Theme(projectRoot)
    if (v4Theme) return TailwindResolver.fromTheme(v4Theme, options)

    return null
  }

  private static async tryV3(projectRoot: string, options?: ResolverOptions): Promise<TailwindResolver | null> {
    let resolveConfig: (config: unknown) => { theme?: ResolvedTheme }
    try {
      // @ts-expect-error — tailwindcss v3 API; v4 removed this export
      const mod = await import('tailwindcss/resolveConfig')
      resolveConfig = mod.default
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code
        // ERR_MODULE_NOT_FOUND: tailwindcss not installed
        // ERR_PACKAGE_PATH_NOT_EXPORTED: tailwindcss v4 (removed resolveConfig export)
        if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
          return null
        }
      }
      throw err
    }

    const config = await TailwindResolver.loadConfig(projectRoot)
    if (!config) return null
    const resolved = resolveConfig(config)
    return TailwindResolver.fromTheme(resolved.theme ?? {}, options)
  }

  private static async loadConfig(projectRoot: string): Promise<Record<string, unknown> | null> {
    const { join } = await import('path')

    const configNames = [
      'tailwind.config.ts',
      'tailwind.config.js',
      'tailwind.config.mjs',
      'tailwind.config.cjs',
    ]

    for (const name of configNames) {
      try {
        const configPath = join(projectRoot, name)
        const mod = await import(configPath)
        return mod.default ?? mod
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_MODULE_NOT_FOUND') {
          continue // file doesn't exist, try next
        }
        throw err // file exists but is broken — surface the error
      }
    }
    return null
  }

  /**
   * Resolve color swatches from the project's Tailwind config.
   * Returns representative hex colors (shade 500 per family + flat customs).
   * Tries v3 first, then falls back to v4 parser.
   * Returns null if tailwindcss is not installed and no v4 CSS found.
   */
  static async resolveColors(projectRoot: string): Promise<string[] | null> {
    // Try v3 first
    const v3Colors = await TailwindResolver.tryV3Colors(projectRoot)
    if (v3Colors) return v3Colors

    // Fall back to v4 parser
    const { parseV4Theme } = await import('./tailwind-v4-parser.js')
    const v4Theme = await parseV4Theme(projectRoot)
    if (v4Theme?.colors && typeof v4Theme.colors === 'object') {
      return flattenColors(v4Theme.colors as Record<string, unknown>)
    }

    return null
  }

  /**
   * Resolve text-component bundles from the project's Tailwind v4 @theme.
   *
   * A "bundle" is a token with ALL FOUR sub-properties present for the same
   * name (font-size, line-height, letter-spacing, font-weight). Partial
   * tokens are silently omitted — the panel renders them as unlinked raw
   * controls, not as a typography pill.
   *
   * This reads only the user's @theme — it deliberately ignores Tailwind's
   * default --text-* entries, so bundle membership is always an explicit,
   * design-system-scoped decision.
   *
   * Returns null when no Tailwind v4 entry CSS is found (same contract as
   * resolveColors' v4 fallback path).
   */
  static async resolveTextComponents(
    projectRoot: string,
  ): Promise<import('./text-components.js').TextComponent[] | null> {
    const { findV4EntryCSS, extractThemeProperties } = await import('./tailwind-v4-parser.js')
    const { extractTextComponents } = await import('./text-components.js')
    const userCSS = await findV4EntryCSS(projectRoot)
    if (!userCSS) return null
    const properties = extractThemeProperties(userCSS)
    return extractTextComponents(properties)
  }

  /**
   * Resolve named design-system color chips from the project's Tailwind v4
   * theme. Returns `[{ name: 'brand-500', hex: '#3b82f6' }, ...]` — names
   * are the token identifier stripped of `--color-`, hex is the browser-
   * ready value after OKLCH/rgb normalization.
   *
   * Unlike resolveColors (which flattens to hex[]), this keeps the name so
   * the UI can render "text-gray-900" in linked pills and pickers rather
   * than bare hex strings.
   *
   * Returns null when no Tailwind v4 entry CSS is found.
   */
  static async resolveColorChips(
    projectRoot: string,
  ): Promise<Array<{ name: string; hex: string }> | null> {
    const { findV4EntryCSS, parseV4Theme } = await import('./tailwind-v4-parser.js')
    const userCSS = await findV4EntryCSS(projectRoot)
    if (!userCSS) return null

    const theme = await parseV4Theme(projectRoot)
    if (!theme) return []

    const chips: Array<{ name: string; hex: string }> = []

    const flatten = (obj: Record<string, unknown>, prefix: string): void => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          chips.push({ name: prefix ? `${prefix}-${key}` : key, hex: val })
        } else if (val && typeof val === 'object') {
          flatten(val as Record<string, unknown>, prefix ? `${prefix}-${key}` : key)
        }
      }
    }
    if (theme.colors && typeof theme.colors === 'object') {
      flatten(theme.colors as Record<string, unknown>, '')
    }

    return chips
  }

  /**
   * Resolve spacing tokens from the project's design system.
   *
   * Combines three sources in priority order:
   *   tailwind-v4 > tailwind-v3 > css-variable
   *
   * Deduplication: name uniqueness across sources — first-seen wins, so a
   * `--spacing-md` defined in v4 hides any same-named entry from v3 or CSS.
   * Same-value tokens with different names are NOT collapsed; designers can
   * pick by semantic name in the popover.
   *
   * Returns null when all three sources yield nothing (same shape as the other
   * resolvers — callers treat null as "no spacing data available").
   */
  static async resolveSpacingTokens(projectRoot: string): Promise<SpacingToken[] | null> {
    const { isAbsolute } = await import('path')
    if (!isAbsolute(projectRoot)) {
      throw new Error(`projectRoot must be an absolute path, got: ${projectRoot}`)
    }

    // Detect the user's actual root font-size before resolving rem-based tokens.
    // Default 16px is wrong for projects using `html { font-size: 62.5% }` (the
    // popular 1rem=10px convention) or any other custom root size. Without this,
    // the popover's "16px" label for a `--spacing-md: 1rem` token would be off
    // from the actual rendered value (Codex /review P1 #1).
    const detectedRemPx = await TailwindResolver.detectRootFontSize(projectRoot)

    const tokens: SpacingToken[] = []
    const seenNames = new Set<string>()
    // Wire schema bounds spacingTokens to .max(500); cap at the resolver too so
    // a 501+ token project doesn't silently fail schema validation downstream.
    const MAX_TOKENS = 500
    let truncationWarned = false

    // Helper to add a token only if the name hasn't been seen yet AND the value
    // is finite + non-negative. parseFloat('Infinitypx') returns Infinity, which
    // bypasses Number.isNaN; explicit isFinite + ≥0 gate before addToken catches
    // malformed source values like `--spacing-bomb: Infinitypx` or `-1rem`.
    function addToken(token: SpacingToken): void {
      if (!Number.isFinite(token.valuePx) || token.valuePx < 0) return
      if (seenNames.has(token.name)) return
      if (tokens.length >= MAX_TOKENS) {
        if (!truncationWarned) {
          console.warn(`[cortex] spacing-token resolver capped at ${MAX_TOKENS} entries — additional tokens dropped. Reduce your design system or file a follow-up ticket if you need more.`)
          truncationWarned = true
        }
        return
      }
      seenNames.add(token.name)
      tokens.push(token)
    }

    // ── Source 1: Tailwind v4 ───────────────────────────────────────────────
    // Reuse parseV4Theme so the canonical singular `--spacing: <base>` case
    // (which generates the full multiplier scale) is captured the same way
    // resolveColors / resolveTextComponents read the v4 theme. parseV4Theme
    // returns a flat `theme.spacing` map already merged from defaults +
    // user @theme blocks; symmetric with the v3 branch below.
    try {
      const { parseV4Theme } = await import('./tailwind-v4-parser.js')
      const v4Theme = await parseV4Theme(projectRoot)
      const v4Spacing = v4Theme?.spacing
      if (v4Spacing && typeof v4Spacing === 'object') {
        for (const [key, value] of Object.entries(v4Spacing)) {
          const name = `--spacing-${key}`
          if (name.startsWith('--cx-')) continue
          const px = TailwindResolver.parseToPx(value, detectedRemPx)
          if (px === null) continue
          addToken({ name, valuePx: px, source: 'tailwind-v4' })
        }
      }
    } catch {
      // v4 not available — fall through
    }

    // ── Source 2: Tailwind v3 ───────────────────────────────────────────────
    // Use resolveConfig + theme.spacing to extract the spacing scale.
    try {
      // @ts-expect-error — tailwindcss v3 API; v4 removed this export
      const mod = await import('tailwindcss/resolveConfig')
      const resolveConfig: (config: unknown) => { theme?: { spacing?: Record<string, string> } } = mod.default
      const config = await TailwindResolver.loadConfig(projectRoot)
      if (config) {
        const resolved = resolveConfig(config)
        const spacing = resolved.theme?.spacing
        if (spacing && typeof spacing === 'object') {
          for (const [key, value] of Object.entries(spacing)) {
            // v3 default theme always carries DEFAULT (alias for the base step) and
            // sometimes px (literal '1px'). Neither belongs in the popover — they
            // duplicate the canonical chip set without adding signal.
            if (key === 'DEFAULT' || key === 'px') continue
            const name = `--spacing-${key}`
            if (name.startsWith('--cx-')) continue
            const px = TailwindResolver.parseToPx(value, detectedRemPx)
            if (px === null) continue
            addToken({ name, valuePx: px, source: 'tailwind-v3' })
          }
        }
      }
    } catch (err: unknown) {
      // Expected codes when tailwindcss isn't installed or only v4 is present:
      //   ERR_MODULE_NOT_FOUND  — ESM resolver, package missing
      //   MODULE_NOT_FOUND      — CJS resolver fallback (legacy / older Node)
      //   ERR_PACKAGE_PATH_NOT_EXPORTED — tailwindcss v4 has no resolveConfig export
      const expected = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'])
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code
        if (!expected.has(code)) {
          throw err
        }
      }
      // fall through
    }

    // ── Source 3: Plain CSS variables ──────────────────────────────────────
    // Scan *.css files under projectRoot (excluding node_modules/dist/.git/build).
    // Extract custom properties matching ^--(spacing|sp|gap|space)- from :root rules.
    try {
      const { readdir, readFile, stat, realpath } = await import('node:fs/promises')
      const { join, sep } = await import('node:path')
      const postcss = (await import('postcss')).default

      // Path-segment exclusions — matched via split(sep).includes() so a segment
      // anywhere in the relative path is rejected (root-level node_modules/foo
      // AND nested packages/x/node_modules/foo). Per cortex CLAUDE.md "Lexer &
      // Scanner Code Rules §6", segment matching beats bare substring includes.
      const EXCLUDED_SEGS = ['node_modules', 'dist', '.git', 'build']
      const MAX_CSS_FILE_BYTES = 1_048_576 // 1MB — guards against generated CSS bundles stalling the handshake

      // Resolve the project root through symlinks once; per-file realpath check
      // below uses this as the containment anchor. Mirrors the canonical
      // requireRealpathInsideRoot helper at adapters/vite.ts:180 — same security
      // contract, inlined here to avoid a circular dep on the Vite plugin module.
      let realProjectRoot: string
      try {
        realProjectRoot = await realpath(projectRoot)
      } catch {
        realProjectRoot = projectRoot
      }

      let entries: string[]
      try {
        entries = await readdir(projectRoot, { recursive: true }) as string[]
      } catch {
        entries = []
      }

      let cssFiles = entries.filter(e =>
        e.endsWith('.css') && !e.split(sep).some(seg => EXCLUDED_SEGS.includes(seg)),
      )

      // File-count cap: a monorepo with thousands of CSS files would stall the
      // hello handshake (the spacingTokensPromise blocks Promise.all alongside
      // the other 3 resolvers). Cap at 200; warn once if truncated. Common
      // case: a project has well under 50 CSS files outside node_modules/dist.
      const MAX_CSS_FILES = 200
      if (cssFiles.length > MAX_CSS_FILES) {
        console.warn(`[cortex] CSS scan truncated: ${cssFiles.length} matching files, scanning first ${MAX_CSS_FILES} only.`)
        cssFiles = cssFiles.slice(0, MAX_CSS_FILES)
      }

      const CSS_VAR_PATTERN = /^--(spacing|sp|gap|space)-/

      // Errors we expect during a CSS scan (ENOENT/ELOOP for broken symlinks,
      // EISDIR if the entry got recreated as a directory between readdir and
      // realpath). Anything else (EACCES, EMFILE, EBUSY) signals a real problem
      // worth flagging — a single warn per scan keeps the noise floor low while
      // surfacing the cause when tokens are silently absent.
      const expectedFsCodes = new Set(['ENOENT', 'ELOOP', 'EISDIR'])
      const reportFsError = (label: string, file: string, err: unknown): void => {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : null
        if (code === null || !expectedFsCodes.has(code)) {
          console.warn(`[cortex] CSS scan ${label} failed for ${file}${code ? ` (${code})` : ''}:`, err instanceof Error ? err.message : err)
        }
      }

      // Read + parse all CSS files concurrently. Per-file errors (symlink
      // escape, oversize, parse failure) are isolated — one bad file doesn't
      // poison the rest of the scan.
      const fileResults = await Promise.all(cssFiles.map(async (file): Promise<string | null> => {
        const filePath = join(projectRoot, file)

        // Symlink containment: a CSS file in the tree may be a symlink whose
        // target escapes projectRoot. Reject before reading.
        let realFilePath: string
        try {
          realFilePath = await realpath(filePath)
        } catch (err) {
          reportFsError('realpath', file, err)
          return null
        }
        if (realFilePath !== realProjectRoot && !realFilePath.startsWith(realProjectRoot + sep)) {
          return null
        }

        // Size cap: skip files >1MB to avoid stalling the panel handshake on
        // generated CSS bundles that escaped the dist/ exclusion.
        try {
          const stats = await stat(realFilePath)
          if (stats.size > MAX_CSS_FILE_BYTES) return null
        } catch (err) {
          reportFsError('stat', file, err)
          return null
        }

        try {
          return await readFile(realFilePath, 'utf-8')
        } catch (err) {
          reportFsError('readFile', file, err)
          return null
        }
      }))

      // Parse + addToken serially so dedup priority order matches the v4→v3→css
      // source ordering. Walking PostCSS ASTs is sync and CPU-bound; concurrency
      // here would not help.
      for (const content of fileResults) {
        if (content === null) continue

        let root: ReturnType<typeof postcss.parse>
        try {
          root = postcss.parse(content)
        } catch {
          continue
        }

        root.walkRules(':root', (rule) => {
          rule.walkDecls((decl) => {
            if (!CSS_VAR_PATTERN.test(decl.prop)) return
            if (decl.prop.startsWith('--cx-')) return
            const px = TailwindResolver.parseToPx(decl.value, detectedRemPx)
            if (px === null) return
            addToken({ name: decl.prop, valuePx: px, source: 'css-variable' })
          })
        })
      }
    } catch (err: unknown) {
      // postcss missing is expected on projects without it; anything else
      // (programmer error in the scan loop, FS module failure) deserves a
      // warning rather than silent omission.
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : null
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
        console.warn('[cortex] CSS variable scan failed:', err instanceof Error ? err.message : err)
      }
      // fall through with whatever tokens were collected before the failure
    }

    return tokens.length > 0 ? tokens : null
  }

  /**
   * Detect the user's `:root` (or `html`) font-size to compute the correct
   * rem-to-px conversion. The 16px default is wrong for projects using
   * `html { font-size: 62.5% }` (the 1rem=10px convention) or any other
   * custom root size. Returns the detected px value, or 16 as a fallback.
   *
   * Bounded scan: reads only top-level `.css` files (non-recursive, max 5).
   * Re-uses postcss + path imports lazily. Errors silently fall back to 16.
   */
  private static async detectRootFontSize(projectRoot: string): Promise<number> {
    const FALLBACK = 16
    try {
      const { readdir, readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const postcss = (await import('postcss')).default

      // Top-level .css only — quick scan, the override usually lives in the entry CSS.
      const entries = await readdir(projectRoot, { withFileTypes: true }) as Array<{ name: string; isFile: () => boolean }>
      const topLevelCss = entries
        .filter(e => e.isFile() && e.name.endsWith('.css'))
        .slice(0, 5)
      // Plus common nested entry paths.
      const candidates = [
        ...topLevelCss.map(e => e.name),
        'src/index.css', 'src/main.css', 'src/App.css', 'src/styles.css',
      ]

      for (const rel of candidates) {
        let content: string
        try {
          content = await readFile(join(projectRoot, rel), 'utf-8')
        } catch {
          continue
        }
        let root: ReturnType<typeof postcss.parse>
        try {
          root = postcss.parse(content)
        } catch {
          continue
        }
        let detected: number | null = null
        // Match :root or html selectors with font-size declarations.
        root.walkRules((rule) => {
          if (rule.selector !== ':root' && rule.selector !== 'html' && rule.selector !== 'html, body' && rule.selector !== ':root, html') return
          rule.walkDecls('font-size', (decl) => {
            const v = decl.value.trim()
            if (v.endsWith('%')) {
              const pct = parseFloat(v)
              if (Number.isFinite(pct)) detected = (pct / 100) * FALLBACK
            } else if (v.endsWith('px')) {
              const px = parseFloat(v)
              if (Number.isFinite(px) && px > 0) detected = px
            } else if (v.endsWith('rem') || v.endsWith('em')) {
              // rem on :root is circular; em assumes parent = browser default.
              const n = parseFloat(v)
              if (Number.isFinite(n) && n > 0) detected = n * FALLBACK
            }
          })
        })
        if (detected !== null && Number.isFinite(detected) && detected > 0) {
          return detected
        }
      }
    } catch {
      // Any unexpected error → fall back to default.
    }
    return FALLBACK
  }

  /**
   * Parse a CSS length value to a numeric px value. Wraps the module-level
   * `toPx` (which returns a px-suffixed string) so we share a single conversion
   * implementation across normalizer chains and the spacing-token resolver.
   * Returns null for non-length values (colors, keywords, etc.).
   */
  private static parseToPx(value: string, remPx = 16): number | null {
    const str = toPx(value.trim(), remPx)
    if (str === null) return null
    const n = parseFloat(str)
    return Number.isNaN(n) ? null : n
  }

  private static async tryV3Colors(projectRoot: string): Promise<string[] | null> {
    let resolveConfig: (config: unknown) => { theme?: Record<string, unknown> }
    try {
      // @ts-expect-error — tailwindcss v3 API
      const mod = await import('tailwindcss/resolveConfig')
      resolveConfig = mod.default
    } catch {
      return null
    }

    const config = await TailwindResolver.loadConfig(projectRoot)
    if (!config) return null

    const resolved = resolveConfig(config)
    const colors = (resolved.theme as Record<string, unknown>)?.colors
    if (!colors || typeof colors !== 'object') return null

    return flattenColors(colors as Record<string, unknown>)
  }

  /** Find the Tailwind class for a CSS property + computed value. */
  findClass(property: string, value: string): string | null {
    const propertyMap = this.lookup.get(property)
    if (!propertyMap) return null

    // Static properties and pre-normalized theme values: try direct match first
    const direct = propertyMap.get(value)
    if (direct) return direct

    // Apply CSS-side normalizer for theme-mapped properties
    const mapping = UTILITY_MAP[property]
    if (!mapping) return null

    const normalized = applyNormalizer(mapping.cssNormalizer, value, this.remPx)
    if (normalized == null) return null

    const exact = propertyMap.get(normalized)
    if (exact) return exact

    // Tolerance matching for color properties: handles ±1-2 rounding differences
    // between our OKLCH→hex conversion and the browser's conversion.
    // Only triggers on exact-match miss, so zero cost for hits.
    if (mapping.cssNormalizer === 'rgbToHex' && normalized.startsWith('#') && normalized.length === 7) {
      return this.findNearestColor(propertyMap, normalized)
    }

    return null
  }

  /**
   * Find the nearest color in the property map within a small tolerance.
   * Handles ±10 per RGB channel to cover OKLCH→sRGB gamut mapping
   * differences between our converter and the browser. The minimum
   * distance between adjacent Tailwind shades is ~16, so ±10 is safe
   * against cross-shade collisions.
   * Returns null if no color is within tolerance.
   */
  private findNearestColor(propertyMap: Map<string, string>, hex: string): string | null {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    let bestClass: string | null = null
    let bestDist = Infinity

    for (const [storedHex, className] of propertyMap) {
      if (!storedHex.startsWith('#') || storedHex.length !== 7) continue
      const sr = parseInt(storedHex.slice(1, 3), 16)
      const sg = parseInt(storedHex.slice(3, 5), 16)
      const sb = parseInt(storedHex.slice(5, 7), 16)

      // Max channel distance — fast rejection
      const dist = Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb))
      if (dist <= 10 && dist < bestDist) {
        bestDist = dist
        bestClass = className
      }
    }

    return bestClass
  }

  /** Get all snap point values for a CSS property. Sorted numerically when possible. */
  getSnapPoints(property: string): readonly string[] {
    const cached = this.snapCache.get(property)
    if (cached) return cached

    const propertyMap = this.lookup.get(property)
    if (!propertyMap) {
      this.snapCache.set(property, TailwindResolver.EMPTY_FROZEN)
      return TailwindResolver.EMPTY_FROZEN
    }

    const keys = Array.from(propertyMap.keys())
    const sorted = keys.length > 0 && Number.isNaN(parseFloat(keys[0]!))
      ? keys
      : keys.sort((a, b) => parseFloat(a) - parseFloat(b))

    const frozen = Object.freeze(sorted)
    this.snapCache.set(property, frozen)
    return frozen
  }

  /**
   * Flatten nested color objects into [key, normalizedValue] pairs.
   * { red: { 50: '#fee2e2', 500: '#ef4444' } } → [['red-50', '#fee2e2'], ['red-500', '#ef4444']]
   * { brand: '#1a73e8' } → [['brand', '#1a73e8']]
   * Skips inherit, current, transparent.
   */
  private static flattenScale(
    scale: Record<string, string | Record<string, string>>,
    normalizer: ValueNormalizer,
    remPx: number,
  ): Array<[string, string]> {
    const result: Array<[string, string]> = []
    for (const [key, value] of Object.entries(scale)) {
      if (key === 'inherit' || key === 'current' || key === 'transparent') continue
      if (typeof value === 'string') {
        const normalized = applyNormalizer(normalizer, value, remPx)
        if (normalized != null) result.push([key, normalized])
      } else if (value && typeof value === 'object') {
        for (const [shade, shadeValue] of Object.entries(value)) {
          if (typeof shadeValue !== 'string') continue
          const normalized = applyNormalizer(normalizer, shadeValue, remPx)
          if (normalized != null) {
            const flatKey = shade === 'DEFAULT' ? key : `${key}-${shade}`
            result.push([flatKey, normalized])
          }
        }
      }
    }
    return result
  }

  private invertTheme(theme: ResolvedTheme): void {
    // Theme-mapped properties
    for (const [cssProperty, mapping] of Object.entries(UTILITY_MAP)) {
      const scale = theme[mapping.themeKey]
      if (!scale || typeof scale !== 'object') continue

      const propertyMap = new Map<string, string>()

      if (mapping.nested) {
        // Nested color-style scale
        const entries = TailwindResolver.flattenScale(
          scale as Record<string, string | Record<string, string>>,
          mapping.themeNormalizer,
          this.remPx,
        )
        for (const [key, normalized] of entries) {
          const className = key === 'DEFAULT' && mapping.defaultBare
            ? mapping.prefix
            : `${mapping.prefix}-${key}`
          propertyMap.set(normalized, className)
        }
      } else {
        // Flat scale (spacing, fontSize, borderWidth, etc.)
        for (const [key, rawValue] of Object.entries(scale)) {
          const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
          if (typeof value !== 'string') continue

          const normalized = applyNormalizer(mapping.themeNormalizer, value, this.remPx)
          if (normalized == null) continue

          const className = key === 'DEFAULT' && mapping.defaultBare
            ? mapping.prefix
            : `${mapping.prefix}-${key}`
          propertyMap.set(normalized, className)
        }
      }

      if (propertyMap.size > 0) {
        this.lookup.set(cssProperty, propertyMap)
      }
    }

    // Static utilities (no theme scale)
    for (const [cssProperty, entries] of Object.entries(STATIC_MAP)) {
      const propertyMap = new Map<string, string>()
      for (const [value, className] of Object.entries(entries)) {
        propertyMap.set(value, className)
      }
      this.lookup.set(cssProperty, propertyMap)
    }
  }
}
