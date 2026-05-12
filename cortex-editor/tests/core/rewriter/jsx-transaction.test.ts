import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createJsxTransaction,
  _resetPoolForTesting,
  _getPoolForTesting,
} from "../../../src/core/rewriter/jsx-transaction.js";
import { TailwindRewriter } from "../../../src/core/rewriter/tailwind.js";
import { InlineStyleRewriter } from "../../../src/core/rewriter/inline-style.js";

/**
 * ZF0-1215 C2 scaffold tests.
 *
 * JsxTransaction is the shared in-memory source that lets TailwindRewriter
 * and InlineStyleRewriter both mutate the SAME ts-morph SourceFile during
 * a compound edit (classOp + inlineSets + inlineRemoves). These tests
 * exercise the transaction primitive directly and the transactional
 * methods on both rewriters, without going through the EditPipeline.
 *
 * End-to-end compound-edit pipeline tests land in Commit 9 / edit-pipeline.
 */

beforeEach(() => {
  _resetPoolForTesting();
});

describe("createJsxTransaction", () => {
  it("returns a handle exposing the initial content and a live source file", async () => {
    const content = 'export const A = () => <div className="flex" />\n';
    const txn = await createJsxTransaction("/virtual/A.tsx", content);
    expect(txn.filePath).toBe("/virtual/A.tsx");
    expect(txn.initialContent).toBe(content);
    expect(txn.getCurrentContent()).toBe(content); // no mutations yet
    expect(txn.sourceFile.getFullText()).toBe(content);
    expect(txn.SK).toBeDefined();
    txn.dispose();
  });

  it("does NOT write to disk; the transaction is memory-only", async () => {
    // Transaction creation with a non-existent path must not error.
    // ts-morph Project is configured with useInMemoryFileSystem: false
    // BUT we use createSourceFile(..., { overwrite: true }) which stages
    // the source in-memory only. Disk I/O is the caller's responsibility.
    const txn = await createJsxTransaction(
      "/definitely/does/not/exist/Nope.tsx",
      "export const Z = () => <div />\n",
    );
    expect(txn.getCurrentContent()).toContain("export const Z");
    txn.dispose();
  });

  it("getCurrentContent reflects direct ts-morph mutations", async () => {
    const content = 'export const A = () => <div className="flex" />\n';
    const txn = await createJsxTransaction("/virtual/A.tsx", content);
    // Find the className literal directly and mutate.
    const jsx = txn.sourceFile.getDescendantsOfKind(
      txn.SK.JsxSelfClosingElement,
    )[0];
    const attr = jsx?.getAttribute("className")?.asKind(txn.SK.JsxAttribute);
    const init = attr?.getInitializer()?.asKind(txn.SK.StringLiteral);
    init?.setLiteralValue("heading-1");
    expect(txn.getCurrentContent()).toContain('className="heading-1"');
    // Initial content is preserved for undo bookkeeping.
    expect(txn.initialContent).toBe(content);
    txn.dispose();
  });
});

