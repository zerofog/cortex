# Phase 5a: Layout + Typography Sections + Segmented Controls + Dropdowns

**Ticket:** ZF0-888
**Date:** 2026-03-14
**Status:** Approved

## Overview

Build four new Preact components for the Cortex visual editor panel: two shared controls (SegmentedControl, Dropdown) and two panel sections (LayoutSection, TypographySection). These extend the panel beyond SpacingSection (Phase 3) to cover the two most frequently edited CSS property groups.

## Design Decisions

### D1: Visibility Toggle — Separate Row (not merged with Display)

Display and visibility are independent CSS properties. The Layout section keeps `display` as its own SegmentedControl (`block`/`flex`/`grid`/`inline`/`none`) and adds a separate Visibility row (`visible`/`hidden`). The Visibility row is hidden when `display: none` since the element is removed from flow entirely.

**Rationale:** Maps cleanly to CSS semantics. The conditional hiding reinforces understanding of how these properties interact.

### D2: Typography Color — Editable Hex Input (no picker yet)

COL row renders a color swatch (small colored square) plus an editable text input for hex values. Clicking the swatch does nothing in Phase 5a. Phase 5b (ZF0-889) adds the ColorPicker popover as an enhancement to the swatch click handler.

**Rationale:** Manual hex entry covers power users now. The editable input is trivial to build and the ColorPicker slots in later without rework.

### D3: Font/Weight Dropdown Content — Application Fonts Only

Font dropdown is populated from `document.fonts` API (loaded FontFace objects) plus the current element's computed font-family (always included even if it's a system font). Weight dropdown shows available weights for the selected font family, extracted from `document.fonts`.

No hardcoded common font lists. Future phases will extend sources to include user's local font directory and design system tokens.

**Rationale:** Only shows fonts the app actually uses. Zero server calls needed.

## Components

### 1. SegmentedControl

**File:** `src/browser/components/controls/SegmentedControl.tsx`

Generic radio-button row with sliding active indicator.

#### Props

```ts
export interface SegmentedOption {
  value: string
  label?: string       // text label (omit for icon-only)
  icon?: string        // SVG string or unicode icon
  title?: string       // tooltip on hover
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'  // sm for icon-only, md for text (default: md)
}
```

#### Behavior

- Single active state — only one option selected at a time
- Click toggles active option, calls `onChange` with new value
- **Sliding indicator:** An absolutely-positioned highlight `<div>` behind the active option. Position updated via `transform: translateX()` with 150ms ease-out CSS transition. Dimensions read from active button's `offsetLeft`/`offsetWidth`.
- Indicator uses compositor-only animation (transform) — no layout thrashing
- Keyboard: Arrow keys move between options, Space/Enter selects

#### Accessibility

- Container: `role="radiogroup"`
- Each option: `role="radio"`, `aria-checked="true|false"`
- Active option: `tabindex="0"`, all others: `tabindex="-1"`
- Arrow keys move focus and selection between options

#### CSS Classes

```
.cortex-segmented              — outer track (flex row, background pill)
.cortex-segmented__indicator   — sliding highlight (absolute, transition)
.cortex-segmented__option      — individual button
.cortex-segmented__option--active  — active state (text color change)
.cortex-segmented--sm          — compact variant for icon-only
```

### 2. Dropdown

**File:** `src/browser/components/controls/Dropdown.tsx`

Generic select-like control with popover list and type-to-filter.

#### Dependencies

- `@floating-ui/dom` (~3KB) — `computePosition()` with `flip()` and `shift()` middleware

#### Props

```ts
export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}
```

#### Behavior

- **Trigger:** Full-width button showing selected label + chevron icon
- **Open:** Click trigger → show popover, focus filter input, position via `computePosition()`
- **Filter:** Type to narrow options list. Case-insensitive substring match. When filter matches zero options, show a disabled "No matches" row.
- **Select:** Click option or press Enter on highlighted option → calls `onChange`, closes popover
- **Close:** Click outside (backdrop click handler), Escape key, or select an option
- **Positioning:** `@floating-ui/dom` with `flip()` (flips above trigger when near viewport bottom) + `shift()` (shifts horizontally to stay in viewport)
- **Keyboard:** Arrow keys navigate options, Enter selects, Escape closes

