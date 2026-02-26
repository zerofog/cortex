---
date: 2026-02-18T06:30:00-08:00
researcher: Claude Opus 4.6
git_commit: 854bdc58c66559af0e7fd661e6b091d184244716
branch: zf0-740-csp-production-hardening
repository: narokan-web
topic: 'Visual Editing Workflow — Token-Aware Specification Toolbar'
tags:
  [
    research,
    visual-inspector,
    design-system,
    styling,
    mantine,
    tailwind,
    csp,
    figma-plugin,
    toolbar,
    diff-contract,
    session-loop,
    edit-intent,
    figma-mcp,
    point-and-prompt,
  ]
status: complete
last_updated: 2026-02-18
last_updated_by: Claude Opus 4.6
last_updated_note: 'Added Round 3 (non-token scenarios, session loop, EditIntent, Point+Prompt pattern, 5-tier taxonomy) and Round 4 (Figma MCP evaluation, plugin vs MCP clarification, integration landscape)'
---

# Research: Visual Editing Workflow — Token-Aware Specification Toolbar

**Date**: 2026-02-18T06:30:00-08:00
**Researcher**: Claude Opus 4.6
**Git Commit**: 854bdc58
**Branch**: zf0-740-csp-production-hardening
**Repository**: narokan-web

## Research Question

Design the visual editing workflow for the `/visual` command: how should users specify style changes visually in the browser, with Claude Code implementing actual source code changes? Validate all assumptions against the actual codebase.

## Summary

After four rounds of 4-agent team analysis and codebase validation, the agreed architecture is:

**Browser = specification tool. Claude Code = editor.** There is no parallel editing system.

The workflow has two modes based on the type of change:

- **Token changes** (spacing, radius, color): Alt+Click element → **token-aware toolbar** with segmented buttons (`xs | sm | md | lg | xl`) → live preview → `[✓ Done]` → Enter in terminal → Claude reads structured diff → edits source code.
- **Everything else** (icons, layout, visibility, text): Alt+Click element → type 2-3 words in terminal ("change to IconShield", "move to top") → Claude reads selection context → edits source code. This is the **"Point + Prompt" pattern**.

**Figma MCP** (`figma@claude-plugins-official`, now enabled) handles a separate concern: **creation and exploration** ("design me a settings page", "show me 3 layout options"). It is complementary to `/visual`, not competitive — they answer different questions from different starting points.

### Key Findings

1. **Token system is disconnected**: The generated token files (`variables.generated.css`, `tailwind.tokens.ts`, `theme.generated.ts`) are not imported anywhere in the app. The runtime styling API is `--mantine-*` CSS variables from `MantineProvider`, not the design token build outputs. Any "token reverse-lookup" must map against Mantine variables, not generated ones.

2. **Mantine props dominate 80:17:3**: The styling ratio is ~80% Mantine props, ~17% Tailwind className, ~3% CSS Modules. The primary edit target is Mantine props, not Tailwind.

3. **data-testid coverage is sparse**: Only 122 production testids across 32 files. The app shell, settings, admin, import wizard, and most interactive components have zero testids.

4. **AskUserQuestion is for disambiguation, not style input**: Its 2-4 option limit and context-switching overhead make it unsuitable for style value selection. Reserved for decisions like "Change all Buttons or just this one?"

5. **Token-aware controls eliminate reverse-mapping ambiguity**: The design system is token-constrained (finite set of values), so the toolbar outputs token names directly in the diff — no pixel-to-token guessing needed.

## Detailed Findings

### 1. Visual Inspector — Current State

**Files**: `scripts/visual-inspect.js` (277 lines), `scripts/__tests__/visual-inspect.test.ts` (230 lines), `.claude/commands/visual.md` (104 lines)

The inspector is stable and well-tested:

- Source resolution via `resolveSource()` — 3 strategies (data-testid, fiber chain, DOM heuristic)
- 10 tests covering all strategies + edge cases (depth limiting, anonymous components, server component detection)
- Selection data stored in `window.__NAROKAN_SELECTED__` with component chain, styles, bounds, testId
- Browser IIFE handles hover overlay (blue), Alt+Click selection (green), Escape deactivation
- Module exports for Node.js testing via `if (typeof module !== 'undefined')`

**No changes needed** to the inspector for the toolbar — it's a clean separation point. The toolbar will layer on top of the existing inspector selection mechanism.

### 2. Styling Systems in Use

| System                                                                        | Files | Occurrences | Share           |
| ----------------------------------------------------------------------------- | ----- | ----------- | --------------- |
| Mantine style props (`size`, `c`, `p`/`m`, `fw`, `gap`, `radius`, `bg`, `fz`) | 178   | ~4,265      | ~80%            |
| Tailwind utility classes (`className=`)                                       | 59    | 281         | ~17%            |
| CSS Modules (`.module.css`)                                                   | 3     | ~30         | ~3%             |
| Inline `style=` objects                                                       | 118   | 438         | (supplementary) |

**Key patterns discovered**:

