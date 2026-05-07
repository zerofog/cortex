# Happy-DOM Theatre Audit

Date: 2026-05-06

## Scope

Scanned `cortex-editor/tests/browser/**/*.test.ts(x)` for:

- CSSOM/computed-style assertions that happy-dom cannot model faithfully.
- Real timers, Preact render/effect scheduling, MutationObserver, rAF, and polling patterns that can become coverage-instrumentation flakes.
- Channel mocks that assert outbound shapes without shared schema validation.

Primary scan commands:

- `rg -n "getComputedStyle|CSSOM|computed|MutationObserver|setTimeout\\(|useFakeTimers|useRealTimers|vi\\.advance|channel\\.send|sendAndAck|postMessage|__cortex_send__|sentMessages|mockChannel|mock-channel|\\.send\\(" cortex-editor/tests/browser --glob "*.ts" --glob "*.tsx"`
- `rg -n "^\s*(describe|it|test)\.skip\(" cortex-editor/tests/browser`

## CSSOM / Real Browser Candidates

| File:line | Signal | Classification | Decision |
| --- | --- | --- | --- |
| `tests/browser/state-detector.test.ts:90` | `@layer` recursion skipped | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1558. |
| `tests/browser/state-detector.test.ts:97` | cross-origin stylesheet `cssRules` access skipped | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1558. |
| `tests/browser/state-detector.test.ts:195` | CSS nesting `&:hover` skipped | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1558. |
| `tests/browser/state-detector.test.ts:230` | nested `&.modifier:hover` skipped | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1558. |
| `tests/browser/override.test.ts:1303` | color canonicalization skipped because happy-dom does not canonicalize like Chromium | Correct skip | Already covered by `tests/e2e/override-canonicalization.spec.ts`. |
| `tests/browser/bootstrap.test.ts:191` | background luminance fallback skipped because computed background colors are not meaningful | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1562. |
| `tests/browser/components/SectionGroup.test.tsx:104` | title typography token resolution skipped until real CSSOM | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1565. |
| `tests/browser/components/TokenPresetPopover.test.tsx:187` | floating-ui flip/shift skipped because layout is zeroed in happy-dom | Correct skip | Covered by `tests/e2e/numeric-input-token-popover.spec.ts` from ZF0-1527. |
| `tests/browser/hooks/useOutsideDismiss.test.tsx:194` | closed ShadowRoot `composedPath()` retargeting skipped | Happy-dom theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1560. |
| `tests/browser/selection-overlay.test.tsx:386` | rect-change/rAF position update skipped | Happy-dom/rAF theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1559. |
| `tests/browser/components/NoAnnotationsBanner.test.tsx:192` | MutationObserver self-heal skipped | Happy-dom timer/MO theatre if kept in Layer 2 | Move to e2e. Filed ZF0-1561. |

CSS parsing tests that feed explicit CSS strings into production parsers, such as `tests/browser/components/panel-style-snapshot.test.ts`, `tests/browser/sections/border-section.test.tsx`, `tests/browser/sections/effects-section.test.tsx`, and `tests/browser/sections/AppearanceSection.test.ts`, are not classified as theatre: they assert parser/fallback behavior over controlled CSSStyleDeclaration-like inputs, not browser cascade fidelity.

## Timer / Scheduler Fragility Candidates

| File:line | Signal | Classification | Decision |
| --- | --- | --- | --- |
| `tests/browser/cortex-app.test.tsx:1176` | Exact negative `getComputedStyle` call-count assertion after fixed 200ms wait failed once under coverage | Real Layer 2 fragility | Filed ZF0-1564 to replace the call-count assertion with a deterministic signal. |
| `tests/browser/components/NoAnnotationsBanner.test.tsx:151` | Happy-dom MutationObserver delivery needs timer wait | Fragile coverage around cleanup behavior | Move skipped self-heal path to e2e via ZF0-1561; suite-order failure also tracked in ZF0-1568. |
| `tests/browser/keyboard-shortcuts.test.tsx:116+` | Uses SETTLE timers around full CortexApp shortcut wiring | Watch item | Targeted touched-file run passed. Existing comments already use `act()` for the known install-race cases; no new ticket unless this flakes again. |
| `tests/browser/panel-t4-integration.test.tsx:115+` | Several fixed `setTimeout(10/20)` waits around Preact render and `sendAndAck` mocks | Watch item | Passed in isolation; suite-order failure tracked in ZF0-1568. |
| `tests/browser/components/TokenPresetPopover.test.tsx:63` | `flushEffects` uses `setTimeout(10)` | Acceptable because real layout path is e2e | Core positioning behavior is covered in ZF0-1527 e2e; Layer 2 tests are only mounting/dismiss plumbing. |

