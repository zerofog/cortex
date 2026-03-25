import type { Declaration, Rule } from 'postcss'

export type WriteStrategy =
  | { type: 'update-shorthand'; shorthandDecl: Declaration; parsedValues: Record<string, string>; newValues: Record<string, string> }
  | { type: 'update-longhand'; decl: Declaration; value: string }
  | { type: 'add-longhand'; prop: string; value: string }
  | { type: 'add-longhand-override'; prop: string; value: string; reason: string }

const BORDER_STYLES = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
])
const WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick'])
const LENGTH_RE = /^-?[\d.]+\w*$/

function hasFunction(value: string, fn: string): boolean {
  return value.includes(`${fn}(`)
}

function splitValues(value: string): string[] {
  const tokens: string[] = []
  let current = ''
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (current) tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

export function parseBoxSides(value: string): { top: string; right: string; bottom: string; left: string } | null {
  if (!value || hasFunction(value, 'var') || hasFunction(value, 'calc')) return null
  const parts = splitValues(value.trim())
  if (parts.length === 1) return { top: parts[0]!, right: parts[0]!, bottom: parts[0]!, left: parts[0]! }
  if (parts.length === 2) return { top: parts[0]!, right: parts[1]!, bottom: parts[0]!, left: parts[1]! }
  if (parts.length === 3) return { top: parts[0]!, right: parts[1]!, bottom: parts[2]!, left: parts[1]! }
  if (parts.length === 4) return { top: parts[0]!, right: parts[1]!, bottom: parts[2]!, left: parts[3]! }
  return null
}

export function recomposeBoxSides(sides: { top: string; right: string; bottom: string; left: string }): string {
  const { top, right, bottom, left } = sides
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

export function parseTypeClassified(value: string): { width?: string; style?: string; color?: string } | null {
  if (!value || hasFunction(value, 'var')) return null
  const tokens = splitValues(value.trim())
  const result: { width?: string; style?: string; color?: string } = {}
  const colorParts: string[] = []

  for (const token of tokens) {
    if (!result.style && BORDER_STYLES.has(token)) {
      result.style = token
    } else if (!result.width && (WIDTH_KEYWORDS.has(token) || LENGTH_RE.test(token))) {
      result.width = token
    } else {
      colorParts.push(token)
    }
  }

  if (colorParts.length > 0) {
    result.color = colorParts.join(' ')
  }
  return Object.keys(result).length > 0 ? result : null
}

type Parsed = { decl: Declaration; suffix: string; parsed: Record<string, string> }

function allParses(value: string): Record<string, string>[] {
  const results: Record<string, string>[] = []
  const box = parseBoxSides(value)
  if (box) results.push(box as unknown as Record<string, string>)
  const typed = parseTypeClassified(value)
  if (typed) results.push(typed as Record<string, string>)
  return results
}

export function findAndValidateShorthand(property: string, rule: Rule): Parsed | null {
  const segments = property.split('-')
  for (let prefixLen = segments.length - 1; prefixLen >= 1; prefixLen--) {
    const candidateProp = segments.slice(0, prefixLen).join('-')
    const suffix = segments.slice(prefixLen).join('-')
    let candidateDecl: Declaration | undefined
    rule.walkDecls(candidateProp, (d) => {
      if (!candidateDecl) candidateDecl = d
    })
    if (!candidateDecl) continue
    if (hasFunction(candidateDecl.value, 'var')) {
      return { decl: candidateDecl, suffix, parsed: {} }
    }
    for (const parsed of allParses(candidateDecl.value)) {
      if (suffix in parsed) {
        return { decl: candidateDecl, suffix, parsed }
      }
    }
  }
  return null
}

export function determineWriteStrategy(rule: Rule, property: string, newValue: string): WriteStrategy {
  let exactDecl: Declaration | undefined
  rule.walkDecls(property, (d) => {
    if (!exactDecl) exactDecl = d
  })
  if (exactDecl) {
    return { type: 'update-longhand', decl: exactDecl, value: newValue }
  }

  const shorthand = findAndValidateShorthand(property, rule)
  if (shorthand) {
    if (hasFunction(shorthand.decl.value, 'var')) {
      return {
        type: 'add-longhand-override',
        prop: property,
        value: newValue,
        reason: `Shorthand '${shorthand.decl.prop}' contains var(); cannot decompose safely`,
      }
    }
    const newValues = { ...shorthand.parsed }
    newValues[shorthand.suffix] = newValue
    return {
      type: 'update-shorthand',
      shorthandDecl: shorthand.decl,
      parsedValues: shorthand.parsed,
      newValues,
    }
  }

  return { type: 'add-longhand', prop: property, value: newValue }
}