- Mantine components with Mantine props is the dominant pattern: `<Text size="sm" c="dimmed" fw={500}>`
- Tailwind is used for layout of wrapper `<div>`s: `className="flex flex-col gap-4"`
- **Mixed usage is common**: `<Button className="bg-foreground" color="primary" radius="full">` — Tailwind classes AND Mantine props on the same element
- CSS Modules exist only for: `main-navbar.module.css` (100 lines, shared by main + settings navbars), `TreeNode.module.css` (153 lines), `ViewAsActions.module.css` (10 lines, unused import)
- All CSS Modules use `var(--mantine-*)` variables internally

**Implication for toolbar**: The property-to-system lookup table must check Mantine props first. When a user changes padding via the toolbar, Claude should target `p="md"` on the Mantine component, not `className="p-4"`.

### 3. Design Token System

**Architecture**:

```
tokens.json (745 lines, W3C DTCG format)
     |
     | npm run tokens:build (Style Dictionary)
     |
     +---> variables.generated.css    [NOT IMPORTED - 0 usages in app]
     +---> theme.generated.ts         [NOT IMPORTED - 0 usages in app]
     +---> tailwind.tokens.ts         [NOT IMPORTED - 0 usages in app]
     +---> figma-variables.json       [consumed only by figma:sync]

globals.css (hand-maintained, 46 lines)
     |
     +---> body color/background only (2 usages)
     +---> tailwind.config.ts references --background, --foreground, --border

theme.ts (hand-maintained, 297 lines)
     |
     +---> layout.tsx <MantineProvider theme={theme}>
           +---> Mantine generates --mantine-* at runtime
                 +---> 146 usages across 42 files (DOMINANT path)
```

**globals.css vs variables.generated.css duplication**:

| Category          | globals.css name      | Generated name        | Status          |
| ----------------- | --------------------- | --------------------- | --------------- |
| Background        | `--background`        | `--background`        | Aligned (Fix 2) |
| Background subtle | `--background-subtle` | `--background-subtle` | Identical       |
| Background muted  | `--background-muted`  | `--background-muted`  | Identical       |
| Foreground        | `--foreground`        | `--foreground`        | Aligned (Fix 2) |
| Foreground muted  | `--foreground-muted`  | `--foreground-muted`  | Identical       |
| Foreground subtle | `--foreground-subtle` | `--foreground-subtle` | Identical       |
| Border            | `--border`            | `--border`            | Aligned (Fix 2) |
| Border muted      | `--border-muted`      | `--border-muted`      | Identical       |
| Radius xs-xl      | `--radius-xs` etc.    | `--radius-xs` etc.    | Identical       |

~~The `-default` suffix mismatch affects 3 categories~~ **Resolved by Fix 2** — the CSS and Tailwind transforms now strip `-default` from CSS variable names when the W3C DTCG `default` variant is the last path segment. Additionally, 22 variables exist only in the generated file (primary, secondary, destructive, success, warning, info, spacing).

**Critical finding**: The generated files are not consumed by the app. The token build pipeline produces correct outputs but they're not wired in. Components use `--mantine-*` variables (146 occurrences across 42 files) as the de facto design token system.

**theme.ts vs theme.generated.ts naming**: theme.ts registers the gray palette as `zinc` (producing `--mantine-color-zinc-*`), while theme.generated.ts would register it as `gray` (producing `--mantine-color-gray-*`). This means swapping to the generated theme would break all `zinc` color references.

**ESLint enforcement**: `no-hardcoded-colors` and `no-inline-style-colors` rules exist (warn level) directing developers to Mantine color refs like `gray.5`.

### 4. data-testid Coverage

**Total**: 122 production testids across 32 files, 37 test-only testids.

| Area                                       | Production Files | Production testids |
| ------------------------------------------ | ---------------- | ------------------ |
| `app/components/hierarchy-viewer/`         | 14               | 60                 |
| `app/demo/`                                | 6                | 36                 |
| `app/risk-taxonomy/`                       | 6                | 19                 |
| `app/components/import/`                   | 4                | 5                  |
| `app/components/object-detail/`            | 2                | 2                  |
| `app/settings/`                            | 0                | 0                  |
| `app/admin/`                               | 0                | 0                  |
| `app/auth/`                                | 0                | 0                  |
| `app/onboarding/`                          | 0                | 0                  |
| `app/boards/`                              | 0                | 0                  |
| `app/inbox/`                               | 0                | 0                  |
| `app/assessments/`                         | 0                | 0                  |
| App shell (layout, navbar, page-container) | 0                | 0                  |

**Components with ZERO testids** (high-traffic, would benefit most):

- Main navbar (`main-navbar.tsx`) — primary navigation, no testids
- Settings navbar (`settings-navbar.tsx`) — no testids
- User profile display (`user-profile.tsx`) — E2E fixture expects `user-menu` but it doesn't exist
- Page container (`page-container.tsx`) — wraps every page, no testids
- All settings forms (profile, workspace-general, workspace-import)
- All admin pages (TenantDataViewer, DatabaseHealthManager, etc.)
- Import wizard and all sub-components (risk-import-wizard, column-mapping, etc.)
- Object detail property list components
- Boards, inbox, assessments pages

