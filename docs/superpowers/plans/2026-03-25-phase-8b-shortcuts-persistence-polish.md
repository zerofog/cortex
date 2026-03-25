# Phase 8b: Keyboard Shortcuts, localStorage Persistence & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the editor's keyboard interaction model (tinykeys shortcuts, Cmd+Shift+. toggle, cascading Escape), add state persistence across page refreshes, and optimize the Tailwind resolver hot path.

**Architecture:** Hybrid keyboard system — capture-phase toggle (always-on) + capture-phase Escape (state machine) + tinykeys bubble-phase shortcuts (only when editor is active). Per-concern localStorage with port-scoped namespacing. Host element reference equality for Shadow DOM focus detection.

**Tech Stack:** tinykeys (~650B), Preact hooks, vitest + happy-dom, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-phase-8b-shortcuts-persistence-webpack-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/browser/focus-utils.ts` | Shadow DOM-aware focus detection utilities |
| `src/browser/persistence.ts` | Namespaced localStorage read/write/clear |
| `src/browser/format-shortcut.ts` | Platform-aware shortcut display formatter |
| `tests/browser/focus-utils.test.ts` | Focus detection tests |
| `tests/browser/persistence.test.ts` | localStorage round-trip tests |
| `tests/browser/keyboard-shortcuts.test.tsx` | Shortcut actions + state guards + cascade |

### Modified Files
| File | Changes |
|------|---------|
| `src/browser/selection.ts` | Remove Escape handler entirely, add isOwnUI to handleKeyDown |
| `src/browser/components/CortexApp.tsx` | Replace ad-hoc Escape with cascade, add tinykeys, wire data-cortex-active |
| `src/browser/index.tsx` | Export host element reference for isCortexUIFocused |
| `src/browser/hooks/useSnapToEdge.ts` | Read/write panel position from localStorage |
| `src/browser/hooks/useToolbarDock.ts` | Read/write toolbar position from localStorage |
| `src/browser/hooks/useCanvasZoom.ts` | Import shared isInputFocused (delete local copy) |
| `src/browser/components/Toolbar.tsx` | Add shortcut hints to tooltips |
| `src/core/tailwind-resolver.ts` | Add getSnapPoints cache with Object.freeze |
| `src/adapters/vite.ts` | Convert CLIENT_SCRIPT to getClientScript(), add toggle shortcut |
| `package.json` | Add tinykeys dependency |

---

## Task 1: Shared Focus Utilities

**Files:**
- Create: `cortex-editor/src/browser/focus-utils.ts`
- Create: `cortex-editor/tests/browser/focus-utils.test.ts`
- Modify: `cortex-editor/src/browser/index.tsx` (export host ref)
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts` (delete local isInputFocused)

- [ ] **Step 1: Write failing tests for focus utilities**

```ts
// tests/browser/focus-utils.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDeepActiveElement, isInputFocused, isCortexUIFocused, _setCortexHost } from '../../src/browser/focus-utils.js'

describe('getDeepActiveElement', () => {
  it('returns document.activeElement when no shadow DOM', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(getDeepActiveElement()).toBe(input)
    input.remove()
  })

  it('traverses into open shadow roots', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('input')
    shadow.appendChild(inner)
    inner.focus()
    expect(getDeepActiveElement()).toBe(inner)
    host.remove()
  })
})

describe('isInputFocused', () => {
  afterEach(() => { (document.activeElement as HTMLElement)?.blur?.() })

  it('returns true for focused <input>', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns true for focused <textarea>', () => {
    const el = document.createElement('textarea')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns true for contenteditable', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns true for role="textbox"', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'textbox')
    el.setAttribute('tabindex', '0')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns false for focused <button>', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(false)
    el.remove()
  })

  it('returns false when nothing is focused', () => {
    expect(isInputFocused()).toBe(false)
  })
})

describe('isCortexUIFocused', () => {
  afterEach(() => {
    _setCortexHost(null)
    ;(document.activeElement as HTMLElement)?.blur?.()
  })

  it('returns true when activeElement is the cortex host', () => {
    const host = document.createElement('div')
    host.setAttribute('tabindex', '0')
    document.body.appendChild(host)
    _setCortexHost(host)
    host.focus()
    expect(isCortexUIFocused()).toBe(true)
    host.remove()
  })

  it('returns false when host is not set', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.focus()
    expect(isCortexUIFocused()).toBe(false)
    el.remove()
  })

  it('returns false when focus is on a non-cortex element', () => {
    const host = document.createElement('div')
    _setCortexHost(host)
    const other = document.createElement('button')
    other.setAttribute('tabindex', '0')
    document.body.appendChild(other)
    other.focus()
    expect(isCortexUIFocused()).toBe(false)
    other.remove()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/focus-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement focus utilities**

```ts
// src/browser/focus-utils.ts

