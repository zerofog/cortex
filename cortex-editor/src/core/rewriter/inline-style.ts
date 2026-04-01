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
import type { Project, SourceFile, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { readFile } from 'fs/promises'
import type { RewriteResult } from './types.js'
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase } from './jsx-utils.js'

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

  async rewrite(request: InlineStyleRewriteRequest): Promise<RewriteResult> {
    if (this.disposed) {
      return { success: false, filePath: request.filePath, reason: 'Rewriter is disposed' }
    }

    const { filePath, line, col, property, value } = request
    const camelProp = cssPropertyToCamelCase(property)

    let oldContent: string
    try {
      oldContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      return { success: false, filePath, reason: `Cannot read file: ${err instanceof Error ? err.message : err}` }
    }

    let project: Project
    let SK: typeof SyntaxKindEnum
    try {
      const ready = await this.ensureReady()
      project = ready.project
      SK = ready.SK
    } catch (err) {
      return { success: false, filePath, reason: `Rewriter init failed: ${err instanceof Error ? err.message : err}` }
    }

    let sourceFile: SourceFile
    const existing = project.getSourceFile(filePath)
    if (existing) {
      existing.replaceWithText(oldContent)
      sourceFile = existing
    } else {
      sourceFile = project.createSourceFile(filePath, oldContent, { overwrite: true })
    }

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
