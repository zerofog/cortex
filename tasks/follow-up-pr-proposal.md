# Follow-Up PR Proposal: Remaining Architecture Review Fixes Post-PR #10

**Date:** 2026-03-03
**Context:** PR #10 merged 25 architecture review findings for Phase 4b panel (ZF0-849). This proposal covers the remaining findings our branch addresses that PR #10 did NOT touch.

---

## Change 1: H5 — Server Origin Header Requirement (SECURITY)

**File:** `visual-editor/src/server.ts` (upgrade handler ~line 435-460)

**Current state on main (PR #10):**
```typescript
// C1: Validate Origin if present
const origin = req.headers.origin;
if (origin && !isLoopbackOrigin(origin)) { socket.destroy(); return; }

const url = req.url ?? '';

if (url.startsWith('/__zerofog')) {
  editorWss.handleUpgrade(req, socket, head, (ws) => {
    editorWss.emit('connection', ws, req);
  });
}
```

**Problem:** The `if (origin && ...)` check passes when Origin is **missing**. Non-browser clients (curl, scripts) can connect to `/__zerofog` WebSocket without any Origin header, bypassing the loopback validation.

**Proposed fix:**
```typescript
const origin = req.headers.origin;
const url = req.url ?? '';

if (url.startsWith('/__zerofog')) {
  // H5: Editor WS requires Origin header (browsers always send it;
  // only non-browser clients like curl omit it)
  if (!origin || !isLoopbackOrigin(origin)) { socket.destroy(); return; }
  editorWss.handleUpgrade(req, socket, head, (ws) => {
    editorWss.emit('connection', ws, req);
  });
} else {
  // Proxy WS: validate Origin if present
  if (origin && !isLoopbackOrigin(origin)) { socket.destroy(); return; }
  if (typeof proxy.upgrade === 'function') {
    proxy.upgrade(req, socket, head);
  } else {
    socket.destroy();
  }
}
```

**Rationale:** Browser WebSocket clients always send Origin. Only non-browser clients omit it. The editor panel runs in a browser, so requiring Origin for `/__zerofog` is safe and closes the gap.

**Test update:** `tests/server/server.test.ts` — all 8 `/__zerofog` WS connections get `headers: { Origin: \`http://127.0.0.1:${sidecar.port}\` }` added.

---

## Change 2: M6 — camelCase Standardization in toolbar.js/d.ts (CONSISTENCY)

**Files:** `visual-editor/src/client/toolbar.js`, `visual-editor/src/client/toolbar.d.ts`

**Problem:** `detectStyleOrigin` uses kebab-case `'border-radius'` in three places, but `getComputedStyle` returns camelCase keys, panel-state.ts uses `borderRadius`, and PR #10's panel-components.tsx now uses `borderRadius` in ELEMENT_TYPE_CATEGORIES.

**Proposed fix in toolbar.js:**
```javascript
// propMap key: 'border-radius' → 'borderRadius'
// defaultPropName check: property === 'border-radius' → property === 'borderRadius'
// twPatterns key: 'border-radius' → 'borderRadius'
```

**Proposed fix in toolbar.d.ts:**
```typescript
export declare function detectStyleOrigin(
  element: Record<string, unknown>,
  property: 'padding' | 'margin' | 'gap' | 'borderRadius',  // was 'border-radius'
  ...
): StyleOrigin;
```

**Additional type improvements in toolbar.d.ts:**
```typescript
// Add ChangeEntry interface (used by panel-state PendingChange)
export interface ChangeEntry {
  property: string;
  token: string;
  previousToken: string | null;
  previousCssValue: string;
  cssProperty: string;
  cssValue: string;
  styleOrigin: StyleOrigin;
}

// Type DiffResult.changes from unknown[] to ChangeEntry[]
export interface DiffResult {
  // ...
  changes: ChangeEntry[];
}
```

**Test update:** `tests/client/toolbar.test.ts` — all `'border-radius'` references → `'borderRadius'` (~8 occurrences).

---

## Change 3: Type Improvements in inspector.d.ts

**File:** `visual-editor/src/client/inspector.d.ts`

**Problem:** Selection type lacks per-side padding/margin fields and origins, but the inspector actually sends these in `zerofog:selected` payload.

**Proposed fix:**
```typescript
export interface Selection {
  // ... existing fields ...
  styles: {
    padding: string;
    margin: string;
    gap: string;
    borderRadius: string;
    fontWeight: string;
    fontFamily: string;
    // NEW: per-side fields sent by inspector
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
  };
  // NEW: origin data for each property
  origins: Record<string, import('./toolbar.js').StyleOrigin>;
}
```

---

## Change 4: Per-Side Origin Lookup Bug Fix (panel.tsx)

**File:** `visual-editor/src/client/panel.tsx` (handleTokenSelect ~line 248-251)

**Current state on main (PR #10):**
```typescript
const handleTokenSelect = useCallback((property: string, token: string) => {
  if (!state.selection) return;
  const origin = state.selection.origins?.[property] ?? { origin: 'unknown' as const };
  // ...
```

**Problem:** When user edits `paddingTop`, `origins[paddingTop]` is undefined because the inspector keys origins by category (`padding`). All per-side edits get `{ origin: 'unknown' }`, breaking Mantine token resolution.

**Proposed fix:** Add helper function:
```typescript
function getOriginForProperty(property: string, origins: Record<string, StyleOrigin> | null): StyleOrigin {
  if (!origins) return { origin: 'unknown' as const };
  if (origins[property]) return origins[property];
  const category = property.replace(/^(padding|margin)(Top|Right|Bottom|Left)$/, '$1');
  return origins[category] ?? { origin: 'unknown' as const };
}
```

Then update `handleTokenSelect` to use it instead of direct bracket access.

---

## Change 5: stateRef Pattern Fix (panel.tsx)

**File:** `visual-editor/src/client/panel.tsx` (lines 188-189)

**Current state on main (PR #10):**
```typescript
const stateRef = useRef(state);
useEffect(() => { stateRef.current = state; }, [state]);
```

**Problem:** `useEffect` runs after DOM commit. Any callback reading `stateRef.current` during the same render tick gets the **previous** state value. This affects the postMessage listener and keyboard handler.

**Proposed fix:**
```typescript
const stateRef = useRef(state);
stateRef.current = state;  // Synchronous update — ref is always current
```

This is the standard React/Preact pattern recommended by the React team (see React docs on "reading latest state in event handlers").

---

## Summary of Files Changed

| File | Type of change |
|------|---------------|
| `src/server.ts` | Security fix (H5) |
| `src/client/toolbar.js` | camelCase standardization (M6) |
| `src/client/toolbar.d.ts` | camelCase + new types |
| `src/client/inspector.d.ts` | Type completeness |
| `src/client/panel.tsx` | Bug fix + pattern fix |
| `tests/server/server.test.ts` | Test update for H5 |
| `tests/client/toolbar.test.ts` | Test update for M6 |

---

## Risk Assessment

- **H5 server change**: Low risk — only affects `/__zerofog` path, which is browser-only by design
- **M6 camelCase**: Medium risk — cascading rename but limited to toolbar layer; panel already uses camelCase
- **Type updates**: Zero risk — .d.ts files only affect compile-time
- **getOriginForProperty**: Low risk — additive helper, fallback to existing behavior
- **stateRef pattern**: Low risk — well-established React pattern, no behavioral change in typical flows

---

## Architecture Review Findings (2026-03-03)

**Review team:** security, jsts, frontend, fullstack, mts
**Mode:** both (clink + native = 10 total reviewers)
**Selection rationale:** WS security (security), TypeScript types + camelCase (jsts), Preact hooks/stateRef (frontend), cross-file integration (fullstack), first-principles correctness (mts).

---

### Cross-Reviewer Consensus

Issues flagged by 3+ reviewers independently — highest-confidence signals:

| # | Issue | Flagged By | Severity |
|---|---|---|---|
| 1 | `getOriginForProperty` should use a lookup table, not regex — regex is wrong abstraction for a finite 8-entry mapping and misses `borderRadius` sub-properties | jsts-clink, frontend-native, mts-native, fullstack-native, frontend-clink | HIGH |
| 2 | Missing negative test: no-Origin WS rejection (the exact scenario H5 fixes) | security-native, fullstack-native, mts-native | MEDIUM |
| 3 | All 5 proposed changes are correct and should be applied | ALL 10 reviewers | CONSENSUS |
| 4 | 4 of 5 changes already applied on this branch — proposal describes completed work | jsts-native, fullstack-native, mts-native | INFO |
| 5 | `finalizeDiff` parameter should be `ChangeEntry[]` not `unknown[]` (type soundness hole) | jsts-clink, jsts-native | HIGH |
| 6 | H5 is defense-in-depth, not primary security — sessionId is the real auth boundary | security-native, mts-native | MEDIUM |

---

### Consolidated Findings by Severity

#### HIGH — Should fix before merge

**H1. Replace regex with lookup table in `getOriginForProperty`** (panel.tsx:220)
- **Reviewers:** 5 reviewers (jsts-clink, frontend-native, mts-native, fullstack-native, frontend-clink)
- **Issue:** The regex `/^(padding|margin)(Top|Right|Bottom|Left)$/` is the wrong abstraction for a finite known mapping. It misses `borderTopLeftRadius` → `borderRadius`, CSS logical properties (`paddingInlineStart`), and `rowGap`/`columnGap` → `gap`. A non-matching property goes through `.replace()` unchanged, producing a result identical to not running it at all.
- **Fix:** Replace with explicit lookup table:
  ```typescript
  const PROPERTY_TO_ORIGIN_KEY: Record<string, string> = {
    paddingTop: 'padding', paddingRight: 'padding',
    paddingBottom: 'padding', paddingLeft: 'padding',
    marginTop: 'margin', marginRight: 'margin',
    marginBottom: 'margin', marginLeft: 'margin',
  };
  ```
  Also consider hoisting to module scope or extracting to `panel-state.ts` for independent testability.

**H2. `finalizeDiff` parameter typed as `unknown[]` contradicts `DiffResult.changes: ChangeEntry[]`** (toolbar.d.ts:64)
- **Reviewers:** jsts-clink, jsts-native
- **Issue:** The function accepts `changes: unknown[]` but returns `DiffResult` with `changes: ChangeEntry[]`. Callers can pass malformed arrays without TypeScript catching it.
- **Fix:** Change parameter to `changes: ChangeEntry[]`. Note: some test fixtures have incomplete `StyleOrigin` shapes that will need updating.

**H3. Missing per-client `ws.on('error')` handler** (server.ts:~379)
- **Reviewers:** jsts-clink
- **Issue:** `editorWss.on('connection', ...)` handler has no `ws.on('error', ...)`. In Node.js, unhandled `'error'` events on EventEmitter throw. A dropped WS connection could crash the process.
- **Fix:** Add `ws.on('error', (err) => console.error('[zerofog] ws client error:', err.message));`

#### MEDIUM

- **M1.** Missing test for no-Origin WS rejection — the exact scenario H5 fixes has no regression test. Add: `it('rejects /__zerofog WS without Origin header')`. (security-native, fullstack-native, mts-native)
- **M2.** `ChangeEntry` and `PendingChange` are structurally identical types in different modules — maintenance hazard if either drifts. Consider `export type PendingChange = ChangeEntry`. (jsts-native)
- **M3.** H5 risk assessment should say "defense-in-depth hardening" not "SECURITY fix" — the real auth boundary is the sessionId (`randomUUID()`). Origin can be forged by local processes. (security-native, mts-native)
- **M4.** `getOriginForProperty` defined as nested function inside component — cannot be unit-tested independently. Extract to `panel-state.ts`. (fullstack-native, frontend-native)
- **M5.** `Selection.origins` typed as `Record<string, StyleOrigin>` is overly loose — inspector sends exactly 4 keys. Consider `Partial<Record<'padding' | 'margin' | 'gap' | 'borderRadius', StyleOrigin>>`. (jsts-native)
- **M6.** stateRef fix justification is slightly inaccurate — no current code path reads stateRef during a render tick (all readers are async event handlers). Fix is still correct as best-practice. (mts-native, frontend-native)

#### LOW

- **L1.** `_now` parameter name in `finalizeDiff` signals "unused" but it IS used for clock injection. Rename to `clock?: Date`. (jsts-clink)
- **L2.** `TOOLBAR_SIZES` and `RADIUS_SIZES` declared as mutable `string[]` — should be `readonly` tuples. (jsts-clink)
- **L3.** `isSelectionPayload`/`isTokenMaps` defined inside component body — pure functions with no state deps, should be hoisted to module scope. (frontend-native)
- **L4.** `elementMap` type declares `Record<string, Element>` but implementation uses numeric keys. (jsts-clink)

---

### Positive Practices — Preserve These

1. **postMessage security model** — session ID + origin validation is correct defense-in-depth. (ALL)
2. **stateRef synchronous assignment** — the canonical React/Preact pattern; correctly eliminates the useEffect timing gap. (ALL)
3. **Discriminated union `StyleOrigin`** — consumers can exhaustively switch on `origin` without runtime guarding. (jsts-clink)
4. **`isLoopbackOrigin` with try-catch on `new URL()`** — safe parsing that handles malformed origins without crashing. (security-native)
5. **RAF throttling in `handleHover`** — correct pattern for performant cursor tracking. (jsts-clink)
6. **Batch write-then-read sentinel pattern in `buildTokenMaps`** — avoids layout thrash. (jsts-clink)
7. **PID file mechanism** — prevents multiple sidecar instances. (fullstack-clink)

---

### Broader Findings (outside proposal scope, flagged for future)

These were found by reviewers exploring beyond the proposed changes:

| Issue | Reviewer | Severity |
|---|---|---|
| Service Worker can silently bypass script injection | frontend-clink | CRITICAL (future) |
| React 16 `__reactInternalInstance$` prefix not checked | frontend-clink | CRITICAL (future) |
| Cmd+Z unreachable when iframe has focus | frontend-clink, frontend-native | HIGH (future) |
| HMR silently orphans CSS overrides (no prune on HMR) | frontend-clink | HIGH (future) |
| Strategy B depth budget consumed by host fibers | frontend-clink | HIGH (future) |
| OAuth cross-origin navigation kills inspector silently | frontend-clink | HIGH (future) |

---

### Review Methodology Note

**Both mode** deployed 10 reviewers: 5 via PAL clink (Gemini 2.5 Pro × 3, Claude Sonnet × 2) + 5 native Claude agents with direct codebase access.

**Clink advantages:** Model diversity surfaced broader concerns (Gemini fullstack caught missing finalize handler; Claude jsts found `ws.on('error')` gap). Some Gemini responses were summary-only (security clink truncated).

**Native advantages:** Full codebase access enabled cross-file verification. Three native agents independently discovered that 4/5 proposed changes are already applied on the branch — this crucial context was invisible to clink reviewers who only see file snapshots. The frontend native reviewer traced the exact stateRef timing through Preact's render cycle.

**Key divergence:** Clink reviewers reviewed the proposal as future work. Native reviewers discovered most work is already done. This is a critical difference — it means the follow-up PR is smaller than the proposal suggests (primarily the diff against main, not new implementation work).
