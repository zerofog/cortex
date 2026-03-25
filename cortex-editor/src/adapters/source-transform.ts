import path from 'path'
import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { SourceTransformOptions, TransformResult } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a string for safe use inside an HTML attribute value. */
const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }
function escapeAttr(s: string): string {
  return s.replace(/[&"'<>]/g, c => ESCAPE_MAP[c]!)
}

/**
 * Extract the tag name and its end position from a JSXOpeningElement's name node.
 * Handles JSXIdentifier, JSXMemberExpression, and JSXNamespacedName.
 * Returns null for unrecognized name types.
 */
function resolveJSXName(
  name: Record<string, unknown>,
): { tagName: string; endPos: number } | null {
  if (name.type === 'JSXIdentifier') {
    const endPos = name.end
    if (typeof endPos !== 'number') return null
    const tagName = name.name
    /* v8 ignore next */
    if (typeof tagName !== 'string') return null
    return { tagName, endPos }
  }
  if (name.type === 'JSXMemberExpression') {
    const prop = name.property as Record<string, unknown>
    const endPos = prop.end
    if (typeof endPos !== 'number') return null
    const tagName = prop.name
    /* v8 ignore next */
    if (typeof tagName !== 'string') return null
    return { tagName, endPos }
  }
  if (name.type === 'JSXNamespacedName') {
    const n = name.name as Record<string, unknown>
    const endPos = n.end
    if (typeof endPos !== 'number') return null
    const tagName = n.name
    /* v8 ignore next */
    if (typeof tagName !== 'string') return null
    return { tagName, endPos }
  }
  /* v8 ignore next */
  return null
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

/** Keys that are never AST children — skip to avoid recursing into metadata. */
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'])

/**
 * Shared parse options — hoisted to module scope to avoid per-call allocation.
 * `@babel/parser` reads but doesn't mutate the options, so sharing is safe.
 *
 * Note: the decorator `version` field is accepted at runtime but missing from
 * `@babel/parser`'s type definitions, hence the `Record<string, string>` cast.
 */
const PARSE_OPTIONS = {
  sourceType: 'module' as const,
  plugins: [
    'typescript',
    'jsx',
    ['decorators', { version: '2023-07' } as Record<string, string>],
    'importAttributes',
    'explicitResourceManagement',
  ],
  ranges: false,
}

/**
 * Iterative DFS walk of a Babel AST, calling visitor on every JSXOpeningElement.
 * Uses Record<string, unknown> rather than Babel's full type hierarchy
 * to avoid coupling to 100+ node types that change between versions.
 */
function walkJSX(root: Record<string, unknown>, visitor: (el: Record<string, unknown>) => void): void {
  const stack: Record<string, unknown>[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (!node || typeof node !== 'object') continue
    if (node.type === 'JSXOpeningElement') visitor(node)
    const keys = Object.keys(node)
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i]!
      if (SKIP_KEYS.has(key)) continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (let j = value.length - 1; j >= 0; j--) {
          const item = value[j]
          if (item && typeof item === 'object') {
            stack.push(item as Record<string, unknown>)
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as Record<string, unknown>)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CSS Module annotation helpers
// ---------------------------------------------------------------------------

interface CSSModuleBinding {
  localName: string
  cssPath: string  // Relative to project root, forward slashes
}

/**
 * Collect CSS module import bindings from the AST.
 * Walks ImportDeclaration nodes and collects default imports of .module.css files.
 */
function collectCSSModuleImports(
  ast: Record<string, unknown>,
  cleanId: string,
  projectRoot: string,
  resolveAlias?: (specifier: string) => string | null,
): CSSModuleBinding[] {
  const program = ast.program as Record<string, unknown> | undefined
  const body = program?.body as Array<Record<string, unknown>> | undefined
  if (!body) return []

  const bindings: CSSModuleBinding[] = []
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const source = node.source as Record<string, unknown> | undefined
    const specifier = source?.value as string | undefined
    if (!specifier || !specifier.endsWith('.module.css')) continue

    let resolvedPath: string | null = null
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      // Relative import — resolve relative to importing file's directory
      resolvedPath = path.resolve(path.dirname(cleanId), specifier)
    } else if (resolveAlias) {
      // Aliased import — resolve via bundler alias map
      const aliasResolved = resolveAlias(specifier)
      if (aliasResolved) {
        if (path.isAbsolute(aliasResolved)) {
          resolvedPath = aliasResolved
        } else {
          resolvedPath = path.resolve(projectRoot, aliasResolved)
        }
      }
    }
    if (!resolvedPath) continue

    // Make relative to project root with forward slashes
    const cssPath = path.relative(projectRoot, resolvedPath).replace(/\\/g, '/')

    const specifiers = node.specifiers as Array<Record<string, unknown>> | undefined
    if (!specifiers) continue
    for (const spec of specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        const local = spec.local as Record<string, unknown> | undefined
        const name = local?.name as string | undefined
        if (name) bindings.push({ localName: name, cssPath })
      } else if (spec.type === 'ImportSpecifier') {
        // import { default as s } from './X.module.css'
        const imported = spec.imported as Record<string, unknown> | undefined
        const importedName = imported?.type === 'Identifier'
          ? (imported.name as string)
          : imported?.type === 'StringLiteral' ? (imported.value as string) : null
        if (importedName === 'default') {
          const local = spec.local as Record<string, unknown> | undefined
          const name = local?.name as string | undefined
          if (name) bindings.push({ localName: name, cssPath })
        }
      }
    }
  }
  return bindings
}

/**
 * Extract CSS module selectors from a className expression by walking for
 * MemberExpression nodes whose object matches a CSS module binding.
 */
function extractCSSSelectors(
  expr: Record<string, unknown>,
  bindingMap: Map<string, string>,
): { cssPath: string; selector: string }[] {
  const results: { cssPath: string; selector: string }[] = []
  walkExprForBindings(expr, bindingMap, results)
  return results
}

function walkExprForBindings(
  node: Record<string, unknown>,
  bindingMap: Map<string, string>,
  results: { cssPath: string; selector: string }[],
): void {
  if (!node || typeof node !== 'object' || !node.type) return

  if (node.type === 'MemberExpression') {
    const obj = node.object as Record<string, unknown> | undefined
    if (obj?.type === 'Identifier') {
      const cssPath = bindingMap.get(obj.name as string)
      if (cssPath) {
        const computed = node.computed as boolean | undefined
        const prop = node.property as Record<string, unknown> | undefined
        if (computed) {
          if (prop?.type === 'StringLiteral') {
            results.push({ cssPath, selector: `.${prop.value as string}` })
          } else {
            // Dynamic access: styles[variant] → wildcard
            results.push({ cssPath, selector: '*' })
          }
        } else if (prop?.type === 'Identifier') {
          results.push({ cssPath, selector: `.${prop.name as string}` })
        }
        return  // Don't recurse into already-matched MemberExpression
      }
    }
  }

  // Recurse into child nodes (covers CallExpression args, ObjectExpression keys, etc.)
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key) || key === 'type') continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') {
          walkExprForBindings(item as Record<string, unknown>, bindingMap, results)
        }
      }
    } else if (val && typeof val === 'object') {
      walkExprForBindings(val as Record<string, unknown>, bindingMap, results)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a source transform function bound to a project root.
 * The returned function adds `data-cortex-source="relativePath:line:col"`
 * attributes to lowercase JSX elements (including member expressions like
 * motion.div). Returns null if no changes were made.
 *
 * Format: `data-cortex-source="relativePath:line:col"` where line and col
 * are the last two colon-separated segments. Paths are always relative
 * (no drive letters) with forward slashes.
 *
 * Note: Only `.jsx` and `.tsx` files are processed. Projects using JSX in
 * `.js`/`.ts` files should rename them or configure the framework adapter.
 *
 * When wrapping in a Vite plugin, use `enforce: 'pre'` so this runs
 * before React's JSX compilation removes JSX syntax.
 */
export function createSourceTransform(
  projectRoot: string,
  options?: SourceTransformOptions,
): (code: string, id: string) => TransformResult | null {
  const isProd = options?.mode === 'production' ||
    (options?.mode == null && process.env.NODE_ENV === 'production')

  return function transformSource(code: string, id: string): TransformResult | null {
    if (isProd) return null
    // Strip Vite HMR query params (e.g. ?v=abc123) before extension check
    const cleanId = id.split('?')[0]!
    if (!/\.[jt]sx$/.test(cleanId)) return null
    if (cleanId.includes('/node_modules/')) {
      const included = options?.includeNodeModules ?? []
      if (!included.some(pkg => cleanId.includes(`/node_modules/${pkg}/`))) return null
    }

    const relativePath = path.relative(projectRoot, cleanId).replace(/\\/g, '/')
    const safePath = relativePath.startsWith('..')
      ? path.basename(cleanId).replace(/\\/g, '/')
      : relativePath
    const escapedPath = escapeAttr(safePath)

    let ast: Record<string, unknown>
    try {
      ast = parse(code, PARSE_OPTIONS as Parameters<typeof parse>[1]) as unknown as Record<string, unknown>
    } catch (e) {
      if (options?.onParseError) {
        options.onParseError(id, e)
      } else {
        console.warn(`[cortex] Failed to parse ${cleanId}:`, e instanceof Error ? e.message : e)
      }
      return null
    }

    // Pre-pass: collect CSS module import bindings
    const cssBindings = collectCSSModuleImports(ast, cleanId, projectRoot, options?.resolveAlias)
    const bindingMap = new Map<string, string>()
    for (const b of cssBindings) bindingMap.set(b.localName, b.cssPath)

    let s = null as MagicString | null

    walkJSX(ast, (el) => {
      const name = el.name as Record<string, unknown> | undefined
      if (!name) return

      const resolved = resolveJSXName(name)
      if (!resolved || !/^[a-z]/.test(resolved.tagName)) return

      const start = el.start as number | null | undefined
      if (start == null || start < 0 || start >= code.length) return

      if (resolved.endPos < 0 || resolved.endPos > code.length) return
      if (resolved.endPos < start) return

      // Skip elements that already have the attribute (AST-level idempotency)
      const attrs = el.attributes as Array<Record<string, unknown>> | undefined
      if (attrs?.some(a => a.type === 'JSXAttribute' &&
        (a.name as Record<string, unknown>)?.name === 'data-cortex-source')) return

      const loc = el.loc as { start: { line: number; column: number } } | undefined
      if (!loc) return

      const line = loc.start.line
      const col = loc.start.column + 1  // Babel is 0-based column, we want 1-based

      if (!s) s = new MagicString(code)
      s.appendLeft(resolved.endPos, ` data-cortex-source="${escapedPath}:${line}:${col}"`)

      // CSS Module annotation: check className for CSS module binding references
      if (bindingMap.size > 0 && attrs) {
        // Skip if element already has data-cortex-css
        if (attrs.some(a => a.type === 'JSXAttribute' &&
          (a.name as Record<string, unknown>)?.name === 'data-cortex-css')) return

        for (const attr of attrs) {
          if (attr.type !== 'JSXAttribute') continue
          const attrName = attr.name as Record<string, unknown> | undefined
          if (attrName?.name !== 'className') continue

          const attrValue = attr.value as Record<string, unknown> | undefined
          if (!attrValue) continue

          // className="static" → no annotation (StringLiteral, not CSS Modules)
          if (attrValue.type === 'StringLiteral') continue

          // className={expression} → walk expression for CSS module bindings
          let expr: Record<string, unknown> | undefined
          if (attrValue.type === 'JSXExpressionContainer') {
            expr = attrValue.expression as Record<string, unknown> | undefined
          }
          if (!expr || expr.type === 'JSXEmptyExpression') continue

          const selectors = extractCSSSelectors(expr, bindingMap)
          if (selectors.length === 0) continue

          // Group selectors by CSS file path
          const grouped = new Map<string, string[]>()
          for (const sel of selectors) {
            const existing = grouped.get(sel.cssPath) ?? []
            existing.push(sel.selector)
            grouped.set(sel.cssPath, existing)
          }

          // Build annotation: "cssPath:selector1,selector2"
          // Use first CSS file path (most common case: one CSS module per element)
          const [cssPath, sels] = grouped.entries().next().value!
          const uniqueSels = [...new Set(sels)]
          const annotation = `${cssPath}:${uniqueSels.join(',')}`

          if (!s) s = new MagicString(code)
          s.appendLeft(resolved.endPos, ` data-cortex-css="${escapeAttr(annotation)}"`)
          break  // Only one className attribute per element
        }
      }
    })

    if (s == null || !s.hasChanged()) return null
    return {
      code: s.toString(),
      map: s.generateMap({
        hires: 'boundary',
        source: safePath,
        file: safePath,
        includeContent: true,
      }) as TransformResult['map'],
    }
  }
}
