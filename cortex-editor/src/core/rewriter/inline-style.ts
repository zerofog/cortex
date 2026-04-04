/**
 * InlineStyleRewriter — deterministic AST-based rewriter for inline style={{}} prop editing.
 *
 * Given a JSX source location and a CSS property/value pair, finds the JSX element and:
 * - Adds a style prop if none exists
 * - Merges into an existing style object literal
 * - Updates an existing property value (only if it's a literal)
 * - Bails to AI for non-object-literal style expressions
 *
 * Uses ts-morph for AST manipulation. Not concurrent-safe for the same file.
 */
import type { Project, SourceFile, SyntaxKind as SyntaxKindEnum, ObjectLiteralExpression } from 'ts-morph'
import { readFile } from 'fs/promises'
import type { RewriteResult } from './types.js'
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase, LONGHAND_TO_SHORTHAND } from './jsx-utils.js'

export interface InlineStyleRewriteRequest {
  /** Absolute path to the source file */
  filePath: string
  /** 1-based line number of the JSX element */
  line: number
  /** 1-based column of the JSX element */
  col: number
  /** CSS property name (kebab-case, e.g., 'padding-top') */
  property: string
  /** CSS value (e.g., '16px') */
  value: string
}

export class InlineStyleRewriter {
  private project: Project | null = null
  private SK: typeof SyntaxKindEnum | null = null
  private _readyPromise: Promise<{ project: Project; SK: typeof SyntaxKindEnum }> | null = null
  private disposed = false

  private ensureReady(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    if (this.disposed) return Promise.reject(new Error('Rewriter is disposed'))
    if (!this._readyPromise) {
      this._readyPromise = this._initialize().catch(err => {
        this._readyPromise = null
        throw err
      })
    }
    return this._readyPromise
  }

  private async _initialize(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    const mod = await ensureTsMorph()
    this.SK = mod.SyntaxKind
    this.project = new mod.Project({
      useInMemoryFileSystem: false,
      compilerOptions: { jsx: 4 /* JsxEmit.ReactJSX */, allowJs: true },
      skipAddingFilesFromTsConfig: true,
    })
    return { project: this.project, SK: this.SK }
  }

  /**
   * Read a file and prepare a ts-morph SourceFile for manipulation.
   * Consolidates the disposed check, file read, lazy init, and sourceFile
   * create-or-refresh that every public method needs.
   */
  private async prepareSourceFile(filePath: string): Promise<
    | { ok: true; sourceFile: SourceFile; oldContent: string; SK: typeof SyntaxKindEnum }
    | { ok: false; result: RewriteResult }
  > {
    if (this.disposed) {
      return { ok: false, result: { success: false, filePath, reason: 'Rewriter is disposed' } }
    }

    let oldContent: string
    try {
      oldContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      return { ok: false, result: { success: false, filePath, reason: `Cannot read file: ${err instanceof Error ? err.message : err}` } }
    }

    let project: Project
    let SK: typeof SyntaxKindEnum
    try {
      const ready = await this.ensureReady()
      project = ready.project
      SK = ready.SK
    } catch (err) {
      return { ok: false, result: { success: false, filePath, reason: `Rewriter init failed: ${err instanceof Error ? err.message : err}` } }
    }

    let sourceFile: SourceFile
    const existing = project.getSourceFile(filePath)
    if (existing) {
      existing.replaceWithText(oldContent)
      sourceFile = existing
    } else {
      sourceFile = project.createSourceFile(filePath, oldContent, { overwrite: true })
    }

    return { ok: true, sourceFile, oldContent, SK }
  }

  async rewrite(request: InlineStyleRewriteRequest): Promise<RewriteResult> {
    const { filePath, line, col, property, value } = request
    const camelProp = cssPropertyToCamelCase(property)

    const prep = await this.prepareSourceFile(filePath)
    if (!prep.ok) return prep.result
    const { sourceFile, oldContent, SK } = prep

    const jsxElement = findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) {
      return { success: false, filePath, reason: `No JSX element found at ${line}:${col}` }
    }

    // Look for existing style attribute
    const styleAttrRaw = jsxElement.getAttribute('style')
    const styleAttr = styleAttrRaw?.asKind(SK.JsxAttribute)