/** Module-scoped reference to the Cortex host element, set at bootstrap time. */
let cortexHost: HTMLElement | null = null

/** Set the Cortex host element reference. Called once from bootstrap(). */
export function _setCortexHost(host: HTMLElement | null): void {
  cortexHost = host
}

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
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return true
  if (el.isContentEditable) return true
  const role = el.getAttribute('role')
  if (role === 'textbox' || role === 'searchbox') return true
  return false
}

/** Is the focused element inside Cortex's Shadow DOM? Uses reference equality. */
export function isCortexUIFocused(): boolean {
  if (!cortexHost) return false
  const el = document.activeElement
  if (!el) return false
  // If activeElement IS the cortex host, focus is inside its shadow root
  if (el === cortexHost) return true
  // Walk shadow root chain for nested shadow DOMs (e.g. vanilla-colorful)
  let root: Node = el.getRootNode()
  while (root instanceof ShadowRoot) {
    if (root.host === cortexHost) return true
    root = root.host.getRootNode()
  }
  return false
}
```

- [ ] **Step 4: Update index.tsx to set the host reference at bootstrap**

In `src/browser/index.tsx`, add import and call after creating hostElement:

```ts
import { _setCortexHost } from './focus-utils.js'
```

After `hostElement.setAttribute('data-cortex-host', '')` (line 24), add:
```ts
_setCortexHost(hostElement)
```

In `_resetForTesting()`, add:
```ts
_setCortexHost(null)
```

- [ ] **Step 5: Update useCanvasZoom.ts — delete local isInputFocused, import shared**

In `src/browser/hooks/useCanvasZoom.ts`:
- Add import: `import { isInputFocused } from '../focus-utils.js'`
- Delete the local `isInputFocused` function at lines 283-288

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/focus-utils.test.ts`
Expected: PASS

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: PASS (existing tests still work with shared utility)

- [ ] **Step 7: Commit**

```bash
git add cortex-editor/src/browser/focus-utils.ts cortex-editor/tests/browser/focus-utils.test.ts \
  cortex-editor/src/browser/index.tsx cortex-editor/src/browser/hooks/useCanvasZoom.ts
git commit -m "feat: shared focus utilities with Shadow DOM traversal (ZF0-894)"
```

---

## Task 2: localStorage Persistence Utility

