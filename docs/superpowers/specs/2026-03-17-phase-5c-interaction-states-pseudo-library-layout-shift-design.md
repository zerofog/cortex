# Phase 5c: Interaction States, Pseudo-Elements, Library Components, Layout Shift

**Ticket:** ZF0-890
**Date:** 2026-03-17
**Status:** Approved

## Overview

Four features that extend the editor to handle advanced CSS scenarios: interaction state toggling via a "state lens" on the selection overlay (:hover/:focus/:active), pseudo-element editing tabs in the panel (::before/::after), third-party library component detection with (library) attribution, and layout shift tracking with auto-scroll.

**Dependency:** Phase 5b (ZF0-889) — Done.

**Core UX principle:** State viewing happens where the element is (the lens overlay). Property editing happens in the panel. Don't mix viewing and editing controls — meet the user where they are.

## Feature 1: Interaction State Toggles — The State Lens

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
- `.btn:hover:focus` → stripped twice: once for `:hover` (yields `.btn:focus`), once for `:focus` (yields `.btn:hover`). Each stripped selector is tested via `element.matches()`. **Declarations are only added to a state map if the stripped selector matches.** Since the element isn't actually in `:focus` or `:hover` state, `element.matches('.btn:focus')` and `element.matches('.btn:hover')` both return `false` — the declarations are dropped. This is correct behavior: compound state rules are for combined states, and we force one state at a time. The simplification is acceptable for the MVP.
- `.parent:hover .child` → stripping `:hover` yields `.parent .child`. `element.matches('.parent .child')` is true only if the DOM structure matches. This correctly detects state rules that depend on ancestor relationships. Note: the ancestor's hover state isn't being simulated — only the declarations are extracted and applied to the target element.

**Test expectations for compound selectors:**
- `.btn:hover` on matching `.btn` → hover map gets declarations
- `.btn:hover:focus` on matching `.btn` → strip `:hover` yields `.btn:focus`, `element.matches('.btn:focus')` = `false` → **not added to hover map**. Strip `:focus` yields `.btn:hover`, `element.matches('.btn:hover')` = `false` → **not added to focus map**. Result: declarations dropped entirely. This is correct — compound state rules require both states active simultaneously.
- `.parent:hover .child` on matching `.child` with `.parent` ancestor → hover map gets declarations
- `.btn:hover::before` → skipped entirely (pseudo-element in selector)

### State Lens UI (SelectionOverlay)

The state toggles live on the selection overlay — not in the panel. The element itself is the preview. Clicking a state forces the element to show that state's appearance in-place in the app.

**Layout — standard element:**
```
     Default  :hover  :focus  :active     ← lens controls (above element)
    ┌──────────────────────────────────┐
    │                                  │   ← selection outline
    │   [ element showing forced       │
    │     state in-place ]             │
    │                                  │
    └──────────────────────────────────┘
     Card — Card.tsx:22                    ← label (below element)
```

**Layout — small element (controls wider than element):**
```
          Default  :hover  :focus
               ┌──────┐
               │  ★   │    ← 24x24 icon
               └──────┘
                 svg
```
Controls centered above element, extending beyond element width. Selection outline stays tight to the element.

**Layout — near top of viewport (no room above):**
```
     Card — Card.tsx:22                    ← label flips to top
    ┌──────────────────────────────────┐
    │                                  │
    │   [ element ]                    │
    │                                  │
    └──────────────────────────────────┘
     Default  :hover  :focus  :active     ← controls flip to bottom
```
Label and controls swap positions — always keep both visible within the viewport.

**Vertical positioning threshold:** The existing label threshold (`r.top > 30`) must be updated to account for the lens bar height. When both lens and label are above the element, they need ~54px of clearance (24px lens + 4px gap + 20px label + 6px gap). The threshold becomes:
- `r.top > 54` → both lens (above) and label (below) fit in default positions
- `r.top <= 54` → flip: label above element, lens below element
- If no state lens is shown (no available states), revert to original `r.top > 30` threshold

**Horizontal repositioning:** If controls extend beyond viewport left/right edges, shift horizontally to stay within the viewport while remaining as close to centered as possible.

