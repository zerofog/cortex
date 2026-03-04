# Phase 4b Panel Architecture Review Findings (2026-03-03)

**Review team:** frontend (Frontend Platform Engineer), security (Security Engineer), jsts (JS/TS Runtime Expert), testing (Senior QA/Test Engineer), mts (Master Technical Strategist)
**Mode:** native (5 Claude Task agents with direct codebase access)
**Perspective:** Senior staff engineer — code quality, security, test coverage, architecture

**Files reviewed:**
- `visual-editor/src/client/panel.tsx` — Entry point, PanelRoot component, Shadow DOM mount, WS/postMessage bridge (~250 lines)
- `visual-editor/src/client/panel-state.ts` — Pure reducer, types, constants (~200 lines)
- `visual-editor/src/client/panel-styles.ts` — CSS string constant, adoptedStyleSheets helper (~165 lines)
- `visual-editor/src/client/panel-components.tsx` — 10 Preact FunctionComponents (~280 lines)
- `visual-editor/src/client/inspector.js` — Extended with per-side styles, origins, detectStyleOrigin/buildTokenMaps (modified, +120 lines)
- `visual-editor/src/client/inspector.d.ts` — Extended Selection type
- `visual-editor/src/client/toolbar.d.ts` — Added ChangeEntry, updated DiffResult
- `visual-editor/tests/client/panel-state.test.ts` — 19 tests
- `visual-editor/tests/client/panel-components.test.ts` — 21 tests
- `visual-editor/tests/client/panel-integration.test.ts` — 8 tests

**Cross-referenced:**
- `visual-editor/src/server.ts` — WS auth handshake, message validation
- `visual-editor/src/client/shell.html` — Iframe sandbox attributes
- `visual-editor/src/client/toolbar.js` — Duplicated functions (detectStyleOrigin, buildTokenMaps)
- `visual-editor/tsup.config.ts` — Build configuration

---

## Cross-Reviewer Consensus

Issues flagged independently by 3+ reviewers — highest-confidence signals:

| Issue | Flagged By | Severity |
|---|---|---|
| `postMessage` uses `'*'` targetOrigin — leaks sessionId to any origin in iframe | frontend, security, jsts, mts | **CRITICAL** |
| `zerofog:deselected` dispatches `null as unknown as SelectionPayload` — crashes `deriveActiveTokens` | frontend, jsts, mts, testing | **CRITICAL** |
| WS auth field name mismatch: panel sends `token`, server expects `sessionId` — auth always fails | frontend, security, mts | **CRITICAL** |
| WS finalize message missing `id` field — server rejects with "missing message id" | frontend, mts | **CRITICAL** |
| Stale closure: `state.mode` in postMessage useEffect deps causes listener churn and dropped messages | frontend, jsts, mts | **HIGH** |
| No WebSocket reconnection logic — server restart permanently disables panel | frontend, jsts, mts | **HIGH** |
| Duplicated undo logic between keyboard handler and handleUndo callback | jsts, mts | **HIGH** |
| `FINALIZE_SUCCESS` doesn't clear `pendingChanges` — allows double-apply | frontend, jsts, mts | **MEDIUM** |
| Per-item undo buttons all trigger stack-based undo (misleading UX) | jsts, mts, testing | **MEDIUM** |
| `detectStyleOrigin`/`buildTokenMaps` duplicated between toolbar.js and inspector.js IIFE | frontend, jsts, mts, testing | **MEDIUM** |
| `inspector:set-edit-mode` message has no handler in inspector.js — dead code | mts, testing | **MEDIUM** |
| Per-side property origin lookup misses (keyed by category, not property name) | jsts, mts | **MEDIUM** |
| PanelRoot orchestration layer is completely untested | mts, testing | **CRITICAL** (test gap) |

---

## Consolidated Findings by Severity

### CRITICAL — Must fix before shipping

**C1. `postMessage` uses `'*'` targetOrigin (4 reviewers: frontend, security, jsts, mts)**

**File:** `panel.tsx:73-76`

```typescript
iframe.contentWindow.postMessage(
  createMessageEnvelope(type, payload, sessionId),
  '*',   // <-- any origin can receive
);
```

