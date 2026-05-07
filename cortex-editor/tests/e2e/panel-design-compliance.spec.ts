/**
 * DESIGN.md compliance scan + per-control stale indicator e2e spec.
 *
 * Business purpose: ZF0-1473 sub-D validates two independent quality axes:
 *
 *   1. DESIGN.md compliance (Tests 1–3): DOM scanners that walk the cortex
 *      Shadow DOM after Panel render and assert that no cortex-* surface
 *      violates the three rules from DESIGN.md:
 *        - No hardcoded hex colors in CSS rule declarations (tokens only)
 *        - No Unicode emoji in text content
 *        - No linear-gradient or "0px 0px Npx" glow box-shadow patterns
 *
 *   2. Per-control stale indicator (Test 4): asserts that `_testOnly_evictStale`
 *      drives the `cortex-numeric-input--stale` CSS class + data-tooltip on the
 *      Panel's NumericInput controls. This proves the end-to-end wire from
 *      CSSOverrideManager → CortexApp.staleSources → Panel.elementSourceIsStale
 *      → SpacingControls.stale → NumericInput.stale.
 *
 * Test 1 scan strategy: reads the shadow root's `<style>` element text content
 * (styles.css injected by bootstrap) and finds hex patterns in CSS rule
 * declarations. The `:host {}` block is excluded because it legitimately
 * defines design tokens with hex values (e.g. `--cx-ink: #111827`) — only
 * non-token rule declarations (outside `:host`) are checked. This approach is
 * falsifiable: injecting a `<style>` element with a hex rule triggers a
 * violation, proving the scanner catches the regression.
 *
 * Tests 2 and 3 scan element inline styles via style.cssText — the only
 * surface where a runtime component could accidentally set a non-token value.
 * Test 2 uses a TreeWalker over text nodes to check for emoji characters.
 * Test 3 checks for `linear-gradient(` in cssText and for `0px 0px Npx`
 * glow box-shadow patterns (the browser normalizes `0 0 12px red` to
 * `red 0px 0px 12px` on write, so the pattern uses `0px`).
 *
 * Boot: all 4 tests use `bootWithSendSpy` (from helpers/panel.ts), which already
 * calls `activateDesignMode`. DO NOT duplicate the boot sequence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 1 (no hardcoded hex in CSS rule declarations)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: after bootWithSendSpy, before the DOM scan, injected a `<style>`
 *   element into the shadow root containing a cortex-* hex rule:
 *     const injected = document.createElement('style')
 *     injected.textContent = '.cortex-test { color: #ff0000; }'
 *     root.appendChild(injected)
 *
 *   Observed failure:
 *     - `violations` contained "#ff0000" from the injected rule.
 *     - `expect(violations).toEqual([])` FAILED.
 *     - The scanner correctly detected the injected hex rule.
 *
 *   Source-code validation: the real `styles.css` HAD a violation
 *   (`color: #fff` on `.cortex-label`) that was caught and fixed by this
 *   spec before landing — now `color: var(--cx-on-select)`. The scanner
 *   directly caught that regression.
 *
 *   Revert: removed the injection block, re-ran — all green (0 violations).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 2 (no Unicode emoji)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
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
 *   Revert: removed the injection block, re-ran — all green (0 violations).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 3 (no linear-gradient or glow box-shadow)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: after bootWithSendSpy, before the DOM scan, set a glow
 *   box-shadow on `.cortex-panel-header` in the shadow root:
 *     el.style.boxShadow = '0 0 12px rgba(255,0,0,0.5)'
 *   (The browser normalizes this to 'rgba(255, 0, 0, 0.5) 0px 0px 12px'.)
 *
 *   Observed failure:
 *     - The glow scanner found `0px 0px 12px` in the normalized value.
 *     - `expect(glowViolations).toEqual([])` FAILED.
 *     - The pattern `0px\s+0px\s+\d+` correctly matches the normalized form.
 *
 *   Revert: removed the injection block, re-ran — all green (0 violations).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 4 (per-control stale indicator)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
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
 *       empty, and elementSourceIsStale stayed false — no stale class was applied.
 *       The test directly catches the regression that _testOnly_evictStale drives
 *       the per-control stale indicator through the full app wire.
 *
 *   Revert: restored CortexApp.tsx, rebuilt with `npm run build:test`, re-ran.
 *   All 4 cases green.
 * ─────────────────────────────────────────────────────────────────────────────
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
  test('Test 1 — no hardcoded hex colors in cortex-* CSS rule declarations', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    // Scan the shadow root's <style> element text (styles.css injected by
    // bootstrap). We look for hex patterns in non-comment, non-token lines.
    //
    // `:host {}` block is excluded because it legitimately defines design
    // tokens with hex values (e.g. `--cx-ink: #111827`). Only CSS rule
    // declarations outside `:host {}` blocks are checked for hardcoded hex.
    //
    // This approach is falsifiable: injecting a <style> element with a hex
    // rule triggers a violation. The scanner caught a real violation during
    // development — `color: #fff` on `.cortex-label` was fixed to
    // `color: var(--cx-on-select)` before this spec landed.
    const violations = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) return [] as string[]

      const hexPattern = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/

      const found: string[] = []
      const styleEls = Array.from(root.querySelectorAll('style'))

      for (const styleEl of styleEls) {
        const text = styleEl.textContent ?? ''
        const lines = text.split('\n')
        let depth = 0
        let inHostBlock = false
        let inBlockComment = false

        for (const line of lines) {
          // Multi-line comment tracking — must run before any other checks.
          // A line can both open and close a comment (/* ... */ on one line).
          // ZF0-1473 PR #93 Copilot+CodeRabbit feedback: strip block comments
          // from the scanned line rather than skipping the entire line. A
          // declaration like `color: #fff; /* note */ background: red` would
          // be silently ignored under the prior "any /* on line → continue"
          // logic, hiding hex violations behind inline comments.
          let scanLine = line
          if (inBlockComment) {
            const closeIdx = scanLine.indexOf('*/')
            if (closeIdx === -1) continue  // entire line is inside a multi-line comment
            inBlockComment = false
            scanLine = scanLine.slice(closeIdx + 2)  // scan only content after */
          }
          let openIdx = scanLine.indexOf('/*')
          while (openIdx !== -1) {
            const closeIdx = scanLine.indexOf('*/', openIdx + 2)
            if (closeIdx === -1) {
              inBlockComment = true  // unterminated → block-comment mode for next line
              scanLine = scanLine.slice(0, openIdx)
              break
            }
            // Strip inline block comment, keep the prefix + suffix.
            scanLine = scanLine.slice(0, openIdx) + scanLine.slice(closeIdx + 2)
            openIdx = scanLine.indexOf('/*')
          }

          // Single-line comment.
          const trimmed = scanLine.trim()
          if (trimmed.startsWith('//')) continue

          // Track entry/exit of :host {} block (the token definition section).
          if (scanLine.includes(':host')) inHostBlock = true
          if (inHostBlock) {
            depth += (scanLine.match(/\{/g) ?? []).length
            depth -= (scanLine.match(/\}/g) ?? []).length
            if (depth <= 0) { inHostBlock = false; depth = 0 }
            // Inside :host block — skip. Token definitions legitimately use hex.
            continue
          }

          // Skip CSS custom property definitions (even outside :host in case
          // any token-only var appears in a media query block).
          if (trimmed.startsWith('--')) continue

          // Any remaining line containing a hex pattern is a violation.
          if (hexPattern.test(scanLine)) {
            found.push(trimmed.slice(0, 120))
          }
        }
      }

      return found
    })

    expect(violations).toEqual([])
  })

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
          const emojiPattern = /\p{Extended_Pictographic}/u
          const emojiChars = [...content].filter((ch) => emojiPattern.test(ch))
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

  test('Test 3 — no linear-gradient or glow box-shadow in cortex-* element styles', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    const { gradientViolations, glowViolations } = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) return { gradientViolations: [] as string[], glowViolations: [] as string[] }

      // "0px 0px Npx" glow: a box-shadow value where offset-x=0px, offset-y=0px,
      // and blur-radius=Npx. The browser normalizes `0 0 12px red` → `red 0px 0px 12px`,
      // so we match the normalized form. A legitimate drop shadow has non-zero offsets
      // (e.g. `0px 1px 4px rgba(...)`) and does NOT match this pattern.
      // Each comma-separated shadow value is checked independently.
      const glowPattern = /0px\s+0px\s+\d+/

      const gradViolations: string[] = []
      const glwViolations: string[] = []

      const allEls = root.querySelectorAll('*')
      for (const el of Array.from(allEls)) {
        const classNames = Array.from(el.classList)
        const hasCortexClass = classNames.some((c) => c.startsWith('cortex-'))
        if (!hasCortexClass) continue

        const cortexClasses = classNames.filter((c) => c.startsWith('cortex-')).join(' ')
        const cssText = (el as HTMLElement).style?.cssText ?? ''
        const boxShadow = (el as HTMLElement).style?.boxShadow ?? ''

        // Check for linear-gradient in cssText.
        if (cssText.includes('linear-gradient(')) {
          gradViolations.push(`${cortexClasses}: ${cssText}`)
        }

        // Check each comma-separated boxShadow value for the glow pattern.
        if (boxShadow) {
          const shadowParts = boxShadow.split(',')
          for (const part of shadowParts) {
            const trimmed = part.trim()
            if (glowPattern.test(trimmed)) {
              glwViolations.push(`${cortexClasses}: ${boxShadow}`)
              break // one report per element is enough
            }
          }
        }
      }

      return { gradientViolations: gradViolations, glowViolations: glwViolations }
    })

    expect(gradientViolations).toEqual([])
    expect(glowViolations).toEqual([])
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
