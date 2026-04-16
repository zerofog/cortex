# Panel v2 — Full Visual Editor Redesign

**Issue:** [ZF0-1124](https://linear.app/zerofog/issue/ZF0-1124)
**Branch:** main
**Date:** 2026-04-10 (rewritten from 2026-04-09 original)
**Status:** READY FOR IMPLEMENTATION
**Source of truth:** `cortex-editor/DESIGN.md`
**Deferred:** [ZF0-1161](https://linear.app/zerofog/issue/ZF0-1161) (box model diagram), [ZF0-1162](https://linear.app/zerofog/issue/ZF0-1162) (token preset popover)
**Interactive mock:** `/tmp/design-consultation-preview-1775767495.html`

## Context

The panel's original 4-section grouping (Layout > Position > Typography > Style) mixed concerns and buried important controls. A 2-day design consultation (April 9-10) produced a redesigned 8-section architecture with:
- Intent-over-mechanism naming (labels show what happens, tooltips show CSS)
- Token display pattern (detected CSS variables shown as chips with unlink)
- 3x3 alignment grid (reinstated from Webflow/Cursor patterns)
- Architecture review from 12 reviewers (6 clink + 6 native across Codex/Claude/Gemini)

The design evolved from 3 sections (Cursor pattern) to 8 sections as Typography was split out and Background/Border/Effects were promoted from collapsible subsections to full sections.

## Architecture — 8 Sections

All section headers: 13px / 600 weight / `--ink` / text only (no icons).
All interactive controls: 28px height.

```
Elements
├── DOM tree (Geist Mono 11px), max-height 140px, scroll
├── Multi-element selection (shift-click, cmd-click)
└── Mixed state ("--") for differing values

Position
├── position                              Dropdown (Cursor pattern)
│   [icon] Static [▾] — icons + descriptions, no clear button
├── self-alignment (flex/grid parent)      6 icon buttons (justify-self × align-self)
├── X, Y, Z                               NumericInput (inline prefix)
├── rotate                                 NumericInput (icon prefix)
└── flip H/V                              IconButton

Layout
├── display: block|flex|grid|inline|none   SegmentedControl (no label, full width)
│
├── FLEX:
│   ├── direction                          SegmentedControl (icon-only, full width)
│   ├── 3x3 alignment grid                Click=position, dblclick=distribute, full-row overlay
│   ├── X (justify-content) / Y (align-items)   Dropdowns with icons per option
│   │   X/Y are screen coordinates. Column-direction: X→align-items, Y→justify-content
│   ├── Gap                                NumericInput (inline prefix)
│   └── More options: wrap                 SegmentedControl
│
├── GRID:
│   ├── Cols / Rows                        NumericInput (inline prefix) + direction toggle
│   ├── 3x3 alignment grid                Shared with flex
│   ├── X (justify-items) / Y (align-items)   Dropdowns (shared with flex)
│   ├── Gap: col-gap + row-gap             NumericInput x2 (gallery-horizontal/vertical icons)
│   └── Three-tier template handling:
│       Simple: repeat(N, 1fr) → editable count
│       Responsive: repeat(auto-fit/fill, minmax(N, 1fr)) → editable min-width
│       Complex: read-only raw CSS
│
├── BLOCK: no additional controls
├── INLINE: vertical-align dropdown only
├── NONE: no additional controls
│
├── SIZING:
│   ├── [W value px ▾] [H value px ▾]     Unified input+dropdown
│   │   Fixed (value), Fit contents, Fill container | Add Min, Add Max
│   │   Fill for grid items → justify-self: stretch
│   ├── Clip content + Border box          Two checkboxes
│
└── SPACING:
    ├── [P ↔ value px] [lock] [P ↕ value px]    Lucide move-horizontal/vertical icons
    └── [M ↔ value px] [lock] [M ↕ value px]    Padding row + margin row

Typography — ONLY for text elements
├── Manual toggle (T button), auto-detected default
├── MODE A (token view): chips [text-sm] [font-light] [text-gray-900] with [unlink]
├── MODE B (CSS view):
│   ├── font-family                        Dropdown (full width)
│   ├── weight + size                      Dropdown + NumericInput
│   ├── line-height + letter-spacing       NumericInput (icon prefix)
│   ├── color                              Swatch + hex
│   └── text-align + vertical-align        SegmentedControl (icons, full width)
└── Settings icon for advanced options (decoration, transform)

Appearance
├── opacity                                NumericInput (icon prefix)
├── corner-radius + per-corner expand      NumericInput + 4-corner expand button
└── visibility                             EyeToggle (eye / eye-closed)

Background — + button to add
├── Token: [swatch] --bg-surface [unlink]  When CSS variable detected
└── Raw: [swatch] [#ffffff]                When no token

Border — + button to add
├── [swatch] [hex] [opacity %] [eye]       Color + opacity + visibility
├── [≡ icon] [width px] [per-side ⊡]      Weight (border icon) + per-side expand
└── Per-side: [T px] [R px] / [B px] [L px]

Effects — + button to add
├── [icon] [Drop shadow ▾] [eye] [−]       Compact summary row
│   Click icon → detail panel:
│   [X px] [Y px] / [Blur px] [Spread px] / [swatch] [hex] [opacity %]
└── Type: Drop shadow, Inner shadow, Blur, Background blur
```

## Design Principles

### Intent Over Mechanism
Labels describe what happens. Tooltips show CSS. AI translates per context.

| Panel label | Intent | CSS (context-dependent) |
|---|---|---|
| Fixed (532) | Explicit size | `width: 532px` |
| Fit contents | Shrink to content | `width: fit-content` or `auto` |
| Fill container | Expand to parent | `width: 100%` (block), `flex: 1` (flex), `justify-self: stretch` (grid) |
| Clip content | Hide overflow | `overflow: hidden` |
| X: Left | Horizontal start | `justify-content: flex-start` (row), `align-items: flex-start` (column) |
| Y: Center | Vertical center | `align-items: center` (row), `justify-content: center` (column) |

### Token Display
Detected CSS variables/tokens: `[swatch] --name [⊘ unlink]`
Unlink detaches for raw editing. Applies to colors, typography classes, spacing tokens.

### Token Namespace (P0 Security)
All panel CSS custom properties prefixed `--cx-*` to prevent collision through Shadow DOM inheritance.
`:host` uses `all: initial` to prevent inherited style leakage.

## Component Catalog — 14 Components

| Component | Purpose | Height |
|---|---|---|
| SectionGroup | Category wrapper | auto, 13px/600/--ink header |
| SegmentedControl | Multi-option toggle | 28px (md), 22px (sm) |
| PositionDropdown | Position selector with icons + descriptions | 28px trigger |
| NumericInput | Value with scrub, keyboard step | 28px |
| Dropdown | Filterable select with popover | 28px trigger |
| SizingDropdown | W/H mode selector (Fixed/Fit/Fill) | 28px |
| ColorInput | Swatch + hex input | 28px |
| Checkbox | Boolean toggle | 16px |
| Tooltip | CSS preview on hover (core of intent-over-mechanism) | auto |
| LockButton | Axis lock for gap/padding/margin | 20px |
| EyeToggle | Visibility (eye / eye-closed) | 28px |
| IconButton | Generic icon-only button | 28px |
| TokenChip | Design token with unlink | 28px |
| ElementTree | DOM hierarchy tree | max-height 140px |
| ColorPicker | Color selection popover | auto |

## PR Strategy — 3 PRs

### PR 1: Structural foundation
- Create 8 section components (shells)
- Panel.tsx: new section ordering (Elements → Position → Layout → Typography → Appearance → Background → Border → Effects)
- Rename Style → Appearance
- Move visibility to Appearance (eye / eye-closed toggle)
- Promote opacity + corner-radius to Appearance top-level
- Per-corner radius expand (4 inputs with corner-specific icons)
- `--cx-*` token namespace migration in styles.css
- `all: initial` on `:host`
- 28px component height standardization
- Subsection labels: 12px/600/--ink-ghost, normal case, top rule
- Update all existing tests
- **Files:** Panel.tsx, styles.css, all section components

### PR 2: Position + Layout controls
- PositionDropdown (Cursor pattern) — icons per option, descriptions, no clear button
- Self-alignment: 6 Lucide icon buttons (align-horizontal/vertical-justify-*)
- Inline X/Y/Z prefixes, rotation icon prefix, flip H/V icons
- Display SegmentedControl (no label, full width)
- Conditional rendering per display mode (flex/grid/block/inline/none)
- 3x3 alignment grid (click=position, dblclick=distribute, full-row overlay)
- X/Y dropdowns with icons per option, grouped separators, descriptions
- Flex: direction (icon SegmentedControl) + gap (single input) + wrap (under More Options)
- Grid: cols/rows + direction toggle + three-tier template + dual gap (gallery-h/v icons)
- Sizing: unified W/H input+dropdown (Fixed/Fit/Fill + Add Min/Max)
- Spacing: P/M labels + Lucide move-horizontal/vertical icons + lock buttons
- Clip content + Border box checkboxes
- **Files:** PositionSection.tsx, PositionDropdown.tsx (new), AlignmentGrid.tsx (new), LayoutSection.tsx (rewrite as orchestrator), FlexControls.tsx, GridControls.tsx, SizingControls.tsx, SpacingControls.tsx

### PR 3: Typography + Token display + Appearance sections
- Typography section (conditional: text elements only)
- Dual-mode with manual toggle (T button): token chips (Mode A) + raw CSS (Mode B)
- TokenChip component: [swatch] --name [unlink]
- Background section with token chip display
- Border section: color + opacity + eye + width + per-side expand
- Effects section: compact row + detail panel behind click + type dropdown
- ElementTree component for Elements section
- **Files:** TypographySection.tsx (new), TokenChip.tsx (new), BackgroundSection.tsx (new), BorderSection.tsx (modify), EffectsSection.tsx (modify), ElementTree.tsx (exists, modify)

## Files Summary

| File | Action | PR |
|---|---|---|
| Panel.tsx | Rewrite section rendering | PR 1 |
| styles.css | --cx-* migration, 28px heights, subsection labels | PR 1 |
| PositionSection.tsx | Self-alignment, inline prefixes | PR 2 |
| PositionDropdown.tsx | New — Cursor pattern dropdown | PR 2 |
| AlignmentGrid.tsx | New — 3x3 grid with click/dblclick | PR 2 |
| LayoutSection.tsx | Rewrite as orchestrator | PR 2 |
| FlexControls.tsx | New — direction, alignment, gap, wrap | PR 2 |
| GridControls.tsx | New — cols/rows, direction, alignment, gap | PR 2 |
| SizingControls.tsx | New — W/H dropdown, clip, border-box | PR 2 |
| SpacingControls.tsx | New — P/M with directional icons | PR 2 |
| TypographySection.tsx | New — dual-mode | PR 3 |
| TokenChip.tsx | New — token display with unlink | PR 3 |
| BackgroundSection.tsx | New | PR 3 |
| BorderSection.tsx | Modify — color/opacity/eye/per-side | PR 3 |
| EffectsSection.tsx | Modify — compact row + detail panel | PR 3 |

## What Already Exists (reuse)

- `SegmentedControl` — reuse for display, direction, wrap, text-align, overflow
- `NumericInput` — reuse for all value inputs (28px height)
- `ColorInput` — reuse for text color, background, border color
- `SizingDropdown` — adapt for unified W/H input+dropdown
- `Dropdown` — reuse for justify/align/position with icon extensions
- `CollapsibleSection` — no longer used for main sections, keep for potential future use
- `SectionGroup` — reuse for all 8 section wrappers
- `isFlexOrGrid` / `isFlex` — reuse for conditional rendering
- `ALL_DIMMING_PROPERTIES` — add flex-wrap, self-alignment properties
- `normalizeDisplay()` — reuse for inline-flex → flex normalization
- `LayerTree.tsx` — exists, adapt for Elements section

## NOT in Scope

- Box model diagram (ZF0-1161)
- Token preset popover (ZF0-1162)
- Flex item properties (grow/shrink/basis/order/align-self flex-specific)
- Full grid template editing (fr/auto/minmax interactive UI)
- Named grid areas
- Font family editing (needs font picker)
- text-decoration, text-transform
- Multi-background layers
- aspect-ratio, object-fit, mix-blend-mode, pointer-events
- AI translation layer UX (diff preview, error states — product decision pending)
- Persona definition update (product decision pending)

## Architecture Review Summary (2026-04-10)

12 reviewers (6 clink + 6 native) across Design, Frontend, DX, PM, Security, MTS personas.

**Critical (4):** X/Y column-direction mapping (FIXED), token namespace collision (FIXED), 15+ document contradictions (FIXED), persona ambiguity (NOTED — product decision pending)

**High (8):** Px/Py as pixels (FIXED — icons), AI translation UX (NOTED), Typography Mode A format (FIXED — token chips), Fill for grid (FIXED), auto-fit/auto-fill read-only (FIXED — three-tier), missing component specs (FIXED — 14 in catalog), manual mode toggle (FIXED), Effects/Filters naming (FIXED — Effects canonical)

**PM verdict:** "Ship the AI translation loop with 15 properties. Validate that developers use intent labels. Then expand."

Full findings appended to DESIGN.md.

## Verification

- `bun test` — all existing tests pass after each PR
- Manual: open cortex-test app, select flex container, verify all 8 sections render
- Manual: switch display modes (block/flex/grid/inline/none), verify conditional controls
- Manual: click alignment grid dots, verify X/Y dropdown sync
- Manual: double-click alignment grid, verify distribution overlay spans full row
- Manual: toggle Blueprint mode, verify all --cx-* tokens work
- Manual: select text element, verify Typography section appears with correct mode
- Manual: toggle Typography Mode A/B with T button
- Manual: click token chip unlink, verify raw value input appears
- Manual: expand per-corner radius, verify 4 corner inputs
- Manual: click Effects detail icon, verify shadow inputs expand
- Manual: verify eye-closed icon on visibility/border/effects toggles
