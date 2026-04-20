import type { Project, SourceFile, Node, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { readFile } from 'fs/promises'
import type { RewriteRequest, RewriteResult } from './types.js'
import { ensureTsMorph, findJsxElementAt } from './jsx-utils.js'
import type { JsxTransactionHandle, TransactionRewriteResult } from './jsx-transaction.js'

/** Recognized className helper functions (clsx, classnames, cn, cx). */
const CLASSNAME_HELPERS = new Set(['clsx', 'classnames', 'cn', 'cx'])

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
    if (!CLASSNAME_HELPERS.has(callee)) {
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
   * Matches whole tokens only. Preserves original whitespace formatting
   * (multi-space gaps, newlines in Prettier-formatted multi-line classNames).
   * Returns null if token not found.
   */
  private replaceClassToken(classString: string, oldToken: string, newToken: string): string | null {
    const escaped = oldToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$)`)
    const match = pattern.exec(classString)
    if (!match) return null
    return classString.slice(0, match.index) + newToken + classString.slice(match.index + oldToken.length)
  }

  /**
   * Mutate a JSX className attribute: remove and/or add a class. Unlike
   * `rewrite()` which swaps one token for another, this handles pure addition
   * and pure removal used by Typography v2 link/unlink flows.
   *
   * Semantics:
   * - `remove` only: deletes the first occurrence of `remove` (no-op if absent)
   * - `add` only: appends `add`, idempotent if already present
   * - both: remove first, then add
   * - neither: no-op (success=true, newContent=oldContent)
   *
   * Supports static strings, clsx/cn/classnames/cx call args, and static-string
   * arms of a ternary. Template literals and conditional objects return
   * success=false so the pipeline can fall back to the AI writer.
   */
  async rewriteClassList(request: {
    filePath: string
    line: number
    col: number
    remove?: string
    add?: string
  }): Promise<RewriteResult> {
    if (this.disposed) {
      return { success: false, filePath: request.filePath, reason: 'Rewriter is disposed' }
    }
    const { filePath, line, col, remove, add } = request

    let oldContent: string
    try {
      oldContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      return { success: false, filePath, reason: `Cannot read file: ${err instanceof Error ? err.message : err}` }
    }

    if (!remove && !add) {
      return { success: true, filePath, oldContent, newContent: oldContent }
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
      return this.mutateStringLiteral(initializer, remove, add, filePath, oldContent, sourceFile, SK)
    }

    if (kind === SK.JsxExpression) {
      const expression = initializer.asKind(SK.JsxExpression)?.getExpression()
      if (!expression) {
        return { success: false, filePath, reason: 'Empty JSX expression in className' }
      }
      const exprKind = expression.getKind()
      if (exprKind === SK.ConditionalExpression) {
        return this.mutateTernary(expression, remove, add, filePath, oldContent, sourceFile, SK)
      }
      if (exprKind === SK.CallExpression) {
        return this.mutateCallExpression(expression, remove, add, filePath, oldContent, sourceFile, SK)
      }
      if (exprKind === SK.TemplateExpression || exprKind === SK.NoSubstitutionTemplateLiteral) {
        return { success: false, filePath, reason: 'Template literal in className — route to AI' }
      }
      return { success: false, filePath, reason: `Unsupported className expression kind: ${exprKind}` }
    }

    return { success: false, filePath, reason: `Unsupported className initializer kind: ${kind}` }
  }

  /**
   * Transaction-based equivalent of `rewriteClassList`. Operates on a
   * pre-loaded `JsxTransactionHandle` instead of reading/writing disk.
   *
   * Used by EditPipeline.handleCompoundEdit so a classOp
   * and subsequent inlineSets/inlineRemoves can share one in-memory
   * SourceFile: one fs read, one fs write, one compound UndoFileChange.
   *
   * Mutation is applied directly to `txn.sourceFile` in place. Callers
   * retrieve the post-mutation content via `txn.getCurrentContent()`.
   * The existing mutate* helpers are reused — they accept a SourceFile
   * and mutate it via ts-morph's `setLiteralValue`, which is exactly
   * what the transaction flow wants. Their RewriteResult's oldContent/
   * newContent fields are discarded since the transaction is the source
   * of truth.
   */
  rewriteClassListInTransaction(
    txn: JsxTransactionHandle,
    request: { line: number; col: number; remove?: string; add?: string },
  ): TransactionRewriteResult {
    if (this.disposed) return { success: false, reason: 'TailwindRewriter is disposed' }
    const { line, col, remove, add } = request
    if (!remove && !add) return { success: true }

    const { sourceFile, filePath, SK, initialContent } = txn

    const jsxElement = findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) return { success: false, reason: `No JSX element found at ${line}:${col}` }

    const classAttrRaw = jsxElement.getAttribute('className') ?? jsxElement.getAttribute('class')
    const classAttr = classAttrRaw?.asKind(SK.JsxAttribute)
    if (!classAttr) return { success: false, reason: 'No className attribute found on element' }

    const initializer = classAttr.getInitializer()
    if (!initializer) return { success: false, reason: 'className attribute has no value' }

    const kind = initializer.getKind()
    let result: RewriteResult

    if (kind === SK.StringLiteral) {
      result = this.mutateStringLiteral(initializer, remove, add, filePath, initialContent, sourceFile, SK)
    } else if (kind === SK.JsxExpression) {
      const expression = initializer.asKind(SK.JsxExpression)?.getExpression()
      if (!expression) return { success: false, reason: 'Empty JSX expression in className' }
      const exprKind = expression.getKind()
      if (exprKind === SK.ConditionalExpression) {
        result = this.mutateTernary(expression, remove, add, filePath, initialContent, sourceFile, SK)
      } else if (exprKind === SK.CallExpression) {
        result = this.mutateCallExpression(expression, remove, add, filePath, initialContent, sourceFile, SK)
      } else if (exprKind === SK.TemplateExpression || exprKind === SK.NoSubstitutionTemplateLiteral) {
        return { success: false, reason: 'Template literal in className — route to AI' }
      } else {
        return { success: false, reason: `Unsupported className expression kind: ${exprKind}` }
      }
    } else {
      return { success: false, reason: `Unsupported className initializer kind: ${kind}` }
    }

    return result.success ? { success: true } : { success: false, reason: result.reason }
  }

  /** Apply remove/add to a space-separated class string. Pure, idempotent on add. */
  private applyClassOp(
    classString: string,
    remove: string | undefined,
    add: string | undefined,
  ): string {
    const tokens = classString.split(/\s+/).filter(Boolean)
    if (remove) {
      const idx = tokens.indexOf(remove)
      if (idx >= 0) tokens.splice(idx, 1)
    }
    if (add && !tokens.includes(add)) {
      tokens.push(add)
    }
    return tokens.join(' ')
  }

  private mutateStringLiteral(
    node: Node,
    remove: string | undefined,
    add: string | undefined,
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
    const next = this.applyClassOp(text, remove, add)
    if (next === text) {
      return { success: true, filePath, oldContent, newContent: oldContent }
    }
    literal.setLiteralValue(next)
    return { success: true, filePath, oldContent, newContent: sourceFile.getFullText() }
  }

  private mutateTernary(
    expression: Node,
    remove: string | undefined,
    add: string | undefined,
    filePath: string,
    oldContent: string,
    sourceFile: SourceFile,
    SK: typeof SyntaxKindEnum,
  ): RewriteResult {
    const conditional = expression.asKind(SK.ConditionalExpression)
    if (!conditional) {
      return { success: false, filePath, reason: 'Expected conditional expression' }
    }
    // Phase 1: prefer the arm containing `remove` for the combined
    // (remove + add) op. If remove is undefined, this loop still
    // processes the first static-string arm and can apply a pure add.
    //
    // Why structured this way: applying both ops in one call keeps the
    // arm's class list in a consistent order — `applyClassOp(text, r, a)`
    // removes then adds atomically, preserving surrounding whitespace.
    const arms = [conditional.getWhenTrue(), conditional.getWhenFalse()]
    for (const branch of arms) {
      const literal = branch.asKind(SK.StringLiteral)
      if (!literal) continue
      const text = literal.getLiteralText()
      if (remove && !text.split(/\s+/).includes(remove)) continue
      const next = this.applyClassOp(text, remove, add)
      if (next === text) {
        return { success: true, filePath, oldContent, newContent: oldContent }
      }
      literal.setLiteralValue(next)
      return { success: true, filePath, oldContent, newContent: sourceFile.getFullText() }
    }

    // Phase 2 (H2 fix): best-effort add on the FIRST static arm.
    //
    // Reached when Phase 1 fell through — that happens when either:
    //   (a) no StringLiteral arm exists (e.g., template-literal arms), or
    //   (b) `remove` was requested but not found in any arm.
    //
    // Previous logic gated this phase on `if (add && !remove)`, which
    // silently dropped the add in case (b). That broke link/swap UX
    // whenever the source ternary's rendered arm didn't currently hold
    // the old class — the user's click appeared to do nothing.
    //
    // New logic: find the first static arm. If `add` is already there,
    // return idempotent no-op (preserves existing "add is set-like"
    // semantics — we don't normalize every arm). If `add` is missing,
    // apply it to that arm. Second-arm processing intentionally does
    // NOT happen: propagating `add` to arms that didn't ask for it
    // would be a normalization operation this rewriter doesn't own.
    //
    // Semantics: "remove is best-effort; add lands at one arm that can
    // hold it, preferring the first static arm as the canonical site."
    // If future callers need to distinguish "full swap" vs "add-only
    // best-effort", extend RewriteResult with a `removeApplied?: boolean`.
    if (add) {
      for (const branch of arms) {
        const literal = branch.asKind(SK.StringLiteral)
        if (!literal) continue
        const text = literal.getLiteralText()
        const next = this.applyClassOp(text, undefined, add)
        // First static arm: if add is already present, we're done
        // (idempotent); if absent, mutate and return. Either way, do
        // not continue to the second arm.
        if (next === text) {
          return { success: true, filePath, oldContent, newContent: oldContent }
        }
        literal.setLiteralValue(next)
        return { success: true, filePath, oldContent, newContent: sourceFile.getFullText() }
      }
    }

    return { success: true, filePath, oldContent, newContent: oldContent }
  }

  private mutateCallExpression(
    expression: Node,
    remove: string | undefined,
    add: string | undefined,
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
    if (!CLASSNAME_HELPERS.has(callee)) {
      return { success: false, filePath, reason: `Unknown className function: ${callee}` }
    }

    const args = call.getArguments()
    if (args.some((a) => a.getKind() === SK.ObjectLiteralExpression)) {
      return { success: false, filePath, reason: 'Conditional object in className call — route to AI' }
    }

    let mutated = false

    if (remove) {
      for (const arg of args) {
        const literal = arg.asKind(SK.StringLiteral)
        if (!literal) continue
        const text = literal.getLiteralText()
        if (!text.split(/\s+/).includes(remove)) continue
        literal.setLiteralValue(this.applyClassOp(text, remove, undefined))
        mutated = true
        break
      }
    }

    if (add) {
      const alreadyPresent = args.some((arg) => {
        const lit = arg.asKind(SK.StringLiteral)
        return lit ? lit.getLiteralText().split(/\s+/).includes(add) : false
      })
      if (!alreadyPresent) {
        for (const arg of args) {
          const literal = arg.asKind(SK.StringLiteral)
          if (!literal) continue
          const text = literal.getLiteralText()
          const next = this.applyClassOp(text, undefined, add)
          if (next !== text) {
            literal.setLiteralValue(next)
            mutated = true
            break
          }
        }
      }
    }

    if (!mutated) {
      return { success: true, filePath, oldContent, newContent: oldContent }
    }
    return { success: true, filePath, oldContent, newContent: sourceFile.getFullText() }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.project = null
    this.SK = null
    this._readyPromise = null
  }
}