    if (!styleAttr) {
      // No style prop — add one
      const propKey = this.formatObjectKey(camelProp)
      jsxElement.addAttribute({
        name: 'style',
        initializer: `{{ ${propKey}: ${JSON.stringify(value)} }}`,
      })
      const newContent = sourceFile.getFullText()
      return { success: true, filePath, oldContent, newContent }
    }

    // Has style attribute — inspect the initializer
    const initializer = styleAttr.getInitializer()
    if (!initializer) {
      return { success: false, filePath, reason: 'style attribute has no value' }
    }

    const initKind = initializer.getKind()
    if (initKind !== SK.JsxExpression) {
      return { success: false, filePath, reason: 'style attribute is not a JSX expression' }
    }

    const jsxExpr = initializer.asKind(SK.JsxExpression)
    const expression = jsxExpr?.getExpression()
    if (!expression) {
      return { success: false, filePath, reason: 'Empty JSX expression in style' }
    }

    if (expression.getKind() !== SK.ObjectLiteralExpression) {
      return { success: false, filePath, reason: `style is not an object literal — route to AI (found ${expression.getKindName()})` }
    }

    const objLiteral = expression.asKind(SK.ObjectLiteralExpression)
    if (!objLiteral) {
      return { success: false, filePath, reason: 'Expected object literal expression' }
    }

    // Check for existing property
    for (const prop of objLiteral.getProperties()) {
      const propKind = prop.getKind()

      // Handle ShorthandPropertyAssignment — bail
      if (propKind === SK.ShorthandPropertyAssignment) {
        const shorthand = prop.asKind(SK.ShorthandPropertyAssignment)
        if (!shorthand) continue
        if (shorthand.getName() === camelProp) {
          return { success: false, filePath, reason: `Property '${camelProp}' uses shorthand assignment — route to AI` }
        }
        continue
      }

      if (propKind === SK.SpreadAssignment) continue

      if (propKind === SK.PropertyAssignment) {
        const propAssign = prop.asKind(SK.PropertyAssignment)
        if (!propAssign) continue
        const name = propAssign.getName()
        // For quoted keys, getName() returns the unquoted string
        // For computed keys we skip
        if (name !== camelProp) continue

        // Found the property — check if its value is a literal
        const propInit = propAssign.getInitializer()
        if (!propInit) {
          return { success: false, filePath, reason: `Property '${camelProp}' has no initializer` }
        }

        const propInitKind = propInit.getKind()
        if (propInitKind !== SK.StringLiteral && propInitKind !== SK.NumericLiteral) {
          return { success: false, filePath, reason: `Property '${camelProp}' has non-literal value — route to AI` }
        }

        // Update the value
        propAssign.setInitializer(JSON.stringify(value))
        const newContent = sourceFile.getFullText()
        return { success: true, filePath, oldContent, newContent }
      }
    }

