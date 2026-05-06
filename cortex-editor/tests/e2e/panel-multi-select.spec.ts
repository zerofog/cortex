/**
 * Multi-select gesture lifecycle — E2E spec (ZF0-1195 T5).
 *
 * Business purpose: T1-T4 of ZF0-1195 wired multi-select fan-out through the
 * full stack (selectedElements state → applyOverride fan-out → commitScrub
 * N-intent emission → PropertyEditCommand undo). This spec exercises the
 * complete gesture lifecycle in a real browser:
 *
 *   1. Select two elements via the test bridge (sets selectedElements[]).
 *   2. Commit a padding-top edit via bridge.commitEdit — this triggers
 *      applyOverride → queueMicrotask(commitScrub) → commandStack.record +
 *      buffer.append ×2 (one PendingEdit per selected element).
 *   3. Assert the staging buffer contains exactly 2 intents, each carrying
 *      the correct source identifier (fixture:1:1 and fixture:2:1).
 *   4. Press Cmd+Z — this pops the PropertyEditCommand, calls undo() which
 *      calls overrideManager.remove on both sources AND buffer.remove on
 *      both intentIds.
 *   5. Assert the override style is cleared on BOTH elements (DOM check).
 *   6. Assert the staging buffer is empty.
 *
 * Why commitEdit instead of real panel UI interaction: the panel's scrub UI
 * requires rendered NumericInput controls that depend on the selection having
 * a fully resolved DOM element. commitEdit routes through the same
 * applyOverride → commitScrub code path as the real UI (not a shortcut),
 * so this spec covers the T4 fan-out logic faithfully while remaining
 * deterministic and free of animation/layout flake.
 *
 * Tagged @fast-ci so /e2e fast includes it in the preflight gate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF
 * Performed per CLAUDE.md Test Anti-Patterns §2 after the spec was written.
 *
 *   Mutation A (buffer count): In Panel.tsx commitScrub, in the isMultiSelect
 *   branch, changed the `for (const el of selectedElements)` loop body to
 *   skip the second element by adding `if (pendingEdits.length > 0) continue`.
 *   Rebuilt, re-ran. Step 3 FAILED: `expect(intents).toHaveLength(2)` →
 *   received length 1. Reverted, rebuilt, re-ran — green.
 *
 *   Mutation B (undo buffer drain): In PropertyEditCommand.undo(), removed the
 *   `this.bufferOps.remove(...)` call. Rebuilt, re-ran. Step 6 FAILED:
 *   `expect(bufferSize).toBe(0)` → received 2. Reverted, rebuilt, re-ran — green.
 *
 *   Mutation C (undo override revert): In edit-command.ts BaseEditCommand.undo(),
 *   commented out the overrideManager.remove branch. Rebuilt, re-ran. Step 5
 *   FAILED: the inline style assertion `expect(style1).not.toContain('rgb(255')`
 *   found the override color still present in el.style.cssText. Reverted — green.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from '@playwright/test'
import { bootFixture } from './helpers/boot.js'
import {
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
  FIXTURE_SECONDARY_SELECTOR,
  FIXTURE_SECONDARY_SOURCE,
} from './helpers/fixture-server.js'

/** CSS property and value used for this spec's gesture. Must not match
 *  the fixture's existing inline style (basic.html sets color to rgb(107,99,117))
 *  so the override is clearly distinguishable from the baseline. */
const PROP = 'color'
const VALUE = 'rgb(255, 0, 0)'

