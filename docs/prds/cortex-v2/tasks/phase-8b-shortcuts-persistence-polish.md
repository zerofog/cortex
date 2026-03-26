# Linear Issue ID: ZF0-894

# Phase 8b: Keyboard Shortcuts, localStorage Persistence & Polish

**Status**: Ready
**Priority**: Medium
**Assignee**: dlee
**Estimate**: 16 points
**Labels**: Feature, Improvement, Frontend
**Project**: Cortex

## Description
Complete the editor's keyboard interaction model (tinykeys shortcuts, Cmd+Shift+. toggle, cascading Escape), add UI state persistence across page refreshes, and optimize the Tailwind resolver hot path. Absorbed escape fixes + Cmd+Shift+. from ZF0-928. Webpack adapter deferred to ZF0-934.

## Key Details
- Hybrid keyboard system: capture-phase toggle (always-on) + capture-phase Escape (state machine) + tinykeys bubble-phase (active-only)
- Closed Shadow DOM support via stored host + ShadowRoot reference pair
- Per-concern localStorage with port-scoped namespacing and schema validation
- 4 architecture review rounds (53 reviewer instances), 0 remaining critical/high issues
- `isRealEvent()` helper for testable `event.isTrusted` checks

## Test Strategy
- TDD: failing test → minimal implementation → pass → commit
- `isRealEvent` stubbed via `vi.spyOn` for synthetic keyboard events in happy-dom
- Closed shadow DOM tests using `createShadowHost({ mode: 'closed' })`
- Dynamic port prefix in persistence tests (`location.port || '0'`)

## Implementation Notes
- Task 3 is ATOMIC — Escape removal from selection.ts + cascade addition must ship together
- Tasks 4→5 sequential (both modify CortexApp.tsx)
- Tasks 1, 2, 7 are independent and parallelizable

## Dependencies
- ZF0-891 (Phase 6: Toolbar) — Done
- ZF0-893 (Phase 8a: CSS Modules + undo/redo) — Done

## References
- Plan: `docs/superpowers/plans/2026-03-25-phase-8b-shortcuts-persistence-polish.md`
- Spec: `docs/superpowers/specs/2026-03-25-phase-8b-shortcuts-persistence-webpack-design.md`

---

# Sub-Tasks

## 1. Shared focus utilities (Shadow DOM traversal + isRealEvent)
**Linear ID**: ZF0-935
**Priority**: Medium
**Estimate**: 2 points
**Status**: Ready
**Dependencies**: None

### Description
Create `src/browser/focus-utils.ts` with Shadow DOM-aware focus detection utilities. Stores host + ShadowRoot reference pair at bootstrap for closed shadow DOM traversal. Extracts `isInputFocused()` from `useCanvasZoom.ts` into shared module with ARIA role support.

### Implementation Steps
1. Update `tests/browser/helpers.ts` — add `mode` option to `createShadowHost()`
2. Write failing tests in `tests/browser/focus-utils.test.ts` — open shadow, closed shadow, ARIA roles, `isCortexUIFocused` reference equality, `isRealEvent`
3. Implement `src/browser/focus-utils.ts` — `getDeepActiveElement()`, `isInputFocused()`, `isCortexUIFocused()`, `isRealEvent()`, `_setCortexHost(host, shadow)`
4. Update `src/browser/index.tsx` — call `_setCortexHost(hostElement, shadowRoot)` at bootstrap, `_setCortexHost(null, null)` in `_resetForTesting()`
5. Update `src/browser/hooks/useCanvasZoom.ts` — delete local `isInputFocused`, import from `focus-utils`

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/browser/focus-utils.test.ts` — all pass
- [ ] `npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx` — existing tests still pass
- [ ] `npm run typecheck` — no type errors

#### Manual Verification
- [ ] `getDeepActiveElement()` traverses into closed shadow root using stored ref

### Code References
- Create: `cortex-editor/src/browser/focus-utils.ts`
- Create: `cortex-editor/tests/browser/focus-utils.test.ts`
- Modify: `cortex-editor/src/browser/index.tsx:24,29` — add `_setCortexHost` call
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts:283-288` — delete local function
- Modify: `cortex-editor/tests/browser/helpers.ts:56-75` — add mode option

---

## 2. localStorage persistence utility
**Linear ID**: ZF0-936
**Priority**: Medium
**Estimate**: 2 points
**Status**: Ready
**Dependencies**: None

### Description
Create `src/browser/persistence.ts` with namespaced, safe localStorage access. Port-scoped prefix (`cortex:<port>:`), required schema validator, try/catch for quota exceeded / private browsing.