    // Property not found — add it
    const propKey = this.formatObjectKey(camelProp)
    objLiteral.addPropertyAssignment({
      name: propKey,
      initializer: JSON.stringify(value),
    })
    const newContent = sourceFile.getFullText()
    return { success: true, filePath, oldContent, newContent }
  }

  /**
   * Remove a single CSS property from the element's inline style object.
   * Delegates to removeProperties with a single-element targets array.
   *
   * Returns success with unchanged content if the property or style attribute
   * doesn't exist (nothing to clean up is not an error).
   */
  async removeProperty(request: { filePath: string; line: number; col: number; property: string }): Promise<RewriteResult> {
    return this.removeProperties({
      filePath: request.filePath,
      targets: [{ line: request.line, col: request.col, property: request.property }],
    })
  }

  /**
   * Remove a property from an object literal by exact match or shorthand parent.
   * Returns true if a property was removed.
   */
  private removePropertyFromObject(
    objLiteral: ObjectLiteralExpression,
    camelProp: string,
    SK: typeof SyntaxKindEnum,
  ): boolean {
    // Remove ALL properties that could set the target CSS property:
    // both the exact longhand AND any shorthand parent.
    // e.g., for paddingTop: remove both paddingTop AND padding —
    // a surviving shorthand still sets the target property and
    // would override the CSS class we're writing to.
    const shorthand = LONGHAND_TO_SHORTHAND[camelProp]
    const targets = shorthand ? [camelProp, shorthand] : [camelProp]

    let removed = false
    for (const target of targets) {
      for (const prop of objLiteral.getProperties()) {
        if (prop.getKind() === SK.PropertyAssignment) {
          const propAssign = prop.asKind(SK.PropertyAssignment)
          if (!propAssign || propAssign.getName() !== target) continue
          propAssign.remove()
          removed = true
          break // only one match per target name; move to next target
        } else if (prop.getKind() === SK.ShorthandPropertyAssignment) {
          const shorthandAssign = prop.asKind(SK.ShorthandPropertyAssignment)
          if (!shorthandAssign || shorthandAssign.getName() !== target) continue
          shorthandAssign.remove()
          removed = true
          break
        }
      }
    }

    return removed
  }

  /**
   * Batch-remove a CSS property from multiple elements' inline styles in a single file.
   * Reads once, modifies all targets on the same AST, writes once.
   * Eliminates line-shift races when multiple elements are in the same file.
   */
  async removeProperties(request: {
    filePath: string
    targets: Array<{ line: number; col: number; property: string }>
  }): Promise<RewriteResult> {
    const { filePath, targets } = request
    if (targets.length === 0) {
      // No targets is a no-op, but return truthful content for undo safety
      const prep = await this.prepareSourceFile(filePath)
      if (!prep.ok) return prep.result
      return { success: true, filePath, oldContent: prep.oldContent, newContent: prep.oldContent }
    }

    const prep = await this.prepareSourceFile(filePath)
    if (!prep.ok) return prep.result
    const { sourceFile, oldContent, SK } = prep

    // Two-pass approach: collect all AST references BEFORE any mutations.
    // Mutations (removePropertyFromObject, styleAttr.remove) shift line positions
    // in the live AST, which would cause subsequent findJsxElementAt calls to
    // miss their targets — the exact line-shift race this method eliminates.
    type Collected = {
      camelProp: string
      objLiteral: ObjectLiteralExpression
      styleAttr: import('ts-morph').JsxAttribute
    }
    const collected: Collected[] = []
    for (const target of targets) {
      const camelProp = cssPropertyToCamelCase(target.property)
      const jsxElement = findJsxElementAt(sourceFile, target.line, target.col, SK)
      if (!jsxElement) continue

      const styleAttrRaw = jsxElement.getAttribute('style')
      const styleAttr = styleAttrRaw?.asKind(SK.JsxAttribute)
      if (!styleAttr) continue

      const initializer = styleAttr.getInitializer()
      if (!initializer) continue

      const jsxExpr = initializer.asKind(SK.JsxExpression)
      const expression = jsxExpr?.getExpression()
      if (!expression || expression.getKind() !== SK.ObjectLiteralExpression) continue

      const objLiteral = expression.asKind(SK.ObjectLiteralExpression)
      if (!objLiteral) continue

      collected.push({ camelProp, objLiteral, styleAttr })
    }

    // Pass 2: group by styleAttr to avoid stale-node races.
    // When 2+ targets reference the same element, processing them individually
    // can cause styleAttr.remove() on the first entry to detach the node,
    // making subsequent entries operate on stale AST references.
    const byAttr = new Map<number, {
      camelProps: string[]
      objLiteral: ObjectLiteralExpression
      styleAttr: import('ts-morph').JsxAttribute
    }>()
    for (const { camelProp, objLiteral, styleAttr } of collected) {
      const key = styleAttr.getStart()
      const existing = byAttr.get(key)
      if (existing) {
        existing.camelProps.push(camelProp)
      } else {
        byAttr.set(key, { camelProps: [camelProp], objLiteral, styleAttr })
      }
    }

    // Mutate: remove all properties per element, then check if empty
    try {
      for (const { camelProps, objLiteral, styleAttr } of byAttr.values()) {
        let anyRemoved = false
        for (const camelProp of camelProps) {
          if (this.removePropertyFromObject(objLiteral, camelProp, SK)) {
            anyRemoved = true
          }
        }
        if (anyRemoved && objLiteral.getProperties().length === 0) {
          styleAttr.remove()
        }
      }
    } catch (err) {
      return { success: false, filePath, reason: `AST mutation failed: ${err instanceof Error ? err.message : err}` }
    }

    const newContent = sourceFile.getFullText()
    return { success: true, filePath, oldContent, newContent }
  }

  /**
   * Format an object key — quote it if it contains special characters
   * (CSS custom properties like --my-var need quoting).
   */
  private formatObjectKey(key: string): string {
    // If the key is a valid JS identifier, use it bare
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key
    // Otherwise quote it
    return JSON.stringify(key)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.project = null
    this.SK = null
    this._readyPromise = null
  }
}