**Visibility rules:**
- Controls only appear when at least one state has declarations (from `detectStates`)
- `Default` is always shown when any other state is available
- Active state pill has highlight styling: `background: rgba(59, 130, 246, 0.15); color: #3b82f6`
- Inactive pills: `color: #9ca3af` (muted)

**CSS classes:**
- `cortex-state-lens` — container for the toggle row, positioned absolutely relative to the selection overlay
- `cortex-state-lens__btn` — pill button, 11px font
- `cortex-state-lens__btn--active` — active state highlight

### SelectionOverlay Props Extension

```typescript
export interface SelectionOverlayProps {
  element: HTMLElement | null
  availableStates?: StateDeclarations
  activeState?: 'default' | 'hover' | 'focus' | 'active'
  onStateChange?: (state: 'default' | 'hover' | 'focus' | 'active') => void
}
```

CortexApp orchestrates state:
1. On element selection → runs `detectStates(element)` → stores as `availableStates`
2. Passes `availableStates`, `activeState`, `onStateChange` to SelectionOverlay
3. Passes `activeState` to Panel (for computed style reading + dimming)
4. On state change callback from lens → updates `activeState`, applies/clears state overrides via `CSSOverrideManager`

SelectionOverlay remains primarily a display component — it renders the lens controls and emits state change events, but the state management lives in CortexApp.

