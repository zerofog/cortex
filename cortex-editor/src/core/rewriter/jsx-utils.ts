/**
 * Shared JSX utilities for AST-based rewriters (TailwindRewriter, InlineStyleRewriter,
 * ToolApplicator). Pure functions + module-scoped ts-morph lazy loader.
 *
 * Scope: JSX/TSX files only. Vue SFC and Svelte templates require framework-specific
 * compiler plugins and are not supported by these utilities.
 */
import type { SourceFile, JsxOpeningElement, JsxSelfClosingElement, SyntaxKind as SyntaxKindEnum } from 'ts-morph'

// ── Lazy ts-morph loader (cold path ~200ms) ─────────────────────

let _tsMorphPromise: Promise<typeof import('ts-morph')> | null = null

export function ensureTsMorph(): Promise<typeof import('ts-morph')> {
  if (!_tsMorphPromise) {
    _tsMorphPromise = import('ts-morph').catch(err => {
      _tsMorphPromise = null // allow retry on failure
      throw err
    })
  }
  return _tsMorphPromise
}

/** Reset the lazy loader for testing. Only available in test environments. */
export function _resetTsMorphForTesting(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    _tsMorphPromise = null
  }
}

// ── JSX element finder ──────────────────────────────────────────

/**
 * Find the tightest JSX element containing the given 1-based line:col position.
 * Uses O(depth) ancestor walk from the position instead of O(n) full-tree scan.
 *
 * Note: source annotations (data-cortex-source) are set at build time and may become
 * stale after file rewrites shift line numbers. If the position doesn't resolve to a
 * JSX element, this returns null — the caller should handle gracefully (e.g., fail
 * the edit, wait for HMR to refresh annotations).
 */
export function findJsxElementAt(
  sourceFile: SourceFile,
  line: number,
  col: number,
  SK: typeof SyntaxKindEnum,
): JsxOpeningElement | JsxSelfClosingElement | null {
  let pos: number
  try {
    pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1)
  } catch {
    return null
  }

  let node = sourceFile.getDescendantAtPos(pos)
  while (node) {
    const kind = node.getKind()
    if (kind === SK.JsxOpeningElement || kind === SK.JsxSelfClosingElement) {
      return node as JsxOpeningElement | JsxSelfClosingElement
    }
    node = node.getParent()
  }

  return null
}

// ── CSS property name conversion ────────────────────────────────

const CSSOM_EXCEPTIONS: Record<string, string> = { 'float': 'cssFloat' }
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Convert kebab-case CSS property to camelCase for JSX style objects.
 *
 * Handles vendor prefixes per React's convention:
 * - `-ms-transform` → `msTransform` (lowercase ms)
 * - `-webkit-transform` → `WebkitTransform` (capitalized)
 * - `-moz-appearance` → `MozAppearance` (capitalized)
 *
 * CSS custom properties (`--my-var`) pass through unchanged.
 *
 * Input must be a valid CSS property name (lowercase kebab-case or custom property).
 * Callers should validate input before calling — `EditPipeline.VALID_PROPERTY` provides
 * this upstream. Returns the input unchanged if it contains no hyphens.
 */
export function cssPropertyToCamelCase(property: string): string {
  if (DANGEROUS_KEYS.has(property)) return property

  const exception = CSSOM_EXCEPTIONS[property]
  if (exception) return exception

  if (property.startsWith('--')) return property

  if (property.startsWith('-')) {
    const withoutLeadingDash = property.slice(1)
    const camel = withoutLeadingDash.replace(/-([a-zA-Z])/g, (_, letter: string) => letter.toUpperCase())
    if (withoutLeadingDash.startsWith('ms-')) return camel
    return camel.charAt(0).toUpperCase() + camel.slice(1)
  }

  return property.replace(/-([a-zA-Z])/g, (_, letter: string) => letter.toUpperCase())
}

// ── Shorthand parent lookup (camelCase) ────────────────────────
// CSS shorthand → longhands. Adding a new shorthand = one entry here,
// LONGHAND_TO_SHORTHAND is derived automatically.
//
// WHY this table exists (ZF0-1293): when React applies a style={{}} prop,
// it iterates keys in insertion order and calls `el.style[key] = value`
// for each. CSSOM expands shorthands into longhands on assignment (per
// CSS Cascading and Inheritance L4 §3 and MDN "Shorthand properties"),
// so setting `el.style.padding = '30px'` AFTER `el.style.paddingBottom = '16px'`
// overwrites paddingBottom back to 30px. The InlineStyleRewriter uses
// this table to detect and re-order object-literal properties so the
// longhand comes AFTER its parent shorthand in source, preventing React
// from clobbering user edits at render time. See `needsShorthandReorder`
// in inline-style.ts for the enforcement.

const SHORTHAND_LONGHANDS: Record<string, readonly string[]> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
  borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
  borderStyle: ['borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'],
  borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
  // Super-shorthand: `border: 1px solid red` resets the width/style/color
  // triad (NOT border-radius or border-image). Children include BOTH the
  // mid-level shorthands (borderWidth/Style/Color) and their per-side
  // longhands, so the parent-chain walk in `needsShorthandReorder` catches
  // both direct (border→borderTopWidth) and transitive (border→borderWidth
  // →borderTopWidth) paths.
  border: [
    'borderWidth', 'borderStyle', 'borderColor',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  ],
  gap: ['rowGap', 'columnGap'],
  // High-frequency in Panel UI edits (backgroundColor especially).
  background: [
    'backgroundColor', 'backgroundImage', 'backgroundRepeat', 'backgroundPosition',
    'backgroundSize', 'backgroundOrigin', 'backgroundClip', 'backgroundAttachment',
  ],
  // Panel edits font-size, font-weight, line-height, font-family, letter-spacing.
  // `font` shorthand resets all of these (plus font-style, font-variant, font-stretch).
  font: ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight'],
  flex: ['flexGrow', 'flexShrink', 'flexBasis'],
  transition: ['transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay'],
  animation: ['animationName', 'animationDuration', 'animationTimingFunction', 'animationDelay', 'animationIterationCount', 'animationDirection', 'animationFillMode', 'animationPlayState'],
  outline: ['outlineWidth', 'outlineStyle', 'outlineColor'],
}

/** Derived inverse: longhand → list of shorthand parents. A longhand can
 *  have MULTIPLE parents (e.g., borderTopWidth is clobbered by both
 *  borderWidth and border). Consumers walk the list to check all parents. */
export const LONGHAND_TO_SHORTHANDS: Record<string, readonly string[]> = Object.create(null)
for (const [shorthand, longhands] of Object.entries(SHORTHAND_LONGHANDS)) {
  for (const longhand of longhands) {
    const existing = LONGHAND_TO_SHORTHANDS[longhand]
    LONGHAND_TO_SHORTHANDS[longhand] = existing ? [...existing, shorthand] : [shorthand]
  }
}

/** Back-compat single-parent accessor for callers that only care about one
 *  parent (the `removePropertyFromObject` path removes just the immediate
 *  parent shorthand to unblock a CSS class write; it does NOT need to walk
 *  the super-shorthand chain, since writing the class wins against the
 *  remaining parents). Returns the FIRST parent if multiple exist. */
export const LONGHAND_TO_SHORTHAND: Record<string, string> = Object.create(null)
for (const [longhand, parents] of Object.entries(LONGHAND_TO_SHORTHANDS)) {
  LONGHAND_TO_SHORTHAND[longhand] = parents[0]!
}
