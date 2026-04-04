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

const SHORTHAND_LONGHANDS: Record<string, readonly string[]> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
  borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
  borderStyle: ['borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'],
  borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
  gap: ['rowGap', 'columnGap'],
}

// Derived inverse: longhand → shorthand parent
export const LONGHAND_TO_SHORTHAND: Record<string, string> = Object.create(null)
for (const [shorthand, longhands] of Object.entries(SHORTHAND_LONGHANDS)) {
  for (const longhand of longhands) {
    LONGHAND_TO_SHORTHAND[longhand] = shorthand
  }
}
