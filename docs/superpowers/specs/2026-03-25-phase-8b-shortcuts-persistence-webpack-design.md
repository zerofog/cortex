# Phase 8b: Keyboard Shortcuts, localStorage Persistence, Webpack Adapter & Polish

**Ticket:** [ZF0-894](https://linear.app/zerofog/issue/ZF0-894)
**Date:** 2026-03-25
**Supersedes:** Sections 8.5-8.9 of `thoughts/shared/plans/2026-03-10-cortex-v2-implementation.md`
**Absorbs from:** ZF0-928 (escape fixes + Cmd+Shift+. toggle)

---

## Overview

Seven implementation units that complete the editor's keyboard interaction model, add state persistence across page refreshes, extend build tool support to webpack, and optimize the Tailwind resolver hot path.

**Guiding principles:**
- No band-aid fixes or workarounds — every change addresses the root cause
- Performance, maintainability, security, and user experience evaluated for each unit
- Follow existing codebase patterns (useState hooks, capture-phase events, adapter conventions)

---

## Section 1: Escape Key Fixes (from ZF0-928)

### Problem

Two bugs cause Escape to misbehave when pressed inside Cortex's own Shadow DOM UI:

**Bug A — `selection.ts` missing `isOwnUI` guard:**
The capture-phase `handleKeyDown` at `selection.ts:84-87` intercepts ALL Escape keypresses on the window, including those originating from inside Cortex's Shadow DOM (chat input, numeric input, dropdown). When a user presses Escape while typing in a Cortex input, the handler deselects the current element — losing the user's context.

**Bug B — `CortexApp.tsx` uses `e.target` instead of `composedPath()[0]`:**
The Escape handler in CortexApp checks `e.target.tagName` to detect if the user is in an input field. In Shadow DOM, `e.target` is the shadow host element (a `<div>`), not the actual `<input>` inside. The input guard fails silently — it sees a `<div>`, concludes the user is NOT typing, and proceeds to deselect/exit.

### Fix

**selection.ts:** Two changes:
1. **Add `isOwnUI(event)` guard** to the click and mousemove handlers. The `isOwnUI` function already exists in this file — it checks `event.composedPath()` for elements with `data-cortex-host`. If the event originates from inside Cortex UI, skip interception.
2. **Remove Escape handling entirely.** Escape was previously handled here independently, but this creates a double-handling problem with the new cascading Escape handler in CortexApp (Section 4). Since `designMode` is only true when the editor is active — the same condition under which the cascade handler is registered — there's no gap. The cascade becomes the single Escape handler.

```ts
function handleKeyDown(event: KeyboardEvent): void {
  if (!designMode) return
  if (isOwnUI(event)) return
  // Escape handling REMOVED — now handled by cascading handler in CortexApp (Section 4)
  // This prevents double-handling: selection.ts deselecting AND cascade running on the same keypress
}
```

Note: `handleKeyDown` may become empty after this change. If so, remove the keydown listener from selection.ts entirely. Other handlers (mousemove, click, scroll) remain with their existing behavior plus the `isOwnUI` guard.

**CortexApp.tsx:** Replace `e.target` with `e.composedPath()[0]` in the existing Escape handler's input guard. This fix is then superseded by the cascading Escape handler (Section 4), which replaces the ad-hoc handler entirely:

```ts
// Old handler replaced by handleEscapeCascade() — but the composedPath pattern
// is used in the cascade's getDeepActiveElement() via focus-utils.ts
```

### User Experience

**Before:** Pressing Escape while typing in a Cortex input randomly deselects the element or closes the editor. Pressing Escape on the host page sometimes deselects AND closes in a single keypress (double-handling). Users lose trust in keyboard interaction and avoid using shortcuts.

**After:** Escape inside Cortex inputs does what the user expects (blur/dismiss). Escape on the host page peels back exactly one layer of editor state. No double-handling, no surprises. This is a prerequisite for the entire shortcut system — without it, no keyboard shortcut can be trusted.

---

## Section 2: Cmd+Shift+. Editor Toggle

### Design

Capture-phase `keydown` listener injected via `getClientScript()` in the Vite adapter. Runs before Preact mounts, survives Preact lifecycle. Works regardless of whether the editor is active or inactive.

**Key combination:** `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows/Linux)

**Detection logic:**
```ts
(e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Period'
```

Uses `e.code` (physical key) instead of `e.key` (character) because `Shift+.` produces `>` as the key character on some platforms. `e.code` is modifier-independent and always returns `'Period'` for the period key.

**Guards:**
- Skip if `composedPath()` hits `data-cortex-host` (don't intercept Cortex's own UI)
- `preventDefault()` + `stopPropagation()` to prevent the host app from seeing the event

**Toggle behavior:**
- If `document.documentElement.hasAttribute('data-cortex-active')` → remove attribute, send `cortex-closed` message through channel
- Otherwise → set attribute, send `init` message through channel

### Configurable Shortcut

Since we use capture-phase, our listener fires **before** the host app's handlers. This means we could steal a shortcut the app needs. To prevent this, the toggle shortcut is configurable via plugin options:

```ts
// Default
cortexEditor({ toggleShortcut: '$mod+Shift+Period' })

// User override if conflict exists
cortexEditor({ toggleShortcut: '$mod+Shift+KeyE' })
```

The option flows: adapter config → `getClientScript(options)` → capture-phase listener in injected script. The webpack adapter accepts the same option.

**Shortcut format:** Uses `KeyboardEvent.code` values (e.g., `Period`, `KeyE`) for physical key mapping, with `$mod` as the platform-aware modifier prefix (Meta on Mac, Ctrl on Windows/Linux).

### User Experience

**Before:** No keyboard shortcut to toggle the editor. Users must interact with UI elements to open/close, creating friction when they want to quickly check their work without the panel overlay.

**After:** `Cmd+Shift+.` instantly toggles the editor from any context. The user develops a rhythm: open editor → make changes → toggle off to see result → toggle back on to tweak. If their app uses `Cmd+Shift+.` for something else, they change one line in their build config.

---

## Section 3: tinykeys Shortcut System

### Architecture

**Registration location:** CortexApp `useEffect` — only active when the editor is active. Returns tinykeys' unsubscribe function as the effect cleanup.

**Separate from Cmd+Shift+.:** The toggle shortcut is bootstrap-level (capture-phase, always active). All other shortcuts are inside the Preact tree via tinykeys (only active when editor is open). This separation is intentional — the toggle needs to work when the editor is inactive; all other shortcuts only make sense when the editor is active.

**Library:** `tinykeys` (~650B gzipped). Provides declarative binding map, `$mod` cross-platform abstraction, and `parseKeybinding()` for UI display.

### Shortcut Table

| Key | Action | Type |
|-----|--------|------|
| `v` | Switch to select mode | Single-key |
| `c` | Toggle comment mode | Single-key |
| `$mod+0` | Reset canvas zoom to 100% | Modifier |
| `$mod+z` | Undo last edit | Modifier |
| `$mod+Shift+z` | Redo last edit | Modifier |
| `Escape` | Cascading exit (Section 4) | Special |

### Input Detection: How V-the-shortcut differs from V-the-letter

Two-layer guard system prevents shortcuts from firing when the user is typing:

**Layer 1 — `isInputFocused()`: Is the user in a text field?**

```ts
function isInputFocused(): boolean {
  let el: Element | null = document.activeElement
  // Traverse into shadow roots to find the actual focused element
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement
  }
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}
```

The Shadow DOM traversal loop is critical. Without it, `document.activeElement` returns the shadow host (a `<div>`), not the actual `<input>` inside. Every input inside Cortex's Shadow DOM would be invisible to the check. The existing `isInputFocused()` in `useCanvasZoom.ts` has this bug — it will be fixed when extracted to the shared utility.

**Layer 2 — `isCortexUIFocused()`: Is the user interacting with editor UI?**

Even when focus isn't on a text input, the user might be interacting with Cortex UI (clicking a dropdown button, tabbing through panel controls). Single-character shortcuts shouldn't fire then either.

```ts
function isCortexUIFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const root = el.getRootNode()
  return root instanceof ShadowRoot &&
    (root.host as HTMLElement)?.hasAttribute?.('data-cortex-host')
}
```

**Guard application rules:**

| Shortcut type | Guard | Rationale |
|---|---|---|
| Single-key (`V`, `C`) | `isInputFocused() \|\| isCortexUIFocused()` | Must not fire when typing or interacting with editor UI |
| Modifier (`Cmd+Z`, `Cmd+0`) | `isInputFocused()` | Works inside editor UI (Cmd+Z to undo is always valid), blocked only in text fields |
| `Escape` | None — cascading handler decides | Each layer in the state machine checks its own context |
| `Cmd+Shift+.` | Separate capture-phase (Section 2) | Not part of tinykeys registration |

### Discoverability

Toolbar button tooltips show shortcut hints using tinykeys' `parseKeybinding()`:
- "Select (V)" on the select mode button
- "Comment (C)" on the comment mode button
- "Zoom to fit (Cmd+0)" on the canvas zoom button

`parseKeybinding()` returns platform-aware display strings ("Cmd" on Mac, "Ctrl" on Windows).

### User Experience

**Before:** Every action requires mouse interaction with the toolbar. Users who are accustomed to keyboard-driven design tools (Figma, Sketch) find the editor slow and foreign.

**After:** Users develop muscle memory for common actions. `V` to select, `C` to comment, `Cmd+Z` to undo — matching conventions from Figma and other design tools. Shortcuts never interfere with typing in inputs or interacting with editor controls. Tooltips help users discover shortcuts organically.

---

## Section 4: Cascading Escape

### State Machine

A single function checks each state in priority order and acts on the first match:

```
Priority 1: Text input focused inside Cortex UI → blur the input
Priority 2: Comment mode active                 → exit comment mode
Priority 3: Element selected                    → deselect element
Priority 4: Editor active, nothing else         → deactivate editor (handleExit)
```

**One press = one action.** Escape never skips layers. The user can press Escape repeatedly to "back out" from any depth.

### Implementation

The cascading handler replaces the existing ad-hoc Escape handling in CortexApp. It's a single function called from the tinykeys Escape binding:

```ts
function handleEscapeCascade(): void {
  // Priority 1: Blur active input inside Cortex UI
  const focused = getDeepActiveElement()
  if (focused && isCortexUIFocused()) {
    const tag = (focused as HTMLElement).tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || (focused as HTMLElement).isContentEditable) {
      ;(focused as HTMLElement).blur()
      return
    }
  }

  // Priority 2: Exit comment mode
  if (commentModeRef.current) {
    setCommentMode(false)
    return
  }

  // Priority 3: Deselect element
  if (selectedElementRef.current) {
    setSelectedElement(null)
    return
  }

  // Priority 4: Close editor
  handleExit()
}
```

`getDeepActiveElement()` is the Shadow DOM-aware traversal from `isInputFocused()`, returning the actual focused element rather than a boolean.

### Interaction with selection.ts

Escape handling is **removed entirely** from `selection.ts` (Section 1). The cascading handler is now the single, authoritative Escape handler. This prevents double-handling where selection.ts would deselect and then the cascade would also fire — causing a single Escape press to both deselect AND close the editor.

This is safe because `designMode` (selection.ts's gate) is only true when the editor is active — the same condition under which the tinykeys cascade is registered. There's no state where selection.ts would need to handle Escape but the cascade wouldn't be available.

### User Experience

**Before:** Pressing Escape is unpredictable. Sometimes it deselects, sometimes it closes the editor, sometimes nothing happens. The user can't trust it.

**After:** Escape follows the "peel back one layer" mental model:
1. Deep in a comment thread → Escape blurs the input → Escape exits comment mode → Escape deselects → Escape closes editor
2. Just selected an element → Escape deselects → Escape closes editor
3. Editor open, nothing selected → Escape closes editor

This matches Figma, VS Code, and other professional tools. The mental model transfers — users don't need to learn new behavior.

---

## Section 5: localStorage Persistence

### Architecture

**Storage utility:** A thin module `src/browser/persistence.ts` providing namespaced, safe localStorage access:

```ts
const PREFIX = 'cortex:'

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota exceeded or private browsing — silently degrade
  }
}