The panel sends messages containing the session ID (a `randomUUID()` that authenticates the WebSocket connection) to the iframe using target origin `'*'`. If the iframe navigates to a different origin (via open redirect in the proxied app, or user clicking an external link), the message — including the session ID — is delivered to whatever origin is loaded. An attacker with the session ID can authenticate to the WS endpoint and issue finalize commands that modify source code.

The inspector's inbound validation (`isValidPanelMessage`) correctly checks origin. The outbound side should reciprocate.

*Impact:* Session credential leakage enables arbitrary source code modification.

*Fix:* Replace `'*'` with `sidecarOrigin` (already available in the closure):
```typescript
iframe.contentWindow.postMessage(
  createMessageEnvelope(type, payload, sessionId),
  sidecarOrigin,
);
```

---

**C2. `zerofog:deselected` dispatches null as SelectionPayload — runtime crash (4 reviewers: frontend, jsts, mts, testing)**

**File:** `panel.tsx:94-96`

```typescript
'zerofog:deselected': () => {
  dispatch({ type: 'ELEMENT_SELECTED', selection: null as unknown as SelectionPayload, origins: {} });
},
```

The `as unknown as` double-cast hides a null-pointer crash. The reducer's `ELEMENT_SELECTED` handler calls `deriveActiveTokens(action.selection.styles, ...)` — when selection is null, this throws `TypeError: Cannot read properties of null (reading 'styles')`. Since there is no error boundary, the entire panel unmounts.

*Impact:* Runtime crash on every deselection event (pressing Escape in inspector).

*Fix:* Add a `ELEMENT_DESELECTED` action to the union:
```typescript
// panel-state.ts
| { type: 'ELEMENT_DESELECTED' }

case 'ELEMENT_DESELECTED':
  return { ...state, selection: null, origins: null, activeTokens: {}, pendingChanges: [], undoStack: [] };
```

---

**C3. WS auth field name mismatch — authentication always fails (3 reviewers: frontend, security, mts)**

**Files:** `panel.tsx:126-130`, `server.ts:382-413`

Panel sends: `{ type: 'auth', token: sessionId }`
Server checks: `parsed.type === 'auth' && parsed.sessionId === sessionId`

The client uses `token` but the server checks `sessionId`. Authentication always fails because `parsed.sessionId` is `undefined`. The panel will never reach `connected` state. The "Apply to Code" button is permanently disabled.

*Impact:* WebSocket authentication is broken. The entire finalize pipeline is dead.

*Fix:* Align field names in panel.tsx:
```typescript
ws.send(JSON.stringify({ type: 'auth', sessionId }));
```

Additionally, the comment says "wait for hello" but the code sends auth immediately on open. Ideally wait for the server's hello message before sending auth.

---

**C4. WS finalize message missing `id` field — server rejects (2 reviewers: frontend, mts)**

**Files:** `panel.tsx:256-265`, `server.ts:415-419`

The server enforces `if (!parsed.id)` after authentication, returning `{ type: 'error', message: 'missing message id' }` for any message without an `id` field. The panel's finalize message sends `{ type: 'finalize', payload: {...} }` with no `id` field.

The server error response has type `'error'`, not `'finalize-result'`, so neither `FINALIZE_SUCCESS` nor `FINALIZE_ERROR` fires — the panel stays stuck on "sending" forever.

*Impact:* The entire finalize pipeline is dead even if auth is fixed.

*Fix:* Add a message ID:
```typescript
wsRef.current.send(JSON.stringify({
  type: 'finalize',
  id: crypto.randomUUID(),
  payload: { ... },
}));
```

And add handling for server `'error'` type responses in `ws.onmessage`.

---

**C5. PanelRoot is completely untested (2 reviewers: mts, testing)**

The `PanelRoot` component is the orchestrator that wires state to side effects — it dispatches postMessages, manages WebSocket lifecycle, binds keyboard shortcuts, and calls `sendToInspector`. None of this is tested. The integration test file only tests two exported helper functions (`createMessageEnvelope`, `isValidPanelMessage`).

Untested paths include: Cmd+Z handler, `handleTokenSelect` flow, `handleDiscard` flow, `handleUndo` dual-path, `handleApply` finalize flow, `zerofog:ready` handler, `zerofog:deselected` handler, and WS lifecycle.

*Impact:* The critical runtime bugs (C2, C3, C4) are undetectable by the current test suite.

