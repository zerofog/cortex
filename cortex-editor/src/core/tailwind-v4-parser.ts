/**
 * Tailwind CSS v4 @theme parser.
 *
 * Parses `@theme` blocks from CSS files using PostCSS, extracts CSS custom
 * properties, and maps them to the ResolvedTheme interface used by
 * TailwindResolver. Handles v4-specific features:
 *
 * - Namespace clearing (`--*: initial`, `--color-*: initial`)
 * - Spacing scale generation from a single base value
 * - OKLCH color conversion via oklchToHex
 * - Default theme merging from tailwindcss/theme.css
 */

import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, dirname, sep } from 'node:path'
import type { Root } from 'postcss'
import { oklchToHex } from './oklch.js'
import type { ResolvedTheme } from './tailwind-resolver.js'

// postcss is an OPTIONAL peer dependency. Resolve it lazily instead of via a
// top-level value import so that importing cortex-editor's core entry never
// requires postcss to be installed — it's only loaded when tailwind-v4 @theme
// parsing actually runs, which only happens in a project that already has
// postcss (every Vite/Next/Webpack/Tailwind setup does). Mirrors the lazy-load
// precedent used for ts-morph. (ZF0-1974)
let _postcss: { parse(css: string): Root } | null = null
function loadPostcss(): { parse(css: string): Root } {
  if (!_postcss) {
    // Resolve from the running project (dev-server cwd), where postcss lives as
    // a peer. NOT via import.meta.url — esbuild emits an EMPTY import.meta.url in
    // the CJS build, so createRequire(import.meta.url) silently fails to resolve
    // there. cwd is build-agnostic and mirrors loadDefaultTheme's
    // createRequire-from-package.json pattern. Stays sync (no async ripple to
    // extractThemeProperties' many synchronous call sites + tests).
    _postcss = createRequire(join(process.cwd(), 'package.json'))('postcss') as {
      parse(css: string): Root
    }
  }
  return _postcss
}

// ── extractThemeProperties ──────────────────────────────────────────

/**
 * Parse CSS with PostCSS, walk `@theme` at-rules, extract declarations
 * whose properties start with `--`. Properties are processed in document
 * order so later @theme blocks override earlier ones.
 *
 * Handles namespace clearing:
 * - `--*: initial` clears all accumulated properties
 * - `--color-*: initial` clears all `--color-*` properties
 */
export function extractThemeProperties(css: string): Map<string, string> {
  const properties = new Map<string, string>()

  let root: Root
  try {
    root = loadPostcss().parse(css)
  } catch {
    // Malformed CSS, OR postcss not installed (it's an optional peer). Fail
    // gracefully — never hard-crash the importer/editor over a parse path that
    // only matters for Tailwind v4 projects (which have postcss anyway).
    return properties
  }

  root.walkAtRules('theme', (atRule) => {
    atRule.walkDecls((decl) => {
      // Only process custom properties
      if (!decl.prop.startsWith('--')) return

      // Namespace clearing: --PREFIX-*: initial
      if (decl.value === 'initial' && decl.prop.endsWith('-*')) {
        const prefix = decl.prop.slice(0, -2) // strip trailing '-*'

        if (prefix === '-') {
          // --*: initial → clear everything
          properties.clear()
        } else {
          // --color-*: initial → clear all matching --color-* properties
          for (const key of [...properties.keys()]) {
            if (key.startsWith(prefix + '-') || key === prefix) {
              properties.delete(key)
            }
          }
        }
        return
      }

      properties.set(decl.prop, decl.value)
    })
  })

  return properties
}

// ── themePropertiesToResolved ────────────────────────────────────────

/**
 * Standard Tailwind spacing multipliers. A base spacing value (e.g. 0.25rem)
 * is multiplied by each of these to generate the full spacing scale.
 * These match the v3 scale that v4 preserves.
 */
const SPACING_MULTIPLIERS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]

/** Static borderWidth defaults added when no border width properties in theme. */
const BORDER_WIDTH_DEFAULTS: Record<string, string> = {
  DEFAULT: '1px', '0': '0px', '2': '2px', '4': '4px', '8': '8px',
}

/**
 * Normalize a color value to hex. Handles:
 * - OKLCH → hex conversion
 * - Hex normalization (#rgb → #rrggbb, lowercase)
 * - rgb() → hex
 * Returns null for var() refs, `transparent`, `currentColor`, or unparseable values.
 */
function normalizeColor(value: string): string | null {
  const trimmed = value.trim()

  // Skip var() references and CSS keywords
  if (trimmed.startsWith('var(')) return null
  if (trimmed === 'transparent' || trimmed === 'currentColor') return null

  // OKLCH conversion
  if (trimmed.startsWith('oklch(')) {
    return oklchToHex(trimmed)
  }

  // Hex normalization
  if (trimmed.startsWith('#')) {
    // 6-digit hex → lowercase
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
    // 3-digit short hex → expand
    const short = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
    if (short) {
      const [, r, g, b] = short
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }
    // 8-digit with alpha → strip alpha
    if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7).toLowerCase()
    return null
  }

  // rgb()/rgba() — reject alpha < 1 (Tailwind separates color from opacity)
  const m = trimmed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/)
  if (m) {
    if (m[4] !== undefined) {
      const alpha = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
      if (Number.isNaN(alpha) || alpha < 1) return null
    }
    const r = Math.round(Number(m[1]))
    const g = Math.round(Number(m[2]))
    const b = Math.round(Number(m[3]))
    if (r > 255 || g > 255 || b > 255) return null
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }

  return null
}

