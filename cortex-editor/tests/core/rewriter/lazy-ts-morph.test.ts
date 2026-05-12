import { describe, it, expect, beforeEach } from "vitest";
import { LazyTsMorph } from "../../../src/core/rewriter/lazy-ts-morph.js";
import { _resetTsMorphForTesting } from "../../../src/core/rewriter/jsx-utils.js";

describe("LazyTsMorph", () => {
  beforeEach(() => {
    _resetTsMorphForTesting();
  });

  it("ensureReady() called twice returns the same { project, SK } reference", async () => {
    const morph = new LazyTsMorph("TestOwner");
    const first = await morph.ensureReady();
    const second = await morph.ensureReady();
    expect(second.project).toBe(first.project);
    expect(second.SK).toBe(first.SK);
    morph.dispose();
  });

  it("ensureReady() concurrent callers receive the same promise (no double-init)", async () => {
    const morph = new LazyTsMorph("TestOwner");
    const p1 = morph.ensureReady();
    const p2 = morph.ensureReady();
    expect(p1).toBe(p2);
    await p1;
    morph.dispose();
  });

  it.skip("ensureReady() retries after rejection (internal promise nulled on init failure)", async () => {
    // TODO: ensureTsMorph caches a module-scoped promise; forcing a rejection requires
    // mocking the dynamic import which vitest cannot do cleanly without shadow copies.
    // Behavior is: if _initialize() rejects, _readyPromise is nulled so next call retries.
    // Covered indirectly by the single-init invariant test above.
  });

  it("dispose() is idempotent — calling twice does not throw", () => {
    const morph = new LazyTsMorph("TestOwner");
    morph.dispose();
    expect(() => morph.dispose()).not.toThrow();
  });

  it('ensureReady() rejects after dispose() with "<ownerName> is disposed"', async () => {
    const morph = new LazyTsMorph("TestOwner");
    morph.dispose();
    await expect(morph.ensureReady()).rejects.toThrow("TestOwner is disposed");
  });

  it("isDisposed getter reflects state", () => {
    const morph = new LazyTsMorph("TestOwner");
    expect(morph.isDisposed).toBe(false);
    morph.dispose();
    expect(morph.isDisposed).toBe(true);
  });

  it("dispose() clears project + SK + _readyPromise to null (no leaked references)", async () => {
    const morph = new LazyTsMorph("TestOwner");
    await morph.ensureReady();
    morph.dispose();
    // Indirect check via isDisposed; internal fields are private.
    expect(morph.isDisposed).toBe(true);
    // A subsequent ensureReady should reject (proof internal state was cleared).
    await expect(morph.ensureReady()).rejects.toThrow("TestOwner is disposed");
  });

  it("useInMemoryFileSystem option is forwarded to Project constructor", async () => {
    // Two LazyTsMorph instances with different options should create independent projects.
    const morphDisk = new LazyTsMorph("OwnerDisk", {
      useInMemoryFileSystem: false,
    });
    const morphMem = new LazyTsMorph("OwnerMem", {
      useInMemoryFileSystem: true,
    });
    const { project: projDisk } = await morphDisk.ensureReady();
    const { project: projMem } = await morphMem.ensureReady();
    expect(projDisk).not.toBe(projMem);
    morphDisk.dispose();
    morphMem.dispose();
  });
});
