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
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase, LONGHAND_TO_SHORTHAND, LONGHAND_TO_SHORTHANDS } from './jsx-utils.js'
import type { JsxTransactionHandle, TransactionRewriteResult } from './jsx-transaction.js'

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
    let existingAssignment: import('ts-morph').PropertyAssignment | null = null
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

        existingAssignment = propAssign
        break
      }
    }

    // ZF0-1293: shorthand-clobber guard. React iterates the style object in
    // insertion order and applies each key via `el.style[key] = value`. A CSS
    // shorthand setter expands into longhands — so if a longhand appears
    // BEFORE its parent shorthand in the object literal, the shorthand wins
    // and the longhand is silently clobbered. Correct the order here: if the
    // longhand currently precedes its parent shorthand, remove it and
    // re-append at the end (which is always after the shorthand, since the
    // shorthand was already somewhere in the literal).
    const propKey = this.formatObjectKey(camelProp)
    if (existingAssignment) {
      if (this.needsShorthandReorder(objLiteral, existingAssignment, camelProp, SK)) {
        existingAssignment.remove()
        const appended = objLiteral.addPropertyAssignment({ name: propKey, initializer: JSON.stringify(value) })
        // Defensive post-condition: re-scan and confirm the reorder actually
        // achieved safe ordering. Guards against a future ts-morph change
        // (e.g., insertion before a trailing comma) that would leave the
        // longhand still clobbered despite reporting success.
        if (this.needsShorthandReorder(objLiteral, appended, camelProp, SK)) {
          return { success: false, filePath, reason: `shorthand reorder for '${camelProp}' did not take effect` }
        }
      } else {
        existingAssignment.setInitializer(JSON.stringify(value))
      }
      const newContent = sourceFile.getFullText()
      return { success: true, filePath, oldContent, newContent }
    }

    // Property not found — add it at the end (always safe: addPropertyAssignment
    // appends, which puts the new longhand after any shorthand already present).
    objLiteral.addPropertyAssignment({
      name: propKey,
      initializer: JSON.stringify(value),
    })
    const newContent = sourceFile.getFullText()
    return { success: true, filePath, oldContent, newContent }
  }

  /** ZF0-1293: Does the longhand assignment need to be moved after its parent
   *  shorthand? Returns true iff ANY parent shorthand (mid-level like
   *  `borderWidth` or super-level like `border`) exists in the same object
   *  literal AND appears at a LATER source position than the longhand.
   *
   *  Walks the full parent list from `LONGHAND_TO_SHORTHANDS` — a longhand
   *  can have multiple parents (borderTopWidth is clobbered by both
   *  borderWidth and border). If any of them appear after the longhand,
   *  React will clobber at render time.
   *
   *  Intentionally excluded (with known limitations):
   *  - Computed keys (`[expr]: value`): `getName()` returns undefined; we
   *    can't statically resolve what property the computed key names.
   *  - SpreadAssignment (`...rest`): skipped in this scan. We CANNOT tell
   *    at static-analysis time whether `rest` contains a parent shorthand.
   *    If an edited longhand appears before a `...rest` whose runtime value
   *    holds `padding: "30px"`, React will clobber the longhand at render
   *    time and this guard will NOT reorder. The runtime divergence system
   *    is the catch-net — the clobber fires as a divergence card with
   *    `actualReadFrom: 'inline-style'` and the user's edited value NOT in
   *    `priorValues` matching `actual`, making the spread-clobber cause
   *    distinguishable from a stale-inline-style divergence (H1).
   *  - ShorthandPropertyAssignment (`{ padding }`): bailed by Phase 2 when
   *    the edit targets the shorthand itself (routed to AI writer). Other
   *    shorthand-property-assignments in the literal are skipped here —
   *    same "can't statically analyze" reasoning as spreads. */
  private needsShorthandReorder(
    objLiteral: ObjectLiteralExpression,
    longhand: import('ts-morph').PropertyAssignment,
    camelProp: string,
    SK: typeof SyntaxKindEnum,
  ): boolean {
    const parents = LONGHAND_TO_SHORTHANDS[camelProp]
    if (!parents || parents.length === 0) return false
    const longhandPos = longhand.getStart()
    const parentSet = new Set(parents)
    for (const prop of objLiteral.getProperties()) {
      const kind = prop.getKind()
      if (kind !== SK.PropertyAssignment && kind !== SK.ShorthandPropertyAssignment) continue
      const name = kind === SK.PropertyAssignment
        ? prop.asKind(SK.PropertyAssignment)?.getName()
        : prop.asKind(SK.ShorthandPropertyAssignment)?.getName()
      if (!name || !parentSet.has(name)) continue
      if (prop.getStart() > longhandPos) return true // some parent clobbers longhand
    }
    return false
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
   * Apply a batch of set and remove operations to ONE JSX element's
   * inline style object within a shared `JsxTransaction`.
   *
   * All-or-nothing semantics: Phase 1 prepares the style attribute (or
   * creates it if sets are requested and none exists). Phase 2 validates
   * that every set's existing-value slot is literal-compatible (non-
   * literal slots route the entire compound op to the AI writer; we do
   * NOT fall through to a partial mutation). Phase 3 applies removes
   * first, then sets — in that order so a property appearing in BOTH
   * lists ends up with the set's value, not nothing.
   *
   * Models the two-pass pattern from `removeProperties` (line 264) —
   * collect then mutate — so a validation failure mid-request leaves
   * the AST unchanged.
   *
   * Empty request (sets.length === 0 && removes.length === 0) is a
   * success no-op rather than an error: the compound-edit protocol
   * sends this when a classOp has no accompanying inline changes.
   */
  setAndRemoveInTransaction(
    txn: JsxTransactionHandle,
    request: {
      line: number
      col: number
      sets: ReadonlyArray<{ property: string; value: string }>
      removes: ReadonlyArray<{ property: string }>
    },
  ): TransactionRewriteResult {
    if (this.disposed) return { success: false, reason: 'InlineStyleRewriter is disposed' }
    const { line, col, sets, removes } = request
    if (sets.length === 0 && removes.length === 0) return { success: true }

    const { sourceFile, SK } = txn
    const jsxElement = findJsxElementAt(sourceFile, line, col, SK)
    if (!jsxElement) return { success: false, reason: `No JSX element found at ${line}:${col}` }

    // Phase 1: locate or create the style object literal.
    let styleAttr = jsxElement.getAttribute('style')?.asKind(SK.JsxAttribute)
    let objLiteral: ObjectLiteralExpression | null = null

    if (styleAttr) {
      const initializer = styleAttr.getInitializer()
      if (!initializer) return { success: false, reason: 'style attribute has no value' }
      if (initializer.getKind() !== SK.JsxExpression) {
        return { success: false, reason: 'style attribute is not a JSX expression' }
      }
      const expression = initializer.asKind(SK.JsxExpression)?.getExpression()
      if (!expression) return { success: false, reason: 'Empty JSX expression in style' }
      if (expression.getKind() !== SK.ObjectLiteralExpression) {
        return { success: false, reason: `style is not an object literal — route to AI (found ${expression.getKindName()})` }
      }
      objLiteral = expression.asKind(SK.ObjectLiteralExpression) ?? null
    } else if (sets.length > 0) {
      jsxElement.addAttribute({ name: 'style', initializer: '{{}}' })
      styleAttr = jsxElement.getAttribute('style')?.asKind(SK.JsxAttribute)
      const initializer = styleAttr?.getInitializer()
      const expression = initializer?.asKind(SK.JsxExpression)?.getExpression()
      objLiteral = expression?.asKind(SK.ObjectLiteralExpression) ?? null
    }

    // No style attr + only removes requested: success no-op. The source
    // has no inline style to clean up; nothing to do.
    if (!objLiteral) return { success: true }

    // Phase 2: validate all sets. If any set targets a property whose
    // existing value is non-literal (e.g., a variable reference), bail
    // BEFORE mutating — partial-application would be a correctness
    // violation per the Plan agent's critique (all-or-nothing required).
    for (const { property } of sets) {
      const camelProp = cssPropertyToCamelCase(property)
      for (const prop of objLiteral.getProperties()) {
        if (prop.getKind() === SK.ShorthandPropertyAssignment) {
          const shorthand = prop.asKind(SK.ShorthandPropertyAssignment)
          if (shorthand?.getName() === camelProp) {
            return { success: false, reason: `Property '${camelProp}' uses shorthand assignment — route to AI` }
          }
          continue
        }
        if (prop.getKind() !== SK.PropertyAssignment) continue
        const propAssign = prop.asKind(SK.PropertyAssignment)
        if (!propAssign || propAssign.getName() !== camelProp) continue
        const propInit = propAssign.getInitializer()
        if (!propInit) continue
        const initKind = propInit.getKind()
        if (initKind !== SK.StringLiteral && initKind !== SK.NumericLiteral) {
          return { success: false, reason: `Property '${camelProp}' has non-literal value — route to AI` }
        }
      }
    }

    // Phase 3: apply. Removes first, then sets (correct ordering when
    // a property appears in both lists — the set's value wins).
    try {
      for (const { property } of removes) {
        this.removePropertyFromObject(objLiteral, cssPropertyToCamelCase(property), SK)
      }
      for (const { property, value } of sets) {
        const camelProp = cssPropertyToCamelCase(property)
        let existing: import('ts-morph').PropertyAssignment | null = null
        for (const prop of objLiteral.getProperties()) {
          if (prop.getKind() !== SK.PropertyAssignment) continue
          const propAssign = prop.asKind(SK.PropertyAssignment)
          if (!propAssign || propAssign.getName() !== camelProp) continue
          existing = propAssign
          break
        }
        if (existing) {
          existing.setInitializer(JSON.stringify(value))
        } else {
          objLiteral.addPropertyAssignment({
            name: this.formatObjectKey(camelProp),
            initializer: JSON.stringify(value),
          })
        }
      }
      // ZF0-1293: shorthand-clobber fix-up pass. Runs after ALL sets are
      // applied so it handles both directions — longhand being set on an
      // object with a trailing shorthand, AND shorthand being set on an
      // object with leading longhands. Simpler than per-set guards, and
      // correctly handles compound edits that add both sides at once.
      //
      // Algorithm: iterate-until-stable. On each pass, find the FIRST
      // property in source order that's unsafe (has a parent shorthand
      // appearing later) and move it to the end. Restart the scan because
      // positions shifted. Loop until no unsafe property remains, or we
      // hit the iteration cap (more iterations than properties means a
      // cycle — ts-morph regression — fail loudly).
      //
      // Why not collect-then-apply: for multi-level chains like
      // `{ borderTopWidth, borderWidth, border }`, moving borderTopWidth
      // first leaves borderWidth still before border. A second pass moves
      // borderWidth past border. A third pass moves borderTopWidth past
      // the now-trailing borderWidth. The "collect in source order and
      // apply" variant produces the wrong final order because the
      // append-in-collection-order step places borderWidth AFTER
      // borderTopWidth in the final literal, re-introducing the clobber.
      //
      // Intentionally excluded:
      // - SpreadAssignment (`...rest`): bailed on by Phase 2 validation;
      //   can't statically analyze its contents.
      // - Computed keys (`[expr]: value`): `getName()` returns undefined
      //   from ts-morph; can't know which shorthand it resolves to.
      // - ShorthandPropertyAssignment (`{ padding }`): bailed by Phase 2.
      // Cap: each move pushes one property to the end. Worst case is
      // N moves for N properties (one per unsafe node). Double as headroom
      // for multi-level chains where one move can expose another unsafe
      // node that was previously hidden. Plus one so an empty/single-prop
      // literal doesn't trip the cycle-detection branch on its first
      // no-op scan.
      const maxIterations = objLiteral.getProperties().length * 2 + 2
      let iterations = 0
      let stabilized = false
      while (iterations++ < maxIterations) {
        let didMove = false
        for (const prop of objLiteral.getProperties()) {
          if (prop.getKind() !== SK.PropertyAssignment) continue
          const pa = prop.asKind(SK.PropertyAssignment)
          if (!pa) continue
          const name = pa.getName()
          if (!this.needsShorthandReorder(objLiteral, pa, name, SK)) continue
          const initText = pa.getInitializerOrThrow().getText()
          pa.remove()
          objLiteral.addPropertyAssignment({
            name: this.formatObjectKey(name),
            initializer: initText,
          })
          didMove = true
          break // restart scan — positions shifted
        }
        if (!didMove) { stabilized = true; break }
      }
      if (!stabilized) {
        return { success: false, reason: 'shorthand reorder did not stabilize (cycle or ts-morph regression)' }
      }
      // Final verification — even with a stable loop, assert no unsafe
      // orderings remain. Catches a future ts-morph change where
      // addPropertyAssignment places the node in an unsafe position.
      for (const prop of objLiteral.getProperties()) {
        if (prop.getKind() !== SK.PropertyAssignment) continue
        const pa = prop.asKind(SK.PropertyAssignment)
        if (!pa) continue
        if (this.needsShorthandReorder(objLiteral, pa, pa.getName(), SK)) {
          return { success: false, reason: `shorthand reorder did not stabilize for '${pa.getName()}'` }
        }
      }
      // Empty object after removes + no sets: drop the entire style prop.
      if (objLiteral.getProperties().length === 0 && styleAttr) {
        styleAttr.remove()
      }
    } catch (err) {
      return { success: false, reason: `AST mutation failed: ${err instanceof Error ? err.message : err}` }
    }

    return { success: true }
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