describe("ProjectPool integration", () => {
  // Test A — Pool reuse across transactions
  it("A: pool honors maxSize cap and releases all after sequential use", async () => {
    // N=6 > maxSize=4; after all complete, pool should have availableCount <= 4
    // and inUseCount === 0
    for (let i = 0; i < 6; i++) {
      const txn = await createJsxTransaction(
        "/v/Seq.tsx",
        `export const C${i} = 1\n`,
      );
      txn.getCurrentContent();
      txn.dispose();
    }
    const pool = _getPoolForTesting();
    expect(pool).not.toBeNull();
    expect(pool!.availableCount).toBeLessThanOrEqual(4);
    expect(pool!.inUseCount).toBe(0);
  });

  // Test B — dispose() releases the Project; next transaction can reuse it
  it("B: dispose() releases project to pool; next transaction reuses it", async () => {
    const txnA = await createJsxTransaction("/v/A.tsx", "export const A = 1\n");
    txnA.dispose();

    const pool = _getPoolForTesting();
    expect(pool).not.toBeNull();

    const txnB = await createJsxTransaction("/v/B.tsx", "export const B = 2\n");
    // B acquired the project A released — pool should show 1 in-use, 0 available
    expect(pool!.inUseCount).toBe(1);
    expect(pool!.availableCount).toBe(0);

    txnB.dispose();
    expect(pool!.availableCount).toBe(1);
    expect(pool!.inUseCount).toBe(0);
  });

  // Test C — Cross-transaction filepath/content isolation
  it("C: transaction B sees fresh content, not residue from transaction A mutation", async () => {
    const txnA = await createJsxTransaction(
      "/v/Foo.tsx",
      "export const A = 1\n",
    );
    // Mutate A's source file directly
    const jsxA = txnA.sourceFile.getDescendantsOfKind(
      txnA.SK.VariableDeclaration,
    )[0];
    jsxA?.getNameNode().replaceWithText("MUTATED");
    expect(txnA.getCurrentContent()).toContain("MUTATED");
    txnA.dispose();

    // B uses same path but fresh content
    const txnB = await createJsxTransaction(
      "/v/Foo.tsx",
      "export const B = 2\n",
    );
    const content = txnB.getCurrentContent();
    expect(content).toBe("export const B = 2\n");
    expect(content).not.toContain("MUTATED");
    expect(content).not.toContain("A = 1");
    txnB.dispose();
  });

  // Test D — dispose() is idempotent
  it("D: dispose() is idempotent — second call does not double-decrement inUseCount", async () => {
    const txn = await createJsxTransaction(
      "/v/Idem.tsx",
      "export const I = 1\n",
    );
    const pool = _getPoolForTesting();
    expect(pool).not.toBeNull();
    expect(pool!.inUseCount).toBe(1);

    txn.dispose();
    expect(pool!.inUseCount).toBe(0);

    // Second dispose — must be no-op, not -1
    txn.dispose();
    expect(pool!.inUseCount).toBe(0);
  });

  // Mechanism test: release() actually calls removeSourceFile on the Project.
  // Falsifiable assertion: after dispose, the underlying ts-morph Project has
  // zero source files (NOT relying on createSourceFile's { overwrite: true }
  // to mask residue). Then a subsequent transaction on a DIFFERENT path
  // reuses the SAME Project instance (proving pool reuse) and that Project
  // tracks only the new file (proving cleanup ran before reuse).
  it("release() clears source files on the underlying Project (mechanism)", async () => {
    const txnA = await createJsxTransaction(
      "/v/Mech.tsx",
      "export const x = 1\n",
    );
    // Capture the underlying Project reference BEFORE dispose — after
    // dispose we no longer have access to it through the handle.
    const projectA = txnA.sourceFile.getProject();
    expect(projectA.getSourceFiles().length).toBe(1);
    expect(
      projectA
        .getSourceFiles()
        .some((sf) => sf.getFilePath().endsWith("Mech.tsx")),
    ).toBe(true);

    txnA.dispose();

    // The Project is back in the pool with zero source files. If release()
    // were a no-op, projectA would still have Mech.tsx in its source files.
    expect(projectA.getSourceFiles().length).toBe(0);

    // Create txnB on a DIFFERENT path. The pool should pop projectA and
    // reuse it (single-entry pool after one release). Same Project instance
    // proves pool reuse; only B's file proves cleanup happened before reuse.
    const txnB = await createJsxTransaction(
      "/v/Other.tsx",
      "export const y = 2\n",
    );
    const projectB = txnB.sourceFile.getProject();
    expect(projectB).toBe(projectA); // pool reused the same Project instance
    const paths = projectB.getSourceFiles().map((sf) => sf.getFilePath());
    expect(paths.some((p) => p.endsWith("Other.tsx"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Mech.tsx"))).toBe(false);

    txnB.dispose();
  });

  // Post-dispose guard: reading source content after dispose risks
  // cross-pollination from a future transaction on the same recycled Project.
  // The handle's getCurrentContent must throw a loud, descriptive error
  // rather than returning stale or future content.
  it("getCurrentContent() throws if called after dispose()", async () => {
    const txn = await createJsxTransaction(
      "/v/Guard.tsx",
      "export const X = 1\n",
    );
    expect(txn.getCurrentContent()).toContain("X = 1");
    txn.dispose();
    expect(() => txn.getCurrentContent()).toThrow(
      /getCurrentContent\(\) called after dispose/,
    );
  });
});

describe("TailwindRewriter.rewriteClassListInTransaction", () => {
  let rewriter: TailwindRewriter;

  beforeEach(() => {
    rewriter = new TailwindRewriter();
  });
  afterEach(() => {
    rewriter.dispose();
  });

  it("mutates the transaction source file (no disk write)", async () => {
    const content = 'export const A = () => <div className="body-md" />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1,
      col: 25,
      remove: "body-md",
      add: "heading-1",
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).toContain('className="heading-1"');
    expect(txn.initialContent).toBe(content); // preserved for undo
    txn.dispose();
  });

  it("returns success=true and unchanged content for an idempotent add", async () => {
    const content = 'export const A = () => <div className="body-md" />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1,
      col: 25,
      add: "body-md",
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).toBe(content);
    txn.dispose();
  });

  it("returns success=false with reason when the element is not found", async () => {
    const content = 'export const A = () => <div className="body-md" />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 99,
      col: 99,
      add: "foo",
    });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.reason).toMatch(/No JSX element found/);
    expect(txn.getCurrentContent()).toBe(content); // no mutation on failure
    txn.dispose();
  });

  it("returns success=false for template literals (routes to AI)", async () => {
    const content =
      "export const A = ({x}:{x:string}) => <div className={`body-md ${x}`} />\n";
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1,
      col: 40,
      remove: "body-md",
    });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.reason.toLowerCase()).toMatch(/template literal/);
    txn.dispose();
  });
});

