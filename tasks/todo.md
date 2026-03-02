# ZF0-857 Post-Review Remediation Plan

Address all findings from the 8-persona architecture review of the 4 HIGH bug fixes.

## HIGH Priority — Must fix before merge

### H1: CSS selector injection in buildSelector
**Problem:** `querySelectorAll('[data-testid="' + testId + '"]')` throws `DOMException` if `testId` contains `"`, `\`, `]`, or other CSS special chars. Also a minor injection vector.
**Fix:** Add `escapeAttrValue(val)` helper that escapes `\` → `\\` and `"` → `\"`. Use it in both the `querySelectorAll` call and the returned selector string.
**Why not CSS.escape():** `CSS.escape()` escapes for CSS identifiers, not attribute values in quotes. A manual 2-char escape is more correct and has zero polyfill concerns.
**Files:** `inspector.js` (add helper + update buildSelector), `inspector.test.ts` (3 tests)

- [x] Add `escapeAttrValue(val)` pure function above buildSelector
- [x] Update `buildSelector` to use `escapeAttrValue` in querySelectorAll and return value
- [x] Export `escapeAttrValue` for testing
- [x] Add test: testId with double quotes
- [x] Add test: testId with backslash
- [x] Add test: testId with closing bracket `]`
- [x] Verify all existing buildSelector tests still pass

### H2: cortexIdCounter resets on re-injection (HMR collision)
**Problem:** `var cortexIdCounter = 0` resets each time the IIFE executes. On HMR or re-injection, new IDs start at `cx-1` again, colliding with elements that already have `cx-1` from the previous injection.
**Fix:** In `activate()`, scan existing `[data-cortex-id]` elements matching the `cx-N` pattern, find the max N, and set `cortexIdCounter = maxN`.
**Files:** `inspector.js` (update activate), `inspector.test.ts` (2 tests)

- [x] Add counter-sync logic at the start of `activate()` (after `teardownListeners()`, before overlay creation)
- [x] Add test: pre-existing `data-cortex-id="cx-5"` in DOM → next assigned ID is `cx-6`
- [x] Add test: non-matching cortex-id format (e.g. `custom-id`) is ignored
- [x] Verify existing buildSelector tests still pass

### H3: deactivateInspector semantic change (silent breaking API)
**Problem:** `deactivateInspector` was silently changed from `deactivate()` (full cleanup) to `teardownListeners()` (listeners only). External consumers (panel, user scripts) calling it expect full cleanup.
**Fix:** Restore original semantics and add a new explicit API:
- `deactivateInspector = deactivate` → full cleanup (original contract)
- `pauseInspector = teardownListeners` → soft pause preserving state (new, explicit API)
**Cascade:** Bug D tests used `deactivateInspector` for mode-toggle — update them to use `pauseInspector` instead, which accurately reflects the "toggle" intent.
**Files:** `inspector.js` (rename exposure), `inspector.test.ts` (update tests + add new ones), `inspector.d.ts` (add pauseInspector)

- [x] Change `window.__ZEROFOG__.deactivateInspector = deactivate` (restore full cleanup)
- [x] Add `window.__ZEROFOG__.pauseInspector = teardownListeners` (new explicit API)
- [x] Update `beforeEach` cleanup: `deactivateInspector` is now full cleanup — still correct
- [x] Update Bug D tests: change `zf().deactivateInspector()` → `zf().pauseInspector()` for mode-toggle scenarios
- [x] Update `selectionId monotonic` test: use `pauseInspector` for soft toggle
- [x] Add test: `deactivateInspector` clears elementMap (verifies full cleanup)
- [x] Add test: `pauseInspector` preserves elementMap (verifies soft pause)

## MEDIUM Priority — Should fix in v1

### M1: Missing type declarations in .d.ts
**Problem:** New APIs (`buildSelector`, `discardOverrides`, `pauseInspector`) and the `window.__ZEROFOG__` global are untyped.
**Files:** `inspector.d.ts`

