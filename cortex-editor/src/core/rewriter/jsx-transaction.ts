/**
 * JsxTransaction — a shared in-memory ts-morph SourceFile scoped to one
 * file, used by TailwindRewriter and InlineStyleRewriter together during
 * compound operations.
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
 *   5. txn.dispose() releases the underlying ts-morph Project back to the
 *      module-scoped pool (maxSize=4) for reuse by the next compound edit
 *
 * Scope: one file per transaction. Compound edits on a single user gesture
 * touch a single JSX element in a single file; multi-file compounds (e.g.,
 * CSS Modules scope='all') continue to use the existing sequential pattern
 * — see commitCSSModulesRewrite in edit-pipeline.ts. That path
 * already accumulates UndoFileChange entries sequentially and does
 * NOT need a transaction.
 */
import type {
  Project,
  SourceFile,
  SyntaxKind as SyntaxKindEnum,
} from "ts-morph";
import { ensureTsMorph } from "./jsx-utils.js";
import { createProjectPool, type ProjectPool } from "./project-pool.js";

export interface JsxTransactionHandle {
  readonly filePath: string;
  /** The file contents at transaction start. Preserved so callers building
   *  UndoFileChange entries can pass this as `previousContent` without
   *  re-reading from disk. */
  readonly initialContent: string;
  /** Live ts-morph source file. Rewriter methods mutate this in place.
   *
   *  Valid only until `dispose()` is called. Do NOT retain references past
   *  dispose — the underlying ts-morph Project is recycled into the pool
   *  and may be vended to a subsequent `createJsxTransaction()` call. */
  readonly sourceFile: SourceFile;
  /** SyntaxKind enum from the loaded ts-morph module. Rewriters use this
   *  for `.asKind(...)` calls; exposing it on the handle avoids each
   *  rewriter calling `ensureTsMorph()` independently.
   *
   *  Valid only until `dispose()` is called. Do NOT retain references past
   *  dispose — the underlying ts-morph Project is recycled into the pool
   *  and may be vended to a subsequent `createJsxTransaction()` call. */
  readonly SK: typeof SyntaxKindEnum;
  /** Final file text after all mutations applied. Call once at the end of
   *  the transaction — this is the string to write to disk.
   *
   *  Valid only until `dispose()` is called. Do NOT retain references past
   *  dispose — the underlying ts-morph Project is recycled into the pool
   *  and may be vended to a subsequent `createJsxTransaction()` call.
   *  Throws if called after dispose to prevent silent cross-pollination. */
  getCurrentContent(): string;
  /** Release the underlying ts-morph Project back to the pool. Idempotent
   *  — second call is a no-op. After dispose, `sourceFile`, `SK`, and
   *  `getCurrentContent` are invalid. `dispose()` itself never throws;
   *  cleanup failures inside the pool are absorbed silently to keep this
   *  method a safe `finally`-block target. Must be called after every
   *  transaction to avoid unbounded Project allocation under high
   *  compound-edit rates. */
  dispose(): void;
}

// ── Module-scoped lazy pool (maxSize=4) ────────────────────────────
//
// Cache the PROMISE, not the resolved pool — mirrors the pattern in
// `ensureTsMorph()` (jsx-utils.ts). Caching the resolved value would
// allow two concurrent first callers to both observe `_pool === null`,
// both proceed past `await ensureTsMorph()`, and both allocate their
// own pool — the second one orphaning the first.

let _poolPromise: Promise<ProjectPool> | null = null;
/** Mirrors _poolPromise after it resolves, so the test-only sync getter
 *  can unwrap without awaiting. Production code never reads this directly. */
let _resolvedPool: ProjectPool | null = null;

function getPool(): Promise<ProjectPool> {
  if (!_poolPromise) {
    _poolPromise = (async () => {
      const mod = await ensureTsMorph();
      const pool = createProjectPool({
        maxSize: 4,
        create: async () =>
          new mod.Project({
            useInMemoryFileSystem: false,
            compilerOptions: { jsx: 4 /* JsxEmit.ReactJSX */, allowJs: true },
            skipAddingFilesFromTsConfig: true,
          }),
      });
      _resolvedPool = pool;
      return pool;
    })().catch((err) => {
      // Transient failure (e.g., ts-morph load error) — clear so the next
      // caller retries instead of permanently bricking the pool. Mirrors
      // the recovery pattern in ensureTsMorph().
      _poolPromise = null;
      throw err;
    });
  }
  return _poolPromise;
}

/** Reset the pool singleton for testing. Only available in test environments. */
export function _resetPoolForTesting(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    _poolPromise = null;
    _resolvedPool = null;
  }
}

/** Expose the current pool instance for test-only introspection (e.g., checking
 *  availableCount / inUseCount). Tests await createJsxTransaction first, so by
 *  the time they call this getter the lazy init has resolved. Only available
 *  in test environments. */
export function _getPoolForTesting(): ProjectPool | null {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) return null;
  return _resolvedPool;
}

/**
 * Create a new JsxTransaction from filePath + pre-read content.
 *
 * Does NOT read from disk — callers pass the already-read content.
 * This is intentional: compound edit flows read the file once (under
 * a withFileLock) and pass that content into the transaction so the
 * read doesn't race with the write later in the same lock.
 *
 * Each transaction acquires a ts-morph Project from a module-scoped pool
 * (maxSize=4). The pool reuses Project instances across sequential edits,
 * clearing source files on release. Call dispose() on the returned handle
 * to return the Project to the pool when the transaction is complete.
 */
export async function createJsxTransaction(
  filePath: string,
  initialContent: string,
): Promise<JsxTransactionHandle> {
  const mod = await ensureTsMorph();
  const pool = await getPool();
  const project: Project = await pool.acquire();
  // If createSourceFile throws (e.g., parse failure on pathological input),
  // the Project would leak — acquire() incremented inUseCount but no caller
  // ever gets a handle to invoke dispose(). Wrap and release-on-failure so
  // every exit path between acquire() and the returned handle's dispose()
  // properly returns the Project to the pool.
  let sourceFile: SourceFile;
  try {
    sourceFile = project.createSourceFile(filePath, initialContent, {
      overwrite: true,
    });
  } catch (err) {
    pool.release(project);
    throw err;
  }

  let disposed = false;

  return {
    filePath,
    initialContent,
    sourceFile,
    SK: mod.SyntaxKind,
    getCurrentContent: (): string => {
      // Throwing guard prevents silent cross-pollination: after dispose,
      // the underlying ts-morph Project is recycled and may be holding a
      // future transaction's source file. Reading at that point could
      // return another transaction's content. Fail loudly instead.
      if (disposed) {
        throw new Error(
          "JsxTransactionHandle: getCurrentContent() called after dispose(). " +
            "The underlying ts-morph Project has been recycled; reading source " +
            "content post-dispose may return state from a future transaction.",
        );
      }
      return sourceFile.getFullText();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        pool.release(project);
      } catch {
        // Pool integrity is preserved by release()'s own cleanupOk=false drop.
        // Swallow here so finally-blocks don't overwrite the caller's primary
        // exception (JS finally semantics: a throw in finally replaces the
        // try-block's pending throw). dispose() is the noexcept boundary
        // every caller assumes when wrapping in try/finally.
      }
    },
  };
}

/** Result type for rewriter methods operating on a JsxTransaction.
 *  No filePath/oldContent/newContent fields — those live on the txn. */
export type TransactionRewriteResult =
  | { success: true }
  | { success: false; reason: string };