#### Popover Strategy

The popover list uses `position: fixed` inside the Shadow DOM, positioned by `@floating-ui/dom`'s `computePosition()`. The shadow host already sits at `z-index: 2147483646`, so fixed-positioned content inside it renders above all app content.

**Why not native `popover` attribute:** The `popover` attribute promotes elements to the document's top layer. While the element remains in the shadow tree, browser implementations have inconsistencies with styling top-layer elements from Shadow DOM stylesheets. Using `position: fixed` avoids this entirely and works reliably.

**Light dismiss:** A transparent fullscreen backdrop `<div>` behind the popover catches outside clicks. The backdrop is rendered when the popover opens and removed on close. Escape key is handled via `onKeyDown`.

#### CSS Classes

```
.cortex-dropdown               — outer wrapper
.cortex-dropdown__trigger      — button (flex, full-width)
.cortex-dropdown__value        — selected text
.cortex-dropdown__chevron      — arrow icon (rotates on open)
.cortex-dropdown__popover      — popover container
.cortex-dropdown__filter       — filter text input inside popover
.cortex-dropdown__list         — scrollable option list
.cortex-dropdown__option       — individual option row
.cortex-dropdown__option--active   — keyboard-highlighted option
.cortex-dropdown__option--selected — currently selected value
.cortex-dropdown__backdrop         — transparent fullscreen overlay for light dismiss
.cortex-dropdown__empty            — "No matches" disabled row
```

### 3. LayoutSection

**File:** `src/browser/components/sections/LayoutSection.tsx`

#### Props

```ts
export interface LayoutChange {
  property: string   // CSS property name
  value: string      // CSS value
}

export interface LayoutValues {
  display: string
  visibility: string
  flexDirection: string
  justifyContent: string
  alignItems: string
  width: string
  height: string
}

export interface LayoutSectionProps {
  values: LayoutValues
  onChange: (change: LayoutChange) => void
  onScrub?: (change: LayoutChange) => void
  onScrubEnd?: (change: LayoutChange) => void
}
```

#### Layout

```
Layout
─────────────────────────────────────────────
Display
 [block] [flex] [grid] [inline] [none]        segmented, icon+text

Visibility                                     hidden when display=none
 [visible] [hidden]                            segmented

Flex Direction                                  flex only, animated reveal
 [→] [←] [↓] [↑]                              icon-only segmented

Justify                                         flex/grid only, animated reveal
 [start] [center] [end] [between] [around]     icon-only segmented

Align                                           flex/grid only, animated reveal
 [start] [center] [end] [stretch] [baseline]   icon-only segmented

Sizing
 W [───] px   H [───] px                       paired NumericInputs
```

#### Conditional Rendering

- Visibility row: hidden when `display === 'none'`
- Flex Direction: shown only when `display === 'flex'` or `display === 'inline-flex'`
- Justify / Align: shown when display is flex, inline-flex, grid, or inline-grid
- **Contextual reveal animation:** Conditional rows use `max-height` + `opacity` CSS transition (~200ms) for smooth appear/disappear

#### Computed Style Reading

```ts
function parseLayoutValues(cs: CSSStyleDeclaration): LayoutValues {
  return {
    display: cs.display,
    visibility: cs.visibility,
    flexDirection: cs.flexDirection,
    justifyContent: cs.justifyContent,
    alignItems: cs.alignItems,
    width: cs.width,                    // computed px string, parseFloat for NumericInput
    height: cs.height,
  }
}
```

#### Root Element

```tsx
<div class="cortex-layout-section" data-section-id="layout">
```