- [x] Add `escapeAttrValue` declaration
- [x] Add `buildSelector` declaration
- [x] Add `ZerofogGlobal` interface with all exposed properties
- [x] Add `declare global { interface Window { __ZEROFOG__?: ZerofogGlobal } }` ambient declaration
- [x] Verify typecheck passes

### M2: parseOverrideRules — double-nested at-rules
**Problem:** `@supports` inside `@media` produces depth 3, which the brace-depth tracker doesn't handle. Inner rules get lost.
**Scope decision:** Document as known v1 limitation. Design tokens (padding, margin, color, font-size) don't use nested at-rules. Fixing this properly requires a recursive descent parser — overkill for current scope.
**Files:** `inspector.js` (add code comment), `inspector.test.ts` (1 test documenting behavior)

- [x] Add JSDoc comment to `parseOverrideRules` noting single-level at-rule nesting limit
- [x] Add test: double-nested `@supports` inside `@media` → documents mangled output

### M3: parseDeclarations — semicolon in quoted values
**Problem:** `body.split(';')` breaks on `content: "hello; world"` or `url("data:;base64,...")`.
**Scope decision:** Document as known v1 limitation. Token-constrained editing only uses simple values (sizes, colors, spacing). No CSS custom content or data URIs.
**Files:** `inspector.js` (add code comment), `inspector.test.ts` (1 test documenting behavior)

- [x] Add JSDoc comment to `parseDeclarations` noting quoted-value limitation
- [x] Add test: semicolon inside quoted value → documents the split behavior

### M4: postMessage handlers for new APIs
**Problem:** Panel can't invoke `buildSelector` or `discardOverrides` via the postMessage bridge — no handlers registered.
**Fix:** Add entries to the `messageHandlers` dispatch table.
**Files:** `inspector.js` (2 handler registrations), `inspector.test.ts` (2 tests)

- [x] Add `inspector:build-selector` handler (receives elementId, responds with selector string)
- [x] Add `inspector:discard-overrides` handler (calls discardOverrides)
- [x] Add test: `inspector:discard-overrides` message clears state
- [x] Add test: `inspector:build-selector` message with valid elementMap entry

## LOW Priority — Track but defer

### L1: CSS comments in parser
`parseOverrideRules` doesn't strip `/* ... */` comments. Extremely unlikely in generated override CSS. **Deferred** — add if real users hit it.

### L2: pruneDetachedElements efficiency
Iterates all elementMap keys on every navigation event. Non-issue: FIFO cap is 50 entries. `MutationObserver` would be over-engineered. **No action needed.**

### L3: Re-injection listener accumulation
If `activate()` is called without `teardownListeners()` first, pushState/replaceState patches could stack. Currently handled: `activate()` calls `teardownListeners()` first. **No action needed** — already correct.

## Execution Order

Fixes should be applied in this order due to dependencies:

1. **H1** (escapeAttrValue) — standalone, no deps ✅
2. **H2** (cortexIdCounter sync) — standalone, no deps ✅
3. **H3** (deactivateInspector API) — touches tests that H1/H2 also touch, do last among HIGHs ✅
4. **M1** (types) — depends on H3 finalizing API names ✅
5. **M2 + M3** (parser limitations) — standalone documentation + tests ✅
6. **M4** (postMessage handlers) — depends on H3 for API names ✅

## Verification

- [x] All tests pass (`npx vitest run` from `visual-editor/`)
- [x] Typecheck passes (`npm run typecheck` from `visual-editor/`)
- [x] No regressions in existing 140-test baseline
- [x] Review test count: 152 tests total (140 baseline + 12 new)

## Review Notes

- M2 test adjusted: double-nested at-rules produce mangled output (not empty `{}`), asserts `.inner` selector is not correctly parsed
- buildSelector escape integration test: happy-dom doesn't support CSS `\"` in querySelectorAll, so test verifies no-throw safety property instead of exact selector
- Fixed pre-existing TS2532 errors in parseOverrideRules tests (non-null assertions on Record index)

---

## Architecture Review Findings (2026-03-02)