**Naming convention**: kebab-case with four patterns:

1. `feature-element` (e.g., `hierarchy-loading`, `canvas-container`)
2. Dynamic `feature-${id}` (e.g., `tree-node-${node.id}`)
3. State indicators (`detail-panel-loading`, `canvas-cycle-error`)
4. Element type descriptors (`search-icon`, `expand-icon`)

**CSS coupling**: `TreeNode.module.css` uses `[data-testid="expand-icon"]` as a CSS selector for styling.

### 5. CSP Configuration

**Dev mode** (`security-headers.ts:27`):

```
script-src 'self' 'unsafe-eval' 'nonce-${nonce}'
```

- `unsafe-eval` is present — **browser_evaluate injection works in dev mode**

**Production** (`security-headers.ts:28`):

```
script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:
```

- No `unsafe-eval` — **injection blocked in production** (intentional safety layer)

**Nonce propagation**: Generated per-request in middleware → `X-Nonce` header → `layout.tsx` reads via `headers().get('x-nonce')` → passed to Mantine's `ColorSchemeScript`.

**Implication for toolbar**: The toolbar can only be injected in dev mode, which is the intended use case. Production CSP provides a natural safety barrier.

### 6. Figma Plugin State

**Confirmed**: Capture pipeline fully removed. Only token sync remains.

- `figma-plugin/code.js` — handles only `'token-data'` message type
- `figma-plugin/ui.html` — WebSocket client for token relay
- `figma-plugin/server.ts` — reads `figma-variables.json`, serves over WebSocket
- `package.json` — only `figma:sync` script exists, no `figma:capture`
- Zero matches for "capture" across entire `figma-plugin/` directory

### 7. Slash Command Patterns

16 commands in `.claude/commands/`. Structural pattern:

1. Optional YAML frontmatter (`description`, `model`)
2. Title + purpose
3. Usage/arguments documentation
4. Numbered execution steps with specific tool references
5. Output format templates

**MCP tool references**: Commands name MCP tools directly (e.g., `browser_navigate`, `browser_evaluate`, `mcp__linear__create_issue`) and provide invocation patterns. Claude is expected to have these tools available via MCP integration.

**Sub-agent delegation**: Research and planning commands spawn parallel agents via `Task` tool.

**Interactive gates**: Several commands explicitly pause for user confirmation before destructive or irreversible actions.

## Architecture Decision: Browser as Specification Tool

### Evolution of the Design

**Round 1** — A 4-agent team evaluated a full Figma-like editor panel (sliders, drag-drop, impact analysis in browser). The **Claude Code expert strongly disagreed**: building a parallel editor creates maintenance burden and fights Claude's strength. The browser should be a specification tool — the user says _what_ to change, Claude figures out _how_.

**Round 2** — Refined the problem: "I don't want to describe what I'm editing through text. I should be able to click, change it, preview it, Claude Code reads it, sees the diff, makes the changes." A second 4-agent team evaluated approaches and converged on **token-aware toolbar controls**.

**Final architecture**: No parallel editing systems. The browser provides visual controls for specifying changes; Claude Code reads the structured diff and implements actual source code changes.

### What This Is NOT

- NOT a full in-browser property editor panel
- NOT drag-and-drop reordering
- NOT WebSocket/polling communication between browser and Claude
- NOT a replacement for Claude Code's editing capabilities
- NOT a production feature — dev-mode only (CSP enforced)

### Token-Aware Toolbar Design (~300 lines)

The design system is **token-constrained** — spacing, radius, font sizes, and colors are all drawn from a finite set of design tokens. This means we can show segmented button controls instead of free-form sliders:

```
┌─ Spacing ──────────────────────┐
│ [xs] [sm] [●md] [lg] [xl]     │  ← current value highlighted
├─ Radius ───────────────────────┤
│ [none] [xs] [sm] [●md] [lg]   │
├─ Font Size ────────────────────┤
│ [xs] [sm] [●md] [lg] [xl]     │
├────────────────────────────────┤
│         [✓ Done]               │
└────────────────────────────────┘
```

**Why segmented buttons over sliders**:

- Output is token names directly (e.g., `md`), not pixel values
- No reverse-mapping ambiguity (slider: `14px` → is that `sm` or custom?)
- Design-system-aware: only valid token values are selectable
- Instant preview via `element.style` (temporary, reverted if cancelled)

### Diff Contract

When the user clicks a token button, the toolbar:

1. Applies the change via `element.style.paddingTop = '16px'` (longhand CSS property)
2. Records the change in a structured diff object: `{ property: 'padding', token: 'md', previous: 'sm' }`

A `MutationObserver` on the element's `style` attribute captures explicit user changes only — distinguishing user edits from cascading side effects. Only **longhand** CSS properties are tracked to avoid ambiguity.

When `[✓ Done]` is clicked, the toolbar calls `finalizeDiff()` which writes the complete changeset to `window.__NAROKAN_STYLE_DIFF__`:

