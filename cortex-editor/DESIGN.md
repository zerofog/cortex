# Design System — Cortex

## Product Context
- **What this is:** A visual editing companion for AI CLI tools (Claude Code, Codex, Gemini CLI)
- **Who it's for:** Developers and technical founders using AI coding tools to build web UIs
- **Space/industry:** Developer tools, AI-assisted visual editing
- **Project type:** Dev tool overlay panel (floating panel + toolbar alongside running web app)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with an architectural drafting metaphor
- **Decoration level:** Minimal — typography and spacing do the work
- **Mood:** Precision instrument. The editor should feel like a well-made drafting tool, not a consumer app. Clean, intentional, no ornamentation. Every pixel earns its place.
- **Metaphor:** Light mode = Drafting Paper. Dark mode = Blueprint.
- **Icons:** Lucide SVGs only (https://lucide.dev). 24x24 viewBox, stroke-width 2, stroke-linecap round, stroke-linejoin round, no fill. If an icon doesn't exist in Lucide, create a custom SVG matching their design language. Never use Unicode emoji for UI icons.
- **Anti-patterns:** No gradients, no shadows, no glow, no purple accents, no rounded bubbly elements, no decorative blobs. No emoji icons.

## Naming Principle — Intent Over Mechanism

The panel is a translation layer between designers and developers. Labels describe **what happens** (intent), not the CSS property name (mechanism). CSS is shown as secondary context (tooltip or subtitle) so developers can verify and designers can learn.

### Sizing
| Panel label | Intent | CSS written (context-dependent) |
|---|---|---|
| Fixed (532) | Explicit size | `width: 532px` |
| Fit contents | Shrink to content | `width: fit-content` (block), `width: auto` (inline) |
| Fill container | Expand to parent | `width: 100%` (block), `flex: 1` (flex child) |
| Add Min Width | Set a floor | `min-width: Npx` |
| Add Max Width | Set a ceiling | `max-width: Npx` |
| Fill container (grid) | Fill grid column | `justify-self: stretch` (remove explicit width) |

### Alignment
| Panel label | Intent | CSS written |
|---|---|---|
| X: Left | Horizontal start | `justify-content: flex-start` (flex), `justify-items: start` (grid) |
| Y: Center | Vertical center | `align-items: center` |
| Space Between | Distribute evenly | `justify-content: space-between` |
| Stretch | Fill cross axis | `align-items: stretch` |
| **Column-direction note:** When flex-direction is column, X/Y mappings swap CSS targets. X (horizontal) → align-items (cross axis). Y (vertical) → justify-content (main axis). The panel labels stay X/Y (screen coordinates); the CSS output adapts. |

### Other translations
| Panel label | Intent | CSS written |
|---|---|---|
| Clip content | Hide overflow | `overflow: hidden` |
| Border box | Include padding in size | `box-sizing: border-box` |
| Visible / Hidden (eye) | Show/hide element | `visibility: visible/hidden` |

### Rules
1. **Dropdown labels** show the intent term (Fixed, Fit, Fill, Clip, etc.)
2. **Tooltips** show the CSS property + value that will be written
3. **AI translates** intent to the correct CSS for the element's context (parent display mode, inline vs block, etc.)
4. Where CSS terms are already clear to both audiences (flex, grid, block, none), use them directly
5. Where CSS terms are confusing (justify-content vs align-items), abstract them (X/Y)

### Token Display
When a CSS value resolves to a design token or CSS variable from the user's application:
- Show as: `[swatch] --token-name [⊘ unlink]`
- Clicking unlink detaches the token and shows the raw resolved value for direct editing
- Re-linking is available via the token picker
- Applies to: colors (background, border, text), typography classes (Tailwind), spacing tokens
- This is the bridge between the user's design system and raw CSS values

## Typography
- **UI/Labels:** Geist Sans, 400/500 weight — designed for interfaces, not overused like Inter
- **Values/Inputs:** Geist Mono, 400/500 weight — pairs with Geist Sans, designed for dev tools
- **Section Group Headers:** Geist Sans, 600 weight, 13px, `--ink` (primary). Text only, no icons. Scanning landmarks, must be visibly heavier than property labels. Matches Cursor/Webflow/Figma pattern.
- **Collapsible Section Labels:** Geist Sans, 400 weight, 11px, 0.01em tracking, `--ink-ghost`
- **Property Labels:** Geist Sans, 400 weight, 11px, `--ink-secondary`
- **Loading:** Google Fonts CDN (`https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500`)
- **Scale:**
  - `--text-xs`: 9px (units like px/deg/%, axis labels, meta badges)
  - `--text-sm`: 11px (property labels, values — primary working size)
  - `--text-md`: 12px (dropdown triggers, subsection labels)
  - `--text-lg`: 13px (section group headers)
  - `--text-xl`: 14px (panel title)
- **Weights:**
  - `--weight-label`: 400 (property labels, collapsible section labels)
  - `--weight-value`: 500 (values, active segmented control options)
  - `--weight-heading`: 600 (section group headers — Position, Layout, Appearance)
  - `--weight-title`: 700 (panel title only)
- **Hierarchy (top to bottom):**
  1. Panel title: 14px / 700 / `--ink`
  2. Section group header: 13px / 600 / `--ink`
  3. Subsection label: 12px / 600 / `--ink-ghost` / normal case / top rule (e.g., "Size", "Spacing")
  4. Property label: 11px / 400 / `--ink-secondary`
  5. Property value: 11px / 500 / `--ink` (Geist Mono)
  6. Collapsible label: 11px / 400 / `--ink-ghost`
  7. Unit/meta: 9px / 400 / `--ink-ghost`

## Color

### Light Mode — Drafting Paper
- **Approach:** Restrained — one accent + neutrals, color is rare and meaningful
- **Ink hierarchy (text):**
  - `--ink`: #111827 (primary text, values)
  - `--ink-secondary`: #6b7280 (labels, property labels)
  - `--ink-tertiary`: #a3a3a3 (meta, disabled)
  - `--ink-ghost`: #b0b0b0 (placeholders, collapsible section labels)
  - `--ink-faint`: #d4d4d4 (decorative, scrollbars)
- **Surfaces:**
  - `--paper`: #ffffff (panel background)
  - `--vellum`: #fafafa (page/app background, section group background)
  - `--well`: #f5f5f5 (input backgrounds, inset areas)
  - `--well-hover`: #efefef
  - `--well-active`: #ebebeb
  - `--well-shadow`: inset 0 1px 2px rgba(0, 0, 0, 0.03)
- **Rules (borders):**
  - `--rule`: #f0f0f0 (section dividers, input borders)
  - `--rule-soft`: rgba(0, 0, 0, 0.04) (subtle separators)
- **Accent:**
  - `--select`: #3b82f6 (blue — active states, selection, highlights)
  - `--select-hover`: #2563eb
  - `--select-muted`: rgba(59, 130, 246, 0.12)
  - `--on-select`: #ffffff (text on accent background)
- **Semantic:**
  - Success: #22c55e
  - Destructive: #ef4444 / `--destructive-surface`: rgba(239, 68, 68, 0.06)
  - Warning: #f97316 / `--warning-surface`: rgba(249, 115, 22, 0.06)
- **Utility:**
  - `--scrollbar`: #d4d4d4
  - `--tooltip-bg`: #1f2937

### Dark Mode — Blueprint
- **Ink hierarchy (text):**
  - `--ink`: #e2e8f0
  - `--ink-secondary`: #94a3b8
  - `--ink-tertiary`: #64748b
  - `--ink-ghost`: #475569
  - `--ink-faint`: #334155
- **Surfaces:**
  - `--paper`: #0f172a (deep navy — technical blueprint feel)
  - `--vellum`: #1e293b
  - `--well`: #1a2332
  - `--well-hover`: #233044
  - `--well-active`: #2a3a52
  - `--well-shadow`: inset 0 1px 2px rgba(0, 0, 0, 0.15)
- **Rules:**
  - `--rule`: #1e293b
  - `--rule-soft`: rgba(255, 255, 255, 0.04)
- **Accent:**
  - `--select`: #60a5fa (lighter blue for dark backgrounds)
  - `--select-hover`: #3b82f6
  - `--select-muted`: rgba(96, 165, 250, 0.15)
  - `--on-select`: #0f172a (text on accent in dark mode)
- **Semantic:**
  - Success: #4ade80
  - Destructive: #f87171 / `--destructive-surface`: rgba(248, 113, 113, 0.1)
  - Warning: #fb923c / `--warning-surface`: rgba(251, 146, 60, 0.1)
- **Utility:**
  - `--scrollbar`: #334155
  - `--tooltip-bg`: #0f172a

### Theme Detection
Auto-detect user's app background luminance on activation. Apply Blueprint (dark) when the app has a dark background, Drafting Paper (light) when light.

### Token Namespace
All CSS custom properties used by the panel MUST be prefixed with `--cx-` to prevent collision with user application tokens. CSS custom properties inherit through Shadow DOM boundaries — `--ink`, `--paper`, `--select` are common design system names that will collide.

**Status:** The `--cx-` namespace migration is complete. All tokens in `styles.css` use the `--cx-` prefix (enforced by `cx-token-namespace.test.ts`). Note: `all: initial` on `:host` does NOT reset custom properties (CSS spec) — Shadow DOM boundary + the `--cx-` namespace prefix are the actual isolation mechanisms.

## Spacing
- **Base unit:** 4px
- **Density:** Compact (dev tool density, not consumer app density)
- **Scale:**
  - `--sp-1`: 2px
  - `--sp-2`: 4px
  - `--sp-3`: 6px
  - `--sp-4`: 8px
  - `--sp-5`: 12px
  - `--sp-6`: 16px
  - `--sp-7`: 24px
  - `--sp-8`: 32px

## Layout
- **Approach:** Grid-disciplined, compact
- **Panel width:** 320px
- **Border radius:**
  - `--radius-sm`: 4px (inputs, badges)
  - `--radius-md`: 6px (sections, cards)
  - `--radius-lg`: 8px (panel container)
  - `--radius-lg-inner`: 5px (inner elements of rounded containers)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Section collapse/expand:** 150ms ease-out
- **Input focus:** instant (no transition on border-color change)
- **Flex controls mount:** instant (no entrance animation when display switches to flex)
- **No decorative animation**
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50ms) short(150ms) medium(250ms)