The `data-section-id="layout"` attribute is required for IntersectionObserver-based tab sync (matches TabNav's `id: 'layout'`).

#### Override Values — Formatting Rules

All `LayoutChange.value` values are pre-formatted CSS strings. The section handles formatting before calling `onChange`:

| Property | Source | Format | Example |
|---|---|---|---|
| `display` | SegmentedControl | raw string | `"flex"` |
| `visibility` | SegmentedControl | raw string | `"hidden"` |
| `flex-direction` | SegmentedControl | raw string | `"column"` |
| `justify-content` | SegmentedControl | raw string | `"center"` |
| `align-items` | SegmentedControl | raw string | `"stretch"` |
| `width` | NumericInput (number) | `${value}px` | `"320px"` |
| `height` | NumericInput (number) | `${value}px` | `"48px"` |

Width/Height formatting happens inside LayoutSection's change handler:
```ts
const handleWidthChange = (v: number) => onChange({ property: 'width', value: `${v}px` })
```

#### Width/Height `auto` Handling

`getComputedStyle` can return `auto` for width/height on inline elements or elements without explicit sizing. When `parseFloat(cs.width)` returns `NaN`:
- NumericInput receives `0` as fallback value
- A placeholder label "auto" is shown instead of the unit suffix
- Editing the value replaces `auto` with an explicit px value

### 4. TypographySection

**File:** `src/browser/components/sections/TypographySection.tsx`

#### Props

```ts
export interface TypographyChange {
  property: string
  value: string
}

export interface TypographyValues {
  fontFamily: string
  fontSize: number        // parsed from computed px value
  fontWeight: string      // e.g. '400', '700'
  lineHeight: number      // parsed, unitless ratio or px
  letterSpacing: number   // parsed px
  textAlign: string
  color: string           // computed rgb/hex
}

export interface TypographySectionProps {
  values: TypographyValues
  availableFonts: string[]       // from document.fonts
  availableWeights: string[]     // for selected font family
  onChange: (change: TypographyChange) => void
  onScrub?: (change: TypographyChange) => void
  onScrubEnd?: (change: TypographyChange) => void
}
```

#### Layout

```
Type
─────────────────────────────────────────────
Font
 [Inter ──────────────────────────── ▾]       Dropdown

 SZ [16]─px    WT [Regular ─────── ▾]        NumericInput + Dropdown, same row

 LH [1.5]      LS [0]───px                   paired NumericInputs, same row

Align
 [≡←] [≡] [≡→] [≡↔]                         icon-only segmented

 COL [■] [#6b7280───────]                    swatch + editable hex input
```

#### Root Element

```tsx
<div class="cortex-typography-section" data-section-id="type">
```

The `data-section-id="type"` attribute is required for IntersectionObserver-based tab sync (matches TabNav's `id: 'type'`).

#### Override Values — Formatting Rules

All `TypographyChange.value` values are pre-formatted CSS strings. The section handles formatting before calling `onChange`:

| Property | Source | Format | Example |
|---|---|---|---|
| `font-family` | Dropdown | unquoted name | `"Inter"` |
| `font-size` | NumericInput (number) | `${value}px` | `"16px"` |
| `font-weight` | Dropdown | numeric string | `"700"` |
| `line-height` | NumericInput (number) | unitless ratio | `"1.5"` |
| `letter-spacing` | NumericInput (number) | `${value}px` | `"0.5px"` |
| `text-align` | SegmentedControl | raw string | `"center"` |
| `color` | Hex input | hex string | `"#6b7280"` |

**line-height note:** The section displays and emits unitless ratios (e.g., `1.5`), not px values. This is the CSS best practice. When `fontSize` changes, the displayed `lineHeight` ratio is automatically correct because the `useMemo` re-reads `getComputedStyle` (via `styleVersion` bump).

#### Font Detection

```ts
function getAvailableFonts(): string[] {
  if (!document.fonts?.[Symbol.iterator]) return []
  const families = new Set<string>()
  for (const face of document.fonts) {
    families.add(face.family.replace(/^["']|["']$/g, ''))
  }
  return [...families].sort()
}

function getWeightsForFamily(family: string): string[] {
  if (!document.fonts?.[Symbol.iterator]) return ['400']
  const weights = new Set<string>()
  for (const face of document.fonts) {
    const faceName = face.family.replace(/^["']|["']$/g, '')
    if (faceName === family) {
      // Handle variable font weight ranges like "100 900"
      const w = face.weight
      if (w.includes(' ')) {
        // Variable font: add standard weight stops within range
        const [min, max] = w.split(' ').map(Number)
        for (const std of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
          if (std >= min && std <= max) weights.add(String(std))
        }
      } else {
        weights.add(w)
      }
    }
  }
  return [...weights].sort((a, b) => Number(a) - Number(b))
}
```

#### Weight Label Mapping

```ts
const WEIGHT_LABELS: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semibold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
}
```

#### Color Display

The COL row renders:
- A 16x16 colored square (`<div>` with background-color set to the computed color value)
- An editable text input showing the hex representation
- Swatch click: no-op in Phase 5a (Phase 5b adds ColorPicker popover)

**RGB-to-hex conversion:** `getComputedStyle` returns color in multiple formats depending on browser and alpha value:
- `rgb(r, g, b)` — legacy comma syntax
- `rgb(r g b)` — modern space syntax (CSS Color Level 4)
- `rgba(r, g, b, a)` — legacy with alpha
- `rgb(r g b / a)` — modern with alpha

The parser handles all four via regex: `/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/` — extracts the first three numeric values regardless of separator. Alpha is ignored for display (shown as hex without alpha).

**Hex validation:** Accept `#RRGGBB` format only (6-digit hex with `#` prefix). On blur, if the input doesn't match `/^#[0-9a-fA-F]{6}$/`, revert to the previous valid value. This matches the common expectation and avoids ambiguity with shorthand or alpha formats.

#### Computed Style Reading

```ts
function parseTypographyValues(cs: CSSStyleDeclaration): TypographyValues {
  return {
    fontFamily: cs.fontFamily,
    fontSize: parseFloat(cs.fontSize) || 16,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight === 'normal' ? 1.5 : parseFloat(cs.lineHeight) / (parseFloat(cs.fontSize) || 16),
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
    textAlign: cs.textAlign,
    color: cs.color,
  }
}
```

### 5. Panel.tsx Integration

#### New Computed Styles

Extend the `computedStyles` useMemo:

```ts
const computedStyles = useMemo(() => {
  if (!element) return { spacing: ..., layout: ..., typography: ... }
  const cs = getComputedStyle(element)
  return {
    spacing: parseSpacingValues(cs),
    isFlexOrGrid: ...,
    layout: parseLayoutValues(cs),
    typography: parseTypographyValues(cs),
  }
}, [element, styleVersion])
```

#### New Override Handlers

Follow the same commit/scrub pattern as `applySpacingOverride`:

```ts
const applyLayoutOverride = useCallback((change: LayoutChange, commitRender: boolean) => {
  if (!element) return
  const source = element.getAttribute('data-cortex-source')
  if (source) {
    overrideManager.set(source, change.property, change.value)
    if (commitRender) {
      overrideManager.flush()
      setStyleVersion(v => v + 1)
    }
  }
}, [element, overrideManager])

// Same pattern for applyTypographyOverride
```

#### Section Wiring

Replace placeholder divs:

```tsx
<LayoutSection
  values={computedStyles.layout}
  onChange={handleLayoutCommit}
  onScrub={handleLayoutScrub}
  onScrubEnd={handleLayoutCommit}
/>
<TypographySection
  values={computedStyles.typography}
  availableFonts={availableFonts}
  availableWeights={availableWeights}
  onChange={handleTypographyCommit}
  onScrub={handleTypographyScrub}
  onScrubEnd={handleTypographyCommit}
/>
```

#### Font List Caching

`availableFonts` is computed once per element selection (not per render). Use `useMemo` keyed on a stable value. `availableWeights` updates when the font family changes.

### 6. Styling

**File:** `src/browser/styles.css` (append)

All new styles follow existing conventions:
- `cortex-` prefix with BEM naming
- No CSS custom properties (matches existing approach)
- Inline styles only for dynamic values (indicator position, swatch color)
- Light theme colors matching existing palette (#111827, #6b7280, #9ca3af, #f3f4f6, #3b82f6)

Key new style patterns:
- `.cortex-segmented` — pill-shaped track with relative positioning for indicator
- `.cortex-segmented__indicator` — `transition: transform 150ms ease-out, width 150ms ease-out`
- `.cortex-layout-section__reveal` — `transition: max-height 200ms ease-out, opacity 200ms ease-out; overflow: hidden`
- `.cortex-dropdown__popover` — `position: fixed` with border-radius, shadow, background
- `.cortex-dropdown__backdrop` — transparent fullscreen overlay for light dismiss
- `.cortex-dropdown__chevron` — `transition: transform 150ms ease-out` for rotation

### 7. Dependencies

Add to `package.json` dependencies:
```json
"@floating-ui/dom": "^1.6.0"
```

## Testing Strategy

### Test Environment Notes

- **`document.fonts` mock:** happy-dom does not implement `FontFaceSet` as iterable. Tests must mock `document.fonts` with a `[Symbol.iterator]` property returning `FontFace`-like objects with `family` and `weight` fields. Add `mockDocumentFonts(faces)` helper to `tests/browser/helpers.ts`.
- **`@floating-ui/dom` mock:** Mock `computePosition()` to return `{x, y}` coordinates. For flip tests, return different y values to simulate viewport edge behavior.

### SegmentedControl Tests

- Renders all options with correct labels/icons
- Click toggles active state, calls onChange with value
- Only one option active at a time (previous deactivates)
- Keyboard navigation (ArrowLeft/Right move, Enter/Space select)
- ARIA attributes: `role="radiogroup"`, `role="radio"`, `aria-checked`

### Dropdown Tests

- Renders trigger with selected value label
- Click opens popover (sets display/visibility)
- Type-to-filter narrows options (case-insensitive)
- Filter with zero matches shows "No matches" disabled row
- Click option selects, calls onChange, closes popover
- Escape closes popover
- Backdrop click closes popover (light dismiss)
- Keyboard: Arrow keys navigate, Enter selects

### LayoutSection Tests

- Reads correct display/flex values from mocked getComputedStyle
- Visibility row hidden when display=none
- Flex-specific rows only shown for flex/inline-flex display
- Grid-specific rows shown for grid/inline-grid display
- Sizing inputs emit correctly formatted `"320px"` values (not raw numbers)
- Width/height `auto` displays fallback (0 with "auto" label)
- Visibility toggle emits correct CSS property override (`visibility: hidden`)
- `data-section-id="layout"` present on root element

### TypographySection Tests

- Reads correct font-size, font-weight, line-height, letter-spacing
- Font dropdown populated from availableFonts prop
- Weight dropdown shows availableWeights prop with named labels
- SZ/LH/LS NumericInputs emit onChange with correctly formatted values
- lineHeight emits unitless ratio (e.g., `"1.5"` not `"24px"`)
- Text align segmented control toggles correctly
- COL hex input accepts `#RRGGBB`, rejects invalid format on blur
- COL hex input parses `rgb()`, `rgba()`, `rgb(r g b)` format from computed style
- COL swatch displays correct background color
- `data-section-id="type"` present on root element
- Empty document.fonts gracefully handled (guard returns empty array)

### Panel Integration Tests

- Layout section renders when element selected
- Typography section renders when element selected
- Section order matches tab order: Layout → Spacing → Type
- Override manager called with correctly formatted string values
- Override manager accepts font-family with quotes (VALID_VALUE regex updated)
- styleVersion bumped on commit, not on scrub

## File Summary

### Create
- `src/browser/components/controls/SegmentedControl.tsx`
- `src/browser/components/controls/Dropdown.tsx`
- `src/browser/components/sections/LayoutSection.tsx`
- `src/browser/components/sections/TypographySection.tsx`
- `tests/browser/controls/segmented-control.test.tsx`
- `tests/browser/controls/dropdown.test.tsx`
- `tests/browser/sections/layout-section.test.tsx`
- `tests/browser/sections/typography-section.test.tsx`

### Modify
- `src/browser/components/Panel.tsx` — computed style parsing + override handlers + section wiring + reorder sections to match tab order (Layout → Spacing → Type)
- `src/browser/override.ts` — update `VALID_VALUE` regex to allow single/double quotes for `font-family` values: `/^[a-zA-Z0-9#()\s,.\-_'"%/]+$/`
- `src/browser/styles.css` — new component styles
- `package.json` — add `@floating-ui/dom` dependency

## References

- UX Spec: `thoughts/shared/research/2026-03-09-cortex-v2-ux-and-architecture-spec.md` (lines 615-670)
- Implementation Plan: `thoughts/shared/plans/2026-03-10-cortex-v2-implementation.md` (lines 1648-1745)
- Existing patterns: SpacingSection, NumericInput, Panel override pattern
- Visual inspiration: Figma properties panel, Cursor design panel (dark theme references adapted to our light glassmorphism theme)