```typescript
interface StyleDiff {
  elementSelector: string; // data-testid or CSS selector
  componentChain: string[]; // React fiber component names
  changes: Array<{
    property: string; // CSS property category (padding, radius, etc.)
    token: string; // New token name (e.g., "lg")
    previousToken: string; // Previous token name (e.g., "md")
    cssProperty: string; // Longhand CSS property (e.g., "padding-top")
    cssValue: string; // Applied CSS value (e.g., "20px")
  }>;
  styleOrigin:
    | 'mantine-prop'
    | 'mantine-default'
    | 'tailwind'
    | 'css-module'
    | 'unknown';
}
```

### Token Reverse-Mapping at Runtime

Token values are read from CSS variables at runtime — not hardcoded:

```javascript
// Read Mantine's runtime spacing scale
const spacingMap = {};
for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--mantine-spacing-${size}`)
    .trim();
  spacingMap[value] = size; // e.g., '16px' → 'md'
}
```

**Color normalization**: Computed styles return `rgb()` but tokens may be hex. Normalize both to a common format (e.g., hex → rgb) before comparison.

Source for Mantine's runtime variables: `app/theme.ts` color palettes (lines 12-88) and spacing/radius scales (lines 137-152).

### Style Origin Detection

The toolbar must detect **where** a style comes from to inform Claude's edit strategy:

| Origin                          | Detection Method                                                           | Claude's Edit Target                             |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| Mantine `theme.ts` defaultProps | Check `theme.components[ComponentName].defaultProps` against current value | Add explicit override prop, or modify `theme.ts` |
| Explicit Mantine prop           | React fiber `memoizedProps` has the prop                                   | Change the prop value in JSX                     |
| Tailwind className              | Element has matching utility class                                         | Change className string                          |
| CSS Module                      | Element has hashed class from `.module.css`                                | Edit the CSS Module file                         |

`theme.ts` sets component-level defaults:

- All Buttons default to `radius="sm"` (line 175)
- All Cards default to `radius="md"`, `padding="lg"` (lines 218-220)
- All Modals default to `radius="lg"` (line 230)
- NavLink has custom root styles via `styles.root` (lines 276-279)

When a user changes border-radius on a Button from `sm` → `lg`, the toolbar detects it's coming from `defaultProps` and the diff includes `styleOrigin: 'mantine-default'`. Claude then uses `AskUserQuestion` to ask: "Change all Buttons via theme.ts, or just this one with an explicit prop?"

### "I'm Done" Signaling Mechanism

1. User clicks `[✓ Done]` button in the browser toolbar → finalizes diff to `window.__NAROKAN_STYLE_DIFF__`
2. User presses Enter in the terminal → signals Claude Code to read the diff
3. Claude runs `browser_evaluate → JSON.stringify(window.__NAROKAN_STYLE_DIFF__)` to retrieve changes
4. Claude reads selection data from `window.__NAROKAN_SELECTED__` for source file resolution

**Why not automatic**: WebSocket adds complexity; polling is wasteful and fragile; `browser_wait_for` times out. The explicit two-step (browser Done + terminal Enter) is simple, reliable, and keeps the user in control.

### AskUserQuestion Verdict

**NOT for style value selection** — The tool supports 2-4 options maximum and requires 3 context switches per change (terminal → browser → terminal). Choosing between `xs/sm/md/lg/xl` spacing via AskUserQuestion would be tedious and slow.

**YES for disambiguation** — Ideal for decisions after the diff is read:

- "Found in 3 files. Which one should I edit?"
- "This radius comes from `theme.ts` defaultProps. Change all Buttons, or just this one?"
- "This Tailwind class is used on 8 elements. Apply to all, or add a variant?"

### Edit-to-Code Translation Table

Based on actual codebase patterns (Mantine-dominant 80:17:3), Claude uses this priority:

| CSS Property  | Primary Target                       | Check                           | Fallback                             |
| ------------- | ------------------------------------ | ------------------------------- | ------------------------------------ |
| padding       | Mantine `p=`/`px=`/`py=`/`pt=`/`pb=` | Is element a Mantine component? | Tailwind `p-*` on wrapper div        |
| margin        | Mantine `m=`/`mx=`/`my=`/`mt=`/`mb=` | Same                            | Tailwind `m-*`                       |
| gap           | Mantine `gap=` on Stack/Group/Flex   | Same                            | Tailwind `gap-*` on flex div         |
| color         | Mantine `c="zinc.7"` or `c="dimmed"` | Same                            | Tailwind `text-*`                    |
| background    | Mantine `bg="gray.0"`                | Same                            | Tailwind `bg-*`                      |
| font-size     | Mantine `size="sm"` or `fz="sm"`     | Same                            | Tailwind `text-sm`                   |
| font-weight   | Mantine `fw={500}`                   | Same                            | Tailwind `font-medium`               |
| border-radius | Mantine `radius="sm"`                | Same (check theme defaultProps) | Tailwind `rounded-*`                 |
| display/flex  | Tailwind `className="flex"`          | Is it a wrapper div?            | Mantine `<Flex>`/`<Stack>`/`<Group>` |

## Round 3: Non-Token Scenarios — Icons, Layout, and General Design

### Problem Statement

Rounds 1-2 solved token-based styling (spacing, radius, color). But real design work includes:

- Swapping icons (`IconSettings` → `IconShield`)
- Moving navigation (sidebar → top bar)
- Hiding/showing elements
- Changing text content

**Question**: Does the browser need more UI for these, or is the existing inspector + terminal sufficient?

### The "Point + Prompt" Pattern

A 4-agent team converged on a key insight: **for non-token changes, Alt+Click selection + 2-3 words in the terminal is faster than any browser-side picker.**

```
# Icon swap
User: Alt+Clicks the settings icon
User (terminal): "change to IconShield"