### Implementation Steps
1. Write failing tests in `tests/browser/persistence.test.ts` — round-trip, corrupt JSON fallback, validation failure, clear, quota exceeded
2. Implement `src/browser/persistence.ts` — `cortexStorage.get()` with required validator, `.set()`, `.clear()`. Prefix cached at module level.
3. Verify tests pass

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/browser/persistence.test.ts` — all pass
- [ ] `npm run typecheck` — no type errors

#### Manual Verification
- [ ] `cortexStorage.get()` returns fallback for corrupt JSON
- [ ] `cortexStorage.clear()` only removes `cortex:*` keys, not host app keys

### Code References
- Create: `cortex-editor/src/browser/persistence.ts`
- Create: `cortex-editor/tests/browser/persistence.test.ts`

---

## 3. Escape fixes + cascading Escape handler (ATOMIC)
**Linear ID**: ZF0-937
**Priority**: High
**Estimate**: 3 points
**Status**: Ready
**Dependencies**: Sub-task #1

### Description
ATOMIC change: remove Escape handler from `selection.ts` AND add capture-phase cascading Escape handler to `CortexApp.tsx`. Both changes MUST ship in one commit to prevent double-handling race. Cascade priorities: blur Cortex input → exit comment mode → deselect element. No Priority 4 (close editor). Also caps `activityEntries` at 200 and syncs `active` state to `setDesignMode` via useEffect.

### Implementation Steps
1. Write cascade tests in `tests/browser/keyboard-shortcuts.test.tsx` using `vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)`
2. Remove `handleKeyDown` function + keydown listener from `selection.ts`
3. Replace Escape useEffect in `CortexApp.tsx` with capture-phase cascade using `isRealEvent`, `isCortexUIFocused`, `getDeepActiveElement`
4. Add `useEffect(() => selectionRef.current?.setDesignMode(active), [active])` for initialActive sync
5. Add `MAX_ACTIVITY_ENTRIES = 200` cap to activityEntries handler
6. Update existing Escape tests in `selection.test.ts` (remove Escape assertions) and `cortex-app.test.tsx` (remove close-on-Escape test, add no-close assertion, add `isRealEvent` spy to deselect test at line 441)

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/browser/keyboard-shortcuts.test.tsx` — cascade tests pass
- [ ] `npx vitest run tests/browser/selection.test.ts` — updated tests pass
- [ ] `npx vitest run tests/browser/cortex-app.test.tsx` — updated tests pass
- [ ] `npm run typecheck` — no type errors

#### Manual Verification
- [ ] Escape in Shadow DOM input does NOT deselect
- [ ] Escape with nothing selected does NOT close editor

### Code References
- Modify: `cortex-editor/src/browser/selection.ts:82-98` — remove handleKeyDown + listeners
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx:201-226` — replace with cascade
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx:111` — cap activityEntries
- Create: `cortex-editor/tests/browser/keyboard-shortcuts.test.tsx`
- Modify: `cortex-editor/tests/browser/selection.test.ts:129-155` — remove Escape tests
- Modify: `cortex-editor/tests/browser/cortex-app.test.tsx:282-298,441-469` — update Escape tests

---

## 4. Cmd+Shift+. editor toggle
**Linear ID**: ZF0-938
**Priority**: Medium
**Estimate**: 3 points
**Status**: Ready
**Dependencies**: Sub-tasks #1, #3

### Description
Add configurable `Cmd+Shift+.` toggle shortcut. Capture-phase listener in injected client script. XSS-safe via regex validation + `safeJSONForScript`. `data-cortex-active` attribute for toggle state. `initialActive` prop passed from bootstrap to CortexApp. `cortex-toggle` message type added to protocol.

### Implementation Steps
1. Add `{ type: 'cortex-toggle'; active: boolean }` to `ServerToBrowser` in `src/adapters/types.ts`
2. Add `__cortex_toggle_registered__`, `__cortex_pending_toggle__` to Window in `src/browser/types.ts`
3. Add `validateToggleShortcut()` + `safeJSONForScript()` to `src/adapters/vite.ts`
4. Convert `CLIENT_SCRIPT` constant to `getClientScript(options)` function with toggle listener, `Object.defineProperty` idempotency guard, pending toggle queue
5. Update `src/browser/index.tsx` — read `data-cortex-active`, pass `initialActive` prop to CortexApp
6. Update `CortexAppProps` interface — add `initialActive?: boolean`
7. Add `data-cortex-active` mirror useEffect and `cortex-toggle` message handler in CortexApp
8. Write validation tests in `tests/adapters/vite.test.ts`

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/adapters/vite.test.ts` — validation tests pass
- [ ] `npm run typecheck` — no type errors (cortex-toggle in union)
- [ ] `npm test` — all tests pass

#### Manual Verification
- [ ] `Cmd+Shift+.` opens editor when closed, closes when open
- [ ] Toggle works before browser bundle loads (pending toggle queued)

### Code References
- Modify: `cortex-editor/src/adapters/types.ts` — add cortex-toggle
- Modify: `cortex-editor/src/browser/types.ts` — add window globals
- Modify: `cortex-editor/src/adapters/vite.ts:48-69` — getClientScript + validation
- Modify: `cortex-editor/src/browser/index.tsx:53` — pass initialActive
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx:20-23,52` — initialActive prop

---