## Panel Architecture (v2)

Panel sections in order. All section headers are 13px/600/--ink, text only (no icons).

### Elements
Non-collapsible element tree with max-height scroll. Shows DOM hierarchy. Selected element highlighted. Multi-element selection supported (shift-click, cmd-click). Mixed state ("--") for differing values.

```
Elements
├── body
│   ├── div.container  ← selected
│   │   ├── h1
│   │   └── div.grid

Position (text only, no icon)
├── position                                             Dropdown (Cursor pattern)
│   trigger: [icon] Static [▾]
│   popover: icon + label per option, description at bottom
├── self-alignment (when parent is flex/grid)             6 icon buttons, no labels
│   ├── horizontal: start | center | end                 → justify-self
│   └── vertical: start | center | end                   → align-self
│   Only shown when selected element's parent is flex or grid.
│   Icons: Lucide align-horizontal-justify-* and align-vertical-justify-*
├── X, Y, Z                                              NumericInput with inline prefix
├── rotate                                               NumericInput with icon prefix
└── flip H/V                                             Icon buttons

Layout (text only, no icon)
├── display: block|flex|grid|inline|none                 SegmentedControl (no label)
│   Future: chevron overflow for inline-block, inline-flex, inline-grid
│
├── DISPLAY=BLOCK: no additional controls
│
├── DISPLAY=FLEX:
│   ├── direction: arrow icons                           SegmentedControl (icon-only, full width)
│   ├── alignment grid                                   3x3 dot grid (click=position, dblclick=distribute)
│   ├── X (→ justify-content) / Y (→ align-items)        Dropdowns with icons per option
│   │   X options: Left, Center, Right | Space Between, Space Around
│   │   Y options: Top, Center, Bottom | Stretch, Baseline
│   ├── Gap                                              NumericInput (inline prefix)
│   └── More options: wrap                               SegmentedControl
│
├── DISPLAY=GRID:
│   ├── template preview                                  Shows parsed "3 × 2" or raw template
│   │   Simple: repeat(N, 1fr) → show as "N × M", editable via col/row inputs
│   │   Responsive: repeat(auto-fit/auto-fill, minmax(N, 1fr)) → two inputs: min-width + 1fr
│   │   Complex: everything else → show raw CSS value, read-only
│   ├── columns / rows count                             NumericInput x2 (inline prefix)
│   │   Editable for simple patterns. For responsive patterns, show min-width input instead.
│   ├── direction (auto-flow): row | column              SegmentedControl (2 icon buttons)
│   ├── alignment grid                                   3x3 grid (shared with flex)
│   ├── X (justify-items) / Y (align-items)              Dropdowns (shared with flex)
│   ├── gap: column-gap + row-gap                         NumericInput x2 (icon prefix, both axes)
│   └── DEFERRED: template editing (fr/auto/minmax), named areas, justify-content/align-content
│
│   NOTE: Grid section is a viewer+editor, not a builder. We read the app's
│   existing grid config via computed styles. Three tiers:
│   - Simple (repeat(N, 1fr)): fully editable col/row count
│   - Responsive (repeat(auto-fit/auto-fill, minmax(N, 1fr))): editable min-width
│   - Complex (everything else): read-only raw CSS display
│
├── DISPLAY=INLINE: vertical-align dropdown only
│
├── DISPLAY=NONE: no additional controls
│
├── SIZING (always, except display=none)
│   ├── [W value px ▾] [H value px ▾]                   Unified input+dropdown, inline prefix
│   │   Dropdown: Fixed (value), Fit contents, Fill container | Add Min, Add Max
│   │   Tooltips show CSS: width: 532px, width: fit-content, width: 100%/flex:1
│   ├── Clip content + Border box                        Two checkboxes on same row
└── SPACING (always, except display=none)
    ├── [↔ value px] [lock] [↕ value px]                 Padding horizontal + vertical
    └── [↔ value px] [lock] [↕ value px]                 Margin horizontal + vertical
    Lucide move-horizontal (↔) and move-vertical (↕) icons as inline prefixes.
    Padding row uses nested-square icon (filled middle), margin uses nested-square (filled outer).

Typography (text only, no icon) — ONLY shown when selected element contains text
├── TWO MODES (manual toggle via T button in section header):
│   ├── MODE A (token view — default when Tailwind/token classes detected):
│   │   Token names shown as chips: [text-sm] [font-medium] [text-gray-900]
│   │   Each chip has an unlink button (⊘) to detach and edit raw values
│   │   Matches the token display pattern used for colors ([swatch] --accent [unlink])
│   │   Auto-detected as default, but user can always toggle to Mode B
│   └── MODE B (CSS view — default when no classes detected):
│       ├── font-family                                  Dropdown (full width)
│       ├── weight + size                                Dropdown + NumericInput (side by side)
│       ├── line-height + letter-spacing                 NumericInput with icon prefix
│       ├── text-align: left|center|right                SegmentedControl (icons, full width)
│       │   + vertical-align: top|middle|bottom          SegmentedControl (icons, full width)
│       └── color                                        Swatch + hex input
├── Settings icon (top-right): expands advanced options (decoration, transform)
├── No text labels — icons and dropdowns are self-explanatory

Appearance (text only, no icon)
├── TOP-LEVEL (always visible, never collapsible)
│   ├── opacity                                          NumericInput with icon prefix
│   ├── corner-radius + per-corner expand                NumericInput + expand button
│   └── visibility: eye icon toggle                      eye → eye-closed on toggle
```

