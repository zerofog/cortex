# Phase 5c: Interaction States, Pseudo-Elements, Library Components, Layout Shift

**Ticket:** ZF0-890
**Date:** 2026-03-17
**Status:** Approved

## Overview

Four features that extend the editor panel to handle advanced CSS scenarios: interaction state toggling (:hover/:focus/:active), pseudo-element editing (::before/::after), third-party library component detection with (library) attribution, and layout shift tracking with auto-scroll.

**Dependency:** Phase 5b (ZF0-889) — Done.

## Feature 1: Interaction State Toggles

### State Detection — CSSOM Inspection (`state-detector.ts`)

New utility that inspects all `document.styleSheets` to find CSS rules with `:hover`, `:focus`, or `:active` pseudo-classes matching a given element.

```typescript
export interface StateDeclarations {
  hover: Map<string, string>   // CSS property → value
  focus: Map<string, string>
  active: Map<string, string>
}

export function detectStates(element: HTMLElement): StateDeclarations
```

**Algorithm:**
1. Iterate `document.styleSheets`
2. Try/catch `sheet.cssRules` access (cross-origin stylesheets throw `SecurityError`)
3. For each `CSSStyleRule`, check if `selectorText` contains `:hover`, `:focus`, or `:active`
4. If the rule also contains a pseudo-element (`::before`, `::after`), skip it — pseudo-element-specific state rules require a separate detection path (see Known Limitations)
5. Strip the pseudo-class from the selector, test `element.matches(baseSelector)`
6. If match: extract all declarations from the rule into the corresponding map
7. Later rules override earlier ones (natural CSS cascade for same-specificity rules)

**Nested at-rule recursion:** The inspector must recurse into:
- `CSSMediaRule.cssRules` — media queries contain style rules
- `CSSLayerBlockRule.cssRules` — cascade layers
- `CSSSupportsRule.cssRules` — feature queries (e.g., `@supports (display: grid) { .btn:hover { ... } }`)

**Compound pseudo-class handling:**
- `.btn:hover:focus` → classified as both `:hover` AND `:focus`. Stripping `:hover` yields `.btn:focus`, stripping `:focus` yields `.btn:hover`. Both tested via `element.matches()`. Since neither pseudo-class is actually active, `element.matches('.btn:focus')` returns false, so only the compound rule's declarations land in whichever state's stripped selector matches. In practice this means compound state rules may appear in individual state maps even though they were authored for the combined case. This is an acceptable simplification — tracking compound state combinations adds significant complexity with minimal user benefit.
- `.parent:hover .child` → stripping `:hover` yields `.parent .child`. `element.matches('.parent .child')` is true only if the DOM structure matches. This correctly detects state rules that depend on ancestor relationships. Note: the ancestor's hover state isn't being simulated — only the declarations are extracted and applied to the target element.

**Test expectations for compound selectors:**
- `.btn:hover` on matching `.btn` → hover map gets declarations
- `.btn:hover:focus` on matching `.btn` → hover map gets declarations (from `.btn:focus` match — only if element has focus), focus map gets declarations (from `.btn:hover` match — only if element has hover). In practice, neither matches since the element isn't in either state, so declarations are dropped. This is correct — compound state rules are for combined states, and we force one state at a time.
- `.parent:hover .child` on matching `.child` with `.parent` ancestor → hover map gets declarations
- `.btn:hover::before` → skipped entirely (pseudo-element in selector)

### State Forcing Mechanism

When the user clicks a state toggle (e.g., `:hover`):
1. Retrieve `StateDeclarations` for the element (cached per selection, invalidated on element change)
2. Apply all declarations from the selected state's map via `CSSOverrideManager.setStateOverrides(source, declarations)`
3. Bump `styleVersion` to force panel `getComputedStyle` re-read
4. Panel displays the forced state's computed values

When switching back to `Default`:
1. Call `CSSOverrideManager.clearStateOverrides()` — removes all state-forced declarations
2. Bump `styleVersion`