describe("InlineStyleRewriter.setAndRemoveInTransaction", () => {
  let rewriter: InlineStyleRewriter;

  beforeEach(() => {
    rewriter = new InlineStyleRewriter();
  });
  afterEach(() => {
    rewriter.dispose();
  });

  it("adds a style prop when none exists (sets only)", async () => {
    const content = "export const A = () => <div />\n";
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [{ property: "font-size", value: "14px" }],
      removes: [],
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).toContain("style={{");
    expect(txn.getCurrentContent()).toContain('fontSize: "14px"');
    txn.dispose();
  });

  it("sets multiple properties in one call", async () => {
    const content = "export const A = () => <div />\n";
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [
        { property: "font-size", value: "14px" },
        { property: "font-weight", value: "600" },
        { property: "line-height", value: "1.4" },
      ],
      removes: [],
    });
    expect(res.success).toBe(true);
    const out = txn.getCurrentContent();
    expect(out).toContain('fontSize: "14px"');
    expect(out).toContain('fontWeight: "600"');
    expect(out).toContain('lineHeight: "1.4"');
    txn.dispose();
  });

  it("removes properties from an existing style object", async () => {
    const content =
      'export const A = () => <div style={{ fontSize: "14px", color: "red" }} />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [],
      removes: [{ property: "font-size" }],
    });
    expect(res.success).toBe(true);
    const out = txn.getCurrentContent();
    expect(out).not.toContain("fontSize");
    expect(out).toContain('color: "red"');
    txn.dispose();
  });

  it("removes the entire style attribute when the object becomes empty", async () => {
    const content =
      'export const A = () => <div style={{ fontSize: "14px" }} />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [],
      removes: [{ property: "font-size" }],
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).not.toContain("style=");
    txn.dispose();
  });

  it("removes-first-then-sets ordering when a property appears in both (set wins)", async () => {
    const content =
      'export const A = () => <div style={{ fontSize: "14px" }} />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [{ property: "font-size", value: "24px" }],
      removes: [{ property: "font-size" }],
    });
    expect(res.success).toBe(true);
    // The set wins — value should be 24px (not removed and then missing).
    expect(txn.getCurrentContent()).toContain('fontSize: "24px"');
    txn.dispose();
  });

  it("is a no-op success when sets and removes are both empty", async () => {
    const content = 'export const A = () => <div style={{ color: "red" }} />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [],
      removes: [],
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).toBe(content);
    txn.dispose();
  });

  it("fails without mutation when a set targets a non-literal existing value (all-or-nothing)", async () => {
    // The existing fontSize value is a variable reference. The rewriter
    // must bail BEFORE touching the AST — no partial mutation.
    const content =
      'export const A = ({s}:{s:string}) => <div style={{ fontSize: s, color: "red" }} />\n';
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 40,
      sets: [{ property: "font-size", value: "14px" }],
      removes: [{ property: "color" }], // this would succeed on its own
    });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.reason).toMatch(/non-literal/);
    // Critical: the color property was NOT removed despite being a
    // separate removal target. All-or-nothing: either every requested
    // mutation lands, or none do.
    expect(txn.getCurrentContent()).toBe(content);
    txn.dispose();
  });

  it("treats removes as no-op when the element has no style attr", async () => {
    const content = "export const A = () => <div />\n";
    const txn = await createJsxTransaction("/v/A.tsx", content);
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1,
      col: 25,
      sets: [],
      removes: [{ property: "font-size" }],
    });
    expect(res.success).toBe(true);
    expect(txn.getCurrentContent()).toBe(content);
    txn.dispose();
  });

  // ── ZF0-1293: shorthand-clobber guard (transaction path) ──────
  //
  // Shared guard scenarios (family-specific inputs, same `needsShorthandReorder`
  // branch) are covered in inline-style.test.ts. These two tests cover the
  // DISTINCT behavior of `setAndRemoveInTransaction` — the collect-move-verify
  // fix-up pass that runs AFTER the sets loop, which handles cases the per-set
  // guard in `rewrite()` cannot reach.

  describe("shorthand-clobber fix-up pass in setAndRemoveInTransaction (ZF0-1293)", () => {
    it("fix-up pass re-orders a longhand set when a shorthand exists later in the literal", async () => {
      // Basic transaction-path coverage — proves the fix-up pass runs for
      // the same unsafe-order scenario as rewrite(). If this fails while
      // inline-style.test.ts passes, the fix-up pass is broken independently.
      const content =
        'export const A = () => <div style={{ paddingBottom: "10px", padding: "30px" }} />\n';
      const txn = await createJsxTransaction("/v/A.tsx", content);
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1,
        col: 25,
        sets: [{ property: "padding-bottom", value: "16px" }],
        removes: [],
      });
      expect(res.success).toBe(true);
      const out = txn.getCurrentContent();
      expect(out.indexOf("paddingBottom:")).toBeGreaterThan(
        out.indexOf("padding:"),
      );
      expect(out).toContain('paddingBottom: "16px"');
      expect(out).toContain('padding: "30px"');
      txn.dispose();
    });

    it("triple-shorthand chain: border + borderWidth + borderTopWidth stabilize to correct cascade order", async () => {
      // Adversarial-review finding: the fix-up pass previously used
      // collect-then-apply-in-collection-order which produced the wrong
      // final order for multi-level chains. After moving borderTopWidth
      // to the end, borderWidth still needed moving past border — but
      // the original algorithm had already committed its decisions and
      // appended borderWidth AFTER borderTopWidth, re-introducing the
      // clobber. The iterate-until-stable algorithm handles this by
      // restarting the scan after each move.
      //
      // Required final order: border → borderWidth → borderTopWidth so
      // React applies them in CSS-cascade-correct specificity order
      // (border sets all 4 sides thick; borderWidth overrides all 4
      // widths to 2px; borderTopWidth overrides top-width only).
      const content =
        'export const A = () => <div style={{ borderTopWidth: "1px", borderWidth: "2px", border: "thick solid red" }} />\n';
      const txn = await createJsxTransaction("/v/A.tsx", content);
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1,
        col: 25,
        // Update the most-specific longhand. Forces the fix-up to reorder
        // the full three-level chain.
        sets: [{ property: "border-top-width", value: "4px" }],
        removes: [],
      });
      expect(res.success).toBe(true);
      const out = txn.getCurrentContent();
      const idxBorder = out.search(/\bborder:/);
      const idxBorderWidth = out.search(/\bborderWidth:/);
      const idxBorderTopWidth = out.indexOf("borderTopWidth:");
      expect(idxBorder).toBeGreaterThan(-1);
      expect(idxBorderWidth).toBeGreaterThan(-1);
      expect(idxBorderTopWidth).toBeGreaterThan(-1);
      // Final order: border → borderWidth → borderTopWidth
      expect(idxBorderWidth).toBeGreaterThan(idxBorder);
      expect(idxBorderTopWidth).toBeGreaterThan(idxBorderWidth);
      expect(out).toContain('borderTopWidth: "4px"');
      expect(out).toContain('borderWidth: "2px"'); // preserved, now safely ordered
      expect(out).toContain('border: "thick solid red"');
      txn.dispose();
    });

    it("compound sets: fix-up pass handles shorthand-AFTER-longhand added in same call (bidirectional)", async () => {
      // The unique-to-transaction branch: the caller adds BOTH a longhand
      // and its parent shorthand in one `sets` array. Each `set` individually
      // looks safe (no existing longhand before shorthand, or vice versa),
      // but the combined insertion order puts longhand before shorthand.
      // The rewrite() path can't hit this branch — only the fix-up pass
      // catches it.
      const content =
        'export const A = () => <div style={{ color: "red" }} />\n';
      const txn = await createJsxTransaction("/v/A.tsx", content);
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1,
        col: 25,
        sets: [
          { property: "padding-bottom", value: "16px" }, // would land first
          { property: "padding", value: "30px" }, // would land after → unsafe
        ],
        removes: [],
      });
      expect(res.success).toBe(true);
      const out = txn.getCurrentContent();
      expect(out.indexOf("paddingBottom:")).toBeGreaterThan(
        out.search(/\bpadding:/),
      );
      expect(out).toContain('paddingBottom: "16px"');
      expect(out).toContain('padding: "30px"');
      txn.dispose();
    });
  });
});

