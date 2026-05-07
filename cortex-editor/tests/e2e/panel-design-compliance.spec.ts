/**
 * Runtime DESIGN.md compliance + per-control stale indicator e2e spec.
 *
 * Business purpose: ZF0-1495 moved source-level CSS linting for hardcoded
 * hex colors, gradients, and glow shadows into `tests/styles/css-compliance.test.ts`.
 * This Playwright spec keeps the two checks that genuinely need a rendered
 * Panel: runtime text-content emoji scanning and stale-indicator behavior.
 *
 * Test 2 uses a TreeWalker over text nodes to check for emoji characters that
 * can be inserted by component interpolation at render time.
 *
 * Test 4 asserts that `_testOnly_evictStale` drives the
 * `cortex-numeric-input--stale` CSS class + data-tooltip on NumericInput
 * controls. This proves the end-to-end wire from CSSOverrideManager to
 * CortexApp.staleSources to Panel.elementSourceIsStale to SpacingControls.stale
 * to NumericInput.stale.
 *
 * Boot: both tests use `bootWithSendSpy` (from helpers/panel.ts), which already
 * calls `activateDesignMode`. DO NOT duplicate the boot sequence.
 *
 * FALSIFIABILITY PROOF - Test 2 (no Unicode emoji)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns section 2 + README.
 *
 *   Mutation: after bootWithSendSpy, before the DOM scan, injected an emoji
 *   text node directly into `.cortex-panel-header` in the shadow root:
 *     const el = root.querySelector('.cortex-panel-header')
 *     el.insertBefore(document.createTextNode('🚀'), el.firstChild)
 *
 *   Observed failure:
 *     - The TreeWalker found the injected text node. The ancestor walk
 *       resolved `.cortex-panel-header` as the cortex-* ancestor.
 *       Character '🚀' (U+1F680 >= 0x1F300) was flagged.
 *     - `violations` = ['cortex-panel-header: U+1F680 "🚀"'].
 *     - `expect(violations).toEqual([])` FAILED.
 *
 *   Revert: removed the injection block, re-ran - all green (0 violations).
 *
 * FALSIFIABILITY PROOF - Test 4 (per-control stale indicator)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns section 2 + README.
 *
 *   Mutation: in CortexApp.tsx, temporarily neutered the _testOnly_evictStale
 *   closure body to a no-op (replaced the entire staleEntries.add + conditional
 *   emitStale block with `// no-op`), rebuilt with `npm run build:test`,
 *   re-ran this spec.
 *
 *   Observed failure:
 *     - Step 4 (stale === true on NumericInput) FAILED: after
 *       page.evaluate([...bridge.overrideManager._testOnly_evictStale(...)]),
 *       the poll for `{ stale: true }` timed out with 2000ms.
 *       getNumericInputStaleState returned `{ stale: false, tooltipText: "Left offset" }`
 *       because the no-op never added to staleEntries and never called emitStale(),
 *       so CortexApp's setStaleOverrideCount stayed at 0, staleSources stayed
 *       empty, and elementSourceIsStale stayed false - no stale class was applied.
 *       The test directly catches the regression that _testOnly_evictStale drives
 *       the per-control stale indicator through the full app wire.
 *
 *   Revert: restored CortexApp.tsx, rebuilt with `npm run build:test`, re-ran.
 *   All cases green.
 */