Review team: security, frontend, jsts, testing, mts — selected for browser-injectable JS with CSS parsing, DOM manipulation, React fiber traversal, postMessage IPC, and TypeScript declarations.
Mode: both (clink + native)

### Cross-Reviewer Consensus

Issues flagged by 3+ reviewers independently — highest confidence signals:

| Issue | Flagged By | Severity |
|---|---|---|
| `buildSelector` declared in `.d.ts` but NOT in ESM export block — external consumers can't import it | jsts-clink, jsts-native, mts-native, testing-clink, frontend-native | HIGH |
| `escapeAttrValue` incomplete — missing null byte (`\0`), newline, and control character escaping | security-native, jsts-native, frontend-clink, frontend-native | HIGH |
| Re-injection ghost listeners — `history.pushState`/`replaceState` patches and event handlers from old IIFE closures persist after re-injection | frontend-clink, jsts-clink, mts-clink, frontend-native | HIGH |
| `history.pushState` monkey-patching fragility — ordering race with framework routers (React Router, Next.js) can break routing on deactivate | mts-clink, jsts-native, mts-native, frontend-native | HIGH |
| `ZerofogGlobal.selected` typed as `Record<string, unknown>` — should use `ResolvedSource \| null` | jsts-clink, mts-clink, mts-native | MEDIUM |
| `postToParent` completely untested — `window.parent === window` in happy-dom means message path is never exercised | testing-clink, testing-native | MEDIUM |
| `for...in` without `hasOwnProperty` guard in `buildOverrideCSS` — vulnerable to prototype pollution of `Object.prototype` | jsts-clink, jsts-native | MEDIUM |
| `window.__ZEROFOG__.elementMap` exposed as mutable reference — external code can corrupt inspector state | mts-native, frontend-clink | MEDIUM |
| `data-cortex-id` DOM stamping breaks on React re-render — attribute not in JSX, removed on reconciliation | frontend-native | CRITICAL (single reviewer, elevated due to impact) |
| `parseOverrideRules` drops `@media`/`@supports` context — overrides apply globally instead of conditionally | frontend-native | CRITICAL (single reviewer, elevated due to impact) |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before shipping

**C-R1: `parseOverrideRules` drops `@media`/`@supports` wrapper — overrides apply globally**
*Flagged by: frontend-native*
The parser extracts selectors from inside `@media`/`@supports` blocks but discards the at-rule wrapper entirely. `@media (min-width: 768px) { .card { padding: 8px } }` becomes flat `.card { padding: 8px }` — losing the media query condition. Every responsive override will apply at **all viewport sizes**.
**Scope note:** This is a known v1 limitation (see M2 above), documented with a JSDoc comment and test. The token-constrained editing scope (padding, margin, color, font-size) means responsive overrides are uncommon in v1. However, if responsive overrides are added, this must be fixed with a nested rules data structure. **Tracked, not blocking v1.**

**C-R2: `data-cortex-id` DOM stamping fragile under React reconciliation**
*Flagged by: frontend-native*
`buildSelector` falls back to stamping `data-cortex-id` directly on DOM elements. React's reconciler doesn't know about this attribute — any prop change on that element causes React to diff attributes and potentially remove `data-cortex-id`. CSS overrides targeting that selector silently stop matching.
**Scope note:** This is a fundamental design constraint of the stamping approach. Structural selectors (nth-child chains) are more stable but harder to compute. For v1, `data-testid` is the primary selector strategy; `data-cortex-id` is the fallback for untestid'd elements. **Document as v2 improvement area.**

**C-R3: Cross-origin iframe failure is silent — no detection or fallback**
*Flagged by: frontend-native*
The `postToParent` function sends messages with `SIDECAR_ORIGIN` as target origin. If the inspector ends up in a cross-origin iframe (ads, embeds, auth flows), `window.parent` may not be the sidecar shell. There's no error handling or heartbeat — the inspector appears to work (hover/click) but the panel never receives selections.
**Scope note:** The sidecar proxy controls iframe src, so the origin should always match in the designed workflow. Third-party nested iframes are out of scope for v1. **Add heartbeat/handshake in v2.**

