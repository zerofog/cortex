/**
 * Static DESIGN.md compliance checks for Cortex source styles.
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
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss, { type Declaration, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CSS_PATH = resolve(__dirname, '../../src/browser/styles.css')
const BROWSER_SRC_PATH = resolve(__dirname, '../../src/browser')
const HEX_PATTERN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/
const GRADIENT_PATTERN = /\b(?:repeating-)?linear-gradient\(/i
const GRADIENT_SCAN_PATTERN = /\b(?:repeating-)?linear-gradient\(/gi

interface Violation {
  line: number
  selector: string
  property: string
  value: string
}

interface SourceViolation {
  path: string
  line: number
  context: string
  value: string
}

function parseCss(css: string) {
  return postcss.parse(css, { from: CSS_PATH })
}

function browserTsxPaths(): string[] {
  const paths: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (extname(entry.name) === '.tsx') paths.push(path)
    }
  }
  visit(BROWSER_SRC_PATH)
  return paths.sort()
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
  return rule?.selector.split(',').some((selector) => /\.cortex-[\w-]+/.test(selector)) ?? false
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

function lineNumberAt(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '\n') line += 1
  }
  return line
}

function inlineViolation(path: string, source: string, index: number, value: string): SourceViolation {
  const line = lineNumberAt(source, index)
  const context = source.split('\n')[line - 1]?.trim() ?? ''
  return { path, line, context, value }
}

function scanInlineGradientViolationsFromSource(source: string, path = '<inline fixture>'): SourceViolation[] {
  return Array.from(source.matchAll(GRADIENT_SCAN_PATTERN))
    .map((match) => inlineViolation(path, source, match.index ?? 0, match[0] ?? 'linear-gradient('))
}

function scanInlineGlowViolationsFromSource(source: string, path = '<inline fixture>'): SourceViolation[] {
  const violations: SourceViolation[] = []
  const shadowPattern = /(?:boxShadow|['"]box-shadow['"])\s*:\s*(['"`])([\s\S]*?)\1/g
  for (const match of source.matchAll(shadowPattern)) {
    const value = match[2] ?? ''
    if (hasZeroOffsetBlurShadow(value)) {
      violations.push(inlineViolation(path, source, match.index ?? 0, value))
    }
  }
  return violations
}

function scanTsxSources(scan: (source: string, path: string) => SourceViolation[]): SourceViolation[] {
  return browserTsxPaths().flatMap((path) =>
    scan(readFileSync(path, 'utf8'), relative(BROWSER_SRC_PATH, path)),
  )
}

function violationMessage(violations: Violation[]): string {
  return violations
    .map((violation) => `L${violation.line} ${violation.selector} -> ${violation.property}: ${violation.value}`)
    .join('\n')
}

function sourceViolationMessage(violations: SourceViolation[]): string {
  return violations
    .map((violation) => `${violation.path}:L${violation.line} ${violation.context} -> ${violation.value}`)
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
      .cortex-bad-alpha-short { color: #f008; }
      .cortex-bad-alpha-long { color: #ff0000cc; }
      button.cortex-compound {
        color: #0000ff;
      }
    `)
    expect(fixtureViolations.map((violation) => violation.selector)).toEqual([
      '.cortex-bad',
      '.cortex-bad-alpha-short',
      '.cortex-bad-alpha-long',
      'button.cortex-compound',
    ])

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

    const inlineFixtureViolations = scanInlineGradientViolationsFromSource(`
      export function Fixture() {
        return <div class="cortex-inline" style={{ background: 'linear-gradient(red, blue)' }} />
      }
    `)
    expect(inlineFixtureViolations).toHaveLength(1)

    const inlineViolations = scanTsxSources(scanInlineGradientViolationsFromSource)
    expect(inlineViolations, sourceViolationMessage(inlineViolations)).toEqual([])
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

    const inlineFixtureViolations = scanInlineGlowViolationsFromSource(`
      export function Fixture() {
        return <div class="cortex-inline" style={{ boxShadow: '0 0 12px red' }} />
      }
    `)
    expect(inlineFixtureViolations).toHaveLength(1)

    const inlineViolations = scanTsxSources(scanInlineGlowViolationsFromSource)
    expect(inlineViolations, sourceViolationMessage(inlineViolations)).toEqual([])
  })
})
