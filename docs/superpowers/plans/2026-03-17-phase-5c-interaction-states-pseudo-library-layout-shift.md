# Phase 5c: Interaction States, Pseudo-Elements, Library Components, Layout Shift

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add state lens (hover/focus/active toggles on selection overlay), pseudo-element tabs, library component detection, and layout shift tracking to the Cortex visual editor.

**Architecture:** State detection via CSSOM inspection, state forcing via CSS overrides with separate internal map, pseudo-element selector support in CSSOverrideManager, library detection from `data-cortex-source` paths, layout shift tracking via document-relative coordinates in existing RAF loop with scroll cooldown.

**Tech Stack:** Preact, Shadow DOM, vitest + happy-dom, BEM CSS

**Spec:** `docs/superpowers/specs/2026-03-17-phase-5c-interaction-states-pseudo-library-layout-shift-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/browser/state-detector.ts` | CREATE | CSSOM inspection: `detectStates(element)` → `StateDeclarations` |
| `src/browser/override.ts` | MODIFY | Add `stateOverrides` map, `setStateOverrides`/`clearStateOverrides`, pseudo-element support in `set`/`remove`/`rebuild` |
| `src/browser/label.ts` | MODIFY | Add `isLibraryComponent()`, `findUserAncestor()` |
| `src/browser/components/SelectionOverlay.tsx` | MODIFY | State lens UI (controls above/below element), layout shift tracking (document-relative, 400ms debounce, 1s cooldown) |
| `src/browser/components/PanelHeader.tsx` | MODIFY | Pseudo-element tabs, library badge |
| `src/browser/components/Panel.tsx` | MODIFY | `activeState`/`activePseudo` props, `defaultComputedStyles` snapshot, dimming logic, `computedStyles` useMemo deps |
| `src/browser/components/CortexApp.tsx` | MODIFY | State orchestration: `detectStates` on selection, `activeState` management, wire lens ↔ panel |
| `src/browser/hooks/useSnapToEdge.ts` | MODIFY | Add `recheckOverlap(elementRect)` |
| `src/browser/styles.css` | MODIFY | State lens, pseudo tabs, library badge, dimmed classes |
| `tests/browser/state-detector.test.ts` | CREATE | CSSOM inspection tests |
| `tests/browser/override.test.ts` | MODIFY | State override + pseudo selector tests |
| `tests/browser/label.test.ts` | MODIFY | Library detection tests |
| `tests/browser/selection-overlay.test.tsx` | MODIFY | State lens + layout shift tests |
| `tests/browser/panel-header.test.tsx` | MODIFY | Pseudo tabs + library badge tests |
| `tests/browser/panel.test.tsx` | MODIFY | activeState/activePseudo/dimming tests |

---

## Task 1: State Detector — CSSOM Inspection

**Files:**
- Create: `cortex-editor/src/browser/state-detector.ts`
- Create: `cortex-editor/tests/browser/state-detector.test.ts`

This is a standalone utility with no dependencies on other new code. Pure function, easy to test.

- [ ] **Step 1: Write test file with all test cases**

```typescript
// tests/browser/state-detector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectStates } from '../../src/browser/state-detector.js'
import type { StateDeclarations } from '../../src/browser/state-detector.js'

describe('detectStates', () => {
  let styleEl: HTMLStyleElement
  let target: HTMLElement

  beforeEach(() => {
    styleEl = document.createElement('style')
    document.head.appendChild(styleEl)
    target = document.createElement('button')
    target.className = 'btn'
    document.body.appendChild(target)
  })

  afterEach(() => {
    styleEl.remove()
    target.remove()
  })

  it('returns empty maps when no state rules exist', () => {
    styleEl.textContent = '.btn { color: red; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.size).toBe(0)
    expect(result.active.size).toBe(0)
  })

  it('detects :hover declarations for matching element', () => {
    styleEl.textContent = '.btn:hover { background: blue; color: white; }'
    const result = detectStates(target)
    expect(result.hover.get('background')).toBe('blue')
    expect(result.hover.get('color')).toBe('white')
    expect(result.focus.size).toBe(0)
    expect(result.active.size).toBe(0)
  })

  it('detects :focus and :active independently', () => {
    styleEl.textContent = `
      .btn:focus { outline: 2px solid blue; }
      .btn:active { transform: scale(0.95); }
    `
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.get('outline')).toBe('2px solid blue')
    expect(result.active.get('transform')).toBe('scale(0.95)')
  })

  it('ignores rules that do not match the element', () => {
    styleEl.textContent = '.other:hover { color: red; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
  })

  it('later rules override earlier ones for same property', () => {
    styleEl.textContent = `
      .btn:hover { color: red; }
      .btn:hover { color: blue; }
    `
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('blue')
  })

  it('skips rules with pseudo-element selectors (::before, ::after)', () => {
    styleEl.textContent = '.btn:hover::before { content: "x"; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
  })

  it('recurses into @media rules', () => {
    styleEl.textContent = '@media (min-width: 0px) { .btn:hover { color: green; } }'
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('green')
  })

  it('recurses into @supports rules', () => {
    styleEl.textContent = '@supports (display: flex) { .btn:hover { display: flex; } }'
    const result = detectStates(target)
    expect(result.hover.get('display')).toBe('flex')
  })

  it('recurses into @layer rules', () => {
    styleEl.textContent = '@layer base { .btn:hover { opacity: 0.8; } }'
    const result = detectStates(target)
    expect(result.hover.get('opacity')).toBe('0.8')
  })

  it('handles cross-origin stylesheets gracefully (no throw)', () => {
    // happy-dom doesn't truly simulate cross-origin, but we verify no crash
    const result = detectStates(target)
    expect(result).toBeDefined()
  })

  it('handles descendant selectors: .parent:hover .child', () => {
    const parent = document.createElement('div')
    parent.className = 'parent'
    const child = document.createElement('span')
    child.className = 'child'
    parent.appendChild(child)
    document.body.appendChild(parent)

    styleEl.textContent = '.parent:hover .child { color: red; }'
    const result = detectStates(child)
    expect(result.hover.get('color')).toBe('red')

    parent.remove()
  })

  it('drops compound pseudo-class rules when stripped selector does not match', () => {
    // .btn:hover:focus → strip :hover → .btn:focus → element not focused → no match
    styleEl.textContent = '.btn:hover:focus { color: purple; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.size).toBe(0)
  })

  it('validates VALID_PROPERTY and VALID_VALUE on extracted declarations', () => {
    // Declarations from CSSOM are browser-parsed, but we validate anyway
    styleEl.textContent = '.btn:hover { color: red; }'
    const result = detectStates(target)
    expect(result.hover.has('color')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/state-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement state-detector.ts**

```typescript
// src/browser/state-detector.ts