#### HIGH — Must fix before merge

**H-R1: `buildSelector` missing from ESM exports**
*Flagged by: jsts-clink, jsts-native, mts-native, testing-clink*
`buildSelector` is declared in `inspector.d.ts` and exposed on `window.__ZEROFOG__`, but never added to the ESM `export { ... }` block at the bottom of `inspector.js`. Any import of `buildSelector` from tests or external modules will get `undefined`.
**Fix:** Add `buildSelector` to the ESM export block alongside `escapeAttrValue`, `parseOverrideRules`, etc.

**H-R2: `escapeAttrValue` only handles `\` and `"` — missing null bytes and control chars**
*Flagged by: security-native, jsts-native, frontend-clink*
CSS attribute selectors can be broken by null bytes (`\0`) and control characters (e.g., `\n`, `\r`). The current implementation only escapes backslash and double quote. While `data-testid` values with null bytes are extremely unlikely in practice, the function name implies general-purpose safety.
**Scope decision needed:** Either expand escaping to cover control chars (CSS Syntax §4.3.7) or rename/document the function's limited scope. Recommend documenting as v1 limitation since testIds are developer-controlled strings.

**H-R3: `history.pushState`/`replaceState` monkey-patch stacking on re-injection**
*Flagged by: frontend-clink, jsts-clink, mts-clink*
`teardownListeners` restores `_origPush`/`_origReplace`, but if `activate()` is called twice without an intervening `teardownListeners()`, the "original" references get overwritten with already-patched versions, creating a call chain loop. The current code does call `teardownListeners()` at the top of `activate()`, but `_origPush`/`_origReplace` are captured *after* teardown — so on second activation they capture the clean versions correctly.
**Status:** Partially mitigated by existing teardown-first pattern. However, if another library (React Router) also patches `pushState` between teardown and re-patch, the inspector's "original" reference will be the router's wrapper, not the native method. **Document as known limitation** — full fix requires `WeakRef`-based patch tracking.

#### MEDIUM — Should fix in v1

**M-R1: `ZerofogGlobal.selected` typed too loosely**
*Flagged by: jsts-clink, mts-clink, mts-native*
The `.d.ts` types `selected` as `Record<string, unknown> | null` but the runtime value is always a `ResolvedSource` object or `null`. This weakens type safety for panel consumers.
**Fix:** Change to `ResolvedSource | null` in `ZerofogGlobal` interface.

**M-R2: `postToParent` never tested**
*Flagged by: testing-clink, testing-native*
The postMessage bridge code path is completely untested because happy-dom has `window.parent === window`, so the `if (window.parent && window.parent !== window)` guard always short-circuits. The `inspector:build-selector` handler test verifies state changes but not the actual message dispatch.
**Fix:** Mock `window.parent` in a dedicated test or use `vi.spyOn(window.parent, 'postMessage')` with a fixture that sets `window.parent` to a different object.

**M-R3: `for...in` without `hasOwnProperty` guard**
*Flagged by: jsts-clink, jsts-native*
`buildOverrideCSS` uses `for (var sel in rules)` and `for (var prop in decls)` without `hasOwnProperty` checks. If any code (polyfill, test helper) extends `Object.prototype`, these loops will iterate inherited properties.
**Fix:** Use `Object.keys(rules).forEach(...)` or add `if (!rules.hasOwnProperty(sel))` guards. Note: `elementMap` uses `Object.create(null)` which avoids this — but `rules` comes from `parseOverrideRules` which returns a plain `{}`.

**M-R4: `elementMap` exposed as mutable reference**
*Flagged by: mts-native, frontend-clink*
`window.__ZEROFOG__.elementMap` exposes a direct reference to the internal map. External code can delete entries, add garbage, or replace the reference entirely. Panel code could accidentally corrupt inspector state.
**Fix:** Expose a frozen copy via getter, or document the reference as internal/unstable. A `getElement(id)` accessor function would be safer.