# Layout restructure
User: Alt+Clicks the sidebar navbar
User (terminal): "move to top"

# Hide element
User: Alt+Clicks a section
User (terminal): "hide this"

# Text change
User: Alt+Clicks a heading
User (terminal): "change to 'Risk Assessment Dashboard'"
```

**Why this beats browser UI for non-token changes**:

- Icon picker would need to load 2000+ Tabler icons into a browser panel
- Layout restructure has too many permutations for button controls
- Text editing in a browser overlay duplicates the source file
- Terminal input is 2-3 words — minimal friction

**Token changes are the ONE case where visual beats text**: Users may not know token names, and seeing `xs | sm | md | lg | xl` with live preview is genuinely faster than typing.

### 5-Tier Design Task Taxonomy

| Tier                    | Input Method                           | Example                             | Browser UI?   |
| ----------------------- | -------------------------------------- | ----------------------------------- | ------------- |
| 1. Visual-only          | Token toolbar clicks                   | Spacing xs→lg, radius sm→md         | YES — toolbar |
| 2. Point + Name         | Alt+Click + component/icon name        | "change to IconShield"              | NO — terminal |
| 3. Point + Short Phrase | Alt+Click + 2-5 word instruction       | "move to top", "hide this"          | NO — terminal |
| 4. Point + Describe     | Alt+Click + multi-sentence description | "Make this a card with a shadow..." | NO — terminal |
| 5. Conversation only    | No visual anchor needed                | "Add dark mode support"             | NO — terminal |

The toolbar (Tier 1) is the **only** tier requiring new browser-side code. Tiers 2-4 work today with zero browser changes — they just need Claude to read `window.__NAROKAN_SELECTED__` after Alt+Click and process the terminal input.

### EditIntent Data Model (Unified Contract)

All 5 tiers produce a common data structure — the `EditIntent` discriminated union. This is the contract between browser selection and Claude Code's edit logic.

```typescript
interface ElementTarget {
  testId: string | null;
  componentChain: string[];
  isServerComponent: boolean;
  element: {
    tag: string;
    classes: string[];
    text: string;
    bounds: { top: number; left: number; width: number; height: number };
  };
}

type Confidence = 'high' | 'medium' | 'low';

// --- Intent types (discriminated union) ---

interface TokenChangeIntent {
  readonly type: 'token-change';
  property: string; // CSS property category
  token: string; // New token name
  previousToken: string | null;
  cssProperty: string; // Longhand CSS property
  cssValue: string; // Applied CSS value
  styleOrigin:
    | 'mantine-prop'
    | 'mantine-default'
    | 'tailwind'
    | 'css-module'
    | 'unknown';
}

interface ComponentSwapIntent {
  readonly type: 'component-swap';
  currentComponent: string; // e.g., "IconSettings"
  newComponent: string; // e.g., "IconShield"
  package: string | null; // e.g., "@tabler/icons-react"
  currentProps: Record<string, string | number | boolean>;
}

interface LayoutMoveIntent {
  readonly type: 'layout-move';
  operation: 'reorder' | 'reparent' | 'slot';
  destination: ElementTarget;
  beforeSibling: ElementTarget | null;
  slotName: string | null; // e.g., "header" for AppShell slots
  newIndex: number;
}

interface VisibilityIntent {
  readonly type: 'visibility';
  action: 'hide' | 'show';
  currentMechanism: 'display-none' | 'conditional' | 'unknown';
}

interface TextChangeIntent {
  readonly type: 'text-change';
  previousText: string;
  newText: string;
  textOrigin: 'strings-file' | 'jsx-literal' | 'prop-value' | 'unknown';
}

type EditIntentAction =
  | TokenChangeIntent
  | ComponentSwapIntent
  | LayoutMoveIntent
  | VisibilityIntent
  | TextChangeIntent;

// --- Container ---

interface EditChange {
  intent: EditIntentAction;
  target: ElementTarget;
  confidence: Confidence;
}