/** Allowlist for CSS property names (same as override.ts) */
const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/
/** Allowlist for CSS values */
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%]+$/
/** Reject url() values */
const REJECT_URL = /url\s*\(/i

export interface StateDeclarations {
  hover: Map<string, string>
  focus: Map<string, string>
  active: Map<string, string>
}

type StateName = 'hover' | 'focus' | 'active'

const STATE_PSEUDOS: readonly StateName[] = ['hover', 'focus', 'active'] as const

/**
 * Inspect all document stylesheets to find :hover/:focus/:active rules
 * matching the given element. Returns declarations grouped by state.
 */
export function detectStates(element: HTMLElement): StateDeclarations {
  const result: StateDeclarations = {
    hover: new Map(),
    focus: new Map(),
    active: new Map(),
  }

  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin stylesheet
    }
    collectFromRules(rules, element, result)
  }

  return result
}

function collectFromRules(
  rules: CSSRuleList,
  element: HTMLElement,
  result: StateDeclarations,
): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      processStyleRule(rule, element, result)
    } else if (
      rule instanceof CSSMediaRule ||
      rule instanceof CSSSupportsRule ||
      rule instanceof CSSLayerBlockRule
    ) {
      collectFromRules(rule.cssRules, element, result)
    }
  }
}

function processStyleRule(
  rule: CSSStyleRule,
  element: HTMLElement,
  result: StateDeclarations,
): void {
  const selector = rule.selectorText

  // Skip rules with pseudo-elements
  if (selector.includes('::before') || selector.includes('::after')) return

  for (const state of STATE_PSEUDOS) {
    const pseudo = `:${state}`
    if (!selector.includes(pseudo)) continue

    // Strip the pseudo-class and test if the base selector matches
    const baseSelector = selector.replace(new RegExp(`:${state}`, 'g'), '').trim()
    if (!baseSelector) continue

    try {
      if (!element.matches(baseSelector)) continue
    } catch {
      continue // invalid selector after stripping
    }

    // Extract declarations
    const style = rule.style
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]
      const val = style.getPropertyValue(prop).trim()
      if (!prop || !val) continue
      if (!VALID_PROPERTY.test(prop)) continue
      if (!VALID_VALUE.test(val) || REJECT_URL.test(val)) continue
      result[state].set(prop, val)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/state-detector.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/state-detector.ts cortex-editor/tests/browser/state-detector.test.ts
git commit -m "feat: state detector — CSSOM inspection for hover/focus/active rules (ZF0-890)"
```

---

## Task 2: CSSOverrideManager — State Override Storage + Pseudo-Element Selectors

**Files:**
- Modify: `cortex-editor/src/browser/override.ts`
- Modify: `cortex-editor/tests/browser/override.test.ts`

Two extensions in one task: (1) `stateOverrides` map with `setStateOverrides`/`clearStateOverrides` + merge in `rebuild()`, (2) pseudo-element parameter on `set`/`remove` + pseudo-suffix splitting in `rebuild()`.

- [ ] **Step 1: Write tests for state overrides**

Add to `tests/browser/override.test.ts`:

```typescript
describe('state overrides', () => {
  it('setStateOverrides generates a rule merged with user overrides', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.flush()
    manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // Both declarations in one rule — user edit 'color' + state override 'background'
    expect(styleEl.textContent).toContain('color: red !important')
    expect(styleEl.textContent).toContain('background: blue !important')
  })

  it('user edits win over state overrides for same property', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.setStateOverrides('Hero.tsx:5:3', new Map([['color', 'blue']]))
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red !important')
    expect(styleEl.textContent).not.toContain('color: blue')
  })

  it('clearStateOverrides removes state overrides but keeps user edits', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
    manager.flush()
    manager.clearStateOverrides()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red !important')
    expect(styleEl.textContent).not.toContain('background')
  })

  it('clearStateOverrides calls rebuild synchronously', () => {
    manager.setStateOverrides('Hero.tsx:5:3', new Map([['color', 'blue']]))
    manager.flush()
    // clearStateOverrides should update the style tag immediately (not via RAF)
    manager.clearStateOverrides()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('setStateOverrides validates property names and values', () => {
    manager.setStateOverrides('Hero.tsx:5:3', new Map([
      ['color', 'red'],
      ['invalid;prop', 'value'],          // invalid property
      ['background', 'url(http://evil)'],  // url() rejected
    ]))
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red')
    expect(styleEl.textContent).not.toContain('invalid')
    expect(styleEl.textContent).not.toContain('url')
  })

  it('state overrides only for element (not pseudo) selectors', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
    manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // State override only merges with element rule, not pseudo rule
    const rules = styleEl.textContent!
    expect(rules).toContain('background: blue')
    // Pseudo rule should NOT have background
    const pseudoRuleMatch = rules.match(/::before\s*\{[^}]+\}/)
    expect(pseudoRuleMatch?.[0]).not.toContain('background')
  })
})
```

- [ ] **Step 2: Write tests for pseudo-element selectors**

Add to `tests/browser/override.test.ts`:

```typescript
describe('pseudo-element selectors', () => {
  it('set with pseudo generates a pseudo-element selector', () => {
    manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"]::before { width: 100px !important; }',
    )
  })

  it('set with ::after generates correct selector', () => {
    manager.set('Hero.tsx:5:3', 'content', '"hello"', '::after')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('::after')
    expect(styleEl.textContent).toContain('content: "hello" !important')
  })

  it('element and pseudo overrides for same source produce separate rules', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    const text = styleEl.textContent!
    expect(text.split('\n').length).toBe(2) // two separate rules
    expect(text).toContain('color: red')
    expect(text).toContain('::before')
  })

  it('remove with pseudo only removes the pseudo override', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
    manager.flush()
    manager.remove('Hero.tsx:5:3', 'width', '::before')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red')
    expect(styleEl.textContent).not.toContain('::before')
  })

  it('remove without property clears all overrides for source+pseudo', () => {
    manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
    manager.set('Hero.tsx:5:3', 'height', '50px', '::before')
    manager.flush()
    manager.remove('Hero.tsx:5:3', undefined, '::before')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/override.test.ts`
Expected: FAIL — new tests fail (setStateOverrides, pseudo parameter not supported)

- [ ] **Step 4: Implement CSSOverrideManager extensions**

Modify `src/browser/override.ts`:

1. Add `private stateOverrides = new Map<string, Map<string, string>>()` field
2. Add `pseudo` parameter to `set()` and `remove()` — use `${source}${pseudo ?? ''}` as map key
3. Add `setStateOverrides(source, declarations)` — validates each entry, stores in stateOverrides map, calls `scheduleRebuild()`
4. Add `clearStateOverrides()` — clears stateOverrides map, calls `rebuild()` synchronously
5. Update `rebuild()` to:
   - Collect keys from both `overrides` and `stateOverrides`
   - Split pseudo suffix from composite key before `CSS.escape()`
   - Merge state overrides (base only, no pseudo) with user overrides (user wins)
   - Generate correct selectors with pseudo suffix outside attribute selector
6. Update `dispose()` to also clear `stateOverrides`

See spec for exact `rebuild()` pseudocode.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/override.test.ts`
Expected: All pass (existing + new)

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/browser/override.ts cortex-editor/tests/browser/override.test.ts
git commit -m "feat: CSSOverrideManager — state override storage + pseudo-element selectors (ZF0-890)"
```

---

## Task 3: Library Component Detection

**Files:**
- Modify: `cortex-editor/src/browser/label.ts`
- Modify: `cortex-editor/tests/browser/label.test.ts`

Standalone utility functions with no deps on other new code.

- [ ] **Step 1: Write tests**

Add to `tests/browser/label.test.ts`:

```typescript
import { isLibraryComponent, findUserAncestor } from '../../src/browser/label.js'

describe('isLibraryComponent', () => {
  it('returns false for elements without data-cortex-source', () => {
    const el = document.createElement('div')
    expect(isLibraryComponent(el)).toBe(false)
  })

  it('returns true when source path contains /node_modules/', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/app/node_modules/@radix-ui/button/dist/index.js:10:5')
    expect(isLibraryComponent(el)).toBe(true)
  })

  it('returns false for user-space source paths', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/app/src/components/Button.tsx:15:3')
    expect(isLibraryComponent(el)).toBe(false)
  })

  it('uses segment-based matching (not bare substring)', () => {
    const el = document.createElement('div')
    // Path that contains "node_modules" but NOT as a segment
    el.setAttribute('data-cortex-source', '/app/src/not_node_modules/thing.tsx:1:1')
    expect(isLibraryComponent(el)).toBe(false)
  })
})