*Fix:* Add `panel-root.test.tsx` with mocked `window.postMessage`, mocked `WebSocket`, and simulated inspector messages.

---

### HIGH — Will cause bugs under specific but common conditions

**H1. Stale closure in postMessage listener captures `state.mode` (3 reviewers: frontend, jsts, mts)**

**File:** `panel.tsx:81-114`

The `useEffect` has `state.mode` in its dependency array, so the entire message listener tears down and re-registers on every mode change. During the teardown/re-registration window, messages from the inspector can be dropped. As more state is referenced inside handlers, this pattern forces either adding more deps (more listener churn) or forgetting deps (stale closures).

*Fix:* Use a ref for state values accessed in the effect:
```typescript
const stateRef = useRef(state);
stateRef.current = state;
// Then use stateRef.current inside handlers
// Remove state.mode from dependency array
```

---

**H2. Duplicated undo logic — keyboard handler and handleUndo callback (2 reviewers: jsts, mts)**

**Files:** `panel.tsx:164-191` (keyboard), `panel.tsx:226-243` (callback)

Two identical code paths implement undo. Both read `state.undoStack` to grab the top entry, dispatch UNDO, then execute side effects. If one is updated without the other, undo breaks. The keyboard handler also triggers effect teardown/re-add cycle on every undo because `state.undoStack` is in the useEffect deps.

*Fix:* Have the keyboard handler delegate to `handleUndo()`:
```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleUndo]);
```

---

**H3. No WebSocket reconnection logic (3 reviewers: frontend, jsts, mts)**

**File:** `panel.tsx:117-161`

The WS `useEffect` connects once and sets `disconnected` on close. There is no reconnection attempt. If the sidecar server restarts (common during development), or if the connection drops due to network hiccup, the panel goes permanently disconnected.

*Fix:* Add exponential backoff reconnection:
```typescript
ws.onclose = () => {
  dispatch({ type: 'WS_STATUS', status: 'disconnected' });
  reconnectTimer = setTimeout(() => {
    // Re-create connection
  }, Math.min(1000 * 2 ** retryCount, 30000));
  retryCount++;
};
```

---

**H4. React 19 fiber traversal relies on unstable internal tags (1 reviewer: frontend)**

**File:** `inspector.js:127-165`

The `walkComponentChain` Strategy B (React 19 path) filters on `fiber.tag` using hardcoded constants `0` (FunctionComponent) and `1` (ClassComponent). ForwardRef (tag 11), Memo (tag 14), and SimpleMemo (tag 15) are all missing. Most Mantine components use `React.forwardRef`, so the component chain will be empty or severely truncated.

*Fix:* Use `getComponentName(fiber)` as the filter instead of tag values.

---

**H5. Cross-Site WebSocket Hijacking — missing Origin header passes validation (1 reviewer: security)**

**File:** `server.ts:438-441`

The Origin header is only validated if present. Non-browser clients (or malicious local processes) can connect without an Origin header, bypassing the check. Combined with C3 (if auth is broken), this allows unauthenticated connections.

*Fix:* Reject connections with no Origin header for the `/__zerofog` WS path.

---

**H6. Undo stack grows unboundedly (1 reviewer: mts)**

**File:** `panel-state.ts:186-221`

Each `APPLY_CHANGE` pushes to the undo stack, but `pendingChanges` deduplicates by property. Clicking the same token 50 times creates 50 undo entries but 1 pending change. No upper bound exists.

*Fix:* Cap the undo stack (e.g., 100 entries) or collapse consecutive same-property changes.

---

**H7. `resolveTokenToCssValue` ignores `_origin` — all frameworks get Mantine vars (1 reviewer: mts)**

**File:** `panel-state.ts:124-134`

For non-Mantine apps, `var(--mantine-spacing-md)` resolves to the initial value (likely 0), making live preview completely broken.

*Fix:* For v1, assert Mantine-only constraint explicitly. For multi-framework: use resolved px values for non-Mantine origins.

---

### MEDIUM — Correctness risk, maintainability debt, or type safety gap

**M1. `FINALIZE_SUCCESS` doesn't clear `pendingChanges` (3 reviewers: frontend, jsts, mts)**

**File:** `panel-state.ts:267-268`

After successful finalize, pendingChanges remain. User can click "Apply to Code" again, sending the same diff twice.

