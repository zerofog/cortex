# Phase 5b: Fill + Color Picker + Border + Shadow + Effects Sections

**Ticket:** ZF0-889
**Date:** 2026-03-15
**Status:** Approved

## Overview

Build four new panel sections (Fill, Border, Shadow, Effects) and two shared controls (ColorInput, ColorPicker) for the Cortex visual editor. Extends the section pattern established in Phase 5a.

## Components

### Controls

#### ColorInput (`controls/ColorInput.tsx`)

Reusable swatch + hex text input. Extracted from TypographySection's existing inline color control.

- Props: `value: string` (CSS color), `onChange: (hex: string) => void`, `onPickerOpen?: () => void`
- Renders: 16x16 color swatch + hex text input
- Swatch click opens the ColorPicker popover (or delegates via `onPickerOpen`)
- Hex input validates on blur with `/^#[0-9a-fA-F]{6}$/`

#### ColorPicker (`controls/ColorPicker.tsx`)

Full color picker popover using vanilla-colorful Web Component + hand-written additions.

**From vanilla-colorful (~2.7KB):**
- `<hex-color-picker>` — saturation/value gradient + hue slider
- Keyboard accessible (arrow keys adjust hue/saturation)
- Styled via `::part()` CSS Shadow Parts

**Hand-written:**
- Alpha/opacity slider (NumericInput, 0-100%)
- Hex/RGB/HSL text input mode tabs
- Tailwind design system color swatches (grid of preset colors)
- Popover wrapper using `@floating-ui/dom` (computePosition, flip, shift)
- Single-picker-open-at-a-time behavior (opening one closes others)

**Popover behavior:**
- Opens on swatch click, positioned via floating-ui below the trigger
- Backdrop click closes
- Emits hex color string on change

### Sections

All sections follow the established pattern:
- `*Values` interface (read-only computed style data)
- `*Change` interface (`{ property: string, value: string }`)
- `*SectionProps` interface (`values`, `onChange`, `onScrub?`, `onScrubEnd?`)
- `parse*Values(cs: CSSStyleDeclaration)` static parser
- `data-section-id` attribute matching TabNav tab ID
- BEM CSS class naming

#### FillSection (`sections/FillSection.tsx`, `data-section-id="fill"`)

| Property | Control | CSS Property |
|---|---|---|
| Background Color | ColorInput + ColorPicker | `background-color` |
| Opacity | NumericInput (0-100, %) | `opacity` |

#### BorderSection (`sections/BorderSection.tsx`, `data-section-id="border"`)

| Property | Control | CSS Property |
|---|---|---|
| Width | NumericInput (px) | `border-width` |
| Style | SegmentedControl (solid/dashed/dotted/none) | `border-style` |
| Color | ColorInput + ColorPicker | `border-color` |
| Radius | NumericInput (px) | `border-radius` |
| Per-corner toggle | Button reveals 4 individual radius inputs | `border-{corner}-radius` |

#### ShadowSection (`sections/ShadowSection.tsx`, `data-section-id="shadow"`)

Multi-shadow support with add/remove rows.

Each shadow row:
| Property | Control | CSS Property (within box-shadow) |
|---|---|---|
| X Offset | NumericInput (px) | — |
| Y Offset | NumericInput (px) | — |
| Blur | NumericInput (px, min 0) | — |
| Spread | NumericInput (px) | — |
| Color | ColorInput | — |

Parses `box-shadow` into individual shadow objects. Serializes back on change.

**Parse format:** `box-shadow: <x>px <y>px <blur>px <spread>px <color>, ...`

#### EffectsSection (`sections/EffectsSection.tsx`, `data-section-id="effects"`)

| Property | Control | CSS Property |
|---|---|---|
| Opacity | NumericInput (0-100, %) | `opacity` |
| Overflow | SegmentedControl (visible/hidden/scroll/auto) | `overflow` |
| Cursor | Dropdown (pointer/default/text/move/...) | `cursor` |
| Blur | NumericInput (px, min 0) | `filter: blur(Npx)` |
| Backdrop Blur | NumericInput (px, min 0) | `backdrop-filter: blur(Npx)` |

**Blur parsing:** Extract value from `filter` string using regex `/blur\(([0-9.]+)px\)/`. Emit complete `filter: blur(Npx)` string.

## Panel.tsx Integration

- Import all 4 new sections + their parsers
- Add to `computedStyles` useMemo: `fill`, `border`, `shadow`, `effects`
- Add change handlers following existing pattern (string values, pass-through to applyOverride)
- Render sections in order after TypographySection

## Dependencies

- **New:** `vanilla-colorful` (~2.7KB, zero deps)
- **Existing:** `@floating-ui/dom` (already in deps), `preact` (already in deps)

## Scope Exclusions

- No TailwindResolver extension (server-side, separate concern)
- No gradient support (solid colors only for Fill)
- No color picker animation
- No refactoring of existing sections beyond ColorInput extraction

## Success Criteria

See ZF0-889 ticket for full automated + manual verification criteria.
