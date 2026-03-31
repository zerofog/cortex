/**
 * Shared JSX utilities for AST-based rewriters (TailwindRewriter, InlineStyleRewriter).
 * Pure functions + module-scoped ts-morph lazy loader.
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

// ── JSX element finder ──────────────────────────────────────────

/** Find the tightest JSX element containing the given 1-based line:col position. */
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
    // getPositionOfLineAndCharacter throws for out-of-bounds line/col.
    // No other failure mode is known for this TS compiler API.
    return null
  }

  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SK.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SK.JsxSelfClosingElement),
  ]

  let best: JsxOpeningElement | JsxSelfClosingElement | null = null
  let bestDist = Infinity

  for (const el of jsxElements) {
    const elStart = el.getStart()
    const elEnd = el.getEnd()
    if (pos >= elStart && pos <= elEnd) {
      const dist = pos - elStart
      if (dist < bestDist) {
        bestDist = dist
        best = el
      }
    }
  }

  return best
}

// ── CSS property name conversion ────────────────────────────────

/**
 * Convert kebab-case CSS property to camelCase for JSX style objects.
 *
 * Handles vendor prefixes per React's convention:
 * - `-ms-transform` → `msTransform` (lowercase ms)
 * - `-webkit-transform` → `WebkitTransform` (capitalized)
 * - `-moz-appearance` → `MozAppearance` (capitalized)
 *
 * CSS custom properties (`--my-var`) pass through unchanged.
 */
/** CSS properties whose CSSOM name differs from the simple camelCase conversion. */
const CSSOM_EXCEPTIONS: Record<string, string> = { 'float': 'cssFloat' }

export function cssPropertyToCamelCase(property: string): string {
  const exception = CSSOM_EXCEPTIONS[property]
  if (exception) return exception

  // CSS custom properties are used as-is in JavaScript
  if (property.startsWith('--')) return property

  // Vendor prefixes: strip leading '-', then camelCase the rest
  // -ms-transform → ms-transform → msTransform
  // -webkit-transform → webkit-transform → WebkitTransform (capitalize non-ms)
  if (property.startsWith('-')) {
    const withoutLeadingDash = property.slice(1)
    const camel = withoutLeadingDash.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    // -ms- is the only vendor prefix React lowercases
    if (withoutLeadingDash.startsWith('ms-')) return camel
    // All other vendor prefixes get capitalized first letter
    return camel.charAt(0).toUpperCase() + camel.slice(1)
  }

  return property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}