describe('findUserAncestor', () => {
  it('returns null for element with no ancestors having data-cortex-source', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    expect(findUserAncestor(el)).toBe(null)
    el.remove()
  })

  it('finds the nearest user-space ancestor', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', '/app/src/Login.tsx:42:5')
    const child = document.createElement('button')
    child.setAttribute('data-cortex-source', '/app/node_modules/@ui/Button.tsx:10:3')
    parent.appendChild(child)
    document.body.appendChild(parent)

    const result = findUserAncestor(child)
    expect(result).not.toBe(null)
    expect(result!.source.fileName).toBe('Login.tsx')
    expect(result!.element).toBe(parent)

    parent.remove()
  })

  it('skips ancestors whose source is also in node_modules', () => {
    const grandparent = document.createElement('div')
    grandparent.setAttribute('data-cortex-source', '/app/src/App.tsx:5:1')
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', '/app/node_modules/@ui/Card.tsx:20:3')
    const child = document.createElement('span')
    child.setAttribute('data-cortex-source', '/app/node_modules/@ui/Icon.tsx:8:2')
    grandparent.appendChild(parent)
    parent.appendChild(child)
    document.body.appendChild(grandparent)

    const result = findUserAncestor(child)
    expect(result!.source.fileName).toBe('App.tsx')
    expect(result!.element).toBe(grandparent)

    grandparent.remove()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/label.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement isLibraryComponent and findUserAncestor**

Add to `src/browser/label.ts`:

```typescript
/** Check if an element comes from a third-party library (node_modules). */
export function isLibraryComponent(el: HTMLElement): boolean {
  const info = parseCortexSource(el)
  if (!info) return false
  return info.filePath.includes('/node_modules/')
}

/** Walk up the DOM to find the closest ancestor with a user-space source. */
export function findUserAncestor(
  el: HTMLElement,
): { source: SourceInfo; element: HTMLElement } | null {
  let current = el.parentElement
  while (current) {
    const source = parseCortexSource(current)
    if (source && !source.filePath.includes('/node_modules/')) {
      return { source, element: current }
    }
    current = current.parentElement
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/label.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/label.ts cortex-editor/tests/browser/label.test.ts
git commit -m "feat: library component detection — isLibraryComponent + findUserAncestor (ZF0-890)"
```

---

## Task 4: SelectionOverlay — Layout Shift Tracking

**Files:**
- Modify: `cortex-editor/src/browser/components/SelectionOverlay.tsx`
- Modify: `cortex-editor/tests/browser/selection-overlay.test.tsx`

Extend the existing RAF loop with shift detection. No UI changes yet — that's Task 6.

- [ ] **Step 1: Write tests for layout shift tracking**

Add to `tests/browser/selection-overlay.test.tsx`:

```typescript
describe('layout shift tracking', () => {
  let element: HTMLElement
  let container: HTMLDivElement
  let rafCallbacks: FrameRequestCallback[]
  let now: number
  const originalRAF = window.requestAnimationFrame
  const originalPerf = performance.now

  beforeEach(() => {
    now = 1000
    rafCallbacks = []
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }) as typeof requestAnimationFrame
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    element = document.createElement('div')
    element.scrollIntoView = vi.fn()
    document.body.appendChild(element)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    performance.now = originalPerf
    element.remove()
    container.remove()
    render(null, container)
  })

  function stepRAF(count = 1) {
    for (let i = 0; i < count; i++) {
      const cb = rafCallbacks.shift()
      if (cb) cb(now)
    }
  }

  function moveElement(top: number, left: number) {
    mockGetBoundingClientRect(element, { top, left, width: 100, height: 50, right: left + 100, bottom: top + 50 })
  }

  it('does not auto-scroll on initial selection', () => {
    moveElement(200, 100)
    render(<SelectionOverlay element={element} />, container)
    stepRAF(1) // first frame — initializes stableDoc
    now += 500
    stepRAF(1) // second frame — 500ms later, no shift
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('auto-scrolls when element shifts >50px after 400ms stable', () => {
    moveElement(100, 100)
    render(<SelectionOverlay element={element} />, container)
    stepRAF(1) // initialize stable position

    moveElement(200, 100) // shift 100px down
    now += 16
    stepRAF(1) // detect shift, set lastChangeTime

    now += 500 // 500ms later, position stable
    stepRAF(1) // should trigger scrollIntoView
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })

  it('does not auto-scroll when shift < 50px', () => {
    moveElement(100, 100)
    render(<SelectionOverlay element={element} />, container)
    stepRAF(1) // initialize

    moveElement(130, 100) // shift 30px — below threshold
    now += 16
    stepRAF(1)
    now += 500
    stepRAF(1)
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not auto-scroll during continuous movement (scrub)', () => {
    moveElement(100, 100)
    render(<SelectionOverlay element={element} />, container)
    stepRAF(1) // initialize

    // Move element every frame for 600ms — never stabilizes
    for (let i = 0; i < 36; i++) { // 36 frames * ~16ms = ~600ms
      moveElement(100 + i * 5, 100)
      now += 16
      stepRAF(1)
    }
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('respects 1s cooldown after scrollIntoView', () => {
    moveElement(100, 100)
    render(<SelectionOverlay element={element} />, container)
    stepRAF(1)

    // Trigger first auto-scroll
    moveElement(300, 100) // shift 200px
    now += 16; stepRAF(1)
    now += 500; stepRAF(1)
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1)

    // Immediately shift again — within 1s cooldown
    moveElement(500, 100)
    now += 16; stepRAF(1)
    now += 500; stepRAF(1) // 500ms after second shift, but still within 1s cooldown
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1) // NOT called again

    // After cooldown expires
    now += 600 // total ~1.1s since first scroll
    moveElement(700, 100)
    now += 16; stepRAF(1)
    now += 500; stepRAF(1)
    expect(element.scrollIntoView).toHaveBeenCalledTimes(2) // now called again
  })
})
```

Uses manual RAF stepping and `performance.now` mock for deterministic timing. `mockGetBoundingClientRect` from `tests/browser/helpers.ts` provides rect control.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/selection-overlay.test.tsx`
Expected: FAIL — new tests fail

- [ ] **Step 3: Implement layout shift tracking**

In `SelectionOverlay.tsx`, inside the existing `useEffect` RAF loop:

1. Add `stableDocTop: number | null = null`, `stableDocLeft: number | null = null`, `lastChangeTime = 0`, `scrollCooldownUntil = 0`
2. After the existing position tracking code, add the shift detection logic from the spec (document-relative coordinates, null init, cooldown check, 400ms debounce, 50px threshold)
3. Use `element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` when threshold exceeded

See spec for exact pseudocode.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/selection-overlay.test.tsx`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/components/SelectionOverlay.tsx cortex-editor/tests/browser/selection-overlay.test.tsx
git commit -m "feat: layout shift tracking — auto-scroll on >50px shift with 400ms debounce (ZF0-890)"
```

---

## Task 5: PanelHeader — Pseudo-Element Tabs + Library Badge

**Files:**
- Modify: `cortex-editor/src/browser/components/PanelHeader.tsx`
- Modify: `cortex-editor/tests/browser/panel-header.test.tsx`

- [ ] **Step 1: Write tests for pseudo tabs and library badge**

Add to `tests/browser/panel-header.test.tsx`:

```typescript
describe('pseudo-element tabs', () => {
  it('does not render tabs when no pseudo-elements detected', () => {
    setup({ hasBefore: false, hasAfter: false })
    expect(container.querySelector('.cortex-pseudo-tabs')).toBe(null)
  })

  it('renders element + ::before tabs when hasBefore is true', () => {
    setup({ hasBefore: true, hasAfter: false })
    const tabs = container.querySelectorAll('.cortex-pseudo-tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].textContent).toBe('element')
    expect(tabs[1].textContent).toBe('::before')
  })

  it('renders all three tabs when both pseudo-elements detected', () => {
    setup({ hasBefore: true, hasAfter: true })
    const tabs = container.querySelectorAll('.cortex-pseudo-tab')
    expect(tabs.length).toBe(3)
  })

  it('calls onPseudoChange when a pseudo tab is clicked', () => {
    const onPseudoChange = vi.fn()
    setup({ hasBefore: true, hasAfter: false, onPseudoChange })
    const beforeTab = container.querySelectorAll('.cortex-pseudo-tab')[1] as HTMLElement
    beforeTab.click()
    expect(onPseudoChange).toHaveBeenCalledWith('::before')
  })

  it('highlights active pseudo tab', () => {
    setup({ hasBefore: true, hasAfter: false, activePseudo: '::before' })
    const tabs = container.querySelectorAll('.cortex-pseudo-tab')
    expect(tabs[1].classList.contains('cortex-pseudo-tab--active')).toBe(true)
  })
})

describe('library badge', () => {
  it('does not show badge for non-library elements', () => {
    setup({ isLibrary: false })
    expect(container.querySelector('.cortex-panel-header__library')).toBe(null)
  })

  it('shows (library) badge for library elements', () => {
    setup({ isLibrary: true })
    const badge = container.querySelector('.cortex-panel-header__library')
    expect(badge).not.toBe(null)
    expect(badge!.textContent).toBe('(library)')
  })

  it('shows ancestor source when library element has user ancestor', () => {
    setup({
      isLibrary: true,
      ancestorSource: 'LoginForm.tsx',
      ancestorLine: '42',
      tagName: 'button',
    })
    const infoText = container.querySelector('.cortex-panel-header__info')!.textContent
    expect(infoText).toContain('LoginForm.tsx:42')
    expect(infoText).toContain('<button>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/panel-header.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PanelHeader extensions**

Extend `PanelHeaderProps` with:
```typescript
hasBefore?: boolean
hasAfter?: boolean
activePseudo?: 'element' | '::before' | '::after'
onPseudoChange?: (pseudo: 'element' | '::before' | '::after') => void
isLibrary?: boolean
ancestorSource?: string | null
ancestorLine?: string | null
```

Add pseudo tabs rendering (conditional on `hasBefore || hasAfter`) and library badge rendering (conditional on `isLibrary`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/panel-header.test.tsx`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/components/PanelHeader.tsx cortex-editor/tests/browser/panel-header.test.tsx
git commit -m "feat: PanelHeader — pseudo-element tabs + library badge (ZF0-890)"
```

---

## Task 6: SelectionOverlay — State Lens UI

**Files:**
- Modify: `cortex-editor/src/browser/components/SelectionOverlay.tsx`
- Modify: `cortex-editor/tests/browser/selection-overlay.test.tsx`

- [ ] **Step 1: Write tests for state lens rendering**

Add to `tests/browser/selection-overlay.test.tsx`:

```typescript
describe('state lens', () => {
  let element: HTMLElement
  let container: HTMLDivElement
  const emptyStates: StateDeclarations = {
    hover: new Map(), focus: new Map(), active: new Map(),
  }
  const hoverOnlyStates: StateDeclarations = {
    hover: new Map([['background', 'blue']]),
    focus: new Map(),
    active: new Map(),
  }
  const allStates: StateDeclarations = {
    hover: new Map([['background', 'blue']]),
    focus: new Map([['outline', '2px solid']]),
    active: new Map([['transform', 'scale(0.95)']]),
  }

  beforeEach(() => {
    element = document.createElement('div')
    mockGetBoundingClientRect(element, { top: 200, left: 100, width: 300, height: 50 })
    document.body.appendChild(element)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    element.remove()
    render(null, container); container.remove()
  })

  it('does not render lens when no states available', () => {
    render(<SelectionOverlay element={element} availableStates={emptyStates} />, container)
    expect(container.querySelector('.cortex-state-lens')).toBe(null)
  })

  it('renders lens with available states only', () => {
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" />, container)
    const btns = container.querySelectorAll('.cortex-state-lens__btn')
    expect(btns.length).toBe(2) // Default + :hover
    expect(btns[0].textContent).toBe('Default')
    expect(btns[1].textContent).toBe(':hover')
  })

  it('renders all state buttons when all states available', () => {
    render(<SelectionOverlay element={element} availableStates={allStates} activeState="default" />, container)
    const btns = container.querySelectorAll('.cortex-state-lens__btn')
    expect(btns.length).toBe(4) // Default + :hover + :focus + :active
  })

  it('highlights active state', () => {
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="hover" />, container)
    const hoverBtn = container.querySelectorAll('.cortex-state-lens__btn')[1]
    expect(hoverBtn.classList.contains('cortex-state-lens__btn--active')).toBe(true)
  })

  it('calls onStateChange when a state button is clicked', () => {
    const onStateChange = vi.fn()
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" onStateChange={onStateChange} />, container)
    const hoverBtn = container.querySelectorAll('.cortex-state-lens__btn')[1] as HTMLElement
    hoverBtn.click()
    expect(onStateChange).toHaveBeenCalledWith('hover')
  })

  it('clicking Default calls onStateChange with default', () => {
    const onStateChange = vi.fn()
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="hover" onStateChange={onStateChange} />, container)
    const defaultBtn = container.querySelectorAll('.cortex-state-lens__btn')[0] as HTMLElement
    defaultBtn.click()
    expect(onStateChange).toHaveBeenCalledWith('default')
  })

  it('positions lens below element when near top of viewport', () => {
    mockGetBoundingClientRect(element, { top: 20, left: 100, width: 300, height: 50 })
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" />, container)
    const lens = container.querySelector('.cortex-state-lens') as HTMLElement
    // Lens should be below the element (top > element bottom)
    const lensTop = parseFloat(lens.style.top)
    expect(lensTop).toBeGreaterThan(70) // below element bottom (20 + 50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/selection-overlay.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement state lens UI in SelectionOverlay**

Extend `SelectionOverlayProps`:
```typescript
availableStates?: StateDeclarations
activeState?: 'default' | 'hover' | 'focus' | 'active'
onStateChange?: (state: 'default' | 'hover' | 'focus' | 'active') => void
```

Render the lens controls:
- Check if any state has non-empty map → show lens
- Position above element by default (adjust threshold from 30 to 54 when lens shown)
- Render `Default` + available state pills
- Handle click events → call `onStateChange`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/selection-overlay.test.tsx`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/components/SelectionOverlay.tsx cortex-editor/tests/browser/selection-overlay.test.tsx
git commit -m "feat: state lens UI on selection overlay (ZF0-890)"
```

---

## Task 7: Panel — activeState + activePseudo + Dimming

**Files:**
- Modify: `cortex-editor/src/browser/components/Panel.tsx`
- Modify: `cortex-editor/tests/browser/panel.test.tsx` (file exists — append new describe blocks)

- [ ] **Step 1: Write tests for activeState + activePseudo + dimming**

Tests should cover:
- `computedStyles` useMemo includes `activeState` and `activePseudo` in deps
- When `activePseudo` is `'::before'`, uses `getComputedStyle(element, '::before')`
- `defaultComputedStyles` snapshot taken on element change, not on styleVersion change
- `dimmedProperties` set computed correctly (diff default vs current)
- Sections receive `dimmedProperties` prop

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Panel extensions**

1. Add `activeState` and `activePseudo` to `PanelProps`:
```typescript
activeState?: 'default' | 'hover' | 'focus' | 'active'
hasBefore?: boolean
hasAfter?: boolean
```

2. Add `activePseudo` state inside Panel:
```typescript
const [activePseudo, setActivePseudo] = useState<'element' | '::before' | '::after'>('element')
```

3. Add `defaultComputedStyles` snapshot ref:
```typescript
const defaultStylesRef = useRef<Record<string, string> | null>(null)
useEffect(() => {
  if (!element) { defaultStylesRef.current = null; return }
  const cs = getComputedStyle(element)
  const snapshot: Record<string, string> = {}
  for (const prop of ALL_DIMMING_PROPERTIES) snapshot[prop] = cs.getPropertyValue(prop)
  defaultStylesRef.current = snapshot
}, [element])
```

4. Update `computedStyles` useMemo to include `activeState` and `activePseudo`:
```typescript
const computedStyles = useMemo(() => {
  if (!element) return { /* defaults */ }
  const pseudo = activePseudo !== 'element' ? activePseudo : undefined
  const cs = getComputedStyle(element, pseudo)
  return { /* parse all sections */ }
}, [element, styleVersion, activeState, activePseudo])
```

5. Compute `dimmedProperties` when `activeState !== 'default'`:
```typescript
const dimmedProperties = useMemo(() => {
  if (!element || activeState === 'default' || !defaultStylesRef.current) return undefined
  const changed = new Set<string>()
  const cs = getComputedStyle(element)
  for (const prop of ALL_DIMMING_PROPERTIES) {
    if (cs.getPropertyValue(prop) !== defaultStylesRef.current[prop]) changed.add(prop)
  }
  return changed
}, [element, activeState, styleVersion])
```

6. Pass pseudo tab props to PanelHeader, `dimmedProperties` to sections
7. Pass `pseudo` parameter to `applyOverride` when `activePseudo !== 'element'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/panel.test.tsx`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/components/Panel.tsx cortex-editor/tests/browser/panel.test.tsx
git commit -m "feat: Panel — activeState, activePseudo, dimming logic (ZF0-890)"
```

---

## Task 8: useSnapToEdge — recheckOverlap

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useSnapToEdge.ts`
- Modify: `cortex-editor/tests/browser/hooks/use-snap-to-edge.test.ts`

Note: test file is in `tests/browser/hooks/` subdirectory (matching existing convention).

- [ ] **Step 1: Write tests for recheckOverlap**

Add to `tests/browser/hooks/use-snap-to-edge.test.ts`:

```typescript
describe('recheckOverlap', () => {
  it('does not reposition when panel does not overlap element', () => {
    // Setup: panel at x=0 (left edge), element at x=800 (right side)
    const { result } = renderHook(() => useSnapToEdge())
    act(() => result.current.setPosition({ x: 0, y: 100 }))

    const elementRect = { left: 800, right: 900, top: 100, bottom: 200 } as DOMRect
    act(() => result.current.recheckOverlap(elementRect))

    // Panel should not have moved — still at x=0
    expect(result.current.position.x).toBe(0)
  })

  it('repositions to opposite edge when panel overlaps element', () => {
    // Setup: panel at x=700 (right edge), element also at x=650 (overlapping)
    const { result } = renderHook(() => useSnapToEdge())
    act(() => result.current.setPosition({ x: 700, y: 100 }))

    const elementRect = { left: 650, right: 850, top: 100, bottom: 200 } as DOMRect
    act(() => result.current.recheckOverlap(elementRect))

    // Panel should have moved to the left side
    expect(result.current.position.x).toBeLessThan(650)
  })

  it('uses PANEL_MAX_HEIGHT as conservative upper bound for overlap check', () => {
    // Panel at x=0, y=0 with PANEL_MAX_HEIGHT=460
    // Element at y=300 — overlap only if panel height considered > 300
    const { result } = renderHook(() => useSnapToEdge())
    act(() => result.current.setPosition({ x: 0, y: 0 }))

    const elementRect = { left: 0, right: 300, top: 300, bottom: 400 } as DOMRect
    act(() => result.current.recheckOverlap(elementRect))

    // Should detect overlap (PANEL_MAX_HEIGHT=460 extends past y=300)
    expect(result.current.position.x).not.toBe(0)
  })
})
```

- [ ] **Step 2: Implement recheckOverlap**

Add to `useSnapToEdge` return value. **Critical:** must read from `positionRef.current` (not `position` state value) to avoid stale closures, then call `snap()` to ensure proper edge snapping:

```typescript
const recheckOverlap = useCallback((elementRect: DOMRect): void => {
  // Read from positionRef (not state) to avoid stale closure
  const pos = positionRef.current
  const panelRight = pos.x + PANEL_WIDTH
  const panelBottom = pos.y + PANEL_MAX_HEIGHT // conservative upper bound

  const overlaps = !(
    panelRight < elementRect.left ||
    pos.x > elementRect.right ||
    panelBottom < elementRect.top ||
    pos.y > elementRect.bottom
  )

  if (overlaps) {
    // Move to opposite horizontal edge, then snap to clean position
    const viewportCenter = window.innerWidth / 2
    const targetX = pos.x < viewportCenter
      ? window.innerWidth - PANEL_WIDTH - EDGE_MARGIN
      : EDGE_MARGIN
    positionRef.current = { x: targetX, y: pos.y }
    snap()
  }
}, [snap])
```

Add `recheckOverlap` to the hook's return value alongside `position`, `isSnapping`, `setPosition`, `snap`.

- [ ] **Step 3: Run tests, commit**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-snap-to-edge.test.ts`

```bash
git add cortex-editor/src/browser/hooks/useSnapToEdge.ts cortex-editor/tests/browser/hooks/use-snap-to-edge.test.ts
git commit -m "feat: useSnapToEdge — recheckOverlap for panel auto-reposition (ZF0-890)"
```

---

## Task 9: CortexApp — State Orchestration

**Files:**
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx`
- Modify: `cortex-editor/tests/browser/cortex-app.test.tsx` (file exists — append new describe blocks)

This task wires everything together. CortexApp becomes the state orchestrator.

- [ ] **Step 1: Write tests for state orchestration lifecycle**

```typescript
describe('state orchestration', () => {
  // Setup: render CortexApp with mock channel, select an element that has
  // a <style> with hover rules. Use createShadowHost() and createMockChannel()
  // from helpers.ts.

  let host: ReturnType<typeof createShadowHost>
  let channel: ReturnType<typeof createMockChannel>
  let targetEl: HTMLElement
  let styleEl: HTMLStyleElement

  beforeEach(() => {
    host = createShadowHost()
    channel = createMockChannel()
    targetEl = document.createElement('button')
    targetEl.className = 'btn'
    targetEl.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(targetEl)
    styleEl = document.createElement('style')
    styleEl.textContent = '.btn:hover { background: blue; }'
    document.head.appendChild(styleEl)
  })

  afterEach(() => {
    targetEl.remove()
    styleEl.remove()
    host.cleanup()
  })

  it('runs detectStates on element selection and renders lens', () => {
    render(<CortexApp channel={channel} shadowRoot={host.shadow} />, host.root)
    // Simulate click to select targetEl
    dispatchMouseEvent(document, 'click', { clientX: 50, clientY: 50 })
    // Verify state lens appears with :hover option
    const lens = host.shadow.querySelector('.cortex-state-lens')
    expect(lens).not.toBe(null)
    const btns = host.shadow.querySelectorAll('.cortex-state-lens__btn')
    expect(btns.length).toBeGreaterThanOrEqual(2) // Default + :hover
  })

  it('applies state overrides when lens hover clicked', () => {
    render(<CortexApp channel={channel} shadowRoot={host.shadow} />, host.root)
    // Select element, then click :hover on lens
    // Verify override style tag contains hover declarations
    const overrideEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // After clicking :hover, the state overrides should be applied
    // Check that the style tag contains the hover declarations
  })

  it('clears state overrides on deselect (ESC)', () => {
    render(<CortexApp channel={channel} shadowRoot={host.shadow} />, host.root)
    // Select, force hover, then press ESC
    dispatchKeyboardEvent(document, 'keydown', { key: 'Escape' })
    const overrideEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // State overrides should be cleared
    expect(overrideEl.textContent).not.toContain('background: blue')
  })

  it('preserves user edits after deselect', () => {
    render(<CortexApp channel={channel} shadowRoot={host.shadow} />, host.root)
    // Select element, apply user edit (override), deselect
    // Verify user edit override persists in style tag
  })

  it('resets activeState to default on re-select', () => {
    render(<CortexApp channel={channel} shadowRoot={host.shadow} />, host.root)
    // Select, force hover, deselect, re-select
    // Verify lens shows Default as active (not :hover)
    const activeBtn = host.shadow.querySelector('.cortex-state-lens__btn--active')
    expect(activeBtn?.textContent).toBe('Default')
  })
})
```

Note: Some tests may need `dispatchKeyboardEvent` from helpers.ts. The test bodies above are starting points — the implementer should adapt based on the actual rendering mechanics (happy-dom + Preact render timing).

- [ ] **Step 2: Implement CortexApp state orchestration**

1. Add state: `const [activeState, setActiveState] = useState<'default' | 'hover' | 'focus' | 'active'>('default')`
2. Add state: `const [availableStates, setAvailableStates] = useState<StateDeclarations | undefined>(undefined)`
3. On `selectedElement` change: run `detectStates()`, reset `activeState` to `'default'`, clear state overrides
4. Add `handleStateChange` callback:
   - If `state === 'default'` → `clearStateOverrides()`, set activeState
   - Else → get source from element, `setStateOverrides(source, availableStates[state])`, set activeState
5. Pass new props to SelectionOverlay: `availableStates`, `activeState`, `onStateChange`
6. Pass `activeState` to Panel
7. Detect pseudo-elements: `hasBefore`, `hasAfter` → pass to Panel

- [ ] **Step 3: Run tests, commit**

Run: `cd cortex-editor && npx vitest run tests/browser/cortex-app.test.tsx`

```bash
git add cortex-editor/src/browser/components/CortexApp.tsx cortex-editor/tests/browser/cortex-app.test.tsx
git commit -m "feat: CortexApp — state orchestration, wires lens ↔ panel (ZF0-890)"
```

---

## Task 10: Styles

**Files:**
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Add all new CSS classes**

Add to `styles.css`:

```css
/* === State Lens (on selection overlay) === */
.cortex-state-lens {
  display: flex;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 6px;
  position: absolute;
  pointer-events: auto;
  z-index: 1;
}

.cortex-state-lens__btn {
  font-size: 11px;
  font-family: inherit;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  white-space: nowrap;
}

.cortex-state-lens__btn:hover {
  color: #d1d5db;
}

.cortex-state-lens__btn--active {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

/* === Pseudo tabs (in panel) === */
.cortex-pseudo-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 12px;
}

.cortex-pseudo-tab {
  font-size: 11px;
  font-family: inherit;
  padding: 6px 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}

.cortex-pseudo-tab:hover {
  color: #d1d5db;
}

.cortex-pseudo-tab--active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

/* === Library badge (in panel header) === */
.cortex-panel-header__library {
  font-style: italic;
  color: #9ca3af;
  font-size: 10px;
  margin-left: 4px;
}

/* === Dimmed properties (in panel sections) === */
.cortex-dimmed {
  opacity: 0.5;
  transition: opacity 150ms ease;
}
```

- [ ] **Step 2: Verify styles render correctly**

Run: `cd cortex-editor && npx vitest run tests/browser/` (full browser test suite)
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add cortex-editor/src/browser/styles.css
git commit -m "feat: CSS styles for state lens, pseudo tabs, library badge, dimming (ZF0-890)"
```

---

## Task 11: Full Test Suite Verification

- [ ] **Step 1: Run complete test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: All tests pass (server, browser, integration)

- [ ] **Step 2: Run type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A && git commit -m "fix: test and type adjustments for Phase 5c (ZF0-890)"
```

---

## Dependency Graph

```
Task 1 (state-detector) ─────────────────────────────────┐
Task 2 (override extensions) ─────────────────────────────┤
Task 3 (label extensions) ────────────────────────────────┤
                                                          ├→ Task 9 (CortexApp wiring) → Task 10 (styles) → Task 11 (verify)
Task 4 (layout shift) ───────────────────────────────────┤
Task 5 (pseudo tabs + library badge in PanelHeader) ──────┤
Task 6 (state lens UI in SelectionOverlay) ───────────────┤
Task 7 (Panel plumbing) ─────────────────────────────────┤
Task 8 (recheckOverlap) ─────────────────────────────────┘
```

**Tasks 1-8 are independent** — they can be parallelized via subagents. Task 9 wires them together and depends on all of 1-8. Task 10-11 are sequential after 9.