/**
 * Generate a spacing scale from a base value and the standard multipliers.
 * Adds 0 (0px), px (1px), and all multiplied values.
 */
function generateSpacingScale(baseValue: string): Record<string, string> {
  const baseMatch = baseValue.match(/^([\d.]+)(rem|px)$/)
  if (!baseMatch) return {}

  const baseNum = parseFloat(baseMatch[1]!)
  const unit = baseMatch[2]!
  const scale: Record<string, string> = {}

  // Fixed entries
  scale['0'] = '0px'
  scale['px'] = '1px'

  // Generate from multipliers
  for (const multiplier of SPACING_MULTIPLIERS) {
    const value = baseNum * multiplier
    // Use clean float representation
    const valueStr = cleanFloat(value)
    scale[String(multiplier)] = `${valueStr}${unit}`
  }

  return scale
}

/** Round to avoid floating point artifacts (e.g. 0.30000000000000004 → 0.3). */
function cleanFloat(n: number): string {
  // Round to 10 decimal places to avoid IEEE 754 artifacts
  return String(Math.round(n * 1e10) / 1e10)
}

/**
 * Map v4 CSS custom property namespaces to the ResolvedTheme structure.
 *
 * | v4 CSS Prefix          | ResolvedTheme Key | Notes                                |
 * |------------------------|-------------------|--------------------------------------|
 * | --spacing (single)     | spacing           | Generate scale from base × multiplier|
 * | --color-{family}-{sh}  | colors            | Nested. OKLCH→hex. Skip var() refs.  |
 * | --text-{size}          | fontSize          | Skip --text-shadow-*, --*--line-height|
 * | --font-weight-{name}   | fontWeight        | NOT --font-* (those are families)    |
 * | --leading-{name}       | lineHeight        |                                      |
 * | --radius / --radius-*  | borderRadius      | Exact --radius → DEFAULT key         |
 * | --shadow / --shadow-*  | boxShadow         | Exact --shadow → DEFAULT key         |
 * | --blur / --blur-*      | blur              | Exact --blur → DEFAULT key           |
 */