interface EditIntent {
  version: '1.0';
  sessionId: number;
  timestamp: string;
  changes: EditChange[];
  screenshotDataUrl: string | null;
}
```

**Stored in**: `window.__NAROKAN_EDIT_INTENT__`

**Key design decisions**:

- Discriminated union (`type` field) enables exhaustive switch for Claude's edit routing
- `version` field for forward compatibility as the model evolves
- `confidence` scoring (high = testId match, medium = fiber chain, low = DOM heuristic)
- Compound changes supported via `changes: EditChange[]` array
- `screenshotDataUrl` for Claude's visual context (optional)

### Session Loop Design

The `/visual` command evolves from a linear 8-step workflow to a **persistent interactive session**:

```
/visual → navigate → inject inspector → LOOP:
  ├─ Wait for user input (terminal)
  ├─ Read browser state (selection + toolbar diff)
  ├─ Route intent based on context:
  │   ├─ styleDiff exists? → Token change handler
  │   ├─ selection + icon keyword? → Icon swap handler
  │   ├─ selection + layout keyword? → Layout handler
  │   ├─ selection + text? → Describe intent handler
  │   └─ no selection? → Page-level handler
  ├─ Edit source code
  ├─ HMR refreshes browser
  ├─ Verify change (screenshot)
  └─ REPEAT until user types "done" or "exit"
```

**Critical insight from Claude Code expert**: Tiers 2-5 work TODAY with zero new browser code. The session loop and intent handlers can be built first, delivering immediate value before the token toolbar is ready.

### Element Type Classifier (~40 lines)

Enriches selection data to help Claude route intents:

```javascript
function classifyElement(el) {
  const fiber = getFiber(el);
  const typeName = fiber?.type?.name || fiber?.type?.displayName || '';

  if (/^Icon[A-Z]/.test(typeName)) return 'icon';
  if (['AppShell', 'Navbar', 'Header', 'Footer'].includes(typeName))
    return 'layout';
  if (['Text', 'Title', 'Heading'].includes(typeName)) return 'text';
  if (['Button', 'ActionIcon', 'Menu'].includes(typeName)) return 'interactive';
  if (['Card', 'Paper', 'Box', 'Group', 'Stack'].includes(typeName))
    return 'container';
  return 'unknown';
}
```

This classification feeds into the session loop's intent routing — an `icon` element + "change to X" → `ComponentSwapIntent`.

### What Was Explicitly Rejected

- **Drag-and-drop reordering**: All 4 agents agreed — complex (static JSX vs `.map()` vs CSS order), high effort, low ROI
- **Component library browser in browser**: Would duplicate Mantine docs, bloat the inspector, and fight with Mantine's server rendering
- **Visual state designer** (hover/active state editing): Internal state changes are too tightly coupled to React logic
- **In-browser text editing**: Contenteditable overlays would be fragile and duplicate the source file

## Figma MCP — Complementary Creation Tool (Separate from `/visual`)

### Two Different Starting Points, Two Different Tools

The `/visual` workflow and Figma MCP are **not competing alternatives**. They answer different questions from different starting points:

```
REFINEMENT (starting from your running app):

  Browser (localhost:3000) → see something → want to tweak it
    └─ /visual workflow
       ├─ Alt+Click element → token toolbar OR terminal phrase
       ├─ Claude edits source code
       ├─ HMR refreshes instantly
       └─ You see the result in the REAL app


CREATION (starting from an idea):

  Terminal → "I want to explore a top-nav layout for the dashboard"
    └─ Figma MCP
       ├─ Claude creates mockups in Figma
       ├─ You compare options visually in Figma
       ├─ You pick one
       └─ Claude implements it in source code
```

### When Would You Use Each?

| Question                                                        | Tool                       |
| --------------------------------------------------------------- | -------------------------- |
| "This button's padding looks wrong"                             | `/visual`                  |
| "What would this page look like with cards instead of a table?" | Figma MCP                  |
| "Change this icon to IconShield"                                | `/visual` (Point + Prompt) |
| "Design me a settings page"                                     | Figma MCP                  |
| "Make this radius larger"                                       | `/visual` (toolbar)        |
| "Show me 3 color scheme options"                                | Figma MCP                  |
| "Move the nav to the top"                                       | `/visual` (Point + Prompt) |
| "What should the onboarding flow look like?"                    | Figma MCP                  |

### How They Coexist in the Stack

```
┌─────────────────────────────────────────────────┐
│                 Design Workflow                  │
│                                                  │
│  CREATION ──────────────────── REFINEMENT        │
│  "Build me something new"      "Tweak what I see"│
│                                                  │
│  Figma MCP                     /visual           │
│  ├─ Explore layouts            ├─ Token toolbar  │
│  ├─ Compare options            ├─ Point+Prompt   │
│  ├─ Generate mockups           ├─ Session loop   │
│  └─ THEN implement             └─ Instant HMR    │
│                                                  │
│  ┌──────────── Bridge ──────────────┐            │
│  │  tokens.json (Style Dictionary)  │            │
│  │  ├─ → Figma Variables (sync)     │            │
│  │  └─ → CSS variables (build)      │            │
│  └──────────────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

The token pipeline (`tokens.json` → Style Dictionary) is the bridge between both worlds. Token values flow to both Figma (via `figma:sync`) and the app (via the CSS variable build).

### What Figma MCP Does NOT Do

Figma MCP is useful for exploration and creation, but it is **not a replacement for source code editing**:

1. **Dual-artifact divergence**: If Figma becomes authoritative, code and Figma designs drift apart
2. **Translation is lossy**: Figma auto-layout ≠ Mantine `<Stack>` + `<Group>`. Shadows, responsive behavior, and component state have no 1:1 mapping
3. **Source code remains the single source of truth** — Figma is ephemeral (exploration), never authoritative
4. The token pipeline already bridges the gap — no second bridge needed