function clear(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
}
```

**Per-concern keys** — each hook reads/writes its own key independently:

| Key | Hook | Data | Read | Write |
|-----|------|------|------|-------|
| `cortex:panel-position` | `useSnapToEdge` | `{ x: number, y: number }` | On mount | On drag end |
| `cortex:toolbar-position` | `useToolbarDock` | `{ x: number, y: number, edge: DockEdge }` | On mount | On dock change |
| `cortex:collapsed-sections` | Section components | `Record<string, boolean>` | On mount | On toggle |

**Write timing:** Position writes happen on drag-end (not every frame during drag). Section collapse writes happen on toggle. No debounce needed since writes are already event-driven, not continuous.

### What Persists and What Doesn't

| Persists | Why |
|----------|-----|
| Panel position | User arranged their workspace layout |
| Toolbar position + edge | User docked toolbar to preferred location |
| Section collapse states | User focused on specific property groups |

| Does NOT Persist | Why |
|------------------|-----|
| Element selection | DOM is fresh after refresh — previous selection is meaningless |
| CSS overrides | Session-scoped; source edits are the durable form |
| Active/inactive state | Editor always starts inactive; user opens with Cmd+Shift+. |
| Activity log entries | Server-side session data, not UI state |
| Undo/redo stack | In-memory by design; source edits persist on disk |

### Failure Resilience

Each key is independent. If `cortex:toolbar-position` contains corrupt JSON, `get()` returns the fallback — the toolbar resets to default while panel position is unaffected. The editor always works; persistence is an enhancement.

**Storage unavailable scenarios:**
- Private browsing mode: `localStorage.setItem` may throw → caught, silently degraded
- Storage quota exceeded: same handling
- localStorage disabled: `get()` returns fallback, `set()` is a no-op

### Security

- Only UI layout preferences stored — no user data, source code, or tokens
- `cortex:` namespace prefix prevents collision with host app's storage
- `clear()` method enables "forget all Cortex data" functionality
- No sensitive data exposure — positions and boolean collapse states only

### User Experience

**Before:** Every page refresh resets the editor layout. Panel jumps to top-right, toolbar resets, all sections expand. During an active design session with frequent refreshes, the user spends 5-10 seconds per refresh re-arranging their workspace.

**After:** The editor remembers where the user left it. Panel stays where they dragged it. Toolbar stays docked. Collapsed sections stay collapsed. The editor feels like a native part of their development environment, not a transient overlay.

---

## Section 6: Webpack Adapter

### Architecture

New file `src/adapters/webpack.ts` following the existing Next.js adapter pattern:

```
cortexWebpack(options?)
  ├─ Source transform: reuses next-source-loader.ts (webpack loader)
  ├─ Communication: CortexTransport (standalone WebSocket server)
  ├─ Script injection: via webpack compilation hooks
  └─ Edit pipeline: TailwindResolver + EditPipeline + UndoStack