import { test, expect } from '@playwright/test'
import { type CortexTestBridge } from './helpers/bridge.js'
import {
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
} from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  getNumericInputStaleState,
  selectElement,
  waitForElementStatePanel,
  stageEdit,
} from './helpers/panel.js'

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Panel DESIGN.md compliance + per-control stale indicator (ZF0-1491)', () => {
  test('Test 2 — no Unicode emoji in cortex-* text content', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    const violations = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) return [] as string[]

      const found: string[] = []

      // TreeWalker over text nodes only — skips SVG path data and attributes.
      // SHOW_TEXT (0x4) visits only TEXT_NODE (nodeType === 3) nodes.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

      let textNode: Node | null = walker.nextNode()
      while (textNode !== null) {
        const content = textNode.textContent ?? ''
        if (!content.trim()) {
          textNode = walker.nextNode()
          continue
        }

        // Walk up to the nearest element ancestor and check for cortex-* class.
        let ancestor: Node | null = textNode.parentNode
        let hasCortexClass = false
        let cortexClassName = ''
        while (ancestor && ancestor !== root) {
          if (ancestor.nodeType === Node.ELEMENT_NODE) {
            const classes = Array.from((ancestor as Element).classList)
            const cortexClasses = classes.filter((c) => c.startsWith('cortex-'))
            if (cortexClasses.length > 0) {
              hasCortexClass = true
              cortexClassName = cortexClasses.join(' ')
              break
            }
          }
          ancestor = ancestor.parentNode
        }

        if (hasCortexClass) {
          // ZF0-1473 PR #93 Copilot feedback: use Unicode property escape
          // \p{Extended_Pictographic} per UTS #51. Catches the full emoji
          // surface including dingbats (U+2700-U+27BF, e.g. ✓ ☑) and misc
          // symbols (U+2600-U+26FF, e.g. ★ ☀) — these are below the prior
          // 0x1F300 threshold and would have slipped through. DESIGN.md's
          // "lucide-icons-only, no emoji" rule covers all pictographic glyphs,
          // not just the supplementary-plane emoji blocks.
          //
          // ALLOWLIST: SpacingControls.tsx:6 documents an intentional choice
          // to use ↔ (U+2194) and ↕ (U+2195) as compact axis indicators in
          // NumericInput prefix labels rather than icon prefixes. These two
          // codepoints have default emoji presentation per UTS #51 (so they
          // match Extended_Pictographic), but they're text-style math/arrow
          // symbols functioning as UI labels — same DESIGN.md role as the
          // string "P" in "P ↔". A future refactor could swap them for
          // Lucide ArrowLeftRight/ArrowUpDown icons; until then, the
          // allowlist documents the deliberate exception so the scanner
          // doesn't whack-a-mole on legitimate UI semantics.
          const ALLOWED_PICTOGRAPHIC = new Set(['↔', '↕'])
          const emojiPattern = /\p{Extended_Pictographic}/u
          const emojiChars = [...content].filter(
            (ch) => emojiPattern.test(ch) && !ALLOWED_PICTOGRAPHIC.has(ch),
          )
          for (const ch of emojiChars) {
            found.push(`${cortexClassName}: U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()} "${ch}"`)
          }
        }

        textNode = walker.nextNode()
      }

      return found
    })

    expect(violations).toEqual([])
  })

  test('Test 4 — per-control stale indicator driven by _testOnly_evictStale', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    // ── Step 1: baseline — no stale indicator ────────────────────────────────
    // Before any eviction, all NumericInputs must be in the non-stale state.
    const initial = await getNumericInputStaleState(page)
    expect(initial.stale).toBe(false)

    // ── Step 2: stage an edit on padding-top ─────────────────────────────────
    // Staging documents the production scenario: the user staged an edit,
    // applied it, and HMR didn't confirm within the TTL. The staging step
    // itself does not affect the stale indicator — only the TTL eviction does.
    await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '32px')

    // ── Step 3: drive synthetic stale via bridge ──────────────────────────────
    // _testOnly_evictStale(source, property) synchronously:
    //   1. Adds `${source}\0${property}\0` to overrideManager.staleEntries
    //   2. Calls overrideManager.emitStale() if it was a new entry
    //   3. CortexApp.tsx onStale listener fires: setStaleOverrideCount(staleSet.size)
    //      AND updates staleSources (the Set<string> of source paths with stale overrides)
    //   4. Panel.tsx reads staleSources → elementSourceIsStale = staleSources.has(source)
    //   5. SpacingControls receives stale={true} → all NumericInputs receive stale={true}
    //   6. NumericInput renders cortex-numeric-input--stale CSS class + data-tooltip
    //
    // This bypasses the 30s TTL for deterministic Playwright specs.
    await page.evaluate(
      ({ source, prop }) => {
        const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
        bridge.overrideManager._testOnly_evictStale(source, prop)
      },
      { source: FIXTURE_SEED_SOURCE, prop: 'padding-top' },
    )

    // ── Step 4: assert stale indicator on NumericInput ────────────────────────
    // The stale indicator is element-level (Panel.tsx:1312 elementSourceIsStale),
    // not property-level — all NumericInputs for #center become stale simultaneously.
    // SpacingControls uses `prefix` (not `label`) for its NumericInputs, so we
    // call getNumericInputStaleState without a property arg and match the first
    // control. Any control would work because stale is binary at element level.
    //
    // Assertions per NumericInput.tsx:229-244:
    //   - cortex-numeric-input--stale class applied when stale=true (line 238)
    //   - data-tooltip = "Edit saved but HMR didn't apply — refresh to verify" (line 230)
    //   - cortex-numeric-input--overridden is mutually exclusive with stale (line 239)
    await expect
      .poll(() => getNumericInputStaleState(page), { timeout: 2000 })
      .toMatchObject({
        stale: true,
        tooltipText: "Edit saved but HMR didn't apply — refresh to verify",
        hasOverriddenClass: false,
      })
  })
})