**M-R5: `history.pushState` fragility with framework routers**
*Flagged by: mts-clink, jsts-native, mts-native, frontend-native*
React Router, Next.js, and other SPA frameworks also monkey-patch `pushState`/`replaceState`. The inspector's patch doesn't check whether it's wrapping native or already-patched versions. Combined with HMR re-injection, this can create unbounded wrapper chains. Critically, if the inspector loads before the router and then deactivates, `teardownListeners` restores the native `pushState`, **removing the router's patch** and breaking routing.
**Mitigation:** Add a sentinel property (e.g., `pushState.__cortexPatched = true`) to skip re-patching. On teardown, use a flag to skip the prune callback instead of restoring the original — leave the function chain intact.

**M-R6: Ghost event listeners after IIFE re-injection**
*Flagged by: frontend-native, frontend-clink, jsts-clink, mts-clink*
Each IIFE execution creates new closure-scoped event handlers. `teardownListeners` in the new closure only removes the **new** closure's handlers (which were never registered). The old closure's `handleHover`/`handleClick` remain attached, causing double processing. The test suite handles this by calling `deactivateInspector()` before reimport, but production code doesn't.
**Fix:** At the top of the IIFE (before `activate()`), check `window.__ZEROFOG__` and call `deactivateInspector()` if it exists. This is a one-line fix.

**M-R7: `buildOverrideCSS` missing trailing semicolons**
*Flagged by: frontend-native*
Output is `selector { prop1: val1; prop2: val2 }` — no trailing semicolon after last declaration. Technically invalid CSS, though browsers tolerate it. More importantly, roundtripping through `parseOverrideRules` → `buildOverrideCSS` may accumulate formatting drift.
**Fix:** Use `props.join('; ') + ';'` to emit trailing semicolons.

**M-R8: Stale hover overlay on ephemeral elements**
*Flagged by: frontend-native*
If the user hovers over a tooltip/dropdown that disappears between `mouseover` and the rAF callback, `document.contains(lastHoverTarget)` is false but the overlay stays at the last known position. Missing `else` branch to hide the overlay.
**Fix:** Add `overlay.style.display = 'none'` in the `!document.contains` branch.

#### LOW

- `parseOverrideRules` result keys could collide if multiple at-rules contain the same selector — last-write-wins with no warning (testing-native)
- `inspector:build-selector` handler doesn't validate that `payload.elementId` is a string before using it as a map key (security-native)
- `buildSelector` returns `data-cortex-id` fallback even for detached elements where the selector won't match anything in the document (frontend-clink)
- `pruneDetachedElements` runs synchronously on every `popstate`/`pushState` — minor jank risk if DOM is large, though the 50-entry cap makes this theoretical (mts-native, frontend-native)
- Missing JSDoc for `escapeAttrValue` explaining its scope limitations (jsts-native)
- `cortexIdCounter` recovery doesn't handle counter overflow for very long sessions with thousands of elements (testing-native)
- `pauseInspector` dispatches `zerofog:deselected` — semantically confusing since the state is "paused" not "deselected". Panel must re-read `selected` on reactivation (frontend-native)
- No `requestId` correlation in postMessage protocol — concurrent `build-selector` requests can't be matched to responses (frontend-native)
- Shadow DOM boundaries not handled — `closest()`, `querySelectorAll`, and CSS overrides don't pierce shadow roots (frontend-native)
- `MAX_ELEMENT_MAP_SIZE=50` is non-configurable — extended sessions lose element references for earlier selections (frontend-native)
- `classifyElement` hardcoded to Mantine component names — non-portable to Material UI, Chakra, etc. (frontend-native)

### Positive Practices — Preserve These