### Figma Integration Landscape

Three separate Figma integrations exist, each going in a different direction:

| Integration                      | What It Is                                                                          | Direction                                              | Status                                 |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `figma@claude-plugins-official`  | Official Claude Code plugin wrapping Figma's MCP server (10 tools + 3 agent skills) | Figma → Code (reads designs, variables, screenshots)   | **Enabled** in `.claude/settings.json` |
| Chrome DevTools MCP              | Browser automation — gives Claude access to any browser tab                         | Bidirectional (read + write Figma via Plugin API)      | Not configured (not needed yet)        |
| Custom `figma-plugin/` directory | WebSocket-based token sync (`npm run figma:sync`)                                   | Code → Figma (pushes `tokens.json` as Figma Variables) | Active, token sync only                |

**Clarification**: `figma@claude-plugins-official` IS "the Figma MCP" — the plugin wraps Figma's MCP servers at `https://mcp.figma.com/mcp` (remote) and `http://127.0.0.1:3845/mcp` (desktop). There is no separate Figma MCP to configure. The custom `figma-plugin/` directory goes in the **opposite direction** and has zero overlap.

### Decision Record

**User decision (explicit)**: Continue building the `/visual` workflow. A 4-agent team recommended pivoting to Figma MCP instead, but the user rejected this: _"I want to continue building, this is valuable to our workflow."_

**Rationale**: The refinement loop (see something → tweak it → see result instantly) is a fundamentally different workflow from creation. Figma MCP is complementary — useful for exploring new layouts — but doesn't replace the speed of editing live production code via the browser. Both tools are now available.

## Phased Implementation Plan

### Phase 0: Session Loop + Point-and-Prompt (zero browser changes)

**Delivers immediate value with NO new browser code.**

- Evolve `/visual` slash command from linear 8-step to persistent interactive session
- Implement intent routing: read `window.__NAROKAN_SELECTED__` → classify element type → route to handler
- Support Tiers 2-5 (Point+Name through Conversation) via terminal input
- Add element type classifier (~40 lines) to `visual-inspect.js`
- Store `EditIntent` in `window.__NAROKAN_EDIT_INTENT__` for structured handoff

### Phase 1: Token Toolbar — Spacing + Radius (~300 lines)

- Segmented buttons for `padding`, `margin`, `gap`, `border-radius`
- Token scales: `xs | sm | md | lg | xl` (spacing), `none | xs | sm | md | lg | xl | full` (radius)
- Live preview via `element.style`
- Structured diff output to `window.__NAROKAN_STYLE_DIFF__`
- Style origin detection (Mantine prop vs defaultProps vs Tailwind)
- `[✓ Done]` button → Enter signal flow

### Phase 2: Token Toolbar — Font + Color

- Font size and font weight segmented buttons
- Color token palette (semantic: primary, secondary, destructive, etc.)
- Mantine color dot notation support (`zinc.5`, `gray.3`)

### Phase 3: Multi-Element Tracking

- Track multiple element selections in one session
- Aggregate diff across selections
- Batch edit preview

### Phase 4: Impact Analysis

- **Browser side**: Detect style origin + count on-screen elements sharing the same style
- **Claude side**: Grep-based codebase-wide count of affected components
- Present combined impact before confirming changes

### Explicitly Deferred

- **Drag-and-drop reordering**: Complex (static JSX vs `.map()` vs CSS order), low ROI for MVP
- **Full property editor panel**: Browser should specify, not edit
- **WebSocket/real-time communication**: Simple polling-free signal (Done + Enter) is sufficient
- **Production deployment**: Dev-mode only, CSP prevents injection in production
- **Chrome DevTools MCP for Figma**: The official plugin covers read-side needs. Chrome DevTools MCP (bidirectional Figma access) adds complexity — defer unless the official plugin proves insufficient

## Open Questions

1. **Should the generated token files be wired in?** Currently the build pipeline produces outputs nobody consumes. Should the MVP first connect `variables.generated.css` to the app, or continue with Mantine-only?

2. ~~**globals.css rationalization**~~ **Resolved (Fix 2)**: The 3 naming mismatches are fixed — both CSS and Tailwind transforms now strip `-default` suffixes. See "Fix 2 Implementation" section below.

3. **testid coverage threshold**: How many testids are needed before the visual toolbar is useful? The current 122 cover hierarchy-viewer well but leave most of the app at low-confidence source resolution.

4. ~~**Scope of MVP**~~ **Resolved**: Phase 1 targets spacing + radius only, Mantine props first. Tailwind and CSS Module targets are included in the translation table but Mantine is the primary path (~80% of styling).

5. **Toolbar injection mechanism**: Should the toolbar be part of `visual-inspect.js` or a separate file? The inspector is 277 lines; adding ~300 lines for the toolbar may warrant separation. The `/visual` slash command orchestrates both.