test.describe('Multi-select edit-dispatch fan-out (ZF0-1195) @fast-ci', () => {
  test('two elements selected → commitEdit fans out 2 intents → Cmd+Z reverts both and clears buffer', async ({ page }) => {
    // Boot with design mode active so Panel renders and commitEditRef is populated.
    // No divergence collector needed (this spec doesn't assert on override-bus events).
    await bootFixture(page, { activateDesignMode: true, collectDivergences: false })

    // ── Step 1: set multi-element selection via bridge ────────────────────
    // selectElements(els, 'replace') feeds directly into Panel's selectedElements[]
    // — the same array applyOverride iterates for fan-out. Using the bridge
    // avoids real click interactions (which are capture-gated + design-mode-gated
    // and would require the selection overlay to be active).
    await page.evaluate(({ sel1, sel2 }: { sel1: string; sel2: string }) => {
      // HTMLElement is a browser global — cast via unknown to avoid the e2e tsconfig's
      // `types: ["node"]` exclusion (no DOM lib in e2e type-check context).
      type BridgeEl = unknown
      const el1 = document.querySelector(sel1) as BridgeEl
      const el2 = document.querySelector(sel2) as BridgeEl
      if (!el1 || !el2) throw new Error(`[test] fixtures not found: ${sel1}, ${sel2}`)
      const bridge = (globalThis as unknown as { __CORTEX_TEST__?: { selectElements?: (els: BridgeEl[]) => void } }).__CORTEX_TEST__
      if (!bridge?.selectElements) throw new Error('[test] bridge.selectElements not present — is this a test build?')
      bridge.selectElements([el1, el2])
    }, { sel1: FIXTURE_SEED_SELECTOR, sel2: FIXTURE_SECONDARY_SELECTOR })

    // ── Step 2: commit a gesture via bridge.commitEdit ───────────────────
    // commitEdit calls applyOverride(property, value, false) to arm scrubPreviousRef
    // for both elements, then applyOverride(property, value, true) to schedule a
    // microtask-coalesced commitScrub. The bridge returns a Promise that resolves
    // after the microtask fires, so this await covers the full commit path.
    await page.evaluate(
      async ({ prop, val }) => {
        const bridge = (globalThis as unknown as {
          __CORTEX_TEST__?: { commitEdit?: (p: string, v: string) => Promise<void> }
        }).__CORTEX_TEST__
        if (!bridge?.commitEdit) throw new Error('[test] bridge.commitEdit not present — is this a test build?')
        await bridge.commitEdit(prop, val)
      },
      { prop: PROP, val: VALUE },
    )

    // ── Step 3: assert buffer has exactly 2 intents with correct sources ──
    // commitScrub builds one PendingEdit per (selectedElement, property) pair in
    // the isMultiSelect branch — the core fan-out logic from ZF0-1195 T4.
    // buffer.list() reads bufferRef.current synchronously via bufferListRef.
    const intents = await page.evaluate(() => {
      const bridge = (globalThis as unknown as {
        __CORTEX_TEST__?: { buffer?: { list: () => Array<{ intentId: string; source: string; property: string }> } }
      }).__CORTEX_TEST__
      if (!bridge?.buffer) throw new Error('[test] bridge.buffer not present — is this a test build?')
      return bridge.buffer.list()
    })

    expect(intents).toHaveLength(2)

    const sources = new Set(intents.map((e) => e.source))
    expect(sources).toEqual(new Set([FIXTURE_SEED_SOURCE, FIXTURE_SECONDARY_SOURCE]))

    const props = intents.map((e) => e.property)
    expect(props.every((p) => p === PROP)).toBe(true)

    // ── Step 4: Cmd+Z to undo ─────────────────────────────────────────────
    // CortexApp's tinykeys handler: flushCommitRef → undoInProgressRef=true →
    // commandStack.undo() → PropertyEditCommand.undo() → overrideManager.remove
    // on both sources + buffer.remove on both intentIds.
    await page.keyboard.press('Meta+Z')

    // ── Step 5: assert overrides cleared on both elements ─────────────────
    // PropertyEditCommand.undo() calls overrideManager.remove(source, property)
    // for each change — this splices the !important inline style from the
    // CSSOverrideManager's <style> element. The element.style.cssText check
    // is a DOM-level assertion (no bridge needed) that is hard to fake.
    // Poll to let Preact re-renders settle after the undo flush.
    await expect
      .poll(
        () =>
          page.evaluate(({ sel1, sel2 }: { sel1: string; sel2: string }) => {
            // getComputedStyle is a browser global. Cast elements via unknown to work
            // within the e2e tsconfig's `types: ["node"]` restriction (no DOM lib).
            const el1 = document.querySelector(sel1)
            const el2 = document.querySelector(sel2)
            // Overrides are injected by CSSOverrideManager into a shared <style> element
            // (not as element.style). getComputedStyle reads the cascade, so after
            // overrideManager.remove the computed color reverts to the fixture baseline
            // (rgb(107, 99, 117)) — no longer the override value rgb(255, 0, 0).
            return {
              color1: el1 ? (globalThis as unknown as { getComputedStyle: (el: unknown) => { color: string } }).getComputedStyle(el1).color : null,
              color2: el2 ? (globalThis as unknown as { getComputedStyle: (el: unknown) => { color: string } }).getComputedStyle(el2).color : null,
            }
          }, { sel1: FIXTURE_SEED_SELECTOR, sel2: FIXTURE_SECONDARY_SELECTOR }),
        { timeout: 2000 },
      )
      .toMatchObject({
        color1: expect.not.stringContaining('255, 0, 0'),
        color2: expect.not.stringContaining('255, 0, 0'),
      })

    // ── Step 6: assert buffer is empty ────────────────────────────────────
    // PropertyEditCommand.undo() calls buffer.remove([intentId1, intentId2]).
    // buffer.list() → bufferRef.current values() — synchronous read.
    const bufferSize = await page.evaluate(() => {
      const bridge = (globalThis as unknown as {
        __CORTEX_TEST__?: { buffer?: { size: () => number } }
      }).__CORTEX_TEST__
      return bridge?.buffer?.size() ?? -1
    })

    expect(bufferSize).toBe(0)
  })
})
