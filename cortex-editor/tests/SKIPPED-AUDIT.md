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
- Final executable skips: 16 after ZF0-1211 re-enabled 13 AlignmentGrid visibility tests.
- "Actually fix" skips found: 0, so the 5x coverage-instrumentation loop is not required.

## Active Skips

| File:line | Test | Classification | Decision |
| --- | --- | --- | --- |
| `tests/core/edit-pipeline.sanitize.test.ts:228` | unquoted path with spaces followed by prose | Correct skip - permanent limitation | This documents an intentionally accepted ambiguity. Node fs errors quote paths, and unquoted paths with spaces plus prose cannot be safely separated by the current sanitizer regex. Leave skipped with the limitation comment. |
| `tests/browser/sections/typography-section.test.tsx:520` | font-size scrub fires onScrub during drag and onScrubEnd on release | Correct skip - Layer 2 would be theatre | Section-level drag is not reliable in happy-dom. The reusable `NumericInput` scrub behavior has direct Layer 2 coverage in `tests/browser/controls/numeric-input.test.tsx`; no separate section-level e2e is required unless full-panel drag becomes load-bearing. |
| `tests/browser/shared-source-detector.test.ts:60` | handles shadow-hosted siblings | Move to e2e | Real shadow-root query behavior is not faithfully represented by happy-dom. Leave skipped until browser coverage exists. |
| `tests/browser/selection-source-expand.test.ts:56` | handles sources with quote characters via CSS.escape | Correct skip - happy-dom limitation | Real sources are file paths without quotes; implementation has the fallback, but happy-dom cannot prove the selector behavior. |
| `tests/browser/override.test.ts:1303` | canonicalizes CSS values before declaring divergence | Correct skip - covered by e2e | Happy-dom cannot canonicalize color formats meaningfully. Covered by `tests/e2e/override-canonicalization.spec.ts`. |
| `tests/browser/channel.test.ts:875` | sendAndAck rejects on disconnect during wait | Correct skip - N/A branch | Vite channel has no disconnect lifecycle; timeout rejection is the reachable rejection path and is covered. |
| `tests/browser/state-detector.test.ts:90` | recurses into `@layer` rules | Move to e2e | Real CSSOM behavior. Follow-up: ZF0-1558. |
| `tests/browser/state-detector.test.ts:97` | handles cross-origin stylesheets gracefully | Move to e2e | Needs real `cssRules` SecurityError behavior. Follow-up: ZF0-1558. |
| `tests/browser/state-detector.test.ts:195` | handles CSS nesting `&:hover` | Move to e2e | Real CSSOM/nesting behavior. Follow-up: ZF0-1558. |
| `tests/browser/state-detector.test.ts:230` | handles `&.modifier:hover` nested CSS | Move to e2e | Real CSSOM/nesting behavior. Follow-up: ZF0-1558. |
| `tests/browser/selection-overlay.test.tsx:386` | updates lens position when element rect changes | Move to e2e | Happy-dom rAF/rect-change pumping is unreliable. Follow-up: ZF0-1559. |
| `tests/browser/components/SectionGroup.test.tsx:104` | lock title typography invariants once real CSSOM is available | Move to e2e | Computed typography token resolution belongs in Chromium. Follow-up: ZF0-1565. |
| `tests/browser/components/NoAnnotationsBanner.test.tsx:204` | self-heals when annotated element is added after mount | Move to e2e | Needs real MutationObserver delivery and Preact effect timing. Follow-up: ZF0-1561. |
| `tests/browser/components/TokenPresetPopover.test.tsx:187` | floating-ui flip/shift positioning | Correct skip - covered by e2e | Covered by `tests/e2e/numeric-input-token-popover.spec.ts` from ZF0-1527. |
| `tests/browser/hooks/useOutsideDismiss.test.tsx:209` | closed ShadowRoot outside dismiss | Move to e2e | Closed-shadow retargeting needs real Chromium. Follow-up: ZF0-1560. |
| `tests/browser/bootstrap.test.ts:191` | background luminance theme fallback | Move to e2e | Happy-dom computed background colors are not meaningful. Follow-up: ZF0-1562. |

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

- ZF0-1558 - Layer 4 state-detector CSSOM coverage.
- ZF0-1559 - SelectionOverlay live-rect tracking in real browser.
- ZF0-1560 - Closed ShadowRoot outside-dismiss coverage.
- ZF0-1561 - NoAnnotationsBanner MutationObserver self-heal coverage.
- ZF0-1562 - Background-luminance theme fallback in real browser.
- ZF0-1565 - SectionGroup computed typography token coverage.
