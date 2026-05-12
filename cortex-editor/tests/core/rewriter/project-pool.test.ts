import { describe, it, expect, vi } from "vitest";
import {
  createProjectPool,
  type ProjectPool,
} from "../../../src/core/rewriter/project-pool.js";

// ── Minimal stub shape — tests never load real ts-morph ──────────────────────
// The pool only calls getSourceFiles() and removeSourceFile(sf). This stub is
// enough for all 7 behavioural tests.

type SourceFileLike = { __brand: "SourceFileLike" };

type ProjectLike = {
  getSourceFiles(): SourceFileLike[];
  removeSourceFile(sf: SourceFileLike): void;
};

function makeProject(sourceFiles: SourceFileLike[] = []): ProjectLike {
  const files = [...sourceFiles];
  return {
    getSourceFiles: vi.fn(() => [...files]),
    removeSourceFile: vi.fn((sf: SourceFileLike) => {
      const idx = files.indexOf(sf);
      if (idx !== -1) files.splice(idx, 1);
    }),
  };
}

// Helper: thin wrapper that fixes the generic boundary so each test reads
// cleanly. createProjectPool is generic over T extends PoolableProject;
// ProjectLike satisfies that contract structurally — no casts needed.
function poolOf<T extends ProjectLike>(
  maxSize: number,
  factory: () => T,
): ProjectPool<T> {
  return createProjectPool<T>({
    maxSize,
    create: () => Promise.resolve(factory()),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("createProjectPool", () => {
  // Test 1: acquire() returns a Project; after release(), the next acquire()
  // returns the SAME instance (identity via ===).
  it("reuses the same Project instance after release (identity check)", async () => {
    const project = makeProject();
    const pool = poolOf(2, () => project);

    const first = await pool.acquire();
    pool.release(first);
    const second = await pool.acquire();

    expect(second).toBe(first);
  });

  // Test 2: after release(), the Project has zero source files — pool clears
  // state via removeSourceFile before returning it to the available stack.
  it("clears source files from the Project on release", async () => {
    const fakeFile = { __brand: "SourceFileLike" as const };
    // Build the stub inline so we can hold a typed reference to the spy
    // (avoids casting `project.removeSourceFile` to access `.mock.calls`).
    const files: SourceFileLike[] = [fakeFile];
    const removeSourceFile = vi.fn((sf: SourceFileLike) => {
      const idx = files.indexOf(sf);
      if (idx !== -1) files.splice(idx, 1);
    });
    const project: ProjectLike = {
      getSourceFiles: () => [...files],
      removeSourceFile,
    };
    const pool = poolOf(2, () => project);

    const acquired = await pool.acquire();
    pool.release(acquired);

    // removeSourceFile should have been called for the fake file.
    expect(removeSourceFile.mock.calls).toHaveLength(1);
    // Confirm the next acquire() gets a Project reporting zero source files.
    const reused = await pool.acquire();
    expect(reused.getSourceFiles()).toHaveLength(0);
  });

  // Test 3: concurrent acquires beyond maxSize each get a distinct Project
  // (no deadlock). Excess Projects are dropped on release — availableCount
  // stays ≤ maxSize.
  it("handles concurrent acquires beyond maxSize; excess Projects are dropped", async () => {
    let callCount = 0;
    const factory = () => {
      callCount++;
      return makeProject();
    };

    const maxSize = 2;
    const pool = poolOf(maxSize, factory);

    // Acquire 3 at once — beyond the cap of 2.
    const [p1, p2, p3] = await Promise.all([
      pool.acquire(),
      pool.acquire(),
      pool.acquire(),
    ]);

    // All three are distinct Projects (factory was called 3 times).
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
    expect(p2).not.toBe(p3);
    expect(callCount).toBe(3);

    // inUseCount should be 3 before any release.
    expect(pool.inUseCount).toBe(3);

    // Release all three — two go back, one is dropped.
    pool.release(p1);
    pool.release(p2);
    pool.release(p3);

    // Pool must not grow past maxSize.
    expect(pool.availableCount).toBe(maxSize);
    expect(pool.inUseCount).toBe(0);
  });

  // Test 4: releasing a transient (over-cap) Project does NOT grow the pool
  // past maxSize. This is essentially subsumed by test 3 but isolated here for
  // clarity.
  it("drop-on-release keeps availableCount ≤ maxSize", async () => {
    const maxSize = 1;
    let callCount = 0;
    const pool = poolOf(maxSize, () => {
      callCount++;
      return makeProject();
    });

    const [a, b] = await Promise.all([pool.acquire(), pool.acquire()]);
    expect(callCount).toBe(2);

    pool.release(a); // fills the pool
    pool.release(b); // must be dropped — pool already full

    expect(pool.availableCount).toBe(maxSize);
    expect(pool.inUseCount).toBe(0);
  });

  // Test 5: acquire() propagates errors from create() — no swallowing.
  it("propagates errors from create() without swallowing", async () => {
    const boom = new Error("create failed");
    const pool = createProjectPool<ProjectLike>({
      maxSize: 2,
      create: () => Promise.reject(boom),
    });

    await expect(pool.acquire()).rejects.toThrow("create failed");
    // inUseCount must be decremented on error too (or never incremented if
    // implementation guards before the increment — either way, 0 after failure).
    expect(pool.inUseCount).toBe(0);
  });

  // Test 6: availableCount and inUseCount track available and in-flight
  // Projects across the full lifecycle.
  it("tracks availableCount and inUseCount accurately through the lifecycle", async () => {
    const pool = poolOf(3, makeProject);

    expect(pool.availableCount).toBe(0);
    expect(pool.inUseCount).toBe(0);

    const a = await pool.acquire();
    expect(pool.availableCount).toBe(0);
    expect(pool.inUseCount).toBe(1);

    const b = await pool.acquire();
    expect(pool.availableCount).toBe(0);
    expect(pool.inUseCount).toBe(2);

    pool.release(a);
    expect(pool.availableCount).toBe(1);
    expect(pool.inUseCount).toBe(1);

    pool.release(b);
    expect(pool.availableCount).toBe(2);
    expect(pool.inUseCount).toBe(0);

    // Re-acquire from pool (reuse path).
    const c = await pool.acquire();
    expect(pool.availableCount).toBe(1); // one left in the available stack
    expect(pool.inUseCount).toBe(1);

    pool.release(c);
    expect(pool.availableCount).toBe(2);
    expect(pool.inUseCount).toBe(0);
  });

  // Test 7: if removeSourceFile throws mid-cleanup, the partially-cleared
  // Project must NOT be returned to the pool — the next acquirer would get
  // stale source files. inUseCount must still decrement (accounting is
  // honored even on failure).
  it("does not return a Project to the pool if cleanup throws", async () => {
    const boom = new Error("removeSourceFile failed");
    const project: ProjectLike = {
      getSourceFiles: () => [{ __brand: "SourceFileLike" as const }],
      removeSourceFile: () => {
        throw boom;
      },
    };
    const pool = poolOf(2, () => project);
    const acquired = await pool.acquire();

    expect(() => pool.release(acquired)).toThrow("removeSourceFile failed");

    // Pool must NOT have absorbed the corrupted Project.
    expect(pool.availableCount).toBe(0);
    // inUseCount must still decrement (accounting honored even on failure).
    expect(pool.inUseCount).toBe(0);
  });
});
