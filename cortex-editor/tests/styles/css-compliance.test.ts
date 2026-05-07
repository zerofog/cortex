/**
 * Static DESIGN.md compliance checks for cortex-editor/src/browser/styles.css.
 *
 * Business logic impact: this test protects the Cortex panel's source styling
 * contract. It blocks hardcoded cortex-* rule colors, decorative gradients, and
 * glow-style zero-offset blur shadows before they ship into the editor UI.
 *
 * Falsifiability proof performed 2026-05-07:
 *   Mutation: temporarily changed `.cortex-label` to `color: #ff0000`.
 *   Observed failure:
 *     - Hex test reported `.cortex-label -> color: #ff0000`.
 *     - `expect(violations).toEqual([])` failed.
 *   Revert: restored token color and reran the targeted Vitest file green.
 *
 *   Mutation: temporarily changed `.cortex-color-input__swatch` to
 *   `background: linear-gradient(red, blue)`.
 *   Observed failure:
 *     - Gradient test reported `.cortex-color-input__swatch -> background`.
 *   Revert: restored token/pseudo-element styling and reran green.
 *
 *   Mutation: temporarily changed `.cortex-color-picker__swatch--active` to
 *   `box-shadow: 0 0 12px var(--cx-select)`.
 *   Observed failure:
 *     - Glow test reported the zero-offset blur shadow.
 *   Revert: restored the zero-blur focus-ring style and reran green.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss, { type Declaration, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CSS_PATH = resolve(__dirname, '../../src/browser/styles.css')
const HEX_PATTERN = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
const GRADIENT_PATTERN = /\b(?:repeating-)?linear-gradient\(/i

interface Violation {
  line: number
  selector: string
  property: string
  value: string
}

function parseCss(css: string) {
  return postcss.parse(css, { from: CSS_PATH })
}

function declarationRule(decl: Declaration): Rule | null {
  let node = decl.parent
  while (node) {
    if (node.type === 'rule') return node as Rule
    node = node.parent
  }
  return null
}

function isCortexRule(decl: Declaration): boolean {
  const rule = declarationRule(decl)
  return rule?.selector.split(',').some((selector) => /(^|[^a-zA-Z0-9_-])\.cortex-[\w-]+/.test(selector)) ?? false
}

function formatViolation(decl: Declaration): Violation {
  return {
    line: decl.source?.start?.line ?? 0,
    selector: declarationRule(decl)?.selector ?? '<unknown selector>',
    property: decl.prop,
    value: decl.value,
  }
}

function scannableDeclarations(css: string): Declaration[] {
  const root = parseCss(css)
  const declarations: Declaration[] = []
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) return
    if (!isCortexRule(decl)) return
    declarations.push(decl)
  })
  return declarations
}

function stripBlockComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '')
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch === '(') depth += 1
    else if (ch === ')' && depth > 0) depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function splitWhitespaceOutsideFunctions(value: string): string[] {
  const tokens: string[] = []
  let start: number | null = null
  let depth = 0
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch === '(') depth += 1
    else if (ch === ')' && depth > 0) depth -= 1
    const isBoundary = /\s/.test(ch) && depth === 0
    if (isBoundary) {
      if (start !== null) tokens.push(value.slice(start, i))
      start = null
    } else if (start === null) {
      start = i
    }
  }
  if (start !== null) tokens.push(value.slice(start))
  return tokens
}

function numericLengthValue(token: string): number | null {
  const match = token.match(/^(-?(?:\d+|\d*\.\d+))(px|rem|em)?$/)
  if (!match) return null
  return Number(match[1])
}

function hasZeroOffsetBlurShadow(value: string): boolean {
  for (const shadow of splitTopLevelCommas(value)) {
    const lengths = splitWhitespaceOutsideFunctions(shadow)
      .map(numericLengthValue)
      .filter((length): length is number => length !== null)
    const [offsetX, offsetY, blur] = lengths
    if (offsetX === 0 && offsetY === 0 && blur !== undefined && blur > 0) return true
  }
  return false
}

function scanHexViolations(css: string): Violation[] {
  return scannableDeclarations(css)
    .filter((decl) => HEX_PATTERN.test(stripBlockComments(decl.value)))
    .map(formatViolation)
}

function scanGradientViolations(css: string): Violation[] {
  return scannableDeclarations(css)
    .filter((decl) => GRADIENT_PATTERN.test(stripBlockComments(decl.value)))
    .map(formatViolation)
}

function scanGlowViolations(css: string): Violation[] {
  return scannableDeclarations(css)
    .filter((decl) => decl.prop === 'box-shadow' && hasZeroOffsetBlurShadow(stripBlockComments(decl.value)))
    .map(formatViolation)
}

function violationMessage(violations: Violation[]): string {
  return violations
    .map((violation) => `L${violation.line} ${violation.selector} -> ${violation.property}: ${violation.value}`)
    .join('\n')
}

describe('styles.css DESIGN.md compliance', () => {
  const css = readFileSync(CSS_PATH, 'utf8')

  it('no hardcoded hex colors in cortex-* rule declarations outside token definitions', () => {
    const fixtureViolations = scanHexViolations(`
      :host { --cx-ink: #111827; color: #000; }
      .cortex-label {
        color: var(--cx-ink); /* #ffffff in comments is ignored */
        background: var(--cx-paper);
      }
      .cortex-bad {
        color: #ff0000; /* inline comment must not hide this declaration */
        background: var(--cx-paper);
      }
    `)
    expect(fixtureViolations).toHaveLength(1)
    expect(fixtureViolations[0]?.property).toBe('color')

    const violations = scanHexViolations(css)
    expect(violations, violationMessage(violations)).toEqual([])
  })

  it('no linear or repeating gradients in cortex-* rule declarations', () => {
    const fixtureViolations = scanGradientViolations(`
      .cortex-good { background: var(--cx-well); }
      .cortex-bad-a { background: linear-gradient(red, blue); }
      .cortex-bad-b { background: repeating-linear-gradient(45deg, red, blue); }
    `)
    expect(fixtureViolations.map((violation) => violation.selector)).toEqual(['.cortex-bad-a', '.cortex-bad-b'])

    const violations = scanGradientViolations(css)
    expect(violations, violationMessage(violations)).toEqual([])
  })

  it('no zero-offset blur glow box-shadows in cortex-* rule declarations', () => {
    const fixtureViolations = scanGlowViolations(`
      .cortex-focus-ring { box-shadow: 0 0 0 2px var(--cx-select-muted); }
      .cortex-drop-shadow { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
      .cortex-glow { box-shadow: rgba(0, 0, 0, 0.3) 0px 0px 12px; }
    `)
    expect(fixtureViolations).toHaveLength(1)
    expect(fixtureViolations[0]?.selector).toBe('.cortex-glow')

    const violations = scanGlowViolations(css)
    expect(violations, violationMessage(violations)).toEqual([])
  })
})
