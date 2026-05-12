/**
 * ProjectPool — a soft-capped pool of ts-morph Project instances.
 *
 * Each compound JSX edit needs a ts-morph Project (~1-5ms to allocate).
 * The pool reuses Project instances across sequential edits. The cap is
 * soft: concurrent demand beyond maxSize gets transient Projects that are
 * dropped (not returned to the pool) on release, so availableCount never
 * exceeds maxSize but callers are never blocked.
 *
 * JS is single-threaded, so pop/push operations between await points are
 * atomic — no mutex is needed.
 *
 * The pool is generic over its element type. Production callers use the
 * default `T = Project`; tests can pass a structural stub satisfying
 * `PoolableProject` without any casts at the boundary.
 *
 * ⚠️ Pool boundary invariant: callers MUST operate on `SourceFile` AST nodes
 * only (getDescendantsOfKind, asKind, attribute / property mutations). Do NOT
 * call any Project-level API that builds lazy state — `getTypeChecker()`,
 * `getLanguageService()`, `getProgram()`, `getCompilerHost()`, or module
 * resolution APIs. The pool's `release()` only clears source files; lazy
 * type/language-service state would leak across pooled transactions. If a
 * future rewriter needs type information, EITHER expand the pool's release
 * semantics to clear that state OR opt that path out of the pool with a
 * transient Project.
 */
import type { Project } from "ts-morph";

/** Minimal structural contract the pool needs from its element. ts-morph's
 *  `Project` satisfies this — any test stub that exposes the same two
 *  methods works without casts. */
interface PoolableProject {
  getSourceFiles(): readonly unknown[];
  removeSourceFile(sf: unknown): void;
}

export interface ProjectPool<T = Project> {
  acquire(): Promise<T>;
  release(project: T): void;
  /** Count of Projects currently available in the pool (not in use). */
  readonly availableCount: number;
  /** Count of Projects currently acquired and not yet released. */
  readonly inUseCount: number;
}

export function createProjectPool<
  T extends PoolableProject = Project,
>(options: { maxSize: number; create: () => Promise<T> }): ProjectPool<T> {
  const { maxSize, create } = options;
  const available: T[] = [];
  let inUseCount = 0;

  return {
    async acquire(): Promise<T> {
      const pooled = available.pop();
      if (pooled !== undefined) {
        inUseCount++;
        return pooled;
      }
      // No available instance — create a new one. Increment inUseCount
      // synchronously to capture intent before the await, so concurrent
      // callers see the accurate count even while creation is in-flight.
      inUseCount++;
      try {
        return await create();
      } catch (err) {
        inUseCount--;
        throw err;
      }
    },

    release(project: T): void {
      // Push back to the pool ONLY if cleanup fully succeeded. If
      // removeSourceFile throws mid-iteration the Project is partially
      // cleared — returning it would hand stale source files to the next
      // acquirer, violating the "state cleared on release" contract.
      // The inUseCount decrement still happens in finally (accounting
      // is honored even on failure).
      let cleanupOk = false;
      try {
        project.getSourceFiles().forEach((sf) => project.removeSourceFile(sf));
        cleanupOk = true;
      } finally {
        inUseCount--;
        if (cleanupOk && available.length < maxSize) {
          available.push(project);
        }
        // else: cleanup failed OR over-cap — drop the project (GC handles cleanup)
      }
    },

    get availableCount(): number {
      return available.length;
    },

    get inUseCount(): number {
      return inUseCount;
    },
  };
}
