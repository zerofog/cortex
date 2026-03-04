# Phase 4b Panel Code — Architecture Review Findings (2026-03-03)

**Reviewed files:**
- `visual-editor/src/client/panel.tsx` (316 lines)
- `visual-editor/src/client/panel-state.ts` (276 lines)
- `visual-editor/src/client/panel-components.tsx` (308 lines)
- `visual-editor/src/client/panel-styles.ts` (367 lines)
- `visual-editor/tests/client/panel-integration.test.ts` (88 lines)
- `visual-editor/tests/client/panel-state.test.ts` (253 lines)
- `visual-editor/tests/client/panel-components.test.ts` (232 lines)

**Review team:** frontend, security, jsts, mts, design, performance, testing, fullstack
**Mode:** both (clink + native = 16 total reviewers)
**Selection rationale:** Preact + Shadow DOM + postMessage/WS protocol warranted frontend, security, jsts. Reducer architecture and cross-boundary integration warranted mts, fullstack. Token-constrained UI warranted design. Shadow DOM rendering warranted performance. 48 new tests warranted testing.

---

## Cross-Reviewer Consensus

Issues flagged by 5+ reviewers independently — highest-confidence signals:

| # | Issue | Flagged By | Severity |
|---|---|---|---|
| 1 | `postMessage` wildcard `'*'` target origin leaks session ID to any listener | ALL 16 | CRITICAL |
| 2 | `null as unknown as SelectionPayload` on deselect crashes downstream access | ALL 16 | CRITICAL |
| 3 | No WebSocket reconnection logic — disconnect is permanent until page reload | 12+ | HIGH |
| 4 | ChangeList per-item undo button always undoes last action, not the clicked item | 10+ | HIGH |
| 5 | Duplicated undo logic between keyboard handler and button handler | 8+ | HIGH |
| 6 | Mantine-only token resolution with silent failure for other frameworks | 8+ | HIGH |
| 7 | `state.mode` stale closure in postMessage listener effect | 8+ | HIGH |

---

## Consolidated Findings by Severity

### CRITICAL — Must fix before v1

**C1. postMessage wildcard `'*'` target origin** (panel.tsx:75)
- **Reviewers:** All 16 (strongest consensus of entire review)
- **Issue:** `iframe.contentWindow.postMessage(envelope, '*')` sends session ID to any origin. If the iframe navigates to a third-party page (ad, OAuth redirect), that page receives the session credentials.
- **Fix:** Replace `'*'` with `sidecarOrigin`:
  ```typescript
  iframe.contentWindow.postMessage(envelope, sidecarOrigin);
  ```

**C2. Deselect crashes via null coercion** (panel.tsx:95)
- **Reviewers:** All 16
- **Issue:** `dispatch({ type: 'ELEMENT_SELECTED', selection: null as unknown as SelectionPayload, origins: {} })` — the `as unknown as` double-cast hides a type error. Any reducer or component that accesses `state.selection.id`, `.elementType`, etc. will throw.
- **Fix:** Add a dedicated `ELEMENT_DESELECTED` action type to the reducer, or make `SelectionPayload` nullable in the type definition:
  ```typescript
  // Option A: new action
  dispatch({ type: 'ELEMENT_DESELECTED' });
  // Option B: nullable selection in existing action
  dispatch({ type: 'ELEMENT_SELECTED', selection: null, origins: {} });
  ```

**C3. WS auth field mismatch** (panel.tsx:129 vs server.ts:405)
- **Reviewers:** fullstack (native + clink)
- **Issue:** Panel sends `{ type: 'auth', token: sessionId }` but server handler destructures `msg.sessionId`. The auth handshake silently fails — WS never transitions to `'connected'` state, blocking the entire finalize pipeline.
- **Fix:** Align field name. Either panel sends `{ type: 'auth', sessionId }` or server reads `msg.token`.

