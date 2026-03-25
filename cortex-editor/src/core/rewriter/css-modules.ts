import type { Root, Rule, default as PostCSS } from 'postcss'
import { createHash } from 'node:crypto'
import { determineWriteStrategy, recomposeBoxSides } from './shorthand.js'

let _postcss: typeof PostCSS | null = null
async function ensurePostCSS(): Promise<typeof PostCSS> {
  if (!_postcss) {
    try {
      _postcss = (await import('postcss')).default
    } catch {
      throw new Error('CSS Modules editing requires postcss. Run: npm install -D postcss')
    }
  }
  return _postcss
}

export interface CSSModulesRewriteRequest {
  cssFilePath: string
  selector: string
  property: string
  newValue: string
}

export type CSSModulesRewriteResult =
  | { success: true; filePath: string; oldContent: string; newContent: string }
  | { success: false; filePath: string; reason: string }

function md5(content: string): string {
  return createHash('md5').update(content).digest('hex')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function selectorMatchesClass(ruleSelector: string, targetClass: string): boolean {
  const escaped = escapeRegex(targetClass)
  const classRe = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`)
  const parts = ruleSelector.split(',')
  for (const part of parts) {
    if (classRe.test(part.trim())) return true
  }
  return false
}

function ruleHasApply(rule: Rule): boolean {
  for (const node of rule.nodes) {
    if (node.type === 'atrule' && node.name === 'apply') return true
  }
  return false
}

function ruleIsInsideAtRule(rule: Rule): boolean {
  return rule.parent?.type === 'atrule'
}

function findPropertyInRule(rule: Rule, property: string): boolean {
  let found = false
  rule.walkDecls(property, () => { found = true })
  if (found) return true
  const segments = property.split('-')
  for (let prefixLen = segments.length - 1; prefixLen >= 1; prefixLen--) {
    const candidateProp = segments.slice(0, prefixLen).join('-')
    rule.walkDecls(candidateProp, () => { found = true })
    if (found) return true
  }
  return false
}

export class CSSModulesRewriter {
  private readFile: (path: string) => Promise<string>
  private astCache = new Map<string, { hash: string; root: Root }>()
  private static MAX_CACHE_SIZE = 50

  constructor(opts: { readFile: (path: string) => Promise<string> }) {
    this.readFile = opts.readFile
  }

  async rewrite(request: CSSModulesRewriteRequest): Promise<CSSModulesRewriteResult> {
    const { cssFilePath, selector, property, newValue } = request

    let pc: typeof PostCSS
    try {
      pc = await ensurePostCSS()
    } catch (e) {
      return { success: false, filePath: cssFilePath, reason: e instanceof Error ? e.message : 'PostCSS not available' }
    }

    let content: string
    try {
      content = await this.readFile(cssFilePath)
    } catch {
      return { success: false, filePath: cssFilePath, reason: `CSS file not found: ${cssFilePath}` }
    }

    let root: Root
    try {
      root = this.parseWithCache(pc, cssFilePath, content)
    } catch (e) {
      this.astCache.delete(cssFilePath)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, filePath: cssFilePath, reason: `CSS parse error: ${msg}` }
    }

    const matchedRule = this.findRule(root, selector, property)
    if (!matchedRule.success) {
      this.astCache.delete(cssFilePath)
      return { success: false, filePath: cssFilePath, reason: matchedRule.reason }
    }
    const rule = matchedRule.rule

    if (ruleHasApply(rule)) {
      this.astCache.delete(cssFilePath)
      return { success: false, filePath: cssFilePath, reason: 'This rule uses @apply; cannot edit individual properties safely' }
    }

    const strategy = determineWriteStrategy(rule, property, newValue)

    switch (strategy.type) {
      case 'update-longhand':
        strategy.decl.value = newValue
        break
      case 'update-shorthand': {
        const recomposed = this.recomposeShorthand(strategy.newValues)
        strategy.shorthandDecl.value = recomposed
        break
      }
      case 'add-longhand':
      case 'add-longhand-override':
        rule.append(pc.decl({ prop: property, value: newValue }))
        break
    }

    const newContent = root.toString()
    // Update cache with mutated AST + new hash (avoids re-parse on next edit to same file)
    this.astCache.set(cssFilePath, { hash: md5(newContent), root })
    return { success: true, filePath: cssFilePath, oldContent: content, newContent }
  }

  dispose(): void {
    this.astCache.clear()
  }

  private parseWithCache(pc: typeof PostCSS, filePath: string, content: string): Root {
    const hash = md5(content)
    const cached = this.astCache.get(filePath)
    if (cached && cached.hash === hash) return cached.root

    const root = pc.parse(content, { from: filePath })

    if (this.astCache.size >= CSSModulesRewriter.MAX_CACHE_SIZE) {
      const firstKey = this.astCache.keys().next().value
      if (firstKey !== undefined) this.astCache.delete(firstKey)
    }
    this.astCache.set(filePath, { hash, root })
    return root
  }

  private findRule(
    root: Root,
    selector: string,
    property: string,
  ): { success: true; rule: Rule } | { success: false; reason: string } {
    const candidates: Rule[] = []

    if (selector === '*') {
      root.walk((node) => {
        if (node.type === 'rule' && findPropertyInRule(node as Rule, property)) {
          candidates.push(node as Rule)
        }
      })
      if (candidates.length === 0) {
        return { success: false, reason: `No CSS rule found for selector '*'` }
      }
      if (candidates.length > 1) {
        return { success: false, reason: `Ambiguous: multiple rules have ${property}` }
      }
      return { success: true, rule: candidates[0]! }
    }

    root.walk((node) => {
      if (node.type === 'rule' && selectorMatchesClass(node.selector, selector)) {
        candidates.push(node as Rule)
      }
    })

    if (candidates.length === 0) {
      return { success: false, reason: `No CSS rule found for selector '${selector}'` }
    }

    if (candidates.length === 1) {
      return { success: true, rule: candidates[0]! }
    }

    const baseRules = candidates.filter(r => !ruleIsInsideAtRule(r))
    if (baseRules.length > 0) {
      return { success: true, rule: baseRules[0]! }
    }
    return { success: true, rule: candidates[0]! }
  }

  private recomposeShorthand(values: Record<string, string>): string {
    if ('top' in values && 'right' in values && 'bottom' in values && 'left' in values) {
      return recomposeBoxSides(values as { top: string; right: string; bottom: string; left: string })
    }
    if ('width' in values || 'style' in values || 'color' in values) {
      const parts: string[] = []
      if (values.width) parts.push(values.width)
      if (values.style) parts.push(values.style)
      if (values.color) parts.push(values.color)
      return parts.join(' ')
    }
    return Object.values(values).join(' ')
  }
}
