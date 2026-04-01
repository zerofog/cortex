/**
 * ToolApplicator — deterministic AST-based applicator for structured tool_use JSON actions.
 *
 * Accepts structured actions (set_inline_style, replace_attribute, replace_line_content)
 * and applies them to JSX source code via ts-morph AST manipulation or string operations.
 *
 * Uses in-memory file system (no disk I/O). Thread-safe for different files, not for the same file.
 */
import type { Project, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase } from './rewriter/jsx-utils.js'

// ── Types ─────────────────────────────────────────────────────────

export type ToolAction =
  | { tool: 'set_inline_style'; changes: Array<{ property: string; value: string }> }
  | { tool: 'replace_attribute'; attribute: string; value: string }
  | { tool: 'replace_line_content'; lineNumber: number; oldContent: string; newContent: string }

export type ApplyResult =
  | { success: true; content: string }
  | { success: false; reason: string }

// ── ToolApplicator ────────────────────────────────────────────────

export class ToolApplicator {
  private project: Project | null = null
  private SK: typeof SyntaxKindEnum | null = null
  private _readyPromise: Promise<{ project: Project; SK: typeof SyntaxKindEnum }> | null = null
  private disposed = false

  private ensureReady(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    if (this.disposed) return Promise.reject(new Error('Applicator is disposed'))
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
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4 /* JsxEmit.ReactJSX */, allowJs: true },
      skipAddingFilesFromTsConfig: true,
    })
    return { project: this.project, SK: this.SK }
  }

  /**
   * Apply a structured tool action to source content.
   *
   * For set_inline_style and replace_attribute, line/col are 1-based positions
   * identifying the target JSX element. For replace_line_content, line/col are ignored
   * (the action carries its own lineNumber).
   */
  async apply(
    content: string,
    filePath: string,
    line: number,
    col: number,
    action: ToolAction,
  ): Promise<ApplyResult> {
    if (this.disposed) {
      return { success: false, reason: 'Applicator is disposed' }
    }

    switch (action.tool) {
      case 'set_inline_style':
        return this.applySetInlineStyle(content, filePath, line, col, action.changes)
      case 'replace_attribute':
        return this.applyReplaceAttribute(content, filePath, line, col, action.attribute, action.value)
      case 'replace_line_content':
        return this.applyReplaceLineContent(content, action.lineNumber, action.oldContent, action.newContent)
      default: {
        const _exhaustive: never = action
        return { success: false, reason: `Unknown tool: ${(_exhaustive as ToolAction).tool}` }
      }
    }
  }

  // ── set_inline_style ──────────────────────────────────────────

  private async applySetInlineStyle(
    content: string,
    filePath: string,
    line: number,
    col: number,
    changes: Array<{ property: string; value: string }>,
  ): Promise<ApplyResult> {
    let project: Project
    let SK: typeof SyntaxKindEnum
    try {
      const ready = await this.ensureReady()
      project = ready.project
      SK = ready.SK
    } catch (err) {
      return { success: false, reason: `Init failed: ${err instanceof Error ? err.message : err}` }
    }

    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true })
    const jsxElement = findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) {
      return { success: false, reason: `No JSX element found at ${line}:${col}` }
    }

    // Look for existing style attribute
    const styleAttrRaw = jsxElement.getAttribute('style')
    const styleAttr = styleAttrRaw?.asKind(SK.JsxAttribute)

    if (!styleAttr) {
      // No style prop — add one with all changes
      const props = changes.map(c => {
        const key = this.formatObjectKey(cssPropertyToCamelCase(c.property))
        return `${key}: ${JSON.stringify(c.value)}`
      })
      jsxElement.addAttribute({
        name: 'style',
        initializer: `{{ ${props.join(', ')} }}`,
      })
      const result = sourceFile.getFullText()
      project.removeSourceFile(sourceFile)
      return { success: true, content: result }
    }

    // Has style attribute — inspect the initializer
    const initializer = styleAttr.getInitializer()
    if (!initializer) {
      return { success: false, reason: 'style attribute has no value' }
    }

    if (initializer.getKind() !== SK.JsxExpression) {
      return { success: false, reason: 'style attribute is not a JSX expression' }
    }

    const jsxExpr = initializer.asKind(SK.JsxExpression)
    const expression = jsxExpr?.getExpression()
    if (!expression) {
      return { success: false, reason: 'Empty JSX expression in style' }
    }

    // Non-literal expression: wrap with spread
    if (expression.getKind() !== SK.ObjectLiteralExpression) {
      const originalExprText = expression.getText()
      const props = changes.map(c => {
        const key = this.formatObjectKey(cssPropertyToCamelCase(c.property))
        return `${key}: ${JSON.stringify(c.value)}`
      })
      expression.replaceWithText(`{ ...${originalExprText}, ${props.join(', ')} }`)
      const result = sourceFile.getFullText()
      project.removeSourceFile(sourceFile)
      return { success: true, content: result }
    }

    const objLiteral = expression.asKind(SK.ObjectLiteralExpression)
    if (!objLiteral) {
      return { success: false, reason: 'Expected object literal expression' }
    }

    // Apply each change
    for (const change of changes) {
      const camelProp = cssPropertyToCamelCase(change.property)
      const result = this.applyOneStyleChange(objLiteral, camelProp, change.value, SK)
      if (!result.success) {
        return result
      }
    }

    const finalContent = sourceFile.getFullText()
    project.removeSourceFile(sourceFile)
    return { success: true, content: finalContent }
  }

  /** Apply a single style property change to an ObjectLiteralExpression (mutates AST in place). */
  private applyOneStyleChange(
    objLiteral: import('ts-morph').ObjectLiteralExpression,
    camelProp: string,
    value: string,
    SK: typeof SyntaxKindEnum,
  ): { success: true } | { success: false; reason: string } {
    for (const prop of objLiteral.getProperties()) {
      const propKind = prop.getKind()

      // Shorthand assignment — bail
      if (propKind === SK.ShorthandPropertyAssignment) {
        const shorthand = prop.asKind(SK.ShorthandPropertyAssignment)
        if (!shorthand) continue
        if (shorthand.getName() === camelProp) {
          return { success: false, reason: `Property '${camelProp}' uses shorthand assignment` }
        }
        continue
      }

      if (propKind === SK.SpreadAssignment) continue

      if (propKind === SK.PropertyAssignment) {
        const propAssign = prop.asKind(SK.PropertyAssignment)
        if (!propAssign) continue
        const name = propAssign.getName()
        if (name !== camelProp) continue

        // Found the property — update its value
        const propInit = propAssign.getInitializer()
        if (!propInit) {
          return { success: false, reason: `Property '${camelProp}' has no initializer` }
        }

        const propInitKind = propInit.getKind()
        if (propInitKind !== SK.StringLiteral && propInitKind !== SK.NumericLiteral) {
          return { success: false, reason: `Property '${camelProp}' has non-literal value` }
        }

        propAssign.setInitializer(JSON.stringify(value))
        return { success: true }
      }
    }

    // Property not found — add it
    const propKey = this.formatObjectKey(camelProp)
    objLiteral.addPropertyAssignment({
      name: propKey,
      initializer: JSON.stringify(value),
    })
    return { success: true }
  }

  // ── replace_attribute ─────────────────────────────────────────

  private async applyReplaceAttribute(
    content: string,
    filePath: string,
    line: number,
    col: number,
    attribute: string,
    value: string,
  ): Promise<ApplyResult> {
    let project: Project
    let SK: typeof SyntaxKindEnum
    try {
      const ready = await this.ensureReady()
      project = ready.project
      SK = ready.SK
    } catch (err) {
      return { success: false, reason: `Init failed: ${err instanceof Error ? err.message : err}` }
    }

    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true })
    const jsxElement = findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) {
      return { success: false, reason: `No JSX element found at ${line}:${col}` }
    }

    // Check if attribute already exists
    const existingAttrRaw = jsxElement.getAttribute(attribute)
    const existingAttr = existingAttrRaw?.asKind(SK.JsxAttribute)

    if (existingAttr) {
      // Replace the entire attribute text with name=value
      existingAttr.replaceWithText(`${attribute}=${value}`)
    } else {
      // Add new attribute
      jsxElement.addAttribute({
        name: attribute,
        initializer: value,
      })
    }

    const attrContent = sourceFile.getFullText()
    project.removeSourceFile(sourceFile)
    return { success: true, content: attrContent }
  }

  // ── replace_line_content ──────────────────────────────────────

  private applyReplaceLineContent(
    content: string,
    lineNumber: number,
    oldContent: string,
    newContent: string,
  ): ApplyResult {
    const lines = content.split('\n')

    if (lineNumber < 1 || lineNumber > lines.length) {
      return { success: false, reason: `Line ${lineNumber} is out of bounds (file has ${lines.length} lines)` }
    }

    const line = lines[lineNumber - 1]!
    if (line.trim() !== oldContent.trim()) {
      return {
        success: false,
        reason: `Line ${lineNumber} does not match expected content. Expected: "${oldContent.trim()}", found: "${line.trim()}"`,
      }
    }

    // Preserve the original line's leading whitespace
    const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? ''
    lines[lineNumber - 1] = leadingWhitespace + newContent.trimStart()

    return { success: true, content: lines.join('\n') }
  }

  // ── Utilities ─────────────────────────────────────────────────

  /**
   * Format an object key — quote it if it contains special characters
   * (CSS custom properties like --my-var need quoting).
   */
  private formatObjectKey(key: string): string {
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key
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