```

**Why reuse `next-source-loader.ts`:** It's already a webpack loader that calls `createSourceTransform`. The Next.js adapter wraps it with `withCortex()`. The standalone webpack adapter wraps it with a standard webpack plugin. Same loader, different wrapper.

### Plugin API

```ts
export interface CortexWebpackOptions {
  /** Override the editor toggle shortcut. Default: '$mod+Shift+Period' */
  toggleShortcut?: string
}

export function cortexWebpack(options?: CortexWebpackOptions): WebpackPluginInstance
```

The plugin:
1. Adds `next-source-loader.ts` as a module rule for `.jsx`/`.tsx` files (same include/exclude as Next.js adapter)
2. Creates a `CortexTransport` instance on `compiler.hooks.afterEnvironment`
3. Injects the client script via `HtmlWebpackPlugin` `afterEmit` hook (or `compiler.hooks.compilation` + `html-webpack-plugin` interop)
4. Initializes `EditPipeline` with the transport channel on first connection
5. Writes `.cortex/port` for MCP server discovery (same as Vite adapter)
6. Cleans up transport on `compiler.hooks.shutdown`

### Build Configuration

- New entry in `tsup.config.ts`: `src/adapters/webpack.ts` (external: `webpack`)
- New export in `package.json`: `"./webpack"` pointing to the built adapter
- `webpack` added to `peerDependencies` (optional) and `externals`

### User Experience

**Before:** Cortex only works with Vite and Next.js. Teams on CRA, Angular, or custom webpack can't use it.

**After:** One import, one plugin:
```js
const { cortexWebpack } = require('cortex-editor/webpack')
module.exports = { plugins: [cortexWebpack()] }
```

The editing experience is identical to Vite — same overlay, same shortcuts, same edit pipeline. The adapter is invisible to the user after setup.

**Target users:** Teams on CRA (react-scripts), Angular with webpack, or custom webpack configurations where switching to Vite isn't an option.

---

## Section 7: Resolver Caching

### Problem

`TailwindResolver.getSnapPoints(property)` creates a new `Array.from()` of the lookup Map keys and sorts them on every call. During numeric input scrubbing (e.g., dragging to change padding), this is called dozens of times per second. For projects with extended Tailwind themes (100+ spacing values), the repeated allocation and sorting creates GC pressure that can cause micro-jank.

### Fix

Instance-level `Map<string, string[]>` cache in `TailwindResolver`:

```ts
private snapCache = new Map<string, string[]>()