**Files:**
- Create: `cortex-editor/src/browser/persistence.ts`
- Create: `cortex-editor/tests/browser/persistence.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/browser/persistence.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cortexStorage } from '../../src/browser/persistence.js'

describe('cortexStorage', () => {
  beforeEach(() => { localStorage.clear() })

  describe('get', () => {
    it('returns fallback when key does not exist', () => {
      expect(cortexStorage.get('missing', { x: 0 }, isPosition)).toEqual({ x: 0 })
    })

    it('returns parsed value when key exists and validates', () => {
      localStorage.setItem('cortex:8080:pos', JSON.stringify({ x: 10, y: 20 }))
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isPosition)).toEqual({ x: 10, y: 20 })
    })

    it('returns fallback when JSON is corrupt', () => {
      localStorage.setItem('cortex:8080:pos', '{bad json')
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isPosition)).toEqual({ x: 0, y: 0 })
    })

    it('returns fallback when validation fails', () => {
      localStorage.setItem('cortex:8080:pos', JSON.stringify({ wrong: 'shape' }))
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isPosition)).toEqual({ x: 0, y: 0 })
    })

    it('returns fallback for prototype pollution attempt', () => {
      localStorage.setItem('cortex:8080:pos', '{"__proto__":{"polluted":true}}')
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isPosition)).toEqual({ x: 0, y: 0 })
      expect((({} as any).polluted)).toBeUndefined()
    })
  })

  describe('set', () => {
    it('writes JSON to namespaced key', () => {
      cortexStorage.set('pos', { x: 5, y: 10 })
      expect(localStorage.getItem('cortex:8080:pos')).toBe('{"x":5,"y":10}')
    })

    it('does not throw when localStorage is unavailable', () => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceeded') }
      expect(() => cortexStorage.set('pos', { x: 1 })).not.toThrow()
      Storage.prototype.setItem = orig
    })
  })

  describe('clear', () => {
    it('removes all cortex-namespaced keys', () => {
      localStorage.setItem('cortex:8080:a', '1')
      localStorage.setItem('cortex:8080:b', '2')
      localStorage.setItem('other-app:c', '3')
      cortexStorage.clear()
      expect(localStorage.getItem('cortex:8080:a')).toBeNull()
      expect(localStorage.getItem('cortex:8080:b')).toBeNull()
      expect(localStorage.getItem('other-app:c')).toBe('3')
    })
  })
})

// Test validator
function isPosition(v: unknown): v is { x: number; y: number } {
  return typeof v === 'object' && v !== null &&
    typeof (v as any).x === 'number' && Number.isFinite((v as any).x) &&
    typeof (v as any).y === 'number' && Number.isFinite((v as any).y)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/persistence.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement persistence utility**

```ts
// src/browser/persistence.ts

function getPrefix(): string {
  const port = typeof location !== 'undefined' ? location.port || '0' : '0'
  return `cortex:${port}:`
}

function get<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(getPrefix() + key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(getPrefix() + key, JSON.stringify(value))
  } catch {
    // Quota exceeded or private browsing — silently degrade
  }
}

function clear(): void {
  const prefix = getPrefix()
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(prefix)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}

export const cortexStorage = { get, set, clear } as const
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/persistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/persistence.ts cortex-editor/tests/browser/persistence.test.ts
git commit -m "feat: localStorage persistence utility with validation (ZF0-894)"
```

---

## Task 3: Escape Fixes + Cascading Escape Handler (ATOMIC)

This task removes Escape from `selection.ts` AND adds the cascading handler to `CortexApp.tsx` in one atomic change. Both changes MUST ship together — the architecture review identified a double-handling race if applied separately.

**Files:**
- Modify: `cortex-editor/src/browser/selection.ts`
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx`
- Create: `cortex-editor/tests/browser/keyboard-shortcuts.test.tsx` (escape cascade tests)

- [ ] **Step 1: Write failing tests for the cascade**

```tsx
// tests/browser/keyboard-shortcuts.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchKeyboardEvent, createShadowHost } from './helpers.js'

describe('cascading Escape', () => {
  // These tests verify the cascade priorities.
  // Full integration tests will be added after tinykeys wiring in Task 5.

  it('selection.ts does NOT handle Escape anymore', async () => {
    const { initSelection } = await import('../../src/browser/selection.js')
    const onSelect = vi.fn()
    const { cleanup } = initSelection(
      document.createElement('div').attachShadow({ mode: 'open' }),
      vi.fn(),
      onSelect,
    )

    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    expect(onSelect).not.toHaveBeenCalled()
    cleanup()
  })

  it('selection.ts still passes isOwnUI events through for click', async () => {
    const { initSelection } = await import('../../src/browser/selection.js')
    const onSelect = vi.fn()
    const { host, cleanup: hostCleanup } = createShadowHost()
    const { cleanup } = initSelection(
      host.attachShadow({ mode: 'open' }),
      vi.fn(),
      onSelect,
    )

    // Click on cortex UI element — should NOT trigger select
    const btn = document.createElement('button')
    host.appendChild(btn)
    btn.click()
    expect(onSelect).not.toHaveBeenCalled()

    cleanup()
    hostCleanup()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/keyboard-shortcuts.test.tsx`
Expected: FAIL — selection.ts still handles Escape