export function themePropertiesToResolved(properties: Map<string, string>): ResolvedTheme {
  const theme: ResolvedTheme = {}

  // ── Spacing ─────────────────────────────────────────────────────
  const spacingBase = properties.get('--spacing')
  if (spacingBase) {
    theme.spacing = generateSpacingScale(spacingBase)
  }

  // ── Colors ──────────────────────────────────────────────────────
  const colors: Record<string, string | Record<string, string>> = {}
  for (const [prop, value] of properties) {
    if (!prop.startsWith('--color-')) continue
    const rest = prop.slice('--color-'.length) // e.g. "red-500" or "black"

    const normalized = normalizeColor(value)
    if (normalized === null) continue

    // Check if this is a family-shade pattern (contains a hyphen)
    const lastDash = rest.lastIndexOf('-')
    if (lastDash > 0) {
      // Potential family-shade: --color-red-500 → family="red", shade="500"
      // But also --color-blue-gray-500 → family="blue-gray", shade="500"
      const family = rest.slice(0, lastDash)
      const shade = rest.slice(lastDash + 1)

      // If shade looks like a number or known shade name, treat as nested
      if (/^\d+$/.test(shade)) {
        const existing = colors[family]
        if (existing && typeof existing === 'object') {
          existing[shade] = normalized
        } else {
          colors[family] = { [shade]: normalized }
        }
        continue
      }
    }

    // Flat color: --color-black → { black: '#000000' }
    colors[rest] = normalized
  }
  if (Object.keys(colors).length > 0) {
    theme.colors = colors
  }

  // ── Font sizes ──────────────────────────────────────────────────
  const fontSize: Record<string, string> = {}
  for (const [prop, value] of properties) {
    if (!prop.startsWith('--text-')) continue
    // Skip --text-shadow-* (those are text shadow properties)
    if (prop.startsWith('--text-shadow-')) continue
    // Skip --text-*--line-height companion properties
    if (prop.includes('--line-height')) continue
    const name = prop.slice('--text-'.length)
    fontSize[name] = value
  }
  if (Object.keys(fontSize).length > 0) {
    theme.fontSize = fontSize
  }

  // ── Font weights ────────────────────────────────────────────────
  const fontWeight: Record<string, string> = {}
  for (const [prop, value] of properties) {
    // Only --font-weight-*, not --font-sans, --font-mono, etc.
    if (!prop.startsWith('--font-weight-')) continue
    const name = prop.slice('--font-weight-'.length)
    fontWeight[name] = value
  }
  if (Object.keys(fontWeight).length > 0) {
    theme.fontWeight = fontWeight
  }

  // ── Line height ─────────────────────────────────────────────────
  const lineHeight: Record<string, string> = {}
  for (const [prop, value] of properties) {
    if (!prop.startsWith('--leading-')) continue
    const name = prop.slice('--leading-'.length)
    lineHeight[name] = value
  }
  if (Object.keys(lineHeight).length > 0) {
    theme.lineHeight = lineHeight
  }

  // ── Border radius ───────────────────────────────────────────────
  const borderRadius: Record<string, string> = {}
  for (const [prop, value] of properties) {
    if (prop === '--radius') {
      borderRadius['DEFAULT'] = value
    } else if (prop.startsWith('--radius-')) {
      const name = prop.slice('--radius-'.length)
      borderRadius[name] = value
    }
  }
  if (Object.keys(borderRadius).length > 0) {
    theme.borderRadius = borderRadius
  }

  // ── Box shadow ──────────────────────────────────────────────────
  const boxShadow: Record<string, string> = {}
  for (const [prop, value] of properties) {
    if (prop === '--shadow') {
      boxShadow['DEFAULT'] = value
    } else if (prop.startsWith('--shadow-')) {
      const name = prop.slice('--shadow-'.length)
      boxShadow[name] = value
    }
  }
  if (Object.keys(boxShadow).length > 0) {
    theme.boxShadow = boxShadow
  }

  // ── Blur ────────────────────────────────────────────────────────
  const blur: Record<string, string> = {}
  for (const [prop, value] of properties) {
    if (prop === '--blur') {
      blur['DEFAULT'] = value
    } else if (prop.startsWith('--blur-')) {
      const name = prop.slice('--blur-'.length)
      blur[name] = value
    }
  }
  if (Object.keys(blur).length > 0) {
    theme.blur = blur
    // Tailwind v4 uses the same --blur-* namespace for both blur and backdrop-blur
    if (!theme.backdropBlur) {
      theme.backdropBlur = { ...blur }
    }
  }

  // ── Opacity (v4 doesn't have @theme vars; generate standard scale) ──
  if (!theme.opacity) {
    const opacity: Record<string, string> = {}
    for (let i = 0; i <= 100; i += 5) {
      opacity[String(i)] = String(i / 100)
    }
    theme.opacity = opacity
  }

  // ── Static defaults ─────────────────────────────────────────────
  if (!theme.borderWidth) {
    theme.borderWidth = { ...BORDER_WIDTH_DEFAULTS }
  }

  return theme
}

// ── parseV4Theme ────────────────────────────────────────────────────

/**
 * Scan CSS files in projectRoot (excluding node_modules) recursively for
 * `@import "tailwindcss"`. Returns the file content if found, null otherwise.
 */
export async function findV4EntryCSS(projectRoot: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(projectRoot, { recursive: true }) as string[]
  } catch {
    return null
  }

  const cssFiles = entries.filter(e =>
    e.endsWith('.css') &&
    !e.includes(`${sep}node_modules${sep}`) &&
    !e.startsWith(`node_modules${sep}`)
  )

  for (const file of cssFiles) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8')
      if (/@import\s+["']tailwindcss["']/.test(content)) return content
    } catch { /* skip unreadable */ }
  }
  return null
}

/**
 * Load the default theme CSS from the installed tailwindcss package.
 * Resolves tailwindcss/package.json via createRequire, reads theme.css.
 * Returns null if tailwindcss is not installed or theme.css not found.
 */
async function loadDefaultTheme(projectRoot: string): Promise<string | null> {
  try {
    const require = createRequire(join(projectRoot, 'package.json'))
    const pkgPath = require.resolve('tailwindcss/package.json')
    const themeDir = dirname(pkgPath)
    const themeCss = await readFile(join(themeDir, 'theme.css'), 'utf-8')
    return themeCss
  } catch {
    return null
  }
}

export async function parseV4ThemeFromCSS(
  projectRoot: string,
  userCSS: string,
): Promise<ResolvedTheme | null> {
  const defaultCSS = await loadDefaultTheme(projectRoot)

  // Concatenate defaults first so user CSS overrides
  const combined = (defaultCSS ?? '') + '\n' + userCSS
  const properties = extractThemeProperties(combined)
  if (properties.size === 0) return null

  return themePropertiesToResolved(properties)
}

/**
 * Main entry point: find user CSS with @import "tailwindcss", load
 * tailwindcss defaults, merge, extract theme properties, and convert
 * to ResolvedTheme.
 *
 * Returns null if no v4 entry CSS is found.
 */
export async function parseV4Theme(projectRoot: string): Promise<ResolvedTheme | null> {
  const userCSS = await findV4EntryCSS(projectRoot)
  if (!userCSS) return null
  return parseV4ThemeFromCSS(projectRoot, userCSS)
}
