/**
 * JsxTransaction — a shared in-memory ts-morph SourceFile scoped to one
 * file, used by TailwindRewriter and InlineStyleRewriter together during
 * compound operations (ZF0-1215 C2).
 *
 * Why this exists: before C2, a compound edit (e.g., "link a text
 * bundle") fired as a classOp + N inline-property edits, producing N+1
 * separate WebSocket messages and N+1 separate undo entries. Undo was
 * broken — one Ctrl+Z restored one piece of the gesture, leaving the
 * element in an observably wrong state.
 *
 * Option A (adopted): the browser sends a SINGLE compound message with
 * classOp + inlineSets + inlineRemoves. The server pipeline must apply
 * all mutations in ONE read-mutate-write cycle and push ONE compound
 * UndoFileChange. To keep both rewriters operating on the same in-
 * memory source without double-reading the file, they share a
 * JsxTransaction.
 *
 * Lifecycle:
 *   1. EditPipeline.handleCompoundEdit reads file → creates JsxTransaction
 *   2. TailwindRewriter.rewriteClassListInTransaction mutates txn.sourceFile
 *   3. InlineStyleRewriter.setAndRemoveInTransaction mutates txn.sourceFile
 *   4. Pipeline reads txn.getCurrentContent() and atomicWrites once
 *   5. Transaction is discarded (ts-morph Project GC'd; no disk side effect)
 *
 * Scope: one file per transaction. Compound edits on a single user gesture
 * touch a single JSX element in a single file; multi-file compounds (e.g.,
 * CSS Modules scope='all') continue to use the existing sequential pattern
 * in edit-pipeline.ts:1013-1127. That path already accumulates
 * UndoFileChange entries correctly and does NOT need a transaction.
 */
import type { Project, SourceFile, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { ensureTsMorph } from './jsx-utils.js'

export interface JsxTransactionHandle {
  readonly filePath: string
  /** The file contents at transaction start. Preserved so callers building
   *  UndoFileChange entries can pass this as `previousContent` without
   *  re-reading from disk. */
  readonly initialContent: string
  /** Live ts-morph source file. Rewriter methods mutate this in place. */
  readonly sourceFile: SourceFile
  /** SyntaxKind enum from the loaded ts-morph module. Rewriters use this
   *  for `.asKind(...)` calls; exposing it on the handle avoids each
   *  rewriter calling `ensureTsMorph()` independently. */
  readonly SK: typeof SyntaxKindEnum
  /** Final file text after all mutations applied. Call once at the end of
   *  the transaction — this is the string to write to disk. */
  getCurrentContent(): string
}

/**
 * Create a new JsxTransaction from filePath + pre-read content.
 *
 * Does NOT read from disk — callers pass the already-read content.
 * This is intentional: compound edit flows read the file once (under
 * a withFileLock) and pass that content into the transaction so the
 * read doesn't race with the write later in the same lock.
 *
 * Each transaction gets its own ts-morph Project. Projects are
 * relatively cheap (no tsconfig scan; skipAddingFilesFromTsConfig is
 * true) but non-zero. If profiling shows this as a hotspot under
 * high compound-edit rates, pool projects across transactions — the
 * public API of this module is stable regardless of that choice.
 */
export async function createJsxTransaction(
  filePath: string,
  initialContent: string,
): Promise<JsxTransactionHandle> {
  const mod = await ensureTsMorph()
  const project: Project = new mod.Project({
    useInMemoryFileSystem: false,
    compilerOptions: { jsx: 4 /* JsxEmit.ReactJSX */, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  })
  const sourceFile = project.createSourceFile(filePath, initialContent, { overwrite: true })
  return {
    filePath,
    initialContent,
    sourceFile,
    SK: mod.SyntaxKind,
    getCurrentContent: () => sourceFile.getFullText(),
  }
}

/** Result type for rewriter methods operating on a JsxTransaction.
 *  No filePath/oldContent/newContent fields — those live on the txn. */
export type TransactionRewriteResult =
  | { success: true }
  | { success: false; reason: string }