**Click handling:** The lens control buttons are inside the shadow DOM (part of CortexApp's render tree). The existing `isOwnUI(event)` check in the selection system — which inspects `event.composedPath()` for `data-cortex-host` — already prevents lens clicks from triggering element selection. No change needed to the selection system.

### State Forcing Mechanism

When the user clicks a state toggle (e.g., `:hover`) on the lens:
1. CortexApp receives `onStateChange('hover')`
2. Retrieves `StateDeclarations` for the element (cached per selection, invalidated on element change)
3. Applies all declarations from the selected state's map via `CSSOverrideManager.setStateOverrides(source, declarations)`
4. Updates `activeState` → triggers Panel re-render
5. Panel's `computedStyles` useMemo re-runs (depends on `[element, styleVersion, activeState]`) → re-reads `getComputedStyle` → shows forced state values
6. The element in the app visually shows its hover appearance (CSS overrides applied)

**Critical implementation detail:** Panel's `computedStyles` useMemo **must include `activeState` in its dependency array**:
```typescript
const computedStyles = useMemo(() => {
  if (!element) return { /* ... defaults ... */ }
  const cs = getComputedStyle(element)  // or getComputedStyle(element, activePseudo)
  return { spacing: parseSpacingValues(cs), /* ... */ }
}, [element, styleVersion, activeState, activePseudo])
```
Without `activeState` in the deps, the state override is applied to the `<style>` tag but Panel's memoized `computedStyles` won't re-run — the panel would show stale default values despite the element visually changing. This is because `getComputedStyle()` returns a live reference, but `useMemo` only re-evaluates when deps change.

When switching back to `Default`:
1. CortexApp receives `onStateChange('default')`
2. Calls `CSSOverrideManager.clearStateOverrides()` — removes all state-forced declarations
3. Updates `activeState` → Panel's `computedStyles` useMemo re-runs
4. Element returns to default appearance

**ESC / click-out behavior:**
1. User forces `:hover` → element shows hover state, lens shows `:hover` active
2. User edits a value while in hover state → CSS override from edit applied + edit sent to source
3. User presses ESC or clicks outside → **element deselects**, lens disappears, forced state removed
4. CSS overrides from user edits **persist** (they're user edits, not state overrides)
5. User re-selects the same element → lens appears with `Default` active, element shows default appearance (with persisted user edit overrides)
6. User clicks `:hover` on lens → element shows hover state **including previously edited values** (from persisted overrides or from source edit via HMR)

### Override Separation Architecture

State overrides are stored in a **separate internal map** inside `CSSOverrideManager`, distinct from user edit overrides. During `rebuild()`, both maps are merged per-source — declarations from both maps targeting the same `data-cortex-source` value are combined into a single CSS rule.

```typescript
// CSSOverrideManager internal structure
private overrides = new Map<string, Map<string, string>>()       // user edits
private stateOverrides = new Map<string, Map<string, string>>()  // forced state

// New public API
setStateOverrides(source: string, declarations: Map<string, string>): void
// Validates each entry against VALID_PROPERTY/VALID_VALUE/REJECT_URL before storing.
// Although declarations are CSSOM-sourced, compromised npm package CSS or MITM on dev
// server could inject malicious values. The validation cost is negligible.
// Stores in stateOverrides map keyed by raw source (never pseudo-suffixed).
// Calls scheduleRebuild().

clearStateOverrides(): void
// Clears the stateOverrides map and calls rebuild() synchronously (not scheduleRebuild)
// to ensure the <style> tag is updated before the next getComputedStyle read.

// rebuild() merges both maps, splitting pseudo suffixes from override keys
private rebuild(): void {
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

### Dimming Unchanged Properties

When a non-default state is active, properties whose computed value matches the default state get `opacity: 0.5` in the panel. This highlights what actually changes in the forced state.

**Implementation:** Panel stores a `defaultComputedStyles` **snapshot** when the element is first selected (before any state forcing). This must be a plain object snapshot, NOT a live `CSSStyleDeclaration` reference (which would change as overrides are applied, making the diff meaningless).

```typescript
// Snapshot stored as a ref, updated only on element change
const defaultStylesRef = useRef<Record<string, string> | null>(null)
useEffect(() => {
  if (!element) { defaultStylesRef.current = null; return }
  const cs = getComputedStyle(element)
  // Snapshot the specific properties we need for dimming comparison
  const snapshot: Record<string, string> = {}
  for (const prop of ALL_DIMMING_PROPERTIES) snapshot[prop] = cs.getPropertyValue(prop)
  defaultStylesRef.current = snapshot
}, [element])  // only on element change, NOT on styleVersion or activeState
```

After state forcing, Panel re-reads computed styles and diffs against the snapshot to produce a `Set<string>` of changed CSS property names.

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

### Pseudo Tab UI (Panel)

Pseudo-element tabs live in the panel — they switch which part of the element the user is editing. This is an editing concern, not a viewing concern.

```
┌─────────────────────────────────┐
│  <h2> · section-title           │
│  SectionTitle — Hero.tsx:15     │
│                                 │
│  [element]  ::before  ::after   │  ← pseudo tabs in panel
│─────────────────────────────────│
│  Font Size    16                │
│  ...                            │
└─────────────────────────────────┘
```

- Rendered as a row of tabs below the panel header info
- Only tabs for detected pseudo-elements are shown; `element` tab always shown when any pseudo exists
- Active tab: underline style (2px bottom border, `#3b82f6`)
- CSS class: `cortex-pseudo-tabs`, tabs: `cortex-pseudo-tab`, active: `cortex-pseudo-tab--active`

**Panel state:** `activePseudo: 'element' | '::before' | '::after'` managed in Panel.

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
- The state lens on the overlay remains functional — state toggles and pseudo tabs work independently

**State + pseudo interaction:** When both a state (on the lens) and pseudo tab (in the panel) are active (e.g., `:hover` + `::before`):
- State forcing applies element-level hover overrides (affects the element's styling context)
- Panel reads `getComputedStyle(element, '::before')` which may reflect changes from the forced state
- Override writes for pseudo properties include the `pseudo` parameter
- **Limitation:** Rules like `.btn:hover::before { content: "hover!" }` are skipped by `detectStates` (pseudo-element in selector). These rules won't be directly forced because the `:hover` pseudo-class isn't actually activated — we only copy declarations as overrides. Full state simulation would require CDP `CSS.forcePseudoState` (not available from page JS). This is a known limitation.

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
let scrollCooldownUntil = 0  // prevents re-entrancy after scrollIntoView
const STABLE_THRESHOLD_MS = 400  // matches edit pipeline debounce
const SHIFT_THRESHOLD_PX = 50
const SCROLL_COOLDOWN_MS = 1000  // ignore shifts during smooth scroll animation

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

  // During scroll cooldown: keep baseline current but skip shift detection
  if (performance.now() < scrollCooldownUntil) {
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
      scrollCooldownUntil = performance.now() + SCROLL_COOLDOWN_MS
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
- **Scroll cooldown (1000ms):** After calling `scrollIntoView`, shift detection is suspended for 1 second. During cooldown, the stable baseline tracks the current position but no shift comparison runs. This prevents re-entrancy from async smooth scroll animation (which changes viewport positions frame-by-frame) or layout side effects (sticky headers, sibling reflow).

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

Implementation: compute the panel's current viewport rect from `position` + `PANEL_WIDTH` + panel height. `PANEL_MAX_HEIGHT` (460px) is used as a **conservative upper bound** for the panel height — the actual rendered panel may be shorter when fewer sections are visible, but false-positive repositioning (moving the panel when it doesn't strictly overlap) is preferable to missing an actual overlap. If rects intersect (standard AABB intersection test), call `snap()` with a forced target edge opposite to the current position. The hook already has access to `position` and `window.innerWidth`/`innerHeight`.

**Overlap detection:** Standard rect intersection: `!(A.right < B.left || A.left > B.right || A.bottom < B.top || A.top > B.bottom)`.

## Component Architecture

### Data Flow

```
CortexApp (state orchestrator)
  ├─ detectStates(element) → availableStates
  ├─ activeState: 'default' | 'hover' | 'focus' | 'active'
  ├─ CSSOverrideManager (setStateOverrides / clearStateOverrides)
  │
  ├─→ SelectionOverlay
  │     ├─ element, availableStates, activeState, onStateChange
  │     ├─ Renders: outline + label + state lens controls
  │     └─ Layout shift tracking (RAF loop)
  │
  └─→ Panel
        ├─ element, overrideManager, activeState
        ├─ Reads getComputedStyle (respects activeState for dimming)
        ├─ Pseudo-element tabs (activePseudo — panel-internal state)
        ├─ Library badge (isLibraryComponent check)
        └─ All property sections with dimmedProperties
```

### Component Boundary Summary

| New/Modified | Responsibility |
|---|---|
| **NEW** `state-detector.ts` | CSSOM inspection, state declaration extraction |
| **MOD** `SelectionOverlay.tsx` | State lens controls UI, layout shift tracking, label/controls positioning |
| **MOD** `PanelHeader.tsx` | Pseudo-element tabs, library badge (state toggles removed) |
| **MOD** `override.ts` | State override storage + merge, pseudo-element selector support |
| **MOD** `label.ts` | `isLibraryComponent()` + `findUserAncestor()` |
| **MOD** `Panel.tsx` | Pseudo-element state management, dimming logic, activeState prop for computed styles |
| **MOD** `CortexApp.tsx` | State detection orchestration, activeState management, wiring lens ↔ panel |
| **MOD** `useSnapToEdge.ts` | `recheckOverlap()` for panel repositioning |
| **MOD** `styles.css` | State lens, pseudo tabs, library badge, dimmed property styling |

## CSS Classes (styles.css additions)

```
/* State lens (on selection overlay) */
.cortex-state-lens              — flex row, gap: 4px, padding: 2px 8px,
                                  background: rgba(0, 0, 0, 0.75), border-radius: 6px,
                                  positioned absolutely above/below selection outline
.cortex-state-lens__btn         — pill button, 11px font, #9ca3af text,
                                  padding: 2px 8px, border-radius: 4px, cursor: pointer
.cortex-state-lens__btn--active — background: rgba(59, 130, 246, 0.15), color: #3b82f6

/* Pseudo tabs (in panel) */
.cortex-pseudo-tabs             — flex row, border-bottom: 1px solid rgba(255,255,255,0.06)
.cortex-pseudo-tab              — tab button, 11px font, padding: 6px 12px
.cortex-pseudo-tab--active      — 2px bottom border #3b82f6

/* Library badge (in panel header) */
.cortex-panel-header__library   — italic, color: #9ca3af, font-size: 10px

/* Dimmed properties (in panel sections) */
.cortex-dimmed                  — opacity: 0.5, transition: opacity 150ms
```

## State Flow Summary

```
Element selected
  → CortexApp: parseCortexSource() → sourceInfo
  → CortexApp: detectStates(element) → availableStates (cached)
  → CortexApp: detect ::before/::after (passed to Panel)
  → CortexApp: activeState = 'default'
  → SelectionOverlay: render outline + label + state lens (if states available)
  → Panel: isLibraryComponent() → library badge
  → Panel: findUserAncestor() → header source (if library)
  → Panel: getComputedStyle(element) → default values → all sections
  → Panel: store defaultComputedStyles for dimming comparison
  → SelectionOverlay: initialize layout shift stable position (null → first rect)

User clicks :hover on lens
  → SelectionOverlay: onStateChange('hover') → CortexApp
  → CortexApp: overrideManager.setStateOverrides(source, hover declarations)
  → CortexApp: setActiveState('hover') → triggers re-render
  → Element in app: visually shows hover appearance
  → Panel: bumps styleVersion → re-reads computed styles
  → Panel: diff defaultComputedStyles vs current → dimmedProperties set
  → Panel: sections render with dimming on unchanged properties

User clicks ::before tab in panel
  → Panel: setActivePseudo('::before')
  → Panel: getComputedStyle(element, '::before') → pseudo values → sections
  → Panel: override writes include pseudo parameter
  → Lens on overlay: state toggles remain functional (independent of pseudo tab)

User clicks :hover on lens while panel shows ::before
  → CortexApp: setStateOverrides(source, hover declarations)
  → Element in app: visually shows hover appearance
  → Panel: re-reads getComputedStyle(element, '::before') (may reflect cascade changes)
  → Panel: dimming based on pseudo values comparison

User edits a value in panel (in any state/pseudo)
  → Panel: applyOverride(property, value, commitRender, pseudo?)
  → CSSOverrideManager generates correct selector (with pseudo if set)
  → Edit message sent to server with state/pseudo context

User presses ESC or clicks outside element
  → CortexApp: setSelectedElement(null)
  → CortexApp: clearStateOverrides() — forced state removed
  → CortexApp: setActiveState('default')
  → SelectionOverlay: unmounts (lens disappears)
  → CSS overrides from user edits persist in CSSOverrideManager
  → Element returns to default appearance (plus any persisted user edits)

User re-selects same element
  → CortexApp: detectStates() re-run, activeState = 'default'
  → Lens appears with Default active
  → User clicks :hover → sees hover state including previously edited values

Element moves after edit
  → SelectionOverlay RAF: detects document-relative position change
  → After 400ms stable: auto-scroll if >50px shift
  → Panel: useEffect on styleVersion → recheckOverlap → reposition if needed
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
| `selection-overlay.test.tsx` | **State lens:** conditional rendering (shown only when states available), active state highlight, state change callback emission, positioning (above/below/horizontal shift), small element centering. **Layout shift:** timing (400ms debounce), >50px threshold, no scroll during continuous movement, sub-pixel jitter filtering, null initialization, document-relative coordinates |
| `panel-header.test.tsx` | Pseudo-element tabs (conditional on detection), library badge, pseudo tab click handlers |
| `override.test.ts` | Pseudo-element selector generation, state override merge with user edits (user wins), `setStateOverrides`/`clearStateOverrides`, mixed state+pseudo overrides in rebuild |
| `label.test.ts` | `isLibraryComponent` (no source → false, node_modules source → true, user source → false), `findUserAncestor` (chain walk, skip node_modules ancestors, no ancestor → null) |
| `cortex-app.test.tsx` | State orchestration: detectStates on selection, activeState management, state override apply/clear lifecycle, ESC/deselect clears state but preserves user edits |

## Out of Scope

- Server-side 4-tier write-back strategy for library components (edit pipeline, future phase)
- Hover variant rewriting in TailwindRewriter (already implemented in Phase 4)
- CSS Modules `:hover` rule rewriting (Phase 8a)
- Keyboard shortcuts for state/pseudo toggling (Phase 8b)
- Pseudo-element-specific state detection (`.btn:hover::before`) — deferred, requires separate CSSOM strategy
- Compound state forcing (`:hover` + `:focus` simultaneously) — deferred, single state at a time for MVP