*Fix:* `return { ...state, pipelineStatus: 'applied', pendingChanges: [], undoStack: [] };`

---

**M2. Per-item undo buttons all trigger stack-based undo (3 reviewers: jsts, mts, testing)**

**File:** `panel-components.tsx:254-259`

Each change item has an "undo" button, but all call the same `onUndo` which pops the *top* of the stack. Clicking undo on `padding` may actually undo `gap`.

*Fix:* Either remove per-item buttons (single "Undo Last") or implement per-property undo.

---

**M3. `detectStyleOrigin`/`buildTokenMaps` duplication — maintenance landmine (4 reviewers: frontend, jsts, mts, testing)**

**Files:** `inspector.js:518-643`, `toolbar.js:114-231`

Copy-pasted pure functions with "Kept in sync manually" comment. No automated drift detection. Three-way duplication with `findReactFiberKeys`.

*Fix:* Extract to shared module that tsup inlines at build time, or add CI drift-detection script.

---

**M4. Per-side property origin lookup misses — keyed by category, not property (2 reviewers: jsts, mts)**

**File:** `panel.tsx:206`

`state.origins?.[property]` uses property name (e.g., `'paddingTop'`), but origins are keyed by category (`'padding'`). Per-side editing always falls back to `{ origin: 'unknown' }`.

*Fix:* Normalize the lookup:
```typescript
const originKey = property.replace(/^(padding|margin)(Top|Right|Bottom|Left)$/, '$1');
const origin = state.origins?.[originKey] ?? state.origins?.[property] ?? { origin: 'unknown' as const };
```

---

**M5. `inspector:set-edit-mode` is dead code (2 reviewers: mts, testing)**

**File:** `panel.tsx:84`, `inspector.js:902-929`

Panel sends `inspector:set-edit-mode` on every `zerofog:ready`, but inspector's `messageHandlers` has no handler. Silently dropped.

*Fix:* Implement the handler or remove the send.

---

**M6. Property name inconsistency: `'border-radius'` vs `'borderRadius'` (1 reviewer: mts)**

`ELEMENT_TYPE_CATEGORIES` uses kebab-case `'border-radius'` but `VAR_PREFIX` and computed styles use camelCase `'borderRadius'`. SpacingControl manually translates between them.

*Fix:* Standardize on camelCase throughout (matches `getComputedStyle` property names).

---

**M7. Unvalidated postMessage payloads via `as unknown as` casts (2 reviewers: jsts, security)**

**File:** `panel.tsx:89-98`

Payloads are cast directly to `SelectionPayload` / `TokenMaps` without runtime validation. Malformed messages pass silently and crash later.

*Fix:* Add lightweight runtime type guards.

---

**M8. Token maps are built once and never refreshed (1 reviewer: frontend)**

**File:** `inspector.js:1035`

If the app's theme changes at runtime (dark mode toggle, Mantine theme switch), token maps become stale.

*Fix:* Re-run `buildTokenMaps()` on theme changes via MutationObserver.

---

**M9. Closed Shadow DOM prevents dev tools inspection (2 reviewers: frontend, mts)**

**File:** `panel.tsx:305`

Closed mode means `mount.shadowRoot` returns null. Browser DevTools can still inspect, but programmatic access for debugging is blocked.

*Fix:* Use `mode: 'open'` in development builds.

---

**M10. Reducer `default` branch returns state instead of exhaustiveness check (1 reviewer: jsts)**

**File:** `panel-state.ts:273-274`

```typescript
default: {
  const _exhaustive: never = action; // Catches missing cases at compile time
  return state;
}
```

---

### LOW — Improvement opportunities

| # | Issue | Reviewer(s) |
|---|-------|-------------|
| L1 | `ELEMENT_TYPE_CATEGORIES` lacks `gap` for `interactive` type | frontend |
| L2 | Panel styles hardcoded dark theme, no light mode | frontend |
| L3 | `escapeAttrValue` doesn't escape newlines/control chars | security |
| L4 | `data-cortex-id` DOM mutation may break SSR hydration | security |
| L5 | `cachedFiberKey` breaks across multiple React roots (perf) | frontend |
| L6 | `pruneDetachedElements` is O(rules * DOM) on every navigation | frontend |
| L7 | `handleApply` sends `selection.id` (ephemeral counter) — server can't use it | mts |
| L8 | `SpacingControl` local state may persist across same-type selections | mts |
| L9 | Test helper `makeSelection()` duplicated across test files | testing |
| L10 | No tests for inspector message dispatch path (apply-override, remove-override) | testing |
| L11 | Unused `h` import in panel-components.tsx (dead code with automatic JSX) | jsts |
| L12 | Redundant `as ShadowRoot` cast in panel-styles.ts | jsts |
| L13 | No WS rate limiting (localhost-only reduces risk) | security |

