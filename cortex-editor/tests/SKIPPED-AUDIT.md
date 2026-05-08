# Skipped Test Audit

Date: 2026-05-06

## Commands

- Pre-cleanup inventory: ran `rg -n "^\s*(describe|it|test)\.skip\(" cortex-editor/tests` before deleting stale skips.
- Final executable skip inventory: ran the same anchored `rg` command after cleanup.
- Note: the ticket's `grep -rn "\\.skip\\(" cortex-editor/tests/` form is not portable on this macOS/BSD grep because `\(` is parsed as an unmatched grouping operator. The anchored `rg` scan above is the executable-test equivalent.

## Counts

- Pre-cleanup executable skips found: 34
- Ticket expected skipped tests: 33; current branch contained 34 before cleanup.
- Deleted stale skips during this audit: 7
- Final executable skips after original audit: 27
- Current executable skips after ZF0-1558 cleanup: 25
- "Actually fix" skips found: 0, so the 5x coverage-instrumentation loop is not required.

## Active Skips

| File:line | Test | Classification | Decision |
| --- | --- | --- | --- |
| `tests/core/edit-pipeline.sanitize.test.ts:228` | unquoted path with spaces followed by prose | Correct skip - permanent limitation | This documents an intentionally accepted ambiguity. Node fs errors quote paths, and unquoted paths with spaces plus prose cannot be safely separated by the current sanitizer regex. Leave skipped with the limitation comment. |
| `tests/browser/sections/typography-section.test.tsx:500` | font-size scrub fires onScrub during drag and onScrubEnd on release | Correct skip - Layer 2 would be theatre | Section-level drag is not reliable in happy-dom. The reusable `NumericInput` scrub behavior has direct Layer 2 coverage in `tests/browser/controls/numeric-input.test.tsx`; no separate section-level e2e is required unless full-panel drag becomes load-bearing. |
| `tests/browser/sections/FlexControls.test.tsx:208` | AlignmentGrid top-center click emits row flex properties | Correct skip - blocked by hidden UI | AlignmentGrid is intentionally hidden in FlexControls until ZF0-1211. Leave skipped and tied to that ticket. |
| `tests/browser/sections/FlexControls.test.tsx:225` | AlignmentGrid top-center click emits swapped column properties | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:243` | row distribute main-axis emits justify-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:272` | row distribute cross-axis emits align-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:293` | column distribute main-axis emits justify-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:320` | column distribute cross-axis emits align-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:545` | column mode reverse-mapped active cell | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/FlexControls.test.tsx:577` | row mode direct active cell | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/GridControls.test.tsx:284` | AlignmentGrid top-center emits grid values | Correct skip - blocked by hidden UI | AlignmentGrid is intentionally hidden in GridControls until ZF0-1211. Leave skipped and tied to that ticket. |
| `tests/browser/sections/GridControls.test.tsx:306` | AlignmentGrid bottom-right canonicalizes flex-end to end | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/GridControls.test.tsx:325` | AlignmentGrid active cell highlights grid canonical values | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/GridControls.test.tsx:340` | AlignmentGrid distribute main-axis emits justify-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/sections/GridControls.test.tsx:369` | AlignmentGrid distribute cross-axis emits align-content | Correct skip - blocked by hidden UI | Same ZF0-1211 dependency. |
| `tests/browser/override.test.ts:1303` | canonicalizes CSS values before declaring divergence | Correct skip - covered by e2e | Happy-dom cannot canonicalize color formats meaningfully. Covered by `tests/e2e/override-canonicalization.spec.ts`. |
| `tests/browser/channel.test.ts:875` | sendAndAck rejects on disconnect during wait | Correct skip - N/A branch | Vite channel has no disconnect lifecycle; timeout rejection is the reachable rejection path and is covered. |
| `tests/browser/selection-overlay.test.tsx:386` | updates lens position when element rect changes | Move to e2e | Happy-dom rAF/rect-change pumping is unreliable. Follow-up: ZF0-1559. |
| `tests/browser/components/SectionGroup.test.tsx:104` | lock title typography invariants once real CSSOM is available | Move to e2e | Computed typography token resolution belongs in Chromium. Follow-up: ZF0-1565. |
| `tests/browser/components/NoAnnotationsBanner.test.tsx:192` | self-heals when annotated element is added after mount | Move to e2e | Needs real MutationObserver delivery and Preact effect timing. Follow-up: ZF0-1561. |
| `tests/browser/components/TokenPresetPopover.test.tsx:187` | floating-ui flip/shift positioning | Correct skip - covered by e2e | Covered by `tests/e2e/numeric-input-token-popover.spec.ts` from ZF0-1527. |
| `tests/browser/hooks/useOutsideDismiss.test.tsx:194` | closed ShadowRoot outside dismiss | Move to e2e | Closed-shadow retargeting needs real Chromium. Follow-up: ZF0-1560. |
| `tests/browser/bootstrap.test.ts:191` | background luminance theme fallback | Move to e2e | Happy-dom computed background colors are not meaningful. Follow-up: ZF0-1562. |
| `tests/browser/shared-source-detector.test.ts:60` | shadow-hosted siblings | Move to e2e | Happy-dom does not model shadow-root query coverage like Chromium. Outside ZF0-1558. |
| `tests/browser/selection-source-expand.test.ts:56` | sources with quote characters via CSS.escape | Correct skip - browser API gap | Documents a defensive fallback for uncommon source strings; outside ZF0-1558. |