Background (section-level, + button to add)
├── [swatch] [hex value]                                 Single background, no multi-layer

Border (section-level, + button to add)
├── [swatch] [hex] [opacity %] [eye toggle]              Color + opacity + visibility
├── [≡ icon] [width px] [per-side toggle]                Weight with border icon prefix
└── Per-side (expandable): [T px] [R px] / [B px] [L px]

Effects (section-level, + button to add)
├── [shadow icon] [Drop shadow ▾] [eye] [−]              Compact summary row
│   Click icon to expand detail panel:
│   [X px] [Y px] / [Blur px] [Spread px] / [swatch] [hex] [opacity %]
├── Type dropdown: Drop shadow, Inner shadow, Blur, Background blur
└── Multiple effects stackable via + button
```

### Position dropdown (Cursor pattern)
The position property uses a rich dropdown, not a SegmentedControl:
- **Trigger:** selected option icon + value label + chevron. Full-width. No clear button (position always has a value).
- **Popover:** each option has a unique icon, checkmark on selected value
- **Description:** bottom of popover shows a one-line description of the focused/selected option
- **Icons per option:** Static (square), Relative (move-diagonal), Absolute (maximize), Fixed (pin), Sticky (paperclip)

### Section headers
Text only, no icons. The 13px/600 weight treatment creates enough visual weight for scanning without icons that break left-alignment with property labels below.

### Subsection labels
12px, 600 weight, `--ink-ghost`, with a subtle top rule (`--rule-soft`). Normal case, NOT uppercase. These read as organizational dividers, clearly distinct from property labels (11px, 400 weight, `--ink-secondary`).

### Section ordering rationale
Outside-in: where, then how big, then what it looks like. Started with 3 core groups (Position, Layout, Appearance) inspired by Cursor, then split Typography, Background, Border, and Effects into separate sections for clarity. The panel now has 8 top-level sections: Elements, Position, Layout, Typography, Appearance, Background, Border, Effects. Each is always visible. 95% of use cases are covered by the default visible controls.

### Multi-element selection
When multiple elements are selected, inputs show mixed state ("--") for properties that differ. Editing a value applies to all selected elements.

### Conditional rendering
- Flex controls appear instantly (no animation) when display=flex
- Grid controls appear instantly when display=grid
- Block/inline/none: display + sizing + spacing only, no flex/grid controls
- Sections are NOT collapsible (user preference: precision instrument, all values visible)

## Component Catalog

Standard visual vocabulary. All components use design tokens from this file.

| Component | Purpose | Height | Font |
|-----------|---------|--------|------|
| SectionGroup | Category wrapper (Position, Layout, Appearance) | auto | --text-lg (13px) / --weight-heading (600) / --ink |
| SectionGroup (with headerAction) | Property group with add/remove lifecycle (Background, Border, Effects) | auto | --text-lg (13px) / --weight-heading (600) / --ink |
| SegmentedControl | Multi-option toggle (display, direction, wrap) | 28px (md), 22px (sm) | --text-sm / --weight-value |
| PositionDropdown | Position property selector with icons + descriptions | trigger 28px | --text-sm / --weight-label |
| NumericInput | Value with scrub, keyboard step, optional unit | 28px | Geist Mono --text-sm / --weight-value |
| Dropdown | Filterable select with floating popover | trigger 28px | --text-sm / --weight-label |
| SizingDropdown | W/H mode selector (fit/fill/fixed) | 28px | --text-sm / --weight-label |
| ColorInput | Swatch + hex input | 28px | Geist Mono --text-sm |
| Checkbox | Boolean toggle (box-sizing) | 16px | -- |
| Tooltip | CSS property preview on hover (core of intent-over-mechanism) | auto | --text-xs / --weight-label |
| LockButton | Axis lock for gap, padding, margin | 20px circle | Lucide link icon, --ink-ghost / --select when active |
| EyeToggle | Visibility toggle (eye → eye-closed) | 28px | Lucide eye / eye-closed icons |
| IconButton | Generic icon-only button (flip, per-side, settings) | 28px | Lucide icon, --ink-secondary / --ink on hover |
| TokenChip | Detected design token display with unlink | 28px | Geist Mono --text-sm, [swatch] name [unlink] |
| ElementTree | DOM hierarchy tree with selection | max-height 140px, scroll | Geist Mono --text-sm |
| ColorPicker | Color selection popover (opens from swatch click) | auto | Hex input, opacity slider, eyedropper |

### Tooltip pattern
- Appears on hover over any intent-labeled control (Fixed, Fit, Fill, Clip content, etc.)
- Shows the exact CSS property + value that will be written: `width: 532px`
- For context-dependent translations, shows the resolved output for the current element context
- 150ms delay before showing. Instant dismiss on mouse leave.
- Positioned via @floating-ui/dom (same as dropdowns)
- Background: --tooltip-bg. Text: --paper. Font: Geist Mono 10px.

### TokenChip pattern
- Shown when a CSS value resolves to a design token or CSS variable from the user's app
- Format: `[swatch] --token-name [unlink icon]`
- Unlink button (broken chain icon) detaches the token, revealing the raw value input
- Re-linking available via token picker popover
- Applies to: colors (background, border, text), typography classes, spacing tokens
- Chip has --well background, --rule border, 28px height

### PositionDropdown pattern (Cursor reference)
- **Trigger:** full-width, shows selected option icon + value label + chevron. No clear button (position always has a value).
- **Popover:** each option shows icon + label. Checkmark on selected. Description at bottom.
- **Option icons:** Static (square), Relative (move-diagonal), Absolute (maximize), Fixed (pin), Sticky (paperclip)
- **Descriptions:** each option has a one-line explanation (e.g., "Static is the default position and displays an element based on styles in the Layout section")
- Follows `@floating-ui/dom` positioning like other dropdowns
- Keyboard: Arrow keys navigate, Enter selects, Escape closes

### Dropdown pattern (used for justify-content, align-items)
- Trigger shows selected label in full text ("Space Between", not abbreviated)
- Popover positioned via `@floating-ui/dom` (flip + shift middleware)
- Filter input at top for type-to-search
- Popover width matches trigger width
- Existing `Dropdown.tsx` component covers this pattern

### ExpandableOptions pattern ("More options")
- Text trigger with chevron, right-aligned
- Content expand via `grid-template-rows: 0fr` to `1fr`
- 150ms ease-out transition (matches section collapse spec)
- Collapsed content has `overflow: hidden`

### Eye icon toggle (visibility)
- 28x28px icon button, lives in Appearance section next to opacity/radius
- `--ink-secondary` default, `--ink` on hover, `--select` when active
- Two states: visible (Lucide `eye`) / hidden (Lucide `eye-closed` with strike-through)
- All eye icons in the UI (visibility toggle, overlay toggle in toolbar) use `eye-closed` for the hidden state

## Progressive Disclosure

Show what's needed 95% of the time. Tuck the rest under "More options".

### Always visible
- Display mode, flex direction, justify, align, gap
- W, H with sizing mode (fit/fill/fixed)
- Padding and margin with lock
- Opacity and corner-radius (top of Appearance)
- Typography: font-size, font-weight, color, text-align

### Expandable (under "More options")
- Flex wrap (nowrap is default ~90% of the time)
- Min/max width, min/max height
- Overflow
- Line-height, letter-spacing
- Box-sizing checkbox

### Separate sections (below Appearance)
- Background: color swatch + hex. Token display when CSS variable detected.
- Border: color + opacity + visibility + width + per-side expand
- Effects: shadow + blur combined. Detail panel behind click. Type dropdown (drop shadow, inner shadow, blur, background blur).

### What is NOT collapsible
Opacity and corner-radius are always visible at the top of Appearance. They are the two most common visual tweaks. No section is collapsible — all sections are always visible with progressive disclosure for advanced options only.

## Interaction Patterns

### Keyboard navigation
- **Tab**: Move between controls in reading order
- **Enter/Space**: Activate buttons, open dropdowns, toggle collapsible sections
- **Arrow Up/Down**: Navigate dropdown options, step NumericInput value
- **Arrow Left/Right**: Navigate SegmentedControl options
- **Escape**: Close dropdown popover, cancel edit
- **Shift+Arrow**: Step NumericInput by 10
- **Alt+Arrow**: Step NumericInput by 0.1

### Focus management
- Focus trap inside open dropdown popover
- Return focus to trigger button on popover close (Escape or selection)
- Visible focus ring: 2px solid `--select`, 2px offset

### ARIA requirements
- Dropdown trigger: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`
- Dropdown filter: `role="combobox"`, `aria-autocomplete="list"`, `aria-controls`, `aria-activedescendant`
- Dropdown options: `role="option"`, `aria-selected`
- Collapsible section header: `aria-expanded`
- ExpandableOptions trigger: `aria-expanded`, `aria-controls`
- Visibility toggle: `aria-label="Toggle visibility"`, `aria-pressed`

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-02 | Initial design system | Created by /design-consultation. Builds on existing ink/paper/vellum token naming in styles.css |
| 2026-04-02 | Blue accent (#3b82f6 light, #60a5fa dark) | Tried amber, reverted to blue. Blue is the expected dev tool accent and felt more natural in practice |
| 2026-04-02 | Blueprint dark mode (#0f172a) | Navy backgrounds evoke technical drawings. Unique vs generic dark gray used by Chrome DevTools, Figma |
| 2026-04-02 | Geist Sans + Geist Mono | Designed for interfaces and dev tools. Not overused. ~40KB font load |
| 2026-04-02 | 4px base spacing, 11px base type | Compact dev tool density. Matches existing styles.css values |
| 2026-04-09 | 3 sections (Cursor pattern) | Position > Layout > Appearance. Explored Webflow's 5-section model, came back to 3 for dev audience |
| 2026-04-09 | Dropdowns for justify/align | Full text labels ("Space Between") more discoverable than icon-only SegmentedControls |
| 2026-04-09 | ~~3x3 AlignmentGrid dropped~~ [SUPERSEDED] | Was dropped, then reinstated per Webflow/Cursor user research. See 2026-04-10 reinstatement. |
| 2026-04-09 | Opacity + corner-radius promoted | Always visible at top of Appearance. Most common visual tweaks should never be buried |
| 2026-04-09 | Progressive disclosure | "More options" for wrap, min/max, overflow, line-height, letter-spacing. 95% rule |
| 2026-04-09 | Gap: two inputs + lock | Asymmetric gaps are common. Single input is lossy (Codex review finding) |
| 2026-04-09 | Box-sizing as checkbox | Like Cursor. Simpler than SegmentedControl for a boolean property |
| 2026-04-09 | Flex controls instant mount | No animation when display switches to flex. Matches existing pattern |
| 2026-04-09 | Rename "Style" to "Appearance" | Matches Cursor. More descriptive, less ambiguous with CSS "style" attribute |
| 2026-04-09 | Token naming aligned to styles.css | Fixed text-xs/sm/md/lg scale, added weight tokens, utility tokens to match shipped code |
| 2026-04-09 | Position: dropdown, not SegmentedControl | Cursor pattern. 5 options too many for SegmentedControl. Dropdown shows icons + descriptions per option |
| 2026-04-09 | ~~Section headers get icons~~ [SUPERSEDED] | Icons broke left-alignment. Removed same day. |
| 2026-04-09 | ~~Visibility moved out of Position~~ [SUPERSEDED] | Initially to Layout, then moved to Appearance (final). |
| 2026-04-09 | Layer tree added to panel | Element hierarchy tree above sections. Multi-element selection supported with mixed state inputs |
| 2026-04-09 | Lucide icons only | All UI icons must be Lucide SVGs. No Unicode emoji. Custom SVGs must match Lucide's design language |
| 2026-04-09 | Type hierarchy: 14/13/12/11/9 scale | Section headers at 13px/600/--ink (landmark weight). Matches Cursor/Webflow/Figma patterns. Old 10/11/12/13 scale was too flat |
| 2026-04-09 | Added 600 weight (semibold) | New --weight-heading for section group headers. 400→500→600→700 weight progression gives clear hierarchy |
| 2026-04-09 | Section icons removed | Icons break left-alignment with property labels. Size+weight differentiation is enough |
| 2026-04-09 | Visibility moved to Appearance | Visibility is visual, not layout. Lives next to opacity/radius. Eye toggles use eye → eye-closed |
| 2026-04-09 | Display selector: top 5 only | block/flex/grid/inline/none covers 95%+ usage. inline-block (91%), inline-flex (39%) deferred to chevron overflow |
| 2026-04-09 | Conditional controls per display mode | block=nothing, flex=direction+justify+align+gap+wrap, grid=justify+align+gap, inline=vertical-align, none=nothing |
| 2026-04-09 | Position uses inline prefixes | X/Y/Z as ghost-colored prefixes inside inputs, rotation uses icon prefix. No separate property labels |
| 2026-04-09 | Grid is viewer+editor, not builder | Read app's existing grid config via computed styles. Simple patterns editable, complex templates read-only. Template preview shows "3 × 1" or raw CSS |
| 2026-04-09 | Intent over mechanism naming | Panel labels describe what happens (Fixed/Fit/Fill, Clip content, X/Y) not CSS names. Tooltips show CSS. AI translates intent to correct CSS for context. |
| 2026-04-09 | Unified sizing input+dropdown | W/H is one control: input + chevron. Dropdown has Fixed/Fit/Fill + Add Min/Add Max. No separate "More size options" expandable. |
| 2026-04-09 | Clip content replaces overflow | Checkbox (→ overflow: hidden). Simpler than 4-option SegmentedControl. Matches Cursor pattern. |
| 2026-04-09 | "Fill" renamed to "Background" | Fill is Figma/SVG term. Background is CSS. Both audiences understand "Background". |
| 2026-04-09 | ~~"Effects" renamed to "Filters"~~ [SUPERSEDED] | Rename didn't stick. "Effects" is canonical (combines shadow + blur). |
| 2026-04-09 | Self-alignment in Position | 6 icon buttons (justify-self × align-self). Only shown when parent is flex/grid. Figma pattern. |
| 2026-04-10 | ~~Px/Py/Mx/My spacing notation~~ [SUPERSEDED] | Text prefixes replaced with Lucide directional icons (move-horizontal, move-vertical). "Px" was confused with "pixels". |
| 2026-04-10 | Background/Border/Effects as sections | Promoted from collapsible subsections to full section-level (13px/600). Each has + button. Effects combines shadow + blur. |
| 2026-04-10 | Typography as own section | Separated from Appearance. Only shows for text elements. Two modes: compact (Tailwind) and expanded (raw CSS). |
| 2026-04-10 | Elements section for layer tree | "Elements" label (understood by designers and developers). Non-collapsible, max-height scroll. |
| 2026-04-10 | Effect details behind click | Summary row: [icon] [type ▾] [eye] [−]. Click icon to expand X/Y/Blur/Spread/Color detail panel. |
| 2026-04-10 | 3x3 AlignmentGrid reinstated | Reinstated after Webflow/Cursor user research. Click=position, dblclick=distribute, full-row overlay for distribution modes. |
| 2026-04-10 | Component heights standardized to 28px | Bumped from 26px for breathing room. All interactive controls: SegmentedControl, NumericInput, Dropdown, IconButton. |
| 2026-04-10 | Token display pattern | Detected tokens shown as [swatch] --name [unlink]. Unlink detaches token for raw editing. Applies to colors, typography classes, spacing tokens. |
| 2026-04-10 | Spacing icons replace Px/Py/Mx/My | Lucide move-horizontal (↔) and move-vertical (↕) icons as inline prefixes. Universal, no framework-specific baggage. |
| 2026-04-10 | Typography Mode A: token chips | Token names shown as chips with unlink buttons, not compact "300 · 14/21" format. Matches token display pattern. |
| 2026-04-10 | CSS token namespace --cx-* | All panel tokens prefixed to prevent collision through Shadow DOM inheritance. P0 security fix. |
| 2026-04-10 | 8 sections (evolved from 3) | Elements, Position, Layout, Typography, Appearance, Background, Border, Effects. Typography split from Appearance, Background/Border/Effects promoted from subsections. |
| 2026-04-10 | X/Y are screen coordinates | X=horizontal, Y=vertical always. CSS mapping adapts: row-flex X→justify-content, column-flex X→align-items. Panel labels don't change, output does. |

---

## Architecture Review Findings (2026-04-10)

Review team: Design (Codex+native), Frontend (Claude+native), DX (Gemini+native), PM (Claude+native), Security (Gemini+native), MTS (Gemini+native)
Mode: both (clink + native, 12 total reviewers)

### Cross-Reviewer Consensus

| Issue | Flagged By | Severity |
|---|---|---|
| X/Y labels flip for column-direction flex | Frontend, PM, Design (4 reviewers) | CRITICAL |
| Token namespace collision (--ink, --paper, --select) | Frontend, Security, MTS (4 reviewers) | CRITICAL |
| Internal contradictions (15+ in document) | Design, MTS, DX, Frontend (6 reviewers) | CRITICAL |
| Persona ambiguity — "developers AND designers" | PM, Design, DX (4 reviewers) | CRITICAL |
| Px/Py/Mx/My reads as "pixels" to non-Tailwind users | Frontend, Design, DX (5 reviewers) | HIGH |
| AI translation layer invisible/unspecified in UX | PM, MTS, Security (5 reviewers) | HIGH |
| Typography dual-mode auto-detection is fragile/unspecified | PM, MTS, DX (5 reviewers) | HIGH |
| v2 scope is 3x too large for v1 | PM, MTS (3 reviewers) | HIGH |
| "Fill container" wrong for grid items | Frontend (2 reviewers) | HIGH |
| Grid auto-fit/auto-fill immediately read-only | Frontend (2 reviewers) | HIGH |

### CRITICAL — Must fix before implementation

**1. X/Y axis labels flip in column-direction flex.**
X → justify-content is only correct for row direction. In column mode, justify-content controls vertical. A developer setting "X: Left" on a column flex silently sets the wrong property. Fix: dynamic label re-binding based on flex-direction. Alternative: use "Horizontal"/"Vertical" instead of X/Y.

**2. CSS token namespace collision.**
`--ink`, `--paper`, `--select`, `--rule` are bare names. CSS custom properties inherit through Shadow DOM. User apps with same names will break the panel. Fix: namespace as `--cx-ink` etc. Add `all: initial` to `:host`.

**3. 15+ internal contradictions.**
Document evolved through rapid iteration without full reconciliation. Key conflicts:
- Line 72 "with Lucide icon" vs line 178 "text only, no icons" vs line 317 catalog still says icons
- Line 55 headers use `--ink` vs line 85 says `--ink-secondary` for headers
- Line 415 "AlignmentGrid dropped" but lines 211/225 have alignment grid (reinstated but log not updated)
- Component Catalog: 26px heights vs eye icon: 28px
- Line 328 PositionDropdown "clear button (X)" vs line 288 "No clear button"
- Line 352 "eye-off" vs lines 267/431 "eye-closed" (Lucide has eye-off, not eye-closed)
- Line 425 visibility in Layout vs line 431 visibility in Appearance
- Lines 372-376 reference "collapsible sections" that were removed
- Line 440 renamed "Effects" to "Filters" but line 278/443 still says "Effects"
- Line 413 "3 sections" but actual panel has 8 top-level sections
Fix: single reconciliation pass with canonical vocabulary table.

**4. Persona ambiguity.**
"Developers and technical founders" is the stated audience, but Intent Over Mechanism naming targets someone who doesn't know CSS. The AI CLI distribution channel means the primary user is a developer. PM verdict: "Pick one primary persona. The strongest bet: the developer who wants to do design polish without context-switching." Use Figma's exact terms where they exist (designers already learned them), show CSS as secondary context for developers. Do not invent new terms unless neither audience has one.

### HIGH — Should fix in v2

**5. Px/Py is NOT standard Tailwind** (DX native caught this). Tailwind uses `px-4`, not `Px`. The notation is Tailwind-adjacent — close enough to confuse, different enough to mislead. Non-Tailwind developers read "Px" as "pixels." Fix: use "Horizontal"/"Vertical" or directional icons (↔/↕).

**6. AI translation layer needs UX.** The product's only moat is invisible. No diff preview, no error state, no validation gate between AI output and source transform. One bad write that corrupts source and the user never returns. Fix: show proposed diff before commit. Add CSS whitelist validation before Babel transform. Make "AI translated this" visible.

**7. Typography Mode A "300 · 14/21" is unreadable to designers** (Design native). This dot-separator format has no precedent in any design tool. Figma shows weight, size, and line-height as three labeled fields. Fix: use labeled segments or match Figma's format.

**8. "Fill container" wrong for grid items.** Maps to `width: 100%` for block and `flex: 1` for flex, but grid items need `justify-self: stretch`. Fix: add grid row to sizing table.

**9. Grid auto-fit/auto-fill is read-only.** The most common responsive grid pattern falls into "complex." Fix: add handling for `repeat(auto-fit/auto-fill, minmax(N, 1fr))`.

**10. Missing component specs.** Tooltip (core of intent-over-mechanism), LockButton, EyeToggle, ColorPicker, ElementTree, IconButton absent from catalog.

**11. Typography mode switching should be manual, not automatic.** Auto-detection has too many edge cases (Tailwind + raw CSS, @apply, mid-edit). Default to detected mode but show escape hatch.

**12. "Effects" vs "Filters" naming is incoherent.** Decision log says renamed to "Filters" but mock and spec still say "Effects." Shadow is `box-shadow`, not `filter`. The grouping conflates unrelated CSS subsystems.

### MEDIUM

- Transitions cause live editing flicker — suppress during editing sessions
- Tailwind JIT breaks CSS injection — write to source in Tailwind mode
- "Clip content" hides overflow:hidden side effects (BFC creation)
- visibility:hidden vs display:none conflation — add tooltip
- Auto-detect luminance fragile — use color-scheme meta first
- Grid item properties missing (grid-column: span N)
- 8 sections may be too many — consider re-collapsing Background/Border/Effects into Appearance
- "Border box" is mechanism not intent — rename to "Include padding in size"
- Google Fonts CDN blocked in air-gapped environments — bundle fonts
- No activation flow or aha-moment defined
- No success metrics defined
- Missing CSS properties: cursor, white-space, text-overflow, pointer-events, transition
- Z in Position ambiguous: z-index or translateZ?
- "Fill container" (sizing) vs "Background" (formerly "Fill") cognitive dissonance
- inline-block at 91% usage — deferral reasoning needs correction

### LOW

- Section header color contradiction (line 55 vs 85)
- align-content not addressed for flex-wrap
- aspect-ratio and object-fit absent
- rotate ambiguity: CSS rotate vs transform: rotate()
- Decisions log needs [superseded] tags on reversed decisions

### Positive Practices — Preserve These

1. **Decisions Log** — praised by all 12 reviewers. Prevents re-litigation.
2. **"Viewer+editor, not builder" for grid** — honest scope bounding
3. **Typography Mode A/B concept** — right insight, needs manual toggle
4. **Progressive disclosure (95% rule)** — correctly applied
5. **Tooltip-shows-CSS approach** — clean for designers, verifiable for developers
6. **Industrial/Utilitarian aesthetic** — differentiated
7. **X/Y alignment concept** — solves cognitive load, needs column-direction fix
8. **Mixed-state multi-select** — correct inspector pattern
9. **Shadow DOM + regex allowlists** — good security foundation
10. **Sizing labels (Fixed/Fit/Fill)** — the strongest naming decision

### Review Methodology Note

Both mode deployed 12 reviewers (6 clink across Codex/Claude/Gemini + 6 native Claude agents). Clink provided model diversity and caught more implementation-level issues by inspecting source code. Native agents provided tighter, more focused analysis with better line-reference precision. Key finding uniquely caught by clink: Tailwind JIT CSS availability problem. Key finding uniquely caught by native: "Px" is NOT standard Tailwind notation (DX native), Typography Mode A format unreadable to designers (Design native).

**PM VERDICT:** "Should this be built as described? No, not as described. The core insight should be built. The scope should not. Ship the AI translation loop with 15 properties. Validate that developers actually use intent labels instead of just typing CSS. Then expand."