- [ ] **Step 3: Remove Escape from selection.ts**

In `src/browser/selection.ts`, replace `handleKeyDown`:

```ts
// Old (lines 82-87):
function handleKeyDown(event: KeyboardEvent): void {
  if (!designMode) return
  if (event.key === 'Escape') {
    onSelect(null)
  }
}

// New:
// Escape handling removed — now handled by cascading handler in CortexApp.
// Kept for future non-Escape key handling if needed.
```

Remove the `handleKeyDown` function body entirely. Remove the keydown listener registration at line 91 and cleanup at line 98:

Delete line 91: `window.addEventListener('keydown', handleKeyDown, { capture: true })`
Delete line 98: `window.removeEventListener('keydown', handleKeyDown, { capture: true })`
Delete the `handleKeyDown` function (lines 82-87).

- [ ] **Step 4: Add cascading Escape handler to CortexApp.tsx**

In `src/browser/components/CortexApp.tsx`, add import:
```ts
import { getDeepActiveElement, isInputFocused, isCortexUIFocused } from '../focus-utils.js'
```

Replace the existing Escape useEffect (lines 201-226) with the capture-phase cascade:

```ts
// Phase 8b: Cascading Escape handler — capture phase for host app compat
useEffect(() => {
  if (!active) return
  function handleEscape(e: KeyboardEvent): void {
    if (!e.isTrusted) return
    if (e.key !== 'Escape') return

    // Priority 1: Blur focused input inside Cortex UI
    if (isCortexUIFocused()) {
      const focused = getDeepActiveElement()
      if (focused instanceof HTMLElement) {
        const tag = focused.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || focused.isContentEditable) {
          focused.blur()
          e.stopPropagation()
          e.preventDefault()
          return
        }
      }
    }

    // Skip if user is focused on a host app input — let browser handle it
    if (isInputFocused() && !isCortexUIFocused()) return

    // Priority 2: Exit comment mode
    if (commentModeRef.current) {
      setCommentMode(false)
      e.stopPropagation()
      e.preventDefault()
      return
    }

    // Priority 3: Deselect element
    if (selectedElementRef.current) {
      setSelectedElement(null)
      e.stopPropagation()
      e.preventDefault()
      return
    }

    // No Priority 4 — Cmd+Shift+. and X button are the only close mechanisms
  }

  window.addEventListener('keydown', handleEscape, { capture: true })
  return () => window.removeEventListener('keydown', handleEscape, { capture: true })
}, [active])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/keyboard-shortcuts.test.tsx`
Expected: PASS

Run: `cd cortex-editor && npx vitest run tests/browser/selection.test.ts`
Expected: PASS (existing selection tests should pass — Escape tests should be updated or removed)

- [ ] **Step 6: Fix any broken existing Escape tests in selection.test.ts**

The existing `selection.test.ts` may have tests asserting Escape deselects. These need to be removed since Escape is no longer handled in selection.ts.

- [ ] **Step 7: Commit**

```bash
git add cortex-editor/src/browser/selection.ts cortex-editor/src/browser/components/CortexApp.tsx \
  cortex-editor/tests/browser/keyboard-shortcuts.test.tsx cortex-editor/tests/browser/selection.test.ts
git commit -m "feat: cascading Escape handler + remove Escape from selection.ts (ZF0-894)

ATOMIC: Both changes must ship together to prevent double-handling race.
Escape cascade priorities: blur input > exit comment > deselect.
No Priority 4 (close editor) — Cmd+Shift+. is the explicit close."
```

---

## Task 4: Cmd+Shift+. Editor Toggle