---

## Positive Practices Worth Preserving

1. **Pure reducer pattern** (`panel-state.ts`): The `panelReducer` is completely pure with no side effects. All side effects handled at the component layer after dispatch. Highly testable, and the test coverage proves it.

2. **Message envelope with version and session ID** (`panel.tsx:34-54`): Versioned envelope format with session validation is a solid foundation for cross-frame security. `isValidPanelMessage` properly checks origin, version, session, and data shape.

3. **adoptedStyleSheets with fallback** (`panel-styles.ts`): Progressive enhancement — try `adoptedStyleSheets` first (no FOUC), fall back to `<style>` element for older environments.

4. **Hover throttling via rAF** (`inspector.js`): Using `requestAnimationFrame` to batch hover updates prevents layout thrashing. `lastHoverTarget` dedup adds another efficiency layer.

5. **CSS value sanitization** (`inspector.js:37`): `CSS_VALUE_UNSAFE` regex blocks `expression()`, `url()`, `paint()`, and injection. Combined with `ALLOWED_CSS_PROPERTIES` and `isTokenValue`, this is defense-in-depth.

6. **pushState monkey-patch sentinel** (`inspector.js:688-711`): `__cortexPatched` guard prevents double-patching. Nulling the callback on teardown avoids the classic monkey-patch unwinding problem.

7. **Override rules via stylesheet with rAF batching** (`inspector.js:1061-1087`): Selector-based rules preserve the ability to serialize override state for finalize. `scheduleOverrideSheet` batching prevents excessive DOM updates.

8. **Idempotent inspector activation** (`inspector.js:983-1036`): Tears down before re-attaching, recovers `cortexIdCounter` from existing DOM, recovers `overrideRules` from previous IIFE instance. Survives HMR gracefully.

9. **Element map eviction** (`inspector.js:842-845`): Capping at 50 entries prevents unbounded memory growth during long sessions.

10. **Three-tier test structure**: Unit (state), component (UI), integration (message protocol) at appropriate abstraction levels. Good foundation despite the PanelRoot gap.

---

## Test Coverage Summary

| Layer | File | Tests | Quality |
|-------|------|-------|---------|
| Unit (pure state) | panel-state.test.ts | 19 | Good — reducer thoroughly tested |
| Component (UI) | panel-components.test.ts | 21 | Moderate — leaf components good, PropertySections missing |
| Integration (protocol) | panel-integration.test.ts | 8 | Weak — only message envelope format, not actual flow |
| Orchestration (PanelRoot) | None | 0 | **Missing entirely** — critical gap |

---

## Priority-Ordered Remediation

### Immediate (before merge)
1. Fix `postMessage` targetOrigin: `'*'` → `sidecarOrigin` (C1)
2. Add `ELEMENT_DESELECTED` action, remove `null as unknown as` cast (C2)
3. Fix WS auth field: `token` → `sessionId` (C3)
4. Add `id: crypto.randomUUID()` to finalize message (C4)
5. Handle server `'error'` responses in `ws.onmessage` (C4)

### Before v1 ship
6. Stale closure fix: useRef for state in useEffect handlers (H1)
7. Deduplicate undo: keyboard delegates to handleUndo (H2)
8. Add WS reconnection with exponential backoff (H3)
9. Clear pendingChanges on FINALIZE_SUCCESS (M1)
10. Fix origin lookup for per-side properties (M4)
11. Add PanelRoot integration tests (C5)

### Should fix
12. Remove or implement `inspector:set-edit-mode` (M5)
13. Standardize property names to camelCase (M6)
14. Add runtime payload validation (M7)
15. Fix per-item undo buttons (M2 — UX decision)
16. Add reducer exhaustiveness check (M10)
17. Extract shared pure functions (M3)