Full-suite order-dependence observed during verification:

- `CI=1 npm run test -- --no-file-parallelism` failed with three browser-only order-dependent failures:
  - `tests/browser/panel-t4-integration.test.tsx:167`
  - `tests/browser/components/NoAnnotationsBanner.test.tsx:26`
  - `tests/browser/hooks/use-canvas-zoom.test.tsx:478`
- Each file passed immediately afterward in isolation with `CI=1 npx vitest run --project browser <file> --no-file-parallelism --reporter=verbose`.
- Filed ZF0-1568 to stabilize the browser suite order-dependent flakes.

Coverage evidence:

- `npm run test:coverage` first failed in `tests/cli/demo.test.ts` with `ENOTEMPTY` during temp cleanup. Filed ZF0-1563.
- `npx vitest run --coverage --fileParallelism=false` then failed once in `tests/browser/cortex-app.test.tsx:1176`. Filed ZF0-1564.
- An earlier pre-cleanup `npx vitest run --coverage --coverage.reportOnFailure --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism` run passed and generated the low-coverage summary.
- The post-cleanup rerun of the same no-file-parallelism coverage command failed under instrumentation with:
  - `tests/cli/init.test.ts:120` timing out at 5000ms.
  - `tests/core/tool-applicator.test.ts:21` timing out at 5000ms.
  - `tests/adapters/source-transform.test.ts:548` failing the local performance budget under coverage, with a 214.5ms median against a 50ms budget.
  - Vitest reporting `[vitest-worker]: Timeout calling "onTaskUpdate"`.
- Filed ZF0-1566 for the broader full-coverage instrumentation stability issue.
- Filed ZF0-1568 for full non-coverage browser-suite order dependence observed separately from coverage instrumentation.

## Channel Shape Assertions

| Surface | Signal | Classification | Decision |
| --- | --- | --- | --- |
| `tests/browser/panel-t4-integration.test.tsx` | Asserts `sendAndAck` mock receives `staged-edits-ready` shape | Mostly covered | Layer 3 schema coverage exists in `tests/schemas/wire-format.test.ts` and e2e validation exists in `tests/e2e/panel-wire-format-validation.spec.ts`. No new ticket. Future tests should validate through shared schemas rather than hand-written shape shadows. |
| `tests/browser/hooks/use-edit-staging-buffer.test.tsx` | Uses mock channel send calls for sync emitter behavior | Acceptable Layer 2 unit scope | This tests hook behavior, not wire-format validity. Schema validity is covered elsewhere. |
| `tests/helpers/mock-channel.ts` | Push-only mock channel | Acceptable helper | Keep helper simple; do not expand it into a shadow schema validator. |

## Coverage Gap Review

Final coverage command: `npx vitest run --coverage --coverage.reportOnFailure --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism`

- Latest generated JSON summary after the post-cleanup failed coverage run reported total line coverage: 88.02%.
- Files below 70% line coverage: `src/index.ts` at 0%.
- Decision for `src/index.ts`: document as intentionally low. It is a package export barrel with no runtime business logic; exported modules are covered directly by their own tests. Adding a barrel smoke test would raise the number without improving behavioral confidence.
- Type-only files such as `src/adapters/types.ts` and `src/core/rewriter/types.ts` print as 0% in the text table but have zero executable lines in `coverage-summary.json`, so their line coverage is treated as 100% by the summary.

## Files Scanned Without Actionable Theatre Findings

The remaining browser test files were scanned and did not contain actionable happy-dom theatre requiring migration. Many use controlled DOM strings, direct component events, pure parser inputs, or mocks with separate schema coverage.

Examples: `activity-log.test.tsx`, `capability-banner.test.tsx`, `class-extractor.test.ts`, `classify-non-editable.test.ts`, `comment-input.test.tsx`, `comment-pin.test.tsx`, `comment-thread.test.tsx`, `components/icons.test.tsx`, `connection-status.test.tsx`, `controls/*`, `cortex-app-reducer.test.ts`, `edit-command.test.ts`, `edit-error-card.test.tsx`, `focus-utils.test.ts`, `hover-overlay.test.tsx`, `label.test.ts`, `layer-tree.test.tsx`, `panel-header.test.tsx`, `panel-section-order.test.ts`, `persistence.test.ts`, `popover-stack.test.ts`, `section-group.test.tsx`, `selection.test.ts`, `shared-class-detector.test.ts`, `token-detector.test.ts`, `toolbar.test.tsx`, and `transform-bus.test.ts`.