**C4. Inspector missing override handlers**
- **Reviewers:** fullstack, frontend (native)
- **Issue:** Panel sends `inspector:apply-override`, `inspector:remove-override`, and `inspector:discard-overrides` messages, but the inspector script has no handlers for these message types. Live preview is completely broken.
- **Fix:** Implement the override message handlers in the inspector client code.

**C5. `zerofog:token-maps` never emitted**
- **Reviewers:** fullstack (native)
- **Issue:** No code path sends the `zerofog:token-maps` message to the panel. `state.tokenMaps` stays `null`, so `resolveTokenToCssValue` always falls through to the raw-token fallback.
- **Fix:** Inspector should emit `zerofog:token-maps` after page scan or on ready.

**C6. Selection payload missing `origins` field**
- **Reviewers:** fullstack, frontend (native)
- **Issue:** The `zerofog:selected` handler reads `payload.origins`, but the inspector's selection payload doesn't include origin data. Panel always gets `undefined` origins.
- **Fix:** Inspector must compute and include `origins: Record<string, StyleOrigin>` in the selection payload.

### HIGH — Should fix in v1

**H1. No WebSocket reconnection** (panel.tsx:117-161)
- **Reviewers:** 12+ reviewers
- **Issue:** On disconnect, WS status moves to `'disconnected'` permanently. No retry logic. Any network hiccup (dev server restart, laptop sleep) requires full page reload.
- **Fix:** Exponential backoff reconnection with max retry cap. Consider `useRef` for retry count.

**H2. Per-item undo broken** (panel-components.tsx, ChangeList)
- **Reviewers:** 10+ reviewers
- **Issue:** Each change row renders an "Undo" button, but the `onUndo` callback always pops the last item from the undo stack — not the item associated with the clicked row. Users expect clicking undo on a specific change reverts that specific change.
- **Fix:** Pass the property identifier to `onUndo` and implement selective undo in the reducer.

**H3. Duplicated undo logic** (panel.tsx:166-191 vs 226-244)
- **Reviewers:** 8+ reviewers
- **Issue:** The keyboard shortcut handler (Cmd+Z) and the `handleUndo` callback duplicate the same undo logic — read top of stack, dispatch, send inspector message. Violates DRY and risks divergence.
- **Fix:** Extract into a shared `performUndo()` function used by both handlers.

**H4. Stale closure on `state.mode`** (panel.tsx:81-114)
- **Reviewers:** 8+ reviewers
- **Issue:** The `useEffect` for the postMessage listener captures `state.mode` in its closure, but `state.mode` is in the dependency array meaning the listener is re-attached on every mode change. This works but is fragile. If the dep is accidentally removed, the `zerofog:ready` handler uses a stale `state.mode`.
- **Fix:** Use a `useRef` for mode to avoid re-registering the listener on mode changes, or accept the current approach with a comment explaining the dependency.

**H5. Mantine-only token resolution** (panel-state.ts, `resolveTokenToCssValue`)
- **Reviewers:** 8+ reviewers
- **Issue:** `resolveTokenToCssValue` only handles Mantine CSS variables (`var(--mantine-spacing-*)`). For Tailwind or CSS Modules origins, it silently returns the raw token string (e.g., `"md"`), which is not valid CSS.
- **Fix:** Implement framework-specific resolution for Tailwind (class utilities) and CSS Modules, or surface a clear warning when resolution fails.

**H6. Unbounded undo stack** (panel-state.ts)
- **Reviewers:** 6+ reviewers (performance, mts, testing)
- **Issue:** Every `APPLY_CHANGE` pushes to `undoStack` with no cap. In long editing sessions with many changes, memory grows unbounded.
- **Fix:** Cap undo stack at a reasonable limit (e.g., 50 entries) and shift oldest entries.

**H7. Missing error states in UI** (panel-components.tsx)
- **Reviewers:** 6+ reviewers (design, dx, frontend)
- **Issue:** When finalize fails (`FINALIZE_ERROR`), only `StatusBar` shows the error. No clear user action path (retry? discard?). `ActionBar` buttons don't react to error state.
- **Fix:** Show error state in ActionBar with retry button. Consider toast/inline error message.