## Covered After Audit

| Original file:line | Test | Coverage | Action |
| --- | --- | --- | --- |
| `tests/browser/state-detector.test.ts:90` | recurses into `@layer` rules | `tests/e2e/state-detector-cssom.spec.ts` | Removed Layer 2 skip; covered by ZF0-1558 real Chromium CSSOM test. |
| `tests/browser/state-detector.test.ts:97` | handles cross-origin stylesheets gracefully | `tests/e2e/state-detector-cssom.spec.ts` | Removed Layer 2 skip; cross-origin stylesheet is route-fulfilled by Playwright. |
| `tests/browser/state-detector.test.ts:195` | handles CSS nesting `&:hover` | `tests/e2e/state-detector-cssom.spec.ts` | Removed Layer 2 skip; covered by native CSS nesting in Chromium. |
| `tests/browser/state-detector.test.ts:230` | handles `&.modifier:hover` nested CSS | `tests/e2e/state-detector-cssom.spec.ts` | Removed Layer 2 skip; covered by native CSS nesting in Chromium. |

## Deleted During Audit

| Original file:line | Test | Classification | Action |
| --- | --- | --- | --- |
| `tests/browser/keyboard-shortcuts.test.tsx:96` | selection.ts does NOT handle Escape | Delete | Empty skipped test in a file that mocks `selection.ts`; it could only test the mock. Existing Escape behavior lives in CortexApp shortcut tests and selection click behavior lives in `selection.test.ts`. |
| `tests/browser/panel.test.tsx:499` | computes dimmedProperties when activeState is not default | Delete | Empty stale placeholder. `computePanelStyleSnapshot` now has direct dimming tests in `tests/browser/components/panel-style-snapshot.test.ts`, and section components assert `cortex-control--dimmed` where they consume the prop. |
| `tests/browser/panel.test.tsx:500` | does not compute dimmedProperties when activeState is default | Delete | Same stale placeholder as above. |
| `tests/browser/sections/GridControls.test.tsx:454` | responsive tier: Cols hidden, MinWidth input shown | Delete | Responsive/complex template tier UI was removed; current GridControls is simple-tier only. |
| `tests/browser/sections/GridControls.test.tsx:471` | complex tier: raw CSS shown | Delete | Removed UI surface. |
| `tests/browser/sections/GridControls.test.tsx:526` | responsive tier min-width edit emits auto-fit template | Delete | Removed UI surface. |
| `tests/browser/sections/GridControls.test.tsx:549` | responsive auto-fill preserves autoMode | Delete | Removed UI surface. |

## Follow-Up Tickets Filed

- ZF0-1558 - Layer 4 state-detector CSSOM coverage. Covered by `tests/e2e/state-detector-cssom.spec.ts`; corresponding Layer 2 skips removed.
- ZF0-1559 - SelectionOverlay live-rect tracking in real browser.
- ZF0-1560 - Closed ShadowRoot outside-dismiss coverage.
- ZF0-1561 - NoAnnotationsBanner MutationObserver self-heal coverage.
- ZF0-1562 - Background-luminance theme fallback in real browser.
- ZF0-1565 - SectionGroup computed typography token coverage.
