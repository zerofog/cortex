import { parse } from '@babel/parser'
import { readFile as fsReadFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import type { Node } from '@babel/types'
import { PARSE_PLUGINS } from '../parser-config.js'

export interface ResolvedCSSMapping {
  cssFilePath: string
  selector: string
}

interface CacheEntry {
  mtime: number
  result: ResolvedCSSMapping[]
}

const PARSE_OPTIONS = {
  sourceType: 'module' as const,
  plugins: PARSE_PLUGINS,
}

const MAX_CACHE = 100

export class RuntimeCSSResolver {
  private cache = new Map<string, CacheEntry>()

  async resolve(
    source: string,
    projectRoot: string,
    readFile?: (path: string) => Promise<string>,
  ): Promise<ResolvedCSSMapping | null> {
    const lastColon = source.lastIndexOf(':')
    const secondLastColon = source.lastIndexOf(':', lastColon - 1)
    if (lastColon === -1 || secondLastColon === -1 || secondLastColon === 0) return null

    const filePath = source.slice(0, secondLastColon)
    const line = parseInt(source.slice(secondLastColon + 1, lastColon), 10)
    const col = parseInt(source.slice(lastColon + 1), 10)
    if (Number.isNaN(line) || Number.isNaN(col)) return null

    const absPath = resolve(projectRoot, filePath)
    let content: string
    let statMtime: number | undefined

    if (readFile) {
      content = await readFile(absPath)
    } else {
      const st = await stat(absPath)
      statMtime = st.mtimeMs
      const cached = this.cache.get(absPath)
      if (cached && cached.mtime === statMtime) {
        return this.findAtPosition(cached.result, line, col)
      }
      content = await fsReadFile(absPath, 'utf-8')
    }

    let ast: ReturnType<typeof parse>
    try {
      ast = parse(content, PARSE_OPTIONS)
    } catch (err) {
      console.warn('[cortex] Failed to parse %s for CSS module resolution: %s', absPath, err instanceof Error ? err.message : err)
      return null
    }

    const bindings = new Map<string, string>()
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration') continue
      const src = node.source.value
      if (!src.endsWith('.module.css')) continue
      for (const spec of node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          bindings.set(spec.local.name, src)
        } else if (
          spec.type === 'ImportSpecifier' &&
          ((spec.imported.type === 'Identifier' && spec.imported.name === 'default') ||
           (spec.imported.type === 'StringLiteral' && spec.imported.value === 'default'))
        ) {
          bindings.set(spec.local.name, src)
        }
      }
    }

    if (bindings.size === 0) return null

    const jsxElements = collectJSXElements(ast.program)
    const results: ResolvedCSSMapping[] = []

    for (const el of jsxElements) {
      const mapping = extractMapping(el, bindings, dirname(absPath))
      if (mapping) results.push({ ...mapping, _line: el.loc!.start.line, _col: el.loc!.start.column } as any)
    }

    if (!readFile) {
      if (this.cache.size >= MAX_CACHE) {
        const oldest = this.cache.keys().next().value!
        this.cache.delete(oldest)
      }
      this.cache.set(absPath, { mtime: statMtime!, result: results })
    }

    return this.findAtPosition(results, line, col)
  }

  private findAtPosition(results: ResolvedCSSMapping[], line: number, col: number): ResolvedCSSMapping | null {
    let best: ResolvedCSSMapping | null = null
    let bestDist = Infinity

    for (const r of results) {
      const entry = r as any
      const eLine = entry._line as number
      const eCol = entry._col as number
      const dist = Math.abs(eLine - line) * 10000 + Math.abs(eCol - col)
      if (dist < bestDist) {
        bestDist = dist
        best = r
      }
    }

    if (!best) return null
    // Distance cap: reject matches more than 3 lines away from the target position.
    // Without this, every query returns *something* even if the nearest JSX element
    // is in a completely different part of the file.
    const MAX_DIST = 3 * 10000 // 3 lines + any column offset
    if (bestDist > MAX_DIST) return null
    return { cssFilePath: best.cssFilePath, selector: best.selector }
  }

  dispose(): void {
    this.cache.clear()
  }
}

function collectJSXElements(node: Node): Node[] {
  const results: Node[] = []
  walk(node, n => {
    if (n.type === 'JSXOpeningElement') {
      results.push(n)
    }
  })
  return results
}

function walk(node: any, visit: (n: Node) => void): void {
  if (!node || typeof node !== 'object') return
  if (node.type) visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const item of val) walk(item, visit)
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, visit)
    }
  }
}

function extractMapping(
  el: Node,
  bindings: Map<string, string>,
  fileDir: string,
): (ResolvedCSSMapping) | null {
  const attrs = (el as any).attributes as any[] | undefined
  if (!attrs) return null

  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue
    const name = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (name !== 'className') continue

    const value = attr.value
    if (!value || value.type !== 'JSXExpressionContainer') continue

    const expr = value.expression
    return resolveMemberExpression(expr, bindings, fileDir)
  }
  return null
}

function resolveMemberExpression(
  expr: any,
  bindings: Map<string, string>,
  fileDir: string,
): ResolvedCSSMapping | null {
  if (expr.type !== 'MemberExpression') return null

  const obj = expr.object
  if (obj.type !== 'Identifier') return null

  const cssPath = bindings.get(obj.name)
  if (!cssPath) return null

  const cssFilePath = resolve(fileDir, cssPath)

  if (expr.computed) {
    const prop = expr.property
    if (prop.type === 'StringLiteral') {
      return { cssFilePath, selector: `.${prop.value}` }
    }
    return { cssFilePath, selector: '*' }
  }

  if (expr.property.type === 'Identifier') {
    return { cssFilePath, selector: `.${expr.property.name}` }
  }

  return null
}