## 5. tinykeys keyboard shortcut system
**Linear ID**: ZF0-939
**Priority**: Medium
**Estimate**: 3 points
**Status**: Ready
**Dependencies**: Sub-tasks #1, #3 (sequential after #4 — both modify CortexApp.tsx)

### Description
Install `tinykeys` (~650B) and register declarative shortcut map in CortexApp useEffect. V (select), C (comment toggle), Cmd+0 (canvas zoom reset), Cmd+Z (undo), Cmd+Shift+Z (redo). Two-layer guard: `guardSingleKey` (isInputFocused + isCortexUIFocused) and `guardModifier` (isInputFocused only). `isRealEvent` check on all handlers. Create `format-shortcut.ts` for platform-aware tooltip display.

### Implementation Steps
1. `cd cortex-editor && npm install tinykeys`
2. Create `src/browser/format-shortcut.ts` — maps key codes to display symbols
3. Add tinykeys useEffect to CortexApp: `import { tinykeys } from 'tinykeys'` (named export)
4. Update Toolbar tooltips to use `formatShortcut()` — `data-tooltip={`Comment (${formatShortcut('c')})`}`
5. Write shortcut integration tests in `tests/browser/keyboard-shortcuts.test.tsx` — cascade priorities (blur, comment-exit, deselect, no-close)

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/browser/keyboard-shortcuts.test.tsx` — all pass
- [ ] `npm run typecheck` — no type errors
- [ ] `npm test` — all tests pass

#### Manual Verification
- [ ] V switches to select mode, C toggles comment mode
- [ ] Shortcuts don't fire in text inputs or Cortex UI elements
- [ ] Cmd+Z sends undo, Cmd+Shift+Z sends redo

### Code References
- Modify: `cortex-editor/package.json` — add tinykeys
- Create: `cortex-editor/src/browser/format-shortcut.ts`
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx` — tinykeys useEffect
- Modify: `cortex-editor/src/browser/components/Toolbar.tsx` — shortcut hints

---

## 6. Persistence integration (panel + toolbar position)
**Linear ID**: ZF0-940
**Priority**: Medium
**Estimate**: 2 points
**Status**: Ready
**Dependencies**: Sub-task #2

### Description
Wire `cortexStorage` into `useSnapToEdge` and `useToolbarDock` hooks. Read from localStorage on mount, write on snap/dock completion. Position validators clamp to viewport bounds via `normalizePosition`.

### Implementation Steps
1. Write failing persistence test in `tests/browser/hooks/use-snap-to-edge.test.tsx` using `vi.resetModules()` + dynamic `import()`
2. Add position validator + persistence reads/writes to `useSnapToEdge.ts` — `getInitialPosition()` reads from storage, `snap()` writes on completion
3. Same pattern for `useToolbarDock.ts`
4. Update any existing tests that assert "ignore localStorage" behavior

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/browser/hooks/use-snap-to-edge.test.tsx` — all pass
- [ ] `npx vitest run tests/browser/hooks/use-toolbar-dock.test.tsx` — all pass
- [ ] `npm test` — all tests pass

#### Manual Verification
- [ ] Panel position survives page refresh
- [ ] Toolbar dock position survives page refresh
- [ ] Corrupt localStorage gracefully falls back to defaults

### Code References
- Modify: `cortex-editor/src/browser/hooks/useSnapToEdge.ts:57-65` — read/write localStorage
- Modify: `cortex-editor/src/browser/hooks/useToolbarDock.ts:49-58` — read/write localStorage
- Modify: `cortex-editor/tests/browser/hooks/use-snap-to-edge.test.tsx` — add persistence tests
- Modify: `cortex-editor/tests/browser/hooks/use-toolbar-dock.test.tsx` — add persistence tests

---

## 7. Resolver cache (getSnapPoints with Object.freeze)
**Linear ID**: ZF0-941
**Priority**: Low
**Estimate**: 1 point
**Status**: Ready
**Dependencies**: None

### Description
Add instance-level `Map<string, readonly string[]>` cache to `TailwindResolver.getSnapPoints()`. Return `Object.freeze(sorted)` to prevent consumer mutation. Static `EMPTY_FROZEN` for unknown properties. Return type changes from `string[]` to `readonly string[]`.

### Implementation Steps
1. Write failing cache tests in `tests/core/tailwind-resolver.test.ts` — frozen array, same reference on second call, frozen empty for unknown
2. Add `snapCache` field + `EMPTY_FROZEN` static to `TailwindResolver`
3. Update `getSnapPoints()` to check cache, freeze results
4. Verify no callers break with `readonly string[]` return type

### Success Criteria

#### Automated Verification
- [ ] `npx vitest run tests/core/tailwind-resolver.test.ts` — all pass
- [ ] `npm run typecheck` — no type errors (readonly string[] compatible at all call sites)
- [ ] `npm test` — all tests pass

#### Manual Verification
- [ ] No jank during rapid numeric input scrubbing

### Code References
- Modify: `cortex-editor/src/core/tailwind-resolver.ts:392-399` — add cache + freeze
- Modify: `cortex-editor/tests/core/tailwind-resolver.test.ts` — add cache tests