getSnapPoints(property: string): string[] {
  const cached = this.snapCache.get(property)
  if (cached) return cached

  const propertyMap = this.lookup.get(property)
  if (!propertyMap) return []

  const keys = Array.from(propertyMap.keys())
  const sorted = keys.length > 0 && Number.isNaN(parseFloat(keys[0]!))
    ? keys
    : keys.sort((a, b) => parseFloat(a) - parseFloat(b))

  this.snapCache.set(property, sorted)
  return sorted
}
```

**Cache lifetime:** The lookup Map is immutable after construction. Snap points for a property never change during the resolver's lifetime. The cache is invalidated automatically when a new `TailwindResolver` is created (which happens when the Tailwind config file changes and the Vite adapter restarts the pipeline).

**What is NOT cached:** `findClass()` normalization. The normalizer cost is low (regex + string ops) and the lookup Map provides O(1) after normalization. Caching would add memory overhead for marginal gain.

### User Experience

**Before:** Scrubbing numeric inputs may exhibit micro-jank on projects with large Tailwind configs, particularly on lower-powered devices.

**After:** Scrubbing feels smooth regardless of theme size. The improvement is most noticeable on laptops running on battery or older machines where GC pressure has visible impact. On fast machines, the difference is imperceptible — but the code is cleaner regardless.

---

## Shared Utilities

### `src/browser/focus-utils.ts`

Extracted from `useCanvasZoom.ts` and enhanced with Shadow DOM traversal:

```ts
/** Get the actual focused element, traversing into shadow roots. */
export function getDeepActiveElement(): Element | null {
  let el: Element | null = document.activeElement
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement
  }
  return el
}