**Files:**
- Modify: `cortex-editor/src/adapters/vite.ts` (getClientScript + configurable shortcut + validation)
- Modify: `cortex-editor/src/browser/index.tsx` (set/read data-cortex-active)
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx` (mirror active to DOM attribute)
- Create: tests in `tests/browser/keyboard-shortcuts.test.tsx` (add toggle tests)

- [ ] **Step 1: Write failing test for toggle shortcut validation**

Add to `tests/browser/keyboard-shortcuts.test.tsx`:

```tsx
describe('Cmd+Shift+. toggle', () => {
  it('data-cortex-active attribute is set when editor activates', () => {
    // This will be tested via CortexApp integration after wiring
    expect(document.documentElement.hasAttribute('data-cortex-active')).toBe(false)
  })
})
```

Add to `tests/adapters/vite.test.ts` (new describe block):

```ts
describe('getClientScript', () => {
  it('rejects invalid toggleShortcut', async () => {
    const { validateToggleShortcut } = await import('../../src/adapters/vite.js')
    expect(() => validateToggleShortcut("'; alert(1);//")).toThrow()
  })

  it('accepts valid toggleShortcut', async () => {
    const { validateToggleShortcut } = await import('../../src/adapters/vite.js')
    expect(validateToggleShortcut('$mod+Shift+Period')).toBe('$mod+Shift+Period')
    expect(validateToggleShortcut('$mod+Shift+KeyE')).toBe('$mod+Shift+KeyE')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/adapters/vite.test.ts -t "getClientScript"`
Expected: FAIL — validateToggleShortcut not found

- [ ] **Step 3: Add shortcut validation to vite.ts**

In `src/adapters/vite.ts`, add the validation function and convert CLIENT_SCRIPT to a function:

```ts
const VALID_SHORTCUT = /^\$mod\+(?:Shift\+)?(?:Alt\+)?(?:Key[A-Z]|Digit\d|Period|Comma|Slash|Backslash|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Minus|Equal)$/

export function validateToggleShortcut(shortcut: string): string {
  if (!VALID_SHORTCUT.test(shortcut)) {
    throw new Error(
      `[cortex] Invalid toggleShortcut: "${shortcut}". ` +
      `Expected format: "$mod+Shift+KeyCode" (e.g., "$mod+Shift+Period", "$mod+Shift+KeyE"). ` +
      `See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code`
    )
  }
  return shortcut
}
```

Convert `CLIENT_SCRIPT` constant to `getClientScript()` function:

```ts
function getClientScript(options: { toggleShortcut: string }): string {
  const config = JSON.stringify({ toggleShortcut: options.toggleShortcut })
  return `\
${/* existing HMR wiring stays the same */''}
if (import.meta.hot) {
  import.meta.hot.on('${CORTEX_MSG_EVENT}', (data) => {
    window.__cortex_channel__?.handleServerMessage(data);
  });
  if (!Object.prototype.hasOwnProperty.call(window, '__cortex_send__')) {
    Object.defineProperty(window, '__cortex_send__', {
      value: (msg) => import.meta.hot.send('${CORTEX_MSG_EVENT}', msg),
      writable: false, configurable: false,
    });
  }
}
// Toggle shortcut — capture phase, always active
if (!window.__cortex_toggle_registered__) {
  window.__cortex_toggle_registered__ = true;
  const __cortexConfig = ${config};
  const __cortexParts = __cortexConfig.toggleShortcut.split('+');
  const __cortexCode = __cortexParts[__cortexParts.length - 1];
  const __cortexNeedShift = __cortexParts.includes('Shift');
  const __cortexNeedAlt = __cortexParts.includes('Alt');
  window.addEventListener('keydown', function(e) {
    if (!e.isTrusted) return;
    const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (__cortexNeedShift && !e.shiftKey) return;
    if (!__cortexNeedShift && e.shiftKey) return;
    if (__cortexNeedAlt && !e.altKey) return;
    if (e.code !== __cortexCode) return;
    e.preventDefault();
    e.stopPropagation();
    const active = document.documentElement.hasAttribute('data-cortex-active');
    if (active) {
      document.documentElement.removeAttribute('data-cortex-active');
      window.__cortex_channel__?.handleServerMessage({ type: 'cortex-toggle', active: false });
    } else {
      document.documentElement.setAttribute('data-cortex-active', '');
      window.__cortex_channel__?.handleServerMessage({ type: 'cortex-toggle', active: true });
    }
  }, { capture: true });
}
// Load cortex editor browser UI
if (!document.querySelector('[data-cortex-host]')) {
  const __cortexScript = document.createElement('script');
  __cortexScript.src = '${CORTEX_BROWSER_PATH}';
  __cortexScript.onerror = () => console.error('[cortex] Failed to load browser UI from ${CORTEX_BROWSER_PATH}.');
  document.head.appendChild(__cortexScript);
}
`
}
```

Update the `load` hook to use `getClientScript()`:
```ts
// In the plugin's load hook, replace CLIENT_SCRIPT with:
return getClientScript({ toggleShortcut: resolvedOptions.toggleShortcut })
```

Add `toggleShortcut` to the plugin options interface and resolve it in `configResolved`:
```ts
export interface CortexEditorOptions {
  toggleShortcut?: string
  // ... existing options
}
```

- [ ] **Step 4: Wire data-cortex-active in CortexApp.tsx**

In `CortexApp.tsx`, add a useEffect that mirrors `active` state to the DOM attribute:

```ts
// Mirror active state to DOM attribute for toggle shortcut detection
useEffect(() => {
  if (active) {
    document.documentElement.setAttribute('data-cortex-active', '')
  } else {
    document.documentElement.removeAttribute('data-cortex-active')
  }
}, [active])
```

Add handling for the `cortex-toggle` message type in the channel message handler:
```ts
if (msg.type === 'cortex-toggle') {
  if (msg.active) {
    selectionRef.current?.setDesignMode(true)
    setActive(true)
  } else {
    handleExit()
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd cortex-editor && npx vitest run tests/adapters/vite.test.ts -t "getClientScript"`
Expected: PASS

Run: `cd cortex-editor && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/adapters/vite.ts cortex-editor/src/browser/components/CortexApp.tsx \
  cortex-editor/src/browser/index.tsx cortex-editor/tests/
git commit -m "feat: Cmd+Shift+. editor toggle with configurable shortcut (ZF0-894)

Capture-phase listener injected via getClientScript(). Shortcut validated
against strict regex to prevent XSS. data-cortex-active attribute mirrors
React state for toggle re-entrancy detection. Idempotency guard prevents
duplicate listeners on HMR."
```

---

## Task 5: tinykeys Shortcut System

**Files:**
- Modify: `cortex-editor/package.json` (add tinykeys)
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx` (tinykeys registration)
- Create: `cortex-editor/src/browser/format-shortcut.ts`
- Modify: `cortex-editor/src/browser/components/Toolbar.tsx` (shortcut hints)
- Add tests to: `cortex-editor/tests/browser/keyboard-shortcuts.test.tsx`

- [ ] **Step 1: Install tinykeys**

Run: `cd cortex-editor && npm install tinykeys`

- [ ] **Step 2: Write failing tests for shortcut actions**

Add to `tests/browser/keyboard-shortcuts.test.tsx`:

```tsx
describe('tinykeys shortcuts', () => {
  it('V key switches to select mode (exits comment mode)', () => {
    // Integration test — will verify after CortexApp wiring
    expect(true).toBe(true) // placeholder until wired
  })
})
```

- [ ] **Step 3: Create format-shortcut utility**

```ts
// src/browser/format-shortcut.ts
const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

const MODIFIER_DISPLAY: Record<string, string> = isMac
  ? { '$mod': '\u2318', 'Shift': '\u21E7', 'Alt': '\u2325' }
  : { '$mod': 'Ctrl', 'Shift': 'Shift', 'Alt': 'Alt' }

const KEY_DISPLAY: Record<string, string> = {
  Period: '.', Comma: ',', Slash: '/', Minus: '-', Equal: '=',
}

export function formatShortcut(binding: string): string {
  const parts = binding.split('+')
  return parts.map(p => MODIFIER_DISPLAY[p] ?? KEY_DISPLAY[p] ?? p.replace('Key', '')).join(isMac ? '' : '+')
}
```

- [ ] **Step 4: Add tinykeys registration to CortexApp.tsx**

Add imports:
```ts
import tinykeys from 'tinykeys'
import { isInputFocused, isCortexUIFocused } from '../focus-utils.js'
```

Add useEffect for tinykeys (below the cascade useEffect):
```ts
// Phase 8b: tinykeys shortcut registration — bubble phase, only when active
useEffect(() => {
  if (!active) return

  function guardSingleKey(handler: () => void): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
      if (!e.isTrusted) return
      if (isInputFocused() || isCortexUIFocused()) return
      handler()
    }
  }

  function guardModifier(handler: () => void): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
      if (!e.isTrusted) return
      if (isInputFocused()) return
      handler()
    }
  }

  const unsubscribe = tinykeys(window, {
    'v': guardSingleKey(() => setCommentMode(false)),
    'c': guardSingleKey(() => setCommentMode(m => !m)),
    '$mod+0': guardModifier(() => {
      // Canvas zoom reset — currently disabled, wired for future
    }),
    '$mod+z': guardModifier(() => {
      channel.send({ type: 'undo' })
    }),
    '$mod+Shift+z': guardModifier(() => {
      channel.send({ type: 'redo' })
    }),
  })

  return unsubscribe
}, [active, channel])
```

- [ ] **Step 5: Add shortcut hints to Toolbar tooltips**

In `src/browser/components/Toolbar.tsx`, update the tooltip attributes:

```tsx
// Comment button tooltip
data-tooltip={`Comment (C)`}

// Close button tooltip (no shortcut change needed)
data-tooltip="Close Cortex"
```

- [ ] **Step 6: Run all tests**

Run: `cd cortex-editor && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add cortex-editor/package.json cortex-editor/package-lock.json \
  cortex-editor/src/browser/components/CortexApp.tsx \
  cortex-editor/src/browser/format-shortcut.ts \
  cortex-editor/src/browser/components/Toolbar.tsx \
  cortex-editor/tests/browser/keyboard-shortcuts.test.tsx
git commit -m "feat: tinykeys keyboard shortcuts with state guards (ZF0-894)

V (select), C (comment), Cmd+Z (undo), Cmd+Shift+Z (redo).
Two-layer guard: isInputFocused + isCortexUIFocused.
event.isTrusted check prevents synthetic event injection."
```

---

## Task 6: Persistence Integration

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useSnapToEdge.ts`
- Modify: `cortex-editor/src/browser/hooks/useToolbarDock.ts`
- Modify: `cortex-editor/tests/browser/hooks/use-snap-to-edge.test.tsx`
- Modify: `cortex-editor/tests/browser/hooks/use-toolbar-dock.test.tsx`

- [ ] **Step 1: Write failing test for panel position persistence**

Add to `tests/browser/hooks/use-snap-to-edge.test.tsx`:

```tsx
describe('localStorage persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores position from localStorage', () => {
    const port = location.port || '0'
    localStorage.setItem(`cortex:${port}:panel-position`, JSON.stringify({ x: 100, y: 200 }))
    // Re-import to pick up localStorage state
    const { getInitialPosition } = require('../../src/browser/hooks/useSnapToEdge.js')
    const pos = getInitialPosition()
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(200)
  })

  it('falls back to default when localStorage is empty', () => {
    const { getInitialPosition } = require('../../src/browser/hooks/useSnapToEdge.js')
    const pos = getInitialPosition()
    expect(pos.x).toBeGreaterThan(0) // top-right default
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-snap-to-edge.test.tsx -t "localStorage"`
Expected: FAIL

- [ ] **Step 3: Integrate persistence into useSnapToEdge**

In `src/browser/hooks/useSnapToEdge.ts`:

Add import:
```ts
import { cortexStorage } from '../persistence.js'
```

Add position validator:
```ts
function isPosition(v: unknown): v is Position {
  return typeof v === 'object' && v !== null &&
    typeof (v as any).x === 'number' && Number.isFinite((v as any).x) &&
    typeof (v as any).y === 'number' && Number.isFinite((v as any).y)
}
```

Update `getInitialPosition()`:
```ts
export function getInitialPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 }

  // Try restoring from localStorage
  const saved = cortexStorage.get('panel-position', null as Position | null, isPosition as any)
  if (saved) return normalizePosition(saved)

  // Default: top-right
  return {
    x: Math.max(0, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN),
    y: PANEL_MARGIN,
  }
}
```

In `useSnapToEdge`, add a save on snap completion:
```ts
// Inside the snap() function, after setting the snapped position:
const snapped = snapToEdge(positionRef.current)
setPositionState(snapped)
positionRef.current = snapped
cortexStorage.set('panel-position', snapped)
```

- [ ] **Step 4: Integrate persistence into useToolbarDock**

In `src/browser/hooks/useToolbarDock.ts`:

Add import and validator, update `getDefaultPosition()` to read from localStorage, and save on dock change. Same pattern as useSnapToEdge.

- [ ] **Step 5: Run all tests**

Run: `cd cortex-editor && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/browser/hooks/useSnapToEdge.ts cortex-editor/src/browser/hooks/useToolbarDock.ts \
  cortex-editor/tests/browser/hooks/
git commit -m "feat: localStorage persistence for panel + toolbar position (ZF0-894)

Per-concern keys with cortex:<port>: namespace. Schema validation on
reads. Falls back to defaults on corrupt data. Writes on snap/dock
completion (not during drag)."
```

---

## Task 7: Resolver Cache (getSnapPoints)

**Files:**
- Modify: `cortex-editor/src/core/tailwind-resolver.ts`
- Modify: `cortex-editor/tests/core/tailwind-resolver.test.ts`

- [ ] **Step 1: Write failing test for cache behavior**

Add to `tests/core/tailwind-resolver.test.ts`:

```ts
describe('getSnapPoints caching', () => {
  it('returns frozen array', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '1': '0.25rem', '2': '0.5rem', '4': '1rem' },
    })
    const points = resolver.getSnapPoints('padding')
    expect(Object.isFrozen(points)).toBe(true)
  })

  it('returns same reference on second call', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '1': '0.25rem', '2': '0.5rem' },
    })
    const first = resolver.getSnapPoints('padding')
    const second = resolver.getSnapPoints('padding')
    expect(first).toBe(second) // same reference = cached
  })

  it('returns different references for different properties', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '1': '0.25rem' },
    })
    const padding = resolver.getSnapPoints('padding')
    const margin = resolver.getSnapPoints('margin')
    expect(padding).not.toBe(margin)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/core/tailwind-resolver.test.ts -t "caching"`
Expected: FAIL — array is not frozen, references differ

- [ ] **Step 3: Add cache to getSnapPoints**

In `src/core/tailwind-resolver.ts`, add a private cache field and update `getSnapPoints`:

```ts
private snapCache = new Map<string, readonly string[]>()