**Override separation architecture:** State overrides are stored in a **separate internal map** inside `CSSOverrideManager`, distinct from user edit overrides. During `rebuild()`, both maps are merged per-source — declarations from both maps targeting the same `data-cortex-source` value are combined into a single CSS rule. This avoids the key-prefix scheme (which would produce selectors that don't match any DOM element) and ensures state overrides and user edits coexist under the same `[data-cortex-source="..."]` selector.

```typescript
// CSSOverrideManager internal structure
private overrides = new Map<string, Map<string, string>>()       // user edits
private stateOverrides = new Map<string, Map<string, string>>()  // forced state

// New public API
setStateOverrides(source: string, declarations: Map<string, string>): void
clearStateOverrides(): void

// New methods
setStateOverrides(source: string, declarations: Map<string, string>): void
// CSSOM-sourced declarations — no injection risk, skip VALID_PROPERTY/VALID_VALUE validation.
// Stores in stateOverrides map keyed by raw source (never pseudo-suffixed).
// Calls scheduleRebuild().

clearStateOverrides(): void
// Clears the stateOverrides map and calls rebuild() synchronously (not scheduleRebuild)
// to ensure the <style> tag is updated before the next getComputedStyle read.

// rebuild() merges both maps, splitting pseudo suffixes from override keys
private rebuild(): void {
  // Collect all sources from both maps
  const allSources = new Set([...this.overrides.keys(), ...this.stateOverrides.keys()])
  const rules: string[] = []
  for (const compositeKey of allSources) {
    // Split pseudo suffix from the composite key (overrides map uses "source::before" keys)
    const pseudoSuffix = compositeKey.endsWith('::before') ? '::before'
                       : compositeKey.endsWith('::after') ? '::after'
                       : ''
    const rawSource = pseudoSuffix ? compositeKey.slice(0, -pseudoSuffix.length) : compositeKey

    const userProps = this.overrides.get(compositeKey)
    // State overrides are always keyed by raw source (no pseudo suffix)
    const stateProps = pseudoSuffix ? undefined : this.stateOverrides.get(rawSource)
    // Merge: user edits win over state overrides (user intent > forced state)
    const merged = new Map<string, string>()
    if (stateProps) for (const [p, v] of stateProps) merged.set(p, v)
    if (userProps) for (const [p, v] of userProps) merged.set(p, v)
    if (merged.size === 0) continue
    const declarations = Array.from(merged.entries())
      .map(([prop, val]) => `${prop}: ${val} !important`)
      .join('; ')
    // CSS.escape only the source part; pseudo suffix appended outside the attribute selector
    const selector = `[data-cortex-source="${CSS.escape(rawSource)}"]${pseudoSuffix}`
    rules.push(`${selector} { ${declarations}; }`)
  }
  this.styleEl.textContent = rules.join('\n')
}
```

### State Bar UI (PanelHeader)

```
[Default]  :hover  :focus  :active
```

- Rendered as a row of pill buttons below the existing header info
- Only states with non-empty declaration maps are shown
- Active state has `background: rgba(59, 130, 246, 0.15); color: #3b82f6` styling
- `Default` is always shown when any other state is available
- CSS class: `cortex-state-bar`, buttons: `cortex-state-bar__btn`, active: `cortex-state-bar__btn--active`

### Dimming Unchanged Properties

When a non-default state is active, properties whose computed value matches the default state get `opacity: 0.5`. This highlights what actually changes in the forced state.

**Implementation:** Panel computes `defaultComputedStyles` (stored once on element selection, before any state forcing) and re-reads computed styles after state forcing. Diff produces a `Set<string>` of changed CSS property names.

**Per-section property mapping:** Each section declares which CSS properties it manages, enabling the dimming system to target the correct controls:

| Section | CSS Properties |
|---|---|
| LayoutSection | `display`, `visibility`, `flex-direction`, `justify-content`, `align-items`, `width`, `height` |
| SpacingSection | `padding-top`, `padding-right`, `padding-bottom`, `padding-left`, `margin-top`, `margin-right`, `margin-bottom`, `margin-left`, `row-gap`, `column-gap` |
| TypographySection | `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `color`, `text-align` |
| FillSection | `background-color` |
| BorderSection | `border-width`, `border-style`, `border-color`, `border-radius` |
| ShadowSection | `box-shadow` |
| EffectsSection | `opacity`, `overflow`, `cursor`, `filter`, `backdrop-filter` |

Sections receive `dimmedProperties?: Set<string>` — each control's wrapper `<div>` gets the `cortex-dimmed` class if its CSS property is NOT in the changed set (i.e., it's unchanged between default and forced state).

## Feature 2: Pseudo-Element Tabs

### Detection

```typescript
const hasBefore = getComputedStyle(element, '::before').content !== 'none'
const hasAfter = getComputedStyle(element, '::after').content !== 'none'
```

Performed once per element selection (alongside state detection).

### Pseudo Tab UI (PanelHeader)

```
[element]  ::before  ::after
```

- Rendered as a row of tabs below the state bar (or below header info if no state bar)
- Only tabs for detected pseudo-elements are shown; `element` tab always shown when any pseudo exists
- Active tab: underline style (2px bottom border, `#3b82f6`)
- CSS class: `cortex-pseudo-tabs`, tabs: `cortex-pseudo-tab`, active: `cortex-pseudo-tab--active`

### CSSOverrideManager Extension

```typescript
// Extended signature
set(source: string, property: string, value: string, pseudo?: '::before' | '::after'): void
remove(source: string, property?: string, pseudo?: '::before' | '::after'): void
```

**Internal storage change:** The `overrides` map key is `${source}` for element overrides, or `${source}::before` / `${source}::after` for pseudo overrides. The `rebuild()` method parses the key to generate the correct selector:
- Key `Hero.tsx:5:3` → `[data-cortex-source="Hero\.tsx\:5\:3"] { ... }`
- Key `Hero.tsx:5:3::before` → `[data-cortex-source="Hero\.tsx\:5\:3"]::before { ... }`

The pseudo suffix (`::before` / `::after`) is only appended to the selector, never passed through `CSS.escape()`.

### Panel Computed Styles for Pseudo-Elements

When a pseudo tab is active:
- `getComputedStyle(element, '::before')` or `getComputedStyle(element, '::after')` used instead of `getComputedStyle(element)`
- Override writes include the `pseudo` parameter
- State toggles remain visible on pseudo tabs (per UX spec)

**State + pseudo interaction:** When both a state and pseudo tab are active (e.g., `:hover` + `::before`):
- State forcing applies element-level hover overrides (affects the element's styling context)
- Panel reads `getComputedStyle(element, '::before')` which may reflect changes from the forced state
- Override writes for pseudo properties include the `pseudo` parameter
- **Limitation:** Rules like `.btn:hover::before { content: "hover!" }` are skipped by `detectStates` (pseudo-element in selector). These rules won't be directly forced because the `:hover` pseudo-class isn't actually activated — we only copy declarations as overrides. Full state simulation would require CDP `CSS.forcePseudoState` (not available from page JS). This is a known limitation documented in the "Known Limitations" section.

**Limitation:** Not all CSS properties are readable from pseudo-element computed styles. The panel gracefully handles missing/empty values (same as current behavior for unsupported properties).

## Feature 3: Library Component Detection

### Detection Logic (`label.ts`)

```typescript
export function isLibraryComponent(el: HTMLElement): boolean
export function findUserAncestor(el: HTMLElement): { source: SourceInfo; element: HTMLElement } | null
```

**`isLibraryComponent`:**
1. Call `parseCortexSource(el)` to get source info
2. If no source info (no `data-cortex-source` attribute) → `false` (un-instrumented element, not necessarily a library component — could be a plain `<hr>`, `<div>` from a script, etc.)
3. If `filePath.includes('/node_modules/')` → `true` (source points to library code)
4. Otherwise → `false` (user-space component)

**Rationale for not flagging missing-attribute elements as library:** Elements without `data-cortex-source` may be structural HTML that the source transform didn't instrument (e.g., elements outside the project root, dynamically injected elements). Labeling these as "library" is misleading. Only elements with a source path pointing into `node_modules` are genuinely library components.

**`findUserAncestor`:**
1. Walk up `el.parentElement` chain
2. For each ancestor, call `parseCortexSource(ancestor)`
3. If source exists AND `!filePath.includes('/node_modules/')` → return `{ source, element: ancestor }`
4. If chain exhausted → `null`

**Path matching safety:** Always use `/node_modules/` with surrounding slashes to prevent false positives on paths like `not_node_modules/` (documented lesson from Phase 1a source transform).

### Library Badge UI

**PanelHeader changes:**
- When `isLibraryComponent(element)` is true:
  - Source text shows: `LoginForm.tsx:42 · <Button>` (ancestor source · element tag)
  - `(library)` badge in italic, color `#9ca3af`, after the source link
- CSS class: `cortex-panel-header__library`

**Source attribution context:**
- `findUserAncestor` provides the user-space file reference for the header
- If no user ancestor found, show just the tag name with `(library)` badge

### Edit Behavior for Library Components

Browser-side: CSS overrides work identically — `CSSOverrideManager` targets elements by attribute. No browser-side change for the override mechanism.

Server-side edit pipeline (out of scope for this phase, documented for context):
- 4-tier write-back: modify existing className → add className prop → modify style prop → AI path
- The edit message includes `isLibrary: true` flag so the pipeline knows to use the fallback strategy

## Feature 4: Layout Shift Tracking

### Shift Detection (SelectionOverlay)

Extend the existing RAF loop with position stability tracking using **document-relative coordinates** (viewport position + scroll offset) to avoid false triggers from `scrollIntoView` changing viewport-relative positions:

```typescript
// Inside the useEffect RAF loop
let stableDocTop: number | null = null  // null = not yet initialized
let stableDocLeft: number | null = null
let lastChangeTime = 0
const STABLE_THRESHOLD_MS = 400  // matches edit pipeline debounce
const SHIFT_THRESHOLD_PX = 50

function update(): void {
  if (!element || !overlayRef.current) return
  if (!element.isConnected) return
  const r = element.getBoundingClientRect()

  // ... existing position tracking (viewport-relative, for overlay positioning) ...

  // Shift detection uses document-relative coordinates
  const docTop = r.top + window.scrollY
  const docLeft = r.left + window.scrollX

  // Initialize on first read — no shift detection until second frame
  if (stableDocTop === null) {
    stableDocTop = docTop
    stableDocLeft = docLeft
    rafId = requestAnimationFrame(update)
    return
  }

  const dTop = docTop - stableDocTop
  const dLeft = docLeft - stableDocLeft
  const shifted = Math.abs(dTop) > 2 || Math.abs(dLeft) > 2  // ignore sub-pixel jitter

  if (shifted) {
    lastChangeTime = performance.now()
  }

  const timeSinceChange = performance.now() - lastChangeTime
  if (timeSinceChange > STABLE_THRESHOLD_MS && lastChangeTime > 0) {
    const totalShift = Math.hypot(docTop - stableDocTop, docLeft - stableDocLeft)
    if (totalShift > SHIFT_THRESHOLD_PX) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    stableDocTop = docTop
    stableDocLeft = docLeft
    lastChangeTime = 0  // reset — don't re-trigger
  }

  rafId = requestAnimationFrame(update)
}
```

**Key behaviors:**
- `stableDocTop`/`stableDocLeft` initialized to `null`, seeded from first rect read — prevents false-positive auto-scroll on element selection
- Document-relative coordinates (`r.top + window.scrollY`) used for shift comparison — prevents `scrollIntoView` from re-triggering the shift detector (viewport positions change after scroll, but document positions stay stable)
- During scrub: rect changes every frame → `lastChangeTime` constantly resets → no auto-scroll
- After scrub release: rect stabilizes → 400ms passes → auto-scroll if shifted >50px
- Sub-pixel jitter (< 2px) ignored to prevent false triggers from browser rounding
- `performance.now()` for timing — monotonic, high-resolution

### Panel Auto-Reposition

After a committed change (`styleVersion` bump), check if panel overlaps the element.

**Call site:** `useEffect` in `Panel.tsx` that runs on `[styleVersion, element]`:
```typescript
useEffect(() => {
  if (!element) return
  const elementRect = element.getBoundingClientRect()
  recheckOverlap(elementRect)
}, [styleVersion, element, recheckOverlap])
```

**`useSnapToEdge` extension:**
```typescript
recheckOverlap(elementRect: DOMRect): void
```

Implementation: compute the panel's current viewport rect from `position` + `PANEL_WIDTH` + panel height. If rects intersect (standard AABB intersection test), call `snap()` with a forced target edge opposite to the current position. The hook already has access to `position` and `window.innerWidth`/`innerHeight`.

**Overlap detection:** Standard rect intersection: `!(A.right < B.left || A.left > B.right || A.bottom < B.top || A.top > B.bottom)`.

## CSS Classes (styles.css additions)

```
/* State bar */
.cortex-state-bar              — flex row, gap: 4px, padding: 4px 12px
.cortex-state-bar__btn         — pill button, 11px font, #9ca3af text
.cortex-state-bar__btn--active — blue bg/text highlight

/* Pseudo tabs */
.cortex-pseudo-tabs            — flex row, border-bottom: 1px solid rgba(255,255,255,0.06)
.cortex-pseudo-tab             — tab button, 11px font, padding: 6px 12px
.cortex-pseudo-tab--active     — 2px bottom border #3b82f6

/* Library badge */
.cortex-panel-header__library  — italic, color: #9ca3af, font-size: 10px

/* Dimmed properties */
.cortex-dimmed                 — opacity: 0.5, transition: opacity 150ms
```

## State Flow Summary

```
Element selected
  → parseCortexSource() → sourceInfo
  → isLibraryComponent() → library badge (only if node_modules source)
  → findUserAncestor() → header source (if library)
  → detectStates() → available states → state bar
  → detect ::before/::after → pseudo tabs
  → getComputedStyle(element) → default values → all sections
  → store defaultComputedStyles for dimming comparison
  → initialize layout shift stable position (null → first rect)

User clicks :hover
  → overrideManager.setStateOverrides(source, hover declarations)
  → bump styleVersion → re-read computed styles
  → diff defaultComputedStyles vs current → dimmedProperties set
  → sections render with dimming

User clicks ::before tab
  → getComputedStyle(element, '::before') → pseudo values → sections
  → override writes include pseudo parameter

User clicks :hover while on ::before tab
  → apply element-level hover overrides (setStateOverrides)
  → re-read getComputedStyle(element, '::before') (may reflect cascade changes)
  → dimming based on pseudo values comparison

User edits a value (in any state/pseudo)
  → applyOverride(property, value, commitRender, pseudo?)
  → CSSOverrideManager generates correct selector (with pseudo if set)
  → edit message sent to server with state/pseudo context

Element moves after edit
  → RAF detects document-relative position change
  → After 400ms stable: auto-scroll if >50px shift
  → Panel useEffect on styleVersion: recheckOverlap → reposition if needed
```

## Known Limitations

1. **State forcing is declaration-copy, not true pseudo-class activation.** We extract CSS declarations from `:hover` rules and apply them as overrides. The `:hover` pseudo-class itself is not activated. This means:
   - Rules like `.btn:hover::before { content: "hover!" }` won't take effect (the pseudo-element-specific hover rule isn't matched)
   - JavaScript `:hover` event handlers are not triggered (this is intentional — "visual only, no JS handlers fired")
   - Full state simulation would require CDP `CSS.forcePseudoState` which is unavailable from page JS

2. **Compound state rules (`.btn:hover:focus`) are simplified.** They're classified into individual state maps. Since we force one state at a time, compound state effects aren't perfectly reproduced. This is acceptable for the MVP — the vast majority of state rules use single pseudo-classes.

3. **Cross-origin stylesheets are invisible.** `sheet.cssRules` throws for cross-origin sheets. State rules in external CDN stylesheets won't be detected. Same-origin app stylesheets (the vast majority) work fine.

## Test Strategy

| Test File | What's Tested |
|---|---|
| `state-detector.test.ts` | CSSOM inspection with mock stylesheets, cross-origin safety, @media/@supports/@layer recursion, compound selectors (`.btn:hover`, `.parent:hover .child`, `.btn:hover:focus`, `.btn:hover::before` skip), element matching |
| `panel-header.test.tsx` | State bar rendering (conditional on available states), pseudo tabs (conditional on detection), library badge, state/pseudo click handlers, combined state+pseudo UI |
| `override.test.ts` | Pseudo-element selector generation, state override merge with user edits (user wins), `setStateOverrides`/`clearStateOverrides`, mixed state+pseudo overrides in rebuild |
| `label.test.ts` | `isLibraryComponent` (no source → false, node_modules source → true, user source → false), `findUserAncestor` (chain walk, skip node_modules ancestors, no ancestor → null) |
| `selection-overlay.test.tsx` | Shift detection timing (400ms debounce), >50px threshold, no scroll during continuous movement, sub-pixel jitter filtering, null initialization (no false trigger on selection), document-relative coordinates (scroll doesn't re-trigger) |

## Out of Scope

- Server-side 4-tier write-back strategy for library components (edit pipeline, future phase)
- Hover variant rewriting in TailwindRewriter (already implemented in Phase 4)
- CSS Modules `:hover` rule rewriting (Phase 8a)
- Keyboard shortcuts for state/pseudo toggling (Phase 8b)
- Pseudo-element-specific state detection (`.btn:hover::before`) — deferred, requires separate CSSOM strategy
- Compound state forcing (`:hover` + `:focus` simultaneously) — deferred, single state at a time for MVP