/** Is the user currently typing in a text input? */
export function isInputFocused(): boolean {
  const el = getDeepActiveElement()
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

/** Is the focused element inside Cortex's Shadow DOM? */
export function isCortexUIFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const root = el.getRootNode()
  return root instanceof ShadowRoot &&
    (root.host as HTMLElement)?.hasAttribute?.('data-cortex-host')
}
```

`useCanvasZoom.ts` updates to import from this module instead of defining its own `isInputFocused`.

---

## File Inventory

### New Files
- `src/browser/persistence.ts` — localStorage utility
- `src/browser/focus-utils.ts` — shared focus detection utilities
- `src/adapters/webpack.ts` — webpack adapter plugin
- `tests/browser/persistence.test.ts` — localStorage round-trip tests
- `tests/browser/focus-utils.test.ts` — focus detection tests
- `tests/browser/keyboard-shortcuts.test.tsx` — shortcut actions + state guards
- `tests/adapters/webpack.test.ts` — webpack adapter transform + injection

### Modified Files
- `src/browser/selection.ts` — add `isOwnUI` guard to Escape handler
- `src/browser/components/CortexApp.tsx` — composedPath fix, tinykeys registration, cascading Escape, persistence integration
- `src/browser/hooks/useSnapToEdge.ts` — read/write panel position from localStorage
- `src/browser/hooks/useToolbarDock.ts` — read/write toolbar position from localStorage
- `src/browser/hooks/useCanvasZoom.ts` — import shared `isInputFocused` from focus-utils
- `src/browser/components/Toolbar.tsx` — shortcut hints in tooltips
- `src/core/tailwind-resolver.ts` — getSnapPoints cache
- `src/adapters/vite.ts` — configurable toggle shortcut in getClientScript
- `tsup.config.ts` — add webpack entry point
- `package.json` — add tinykeys dep, ./webpack export, webpack peer dep

### Not Modified (read-only reference)
- `src/adapters/next.ts` — pattern reference for webpack adapter
- `src/adapters/next-source-loader.ts` — reused directly by webpack adapter
- `src/core/transport.ts` — used by webpack adapter, no changes needed

---

## Testing Strategy

| Unit | Test Type | Key Cases |
|------|-----------|-----------|
| Escape fixes | Unit | Escape in Shadow DOM input does NOT deselect; Escape outside UI does deselect |
| Cmd+Shift+. | Unit | Toggle on/off; skip when inside Cortex UI; configurable shortcut |
| tinykeys shortcuts | Unit | Each shortcut fires correct action; respects input focus guard; respects Cortex UI guard |
| Cascading Escape | Unit | Each priority level; full cascade sequence; partial cascade |
| localStorage | Unit | Read/write round-trip; corrupt JSON fallback; storage unavailable; clear all |
| Webpack adapter | Unit | Transform applied; client script injected; transport created; cleanup on shutdown |
| Resolver cache | Unit | First call computes; second call returns cached; different properties cached independently |
| Focus utils | Unit | Shadow DOM traversal; input detection; Cortex UI detection |

---

## Out of Scope

- **Dark mode** — not needed for this phase
- **RAF batching for overlays** — handled by ZF0-927
- **FloatingIcon** — remains in ZF0-928
- **Keyboard shortcut help overlay** — optional stretch goal, not in core scope
- **CSS-in-JS rewriting** — future phase
- **3-way merge for stale undo** — future phase
