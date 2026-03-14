import type { Project, SourceFile, JsxOpeningElement, JsxSelfClosingElement, Node, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { readFile } from 'fs/promises'
import type { RewriteRequest, RewriteResult } from './types.js'

/** Lazily loaded ts-morph exports. Cold path — only loaded on first rewrite (~200ms). */
let _tsMorph: typeof import('ts-morph') | null = null

async function ensureTsMorph(): Promise<typeof import('ts-morph')> {
  if (!_tsMorph) {
    _tsMorph = await import('ts-morph')
  }
  return _tsMorph
}

/**
 * Rewrites Tailwind className tokens in JSX source files using ts-morph.
 *
 * Given a source location (from data-cortex-source), finds the JSX element,
 * locates the className attribute, and replaces the old Tailwind class with
 * the new one. Returns the old and new file contents (does NOT write to disk).
 *
 * Handles: static strings, ternary expressions, static clsx/classnames/cn/cx args.
 * Returns success=false for: template literals, conditional objects.
 *
 * Not concurrent-safe for the same file — callers must serialize per-file access.
 */
export class TailwindRewriter {
  private project: Project | null = null
  private SK: typeof SyntaxKindEnum | null = null
  private _readyPromise: Promise<{ project: Project; SK: typeof SyntaxKindEnum }> | null = null
  private disposed = false

  private ensureReady(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    if (this.disposed) return Promise.reject(new Error('TailwindRewriter is disposed'))
    if (!this._readyPromise) {
      this._readyPromise = this._initialize().catch(err => {
        this._readyPromise = null // allow retry on failure
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

  async rewrite(request: RewriteRequest): Promise<RewriteResult> {
    if (this.disposed) {
      return { success: false, filePath: request.filePath, reason: 'Rewriter is disposed' }
    }

    const { filePath, line, col, oldToken, newToken } = request

    let oldContent: string
    try {
      oldContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      return { success: false, filePath, reason: `Cannot read file: ${err instanceof Error ? err.message : err}` }
    }

    const { project, SK } = await this.ensureReady()

    let sourceFile: SourceFile
    const existing = project.getSourceFile(filePath)
    if (existing) {
      existing.replaceWithText(oldContent)
      sourceFile = existing
    } else {
      sourceFile = project.createSourceFile(filePath, oldContent, { overwrite: true })
    }

    const jsxElement = this.findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) {
      return { success: false, filePath, reason: `No JSX element found at ${line}:${col}` }
    }

    const classAttrRaw = jsxElement.getAttribute('className') ?? jsxElement.getAttribute('class')
    const classAttr = classAttrRaw?.asKind(SK.JsxAttribute)
    if (!classAttr) {
      return { success: false, filePath, reason: 'No className attribute found on element' }
    }

    const initializer = classAttr.getInitializer()
    if (!initializer) {
      return { success: false, filePath, reason: 'className attribute has no value' }
    }

    const kind = initializer.getKind()

    if (kind === SK.StringLiteral) {
      return this.rewriteStringLiteral(initializer, oldToken, newToken, filePath, oldContent, sourceFile, SK)
    }

    if (kind === SK.JsxExpression) {
      const expression = initializer.asKind(SK.JsxExpression)?.getExpression()
      if (!expression) {
        return { success: false, filePath, reason: 'Empty JSX expression in className' }
      }

      const exprKind = expression.getKind()

      if (exprKind === SK.ConditionalExpression) {
        return this.rewriteTernary(expression, oldToken, newToken, filePath, oldContent, sourceFile, SK)
      }

      if (exprKind === SK.CallExpression) {
        return this.rewriteCallExpression(expression, oldToken, newToken, filePath, oldContent, sourceFile, SK)
      }

      if (exprKind === SK.TemplateExpression || exprKind === SK.NoSubstitutionTemplateLiteral) {
        return { success: false, filePath, reason: 'Template literal in className — route to AI' }
      }

      return { success: false, filePath, reason: `Unsupported className expression kind: ${exprKind}` }
    }

    return { success: false, filePath, reason: `Unsupported className initializer kind: ${kind}` }
  }

  private findJsxElementAt(
    sourceFile: SourceFile,
    line: number,
    col: number,
    SK: typeof SyntaxKindEnum,
  ): JsxOpeningElement | JsxSelfClosingElement | null {
    const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1)

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

  private rewriteStringLiteral(
    node: Node,
    oldToken: string,
    newToken: string,
    filePath: string,
    oldContent: string,
    sourceFile: SourceFile,
    SK: typeof SyntaxKindEnum,
  ): RewriteResult {
    const literal = node.asKind(SK.StringLiteral)
    if (!literal) {
      return { success: false, filePath, reason: 'Expected string literal' }
    }

    const text = literal.getLiteralText()
    const replaced = this.replaceClassToken(text, oldToken, newToken)
    if (replaced === null) {
      return { success: false, filePath, reason: `Token '${oldToken}' not found in className` }
    }

    literal.setLiteralValue(replaced)
    const newContent = sourceFile.getFullText()
    return { success: true, filePath, oldContent, newContent }
  }

  private rewriteTernary(
    expression: Node,
    oldToken: string,
    newToken: string,
    filePath: string,
    oldContent: string,
    sourceFile: SourceFile,
    SK: typeof SyntaxKindEnum,
  ): RewriteResult {
    const conditional = expression.asKind(SK.ConditionalExpression)
    if (!conditional) {
      return { success: false, filePath, reason: 'Expected conditional expression' }
    }

    const whenTrue = conditional.getWhenTrue()
    const whenFalse = conditional.getWhenFalse()

    for (const branch of [whenTrue, whenFalse]) {
      const literal = branch.asKind(SK.StringLiteral)
      if (!literal) continue

      const text = literal.getLiteralText()
      const replaced = this.replaceClassToken(text, oldToken, newToken)
      if (replaced !== null) {
        literal.setLiteralValue(replaced)
        const newContent = sourceFile.getFullText()
        return { success: true, filePath, oldContent, newContent }
      }
    }

    return { success: false, filePath, reason: `Token '${oldToken}' not found in ternary branches` }
  }

  private rewriteCallExpression(
    expression: Node,
    oldToken: string,
    newToken: string,
    filePath: string,
    oldContent: string,
    sourceFile: SourceFile,
    SK: typeof SyntaxKindEnum,
  ): RewriteResult {
    const call = expression.asKind(SK.CallExpression)
    if (!call) {
      return { success: false, filePath, reason: 'Expected call expression' }
    }

    const callee = call.getExpression().getText()
    if (!['clsx', 'classnames', 'cn', 'cx'].includes(callee)) {
      return { success: false, filePath, reason: `Unknown className function: ${callee}` }
    }

    for (const arg of call.getArguments()) {
      if (arg.getKind() === SK.ObjectLiteralExpression) {
        return { success: false, filePath, reason: 'Conditional object in className call — route to AI' }
      }

      const literal = arg.asKind(SK.StringLiteral)
      if (!literal) continue

      const text = literal.getLiteralText()
      const replaced = this.replaceClassToken(text, oldToken, newToken)
      if (replaced !== null) {
        literal.setLiteralValue(replaced)
        const newContent = sourceFile.getFullText()
        return { success: true, filePath, oldContent, newContent }
      }
    }

    return { success: false, filePath, reason: `Token '${oldToken}' not found in call arguments` }
  }

  /**
   * Replace a class token within a space-separated class string.
   * Matches whole tokens only. Returns null if token not found.
   */
  private replaceClassToken(classString: string, oldToken: string, newToken: string): string | null {
    const classes = classString.split(/\s+/)
    const idx = classes.indexOf(oldToken)
    if (idx === -1) return null
    classes[idx] = newToken
    return classes.join(' ')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.project = null
    this.SK = null
    this._readyPromise = null
  }
}