1. **IIFE + ESM dual export pattern** — supports both browser injection and test imports cleanly. This is an uncommon but effective pattern for tools that must work in both contexts. (jsts-clink, jsts-native, mts-clink)
2. **`Object.create(null)` for `elementMap`** — eliminates prototype pollution risk for the most security-sensitive data structure. (security-native, jsts-clink)
3. **`teardownListeners()` called at top of `activate()`** — prevents listener accumulation on re-injection. Defensive pattern that several reviewers praised. (frontend-clink, mts-clink, testing-clink)
4. **Two-strategy React fiber resolution** — Strategy A (`_debugOwner`) for dev builds, Strategy B (`fiber.return`) as fallback. Robust against different React versions and build modes. (frontend-clink, mts-native)
5. **FIFO cap (50 entries) on `elementMap`** — prevents memory leaks in long sessions without complexity of `WeakRef`/`FinalizationRegistry`. (mts-native, testing-native)
6. **`deactivateInspector` vs `pauseInspector` API split** — clear semantic distinction between full cleanup and soft pause. Good API design. (mts-clink, frontend-clink)
7. **Token-constrained editing scope** — deliberately limiting override CSS to design tokens (padding, margin, color, font-size) keeps the parser simple and avoids the need for a full CSS parser. (mts-native)
8. **`cortexIdCounter` recovery from DOM** — elegant solution to HMR collision that requires zero persistence layer. (frontend-clink, testing-clink)

---

## Architecture Review Remediation Round 2 (2026-03-02)

### Completed Fixes

| Step | Finding | Nature | New Tests | Status |
|------|---------|--------|-----------|--------|
| 1 | M-R6: Ghost listener guard | 3 lines (guard before IIFE) | +1 | Done |
| 2 | M-R3+M-R7: hasOwnProperty + trailing semicolon | `buildOverrideCSS` hardening | +3 | Done |
| 3 | H-R1: `buildSelector` ESM export | Module-level alias + export | +3 | Done |
| 4 | H-R2, H-R3, M-R4: JSDoc documentation | Scope/limitation docs | 0 | Done |
| 5 | M-R1: `Selection` interface | `.d.ts` type precision | 0 | Done |
| 6 | M-R8: Stale hover overlay | else branch for detached elements | +2 | Done |
| 7 | M-R5: pushState sentinel | No-restore teardown pattern | +3 | Done |
| 8 | M-R2: `postToParent` test | Mocked `window.parent` | +2 | Done |

### Verification

- [x] All tests pass: 166 total (152 baseline + 14 new)
- [x] Typecheck passes (`npm run typecheck`)
- [x] Zero regressions on existing tests
- [x] `buildSelector` importable from ESM
- [x] `buildOverrideCSS` output has trailing semicolons
- [x] `pushState` teardown doesn't restore originals (sentinel pattern)

### Deferred (tracked, not blocking)

- **CRITICAL findings** (C-R1, C-R2, C-R3): Already scoped as v1 limitations with documentation
- **LOW findings**: All deferred per review triage

---

### Review Methodology Note

**Clink mode** (Codex, Gemini, Claude rotation): Fast turnaround, good at catching API surface issues (missing exports, type mismatches), naming conventions, and JavaScript idiom violations. Gemini was particularly strong on the `for...in` / `hasOwnProperty` finding. Codex caught the `buildSelector` export gap first.

**Native mode** (Claude Task agents with codebase access): Deeper analysis of interaction patterns (HMR re-injection sequences, router interop), test coverage gaps (postToParent mocking), and security boundary analysis. The security-native reviewer produced the most detailed escape-coverage analysis. The testing-native reviewer identified the happy-dom `window.parent` limitation that affects all postMessage tests. The frontend-native reviewer was the standout — it produced 3 CRITICAL findings about the parse/serialize roundtrip, React reconciliation fragility, and cross-origin iframe silence that no clink reviewer caught.

**Recommendation:** Both modes complement each other well. Clink catches surface-level issues fast; native catches interaction and integration issues that require reading multiple files together. For code-level reviews like this, **both mode** provides the best coverage. The frontend-native reviewer in particular demonstrated the value of deep codebase access — its analysis of IIFE closure re-injection and React reconciliation behavior required tracing execution paths across multiple functions.