6. **Color normalization strategy**: Computed styles return `rgb()`, tokens may be hex. Need a lightweight conversion utility (~10 lines) for Phase 2 color matching.

7. **Phase 0 implementation order**: Should the session loop and element type classifier be built first (zero browser changes, immediate value), or should Phase 0 and Phase 1 be developed in parallel?

8. ~~**Figma MCP enablement timing**~~ **Resolved**: Plugin enabled in project settings (`figma@claude-plugins-official: true`). Available for creation/exploration alongside `/visual` for refinement.

## Fix 2 Implementation — CSS Variable `-default` Suffix Stripping

**Problem**: The W3C DTCG token `semantic.background.default` was generating CSS variable `--background-default` in both the CSS and Tailwind transforms, but `globals.css` and `tailwind.config.ts` expect `--background` (without `-default`).

### Root Cause

In W3C DTCG format, `default` is the conventional name for the base variant in a group:

```json
{
  "semantic": {
    "background": {
      "default": { "$value": "#FFFFFF" },
      "subtle": { "$value": "#FAFAFA" },
      "muted": { "$value": "#F4F4F5" }
    }
  }
}
```

The Style Dictionary transforms naively joined all path segments: `semantic.background.default` → `--background-default`. But `default` is a structural marker in DTCG, not a meaningful suffix — the base variant should be `--background`, not `--background-default`.

### Fix Applied

**1. CSS Variables Transform** (`design-tokens/transforms/css-variables.ts`)

```typescript
// Before (line 22-29):
const varName = token.path.slice(1).join('-');

// After:
const segments = token.path.slice(1);
const lastSegment = segments[segments.length - 1];
const varName =
  lastSegment === 'default'
    ? segments.slice(0, -1).join('-')
    : segments.join('-');
```

Tests: `design-tokens/__tests__/css-variables.test.ts` (5 tests)

**2. Tailwind Transform** (`design-tokens/transforms/tailwind.ts`)

Two bugs fixed:

- **Key naming**: `'default'` → `DEFAULT` (Tailwind's convention for base variants)
- **Variable reference**: `var(--background-default)` → `var(--background)`

```typescript
// After:
const segments = token.path.slice(2);
const lastSegment = segments[segments.length - 1];
const isDefault = lastSegment === 'default';
const key = isDefault ? 'DEFAULT' : segments.join('-');
const varName = isDefault
  ? token.path.slice(1, -1).join('-')
  : token.path.slice(1).join('-');
semanticColors[group][key] = `var(--${varName})`;
```

Tests: `design-tokens/__tests__/tailwind.test.ts` (6 tests)

### Verification

All 72 design-token tests pass (4 test files):

- `css-variables.test.ts` — 5 tests
- `tailwind.test.ts` — 6 tests
- `lint-tokens.test.ts` — 30 tests
- `eslint-plugin-design-tokens.test.ts` — 31 tests

### Remaining Work to Wire Token Pipeline

Fix 2 aligns the generated output with existing conventions. The generated files are still NOT imported. The wiring sequence is:

1. **`theme.ts`** — import colors/spacing/radius from `theme.generated.ts`, rename `zinc` → `gray`
2. **`globals.css`** — import from `variables.generated.css` (or replace globals.css entirely with the generated file)
3. **`tailwind.config.ts`** — import from `tailwind.tokens.ts`

Each step can be done independently with its own test verification.

## Code References

- `scripts/visual-inspect.js` — Current inspector (277 lines), foundation for toolbar + element classifier
- `scripts/__tests__/visual-inspect.test.ts` — Inspector tests (230 lines, 10 tests)
- `.claude/commands/visual.md` — Slash command orchestration (104 lines), evolving to session loop
- `app/theme.ts` — Mantine theme config, color palettes (lines 12-88), spacing/radius (lines 137-152), defaultProps (lines 170+)
- `design-tokens/tokens.json` — W3C DTCG source of truth (745 lines)
- `design-tokens/transforms/css-variables.ts` — CSS variable output transform (Fix 2 applied)
- `design-tokens/transforms/tailwind.ts` — Tailwind theme extension transform (Fix 2 applied)
- `app/globals.css` — Hand-maintained CSS variables (46 lines)
- `middleware.ts:49` — CSP nonce generation, demo route exclusion
- `.claude/settings.json:69` — `figma@claude-plugins-official: false` (boolean flip to enable)
- `.mcp.json` — MCP server config (zen + linear-server only, no Figma entries)
- `figma-plugin/server.ts` — Custom WebSocket token sync (298 lines, Code → Figma direction)

## Related Research

- `thoughts/shared/plans/2026-02-17-pipeline-cleanup-visual-editing-prep.md` — Figma capture pipeline cleanup plan

## External References

- [Chrome DevTools MCP for Figma](https://cianfrani.dev/posts/a-better-figma-mcp/) — Blog post on using `chrome-devtools-mcp` to drive Figma via Plugin API
- [Figma MCP design workflow](https://www.linkedin.com/posts/samuel-frischknecht-74a452161_figmamcp-claudecode-aidesign-ugcPost-7429293311682732032-KoDP) — LinkedIn post demonstrating full screen design via Claude + Figma MCP