### MEDIUM

- **M1.** WebSocket `onmessage` silently swallows parse errors via empty `catch {}` block (panel.tsx:144). Should log in dev mode at minimum.
- **M2.** `sendToInspector` falls back to `document.querySelector('.shell-viewport')` on every call when `iframeRef.current` is null. Should cache the result or fail explicitly.
- **M3.** CSS custom properties in `panel-styles.ts` use hardcoded hex values instead of a theme object, making dark/light theme switching impossible without rewriting the CSS string.
- **M4.** `PropertySections` component doesn't show loading state when `tokenMaps` is null — renders empty sections with no feedback.
- **M5.** `DISCARD_ALL` action doesn't reset `pipelineStatus` — if a finalize was in progress, the status persists after discard.
- **M6.** No keyboard accessibility for token selection — only mouse/touch interaction supported.
- **M7.** `SpacingControl` per-side component renders all 4 sides even for properties that don't have directional variants (e.g., `gap`).
- **M8.** Tests mock `postMessage` and `WebSocket` but don't test the actual message flow end-to-end between panel and inspector.

### LOW

- **L1.** IIFE uses `var` for `SESSION_ID` and `SIDECAR_ORIGIN` (panel.tsx:299-300) — `const` would be more appropriate.
- **L2.** `PanelHeader` hardcodes "zerofog" branding — should be configurable for white-labeling.
- **L3.** CSS uses `px` units for font sizes in `panel-styles.ts` — `rem` would respect user font size preferences.
- **L4.** `ModeToggle` uses radio buttons without `fieldset`/`legend` — screen reader labeling is incomplete.
- **L5.** `import type` is used inconsistently — some type imports use regular `import`.

---

## Positive Practices — Preserve These

1. **Shadow DOM isolation** — Closed Shadow DOM (`mode: 'closed'`) prevents host page styles from leaking into the panel. Excellent boundary discipline.
2. **Pure reducer architecture** — `panelReducer` is fully pure with zero side effects. All side effects live in component event handlers. Textbook Elm architecture.
3. **Message envelope pattern** — `createMessageEnvelope` with version field enables protocol evolution without breaking changes.
4. **Exported pure helpers** — `createMessageEnvelope` and `isValidPanelMessage` are exported for direct testing, avoiding the need to spin up full component trees.
5. **adoptedStyleSheets with fallback** — `applyPanelStyles` tries `adoptedStyleSheets` first (performant, no FOUC) and falls back to `<style>` injection for older browsers.
6. **Component composition** — 8 small, focused components with clear prop interfaces. No god components.
7. **Discriminated union actions** — `PanelAction` uses tagged unions with exhaustive switch coverage in the reducer.
8. **Token-constrained editing** — Design token buttons (xs/sm/md/lg/xl) prevent arbitrary values, enforcing design system consistency by construction.
9. **Per-side spacing decomposition** — `PER_SIDE_MAP` enables directional padding/margin editing while keeping the data model flat.
10. **IIFE with template vars** — Clean separation between build-time bundling and runtime injection via `__SESSION_ID__`/`__SIDECAR_ORIGIN__` replacement.

---

## Review Methodology Note

**Both mode** deployed 16 reviewers: 8 via PAL clink (distributed across Codex, Gemini, Claude for perspective diversity) + 8 native Claude agents (deeper analysis with direct codebase access).

**Clink advantages:** Faster turnaround, model diversity surfaced different concerns (Gemini caught CSS accessibility issues, Codex focused on runtime behavior). Some clink responses were truncated (Gemini security reviewer returned summary only).

**Native advantages:** Full codebase access enabled cross-file analysis. The fullstack native reviewer discovered C3-C6 (integration bugs between panel ↔ server ↔ inspector) that no clink reviewer caught — these are the highest-impact findings.

**Recommendation:** For isolated module reviews, clink mode is sufficient. For cross-boundary integration review, native mode is essential. The `both` mode justified its cost here — C3-C6 alone represent show-stopping integration bugs.