describe("compound transaction: classOp + inline ops on the same element", () => {
  let tw: TailwindRewriter;
  let is: InlineStyleRewriter;

  beforeEach(() => {
    tw = new TailwindRewriter();
    is = new InlineStyleRewriter();
  });
  afterEach(() => {
    tw.dispose();
    is.dispose();
  });

  it("applies classOp then inline sets then inline removes on one source", async () => {
    // This is the end-to-end compound-edit shape: user unlinks a text
    // bundle. Pipeline does:
    //   1. remove className token 'text-body-md'
    //   2. set inline font-size/font-weight/line-height (preserved look)
    //   3. remove inline color (no longer needed)
    // All mutations apply to ONE source file, retrieved once from
    // txn.getCurrentContent() at the end.
    const content = `export const H1 = () => (
  <h1 className="text-body-md flex" style={{ color: "red" }}>Hello</h1>
)\n`;
    const txn = await createJsxTransaction("/v/H1.tsx", content);

    const r1 = tw.rewriteClassListInTransaction(txn, {
      line: 2,
      col: 3,
      remove: "text-body-md",
    });
    expect(r1.success).toBe(true);

    const r2 = is.setAndRemoveInTransaction(txn, {
      line: 2,
      col: 3,
      sets: [
        { property: "font-size", value: "14px" },
        { property: "font-weight", value: "600" },
      ],
      removes: [{ property: "color" }],
    });
    expect(r2.success).toBe(true);

    const final = txn.getCurrentContent();
    expect(final).toContain('className="flex"');
    expect(final).not.toContain("text-body-md");
    expect(final).toContain('fontSize: "14px"');
    expect(final).toContain('fontWeight: "600"');
    expect(final).not.toContain("color:");
    // initialContent is preserved for the pipeline's UndoFileChange.
    expect(txn.initialContent).toBe(content);
    txn.dispose();
  });
});