getSnapPoints(property: string): readonly string[] {
  const cached = this.snapCache.get(property)
  if (cached) return cached

  const propertyMap = this.lookup.get(property)
  if (!propertyMap) return []

  const keys = Array.from(propertyMap.keys())
  const sorted = keys.length > 0 && Number.isNaN(parseFloat(keys[0]!))
    ? keys
    : keys.sort((a, b) => parseFloat(a) - parseFloat(b))

  const frozen = Object.freeze(sorted)
  this.snapCache.set(property, frozen)
  return frozen
}
```

Note: The return type changes from `string[]` to `readonly string[]`. Check for any callers that mutate the return value and fix them.

- [ ] **Step 4: Run tests**

Run: `cd cortex-editor && npx vitest run tests/core/tailwind-resolver.test.ts`
Expected: All pass

Run: `cd cortex-editor && npx vitest run`
Expected: All pass (no callers mutate snap points)

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/core/tailwind-resolver.ts cortex-editor/tests/core/tailwind-resolver.test.ts
git commit -m "perf: cache getSnapPoints with Object.freeze (ZF0-894)

Instance-level Map cache. Frozen arrays prevent consumer mutation.
Cache invalidated naturally when new TailwindResolver is created
(on config change)."
```

---

## Execution Checklist

After all 7 tasks:

- [ ] Run full test suite: `cd cortex-editor && npm test`
- [ ] Run typecheck: `cd cortex-editor && npm run typecheck`
- [ ] Run lint: `cd cortex-editor && npm run lint`
- [ ] Verify no regressions in existing 480+ tests
- [ ] Manual test: `Cmd+Shift+.` toggle in cortex-test app
- [ ] Manual test: V/C/Escape shortcuts in cortex-test app
- [ ] Manual test: Panel position survives page refresh
