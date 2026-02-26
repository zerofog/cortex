# Visual Editing — Session Loop & Token-Aware Toolbar Implementation Plan

## Overview

Implement the visual editing workflow for the `/visual` command in two phases:
- **Phase 0**: Persistent session protocol with Point+Prompt pattern (zero browser changes)
- **Phase 1**: Token-aware toolbar with segmented buttons for spacing and radius (new browser-injected code)

This plan transforms the current linear 8-step `/visual` workflow into a persistent editing session, then adds browser-side controls for design-token-constrained style changes.

**Research basis**: `thoughts/shared/research/2026-02-18-visual-editor-panel-feasibility.md`

## Current State Analysis

### What Exists

1. **Visual Inspector** (`scripts/visual-inspect.js`, 278 lines)
   - Source resolution via `resolveSource()` — 3 strategies (data-testid, React fiber chain, DOM heuristic)
   - Browser IIFE with hover overlay (blue), Alt+Click selection (green), Escape deactivation
   - Selection data written to `window.__ZEROFOG_SELECTED__` with component chain, computed styles, bounds
   - 10 tests in `scripts/__tests__/visual-inspect.test.ts`
   - Supports multiple selections via incrementing `selectionId`

2. **Slash Command** (`.claude/commands/visual.md`, 104 lines)
   - Linear 8-step workflow: navigate -> inject -> screenshot -> select -> read -> find source -> edit -> verify
   - **No session protocol** — terminates after step 8
   - No intent routing — all changes handled as free-form text

3. **Styling System** (confirmed ratios)
   - Mantine props: ~80% (dominant pattern, 178 files, ~4265 occurrences)
   - Tailwind className: ~17% (59 files, 281 occurrences)
   - CSS Modules: ~3% (3 files, ~30 occurrences)

4. **Theme Configuration** (`app/theme.ts`, 297 lines)
   - Spacing: xs=8px, sm=12px, md=16px, lg=20px, xl=24px (stored as rem via `rem()` utility)
   - Radius: xs=4px, sm=6px, md=8px, lg=12px, xl=16px (default: sm)
   - Font sizes: xs=12px, sm=14px, md=16px, lg=18px, xl=20px
   - Font weights used: 400, 500, 600, 700
   - 19 components with defaultProps (Button radius=sm, Card radius=md/padding=lg, Modal radius=lg)
   - Color palettes: zinc (primary gray), slate, red, green, yellow, blue

5. **CSP** (`app/lib/middleware/security-headers.ts:26-28`)
   - Dev: `script-src 'self' 'unsafe-eval' 'nonce-${nonce}'` — injection works
   - Prod: `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:` — injection blocked (intentional)

### Key Discoveries

- **Window globals use `__ZEROFOG_*` prefix** (not `__NAROKAN_*` as in the research doc — repo renamed)
- **No `fz=` prop usage** in the codebase — `size=` on Text is used instead
- **Numeric pixel values** are used for fine-grained gap/margin: `gap={0}`, `gap={2}`, `gap={4}`, `mt={4}`
- **Mixed Mantine+Tailwind** is rare and follows clear patterns: Mantine for tokens, Tailwind for positioning/interaction
- **`radius="full"`** (9999px) is used on the login button — need to include this in toolbar
- **Mantine CSS variables are in rem** — `--mantine-spacing-md` resolves to `"1rem"`, not `"16px"`. `getComputedStyle(element).padding` returns px. Token reverse-lookup must normalize units.
- **Mantine component props live on `_debugOwner` fiber**, not the DOM element's direct fiber. The DOM element fiber is a host element (`div`, `button`) whose `memoizedProps` has `className`/`style`, not Mantine token props like `p` or `radius`.

## Desired End State

### After Phase 0 (Session Protocol)
- `/visual` launches a persistent session protocol that Claude follows across conversation turns
- Element type classification enriches selection data (icon, layout, text, interactive, container)
- Claude routes user intent based on selection + terminal input (Point+Prompt)
- Inspector dispatches `CustomEvent('zerofog:selected')` after each selection for toolbar integration
- All 5 tiers of the design task taxonomy work: visual-only (placeholder for Phase 1), point+name, point+phrase, point+describe, conversation-only

### After Phase 1 (Token Toolbar)
- Alt+Click on any element shows a floating token toolbar with segmented buttons
- Toolbar shows: Spacing (p, m, gap), Radius, with token scales (xs/sm/md/lg/xl)
- Current value is highlighted in the toolbar (or "custom" indicator for non-token values), live preview on hover/click
- Style origin detection: Mantine prop (via `_debugOwner` chain) vs theme defaultProps (via lookup table) vs Tailwind vs CSS Module
- `[Done]` button finalizes changes to `window.__ZEROFOG_STYLE_DIFF__`
- User presses Enter in terminal, Claude reads diff and edits source code

### Verification

1. **Phase 0**: Invoke `/visual`, navigate to a page, Alt+Click a button, type "change to IconShield" — Claude identifies the icon component and offers the edit. Type "done" to exit session.
2. **Phase 1**: Invoke `/visual`, navigate to a page, Alt+Click a Card component — toolbar appears with current padding=lg and radius=md highlighted. Click xl for padding — live preview shows larger padding. Click Done, press Enter — Claude edits the Card's `p` prop from `"lg"` to `"xl"`.

## What We're NOT Doing

- Drag-and-drop reordering (complex, low ROI)
- Full property editor panel (browser is specification tool, not editor)
- WebSocket/polling communication (Done+Enter is sufficient)
- Production deployment (dev-only, CSP enforces this)
- Color toolbar (Phase 2, separate plan)
- Font size/weight toolbar (Phase 2, separate plan)
- Multi-element tracking (Phase 3, separate plan)
- Wiring the disconnected token pipeline (separate effort)

## Implementation Approach

**TDD throughout**: Every phase starts with failing tests, then minimal implementation.

**File strategy**:
- Phase 0 modifies `scripts/visual-inspect.js` (add element classifier ~20 lines, CustomEvent dispatch, exports) and `.claude/commands/visual.md` (session protocol)
- Phase 1 creates `scripts/visual-toolbar.js` (new file, ~350 lines) — separate from inspector to keep concerns clean and file sizes manageable

**Browser code style**: `visual-toolbar.js` uses modern JavaScript (ES6+ — `const`/`let`, arrow functions, template literals). Playwright targets modern Chromium with full ES2020+ support, so there is no compatibility concern. `visual-inspect.js` retains its existing ES5 style; the two scripts coexist independently.

**Inter-script communication**: Inspector dispatches `CustomEvent('zerofog:selected')` on `document`. Toolbar listens for it. No polling, no shared mutable state watching, no `Object.defineProperty` tricks.

## Workflow Diagram

### Session Protocol (Claude-side)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        /visual INVOCATION                          │
│                                                                     │
│  1. Navigate browser to localhost:3000/<path>                      │
│  2. Inject scripts/visual-inspect.js (hover + Alt+Click)           │
│  3. Inject scripts/visual-toolbar.js  (token buttons)              │
│  4. Inject theme defaults from theme.ts → __ZEROFOG__.themeDefaults│
│  5. Screenshot → show to user                                       │
│  6. "Inspector active. Alt+Click to select, tell me what to change"│
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SESSION LOOP (per user message)                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  User types "done" or "exit"? ──────── YES ──→ END SESSION  │   │
│  └────────────────┬─────────────────────────────────────────────┘   │
│                   │ NO                                               │
│                   ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  a. READ __ZEROFOG__.selected + __ZEROFOG__.styleDiff       │   │
│  │     Then RESET both to null (prevent stale data)             │   │
│  └────────────────┬─────────────────────────────────────────────┘   │
│                   │                                                  │
│                   ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  b. ROUTE INTENT — What happened?                            │   │
│  │                                                              │   │
│  │     ┌─────────────────────┐                                  │   │
│  │     │ Toolbar diff exists │──→ TOKEN CHANGE HANDLER          │   │
│  │     │ (user clicked Done) │    Read styleOrigin:              │   │
│  │     └─────────────────────┘    • mantine-prop → edit prop    │   │
│  │              │ no              • mantine-default → ask scope  │   │
│  │              ▼                 • tailwind → edit className    │   │
│  │     ┌─────────────────────┐    • css-module → edit .module   │   │
│  │     │ Selection exists +  │                                  │   │
│  │     │ user typed message  │──→ POINT+PROMPT HANDLER          │   │
│  │     └─────────────────────┘    Route by elementType:         │   │
│  │              │ no              • icon + name → swap component│   │
│  │              ▼                 • text + "..." → text change  │   │
│  │     ┌─────────────────────┐    • "hide"/"remove" → toggle   │   │
│  │     │ No selection, just  │    • anything else → freeform    │   │
│  │     │ user typed message  │──→ PAGE-LEVEL INSTRUCTION        │   │
│  │     └─────────────────────┘                                  │   │
│  └────────────────┬─────────────────────────────────────────────┘   │
│                   │                                                  │
│                   ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  c. FIND SOURCE — Locate the file to edit                    │   │
│  │     Priority: data-testid (high) → component name (med)     │   │
│  │              → className/text (low)                          │   │
│  │     If in a list: ask "all instances or just this one?"      │   │
│  └────────────────┬─────────────────────────────────────────────┘   │
│                   │                                                  │
│                   ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  d. CONFIRM with user (show matched file)                    │   │
│  │  e. EDIT source code                                         │   │
│  │  f. VERIFY — check both scripts survived HMR                 │   │
│  │     Re-inject if __ZEROFOG__.inspectorActive = false         │   │
│  │     Re-inject if __ZEROFOG__.toolbarActive   = false         │   │
│  │     (re-inject toolbar calls destroy() first to prevent leak)│   │
│  │     Re-inject theme defaults if toolbar was re-injected      │   │
│  │     Screenshot → show result                                 │   │
│  └────────────────┬─────────────────────────────────────────────┘   │
│                   │                                                  │
│                   └──→ WAIT for next user message (loop back) ──┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Browser Side (two injected scripts)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BROWSER SIDE (two scripts)                        │
│                                                                     │
│  Shared namespace: window.__ZEROFOG__ = {}                          │
│  Shared UI contract: data-zerofog-ui="true" on all injected DOM     │
│                                                                     │
│  ┌─────────────────────┐     CustomEvent        ┌────────────────┐ │
│  │  visual-inspect.js  │ ──────────────────────→ │ visual-toolbar │ │
│  │                     │  'zerofog:selected'     │     .js        │ │
│  │  • Hover highlight  │  'zerofog:deselected'   │                │ │
│  │  • Alt+Click select │                         │ • Token buttons│ │
│  │  • classifyElement  │                         │ • Live preview │ │
│  │  • componentChain   │                         │ • Style origin │ │
│  │  • Escape to clear  │                         │ • Diff output  │ │
│  │  • Ignores elements │                         │ • destroy()    │ │
│  │    with zerofog-ui  │                         │   lifecycle    │ │
│  └─────────────────────┘                         └────────────────┘ │
│                                                                     │
│  Data Flow:                                                         │
│  Alt+Click → resolveSource() → classifyElement(chain, tag)          │
│           → __ZEROFOG__.selected = { ..., elementType }             │
│           → CustomEvent('zerofog:selected', { detail: selection })   │
│                    │                                                 │
│                    ▼                                                 │
│  Toolbar: revert previous preview → show new toolbar                │
│         → user clicks token → live preview (longhand CSS props)     │
│         → [Done] → __ZEROFOG__.styleDiff = { ... }                  │
│         → "Press Enter in terminal"                                  │
│         → [X] → revertPreview() (restores full style attribute)     │
│                    │                                                 │
│                    ▼                                                 │
│  Claude reads diff on next message → edits source → HMR refreshes  │
└─────────────────────────────────────────────────────────────────────┘
```

### Token Toolbar UI (user-facing)

```
┌─────────────────────────────────────────────────────────────────────┐
│              TOKEN TOOLBAR — What the user sees                     │
│              (all DOM has data-zerofog-ui="true")                   │
│                                                                     │
│  Alt+Click a Card component:                                        │
│                                                                     │
│  ┌─ Token Toolbar ────────────────────── [X] ──┐                   │
│  │                                               │                  │
│  │ Padding     origin: mantine-prop (padding=lg) │                  │
│  │ [xs] [sm] [md] [●lg] [xl]                    │                  │
│  │                                               │                  │
│  │ Radius      origin: mantine-default           │                  │
│  │ [none] [xs] [sm] [●md] [lg] [xl] [full]      │                  │
│  │                                               │                  │
│  │           [ Done ]                            │                  │
│  └───────────────────────────────────────────────┘                  │
│                                                                     │
│  Click xl for padding → live preview shows larger padding           │
│  Click Done → diff written → "Press Enter in terminal"              │
│  User presses Enter → Claude reads diff → edits <Card padding="xl">│
│  Re-select another element → previous preview auto-reverted         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Session Protocol + Point-and-Prompt

### Overview

Transform the linear `/visual` workflow into a persistent session protocol. Add element type classification to enrich selection data. Dispatch a `CustomEvent` after each selection for toolbar integration (Phase 1). Export shared utilities for toolbar script reuse.

### Changes Required

#### 0.1 Element Type Classifier — Add to `visual-inspect.js`

**File**: `scripts/visual-inspect.js`
**Changes**: Add `classifyElement(componentChain, tagName)` function (~20 lines). This is a pure function that operates on pre-computed data from `resolveSource`, not raw fibers.

The classifier enriches selection data by categorizing the selected element:

```javascript
// Element type classification for intent routing
// Operates on pre-computed componentChain from resolveSource (no fiber access needed)
function classifyElement(componentChain, tagName) {
  // Classification rules against component names (order matters — first match wins)
  for (var i = 0; i < componentChain.length; i++) {
    var compName = componentChain[i];
    if (/^Icon[A-Z]/.test(compName)) return 'icon';
    if (['AppShell', 'Navbar', 'Header', 'Footer', 'Aside'].indexOf(compName) !== -1) return 'layout';
    if (['Text', 'Title', 'Heading'].indexOf(compName) !== -1) return 'text';
    if (['Button', 'ActionIcon', 'Menu', 'MenuItem', 'UnstyledButton', 'Tabs.Tab', 'NavLink'].indexOf(compName) !== -1) return 'interactive';
    if (['Card', 'Paper', 'Box', 'Group', 'Stack', 'Flex', 'Grid', 'Container', 'SimpleGrid'].indexOf(compName) !== -1) return 'container';
    if (['Badge', 'Alert', 'Notification', 'Skeleton', 'Loader'].indexOf(compName) !== -1) return 'feedback';
    if (['TextInput', 'Select', 'Textarea', 'NumberInput', 'PasswordInput', 'MultiSelect', 'Checkbox', 'Switch', 'Radio'].indexOf(compName) !== -1) return 'input';
  }

  // Fallback: check the element's own tag
  var tag = (tagName || '').toLowerCase();
  if (tag === 'svg' || tag === 'path') return 'icon';
  if (['h1','h2','h3','h4','h5','h6','p','span','label'].indexOf(tag) !== -1) return 'text';
  if (['button','a'].indexOf(tag) !== -1) return 'interactive';
  if (['input','textarea','select'].indexOf(tag) !== -1) return 'input';
  if (['nav','header','footer','aside','main'].indexOf(tag) !== -1) return 'layout';

  return 'unknown';
}
```

Initialize the consolidated namespace at the top of the IIFE:

```javascript
// Initialize namespace (idempotent — safe for re-injection)
window.__ZEROFOG__ = window.__ZEROFOG__ || {};
```

Then update the `handleClick` function to include classification in the namespace:

```javascript
// Inside handleClick, after resolveSource call (info already has componentChain):
var elementType = classifyElement(info.componentChain || [], target.tagName);

// Add to the selection object (using consolidated namespace):
window.__ZEROFOG__.selected = {
  // ... existing fields ...
  elementType: elementType,  // NEW: 'icon'|'layout'|'text'|'interactive'|'container'|'feedback'|'input'|'unknown'
};

// Dispatch CustomEvent for toolbar integration (Phase 1)
document.dispatchEvent(new CustomEvent('zerofog:selected', { detail: window.__ZEROFOG__.selected }));
```

Update the module exports to include all shared utilities:

```javascript
module.exports = {
  resolveSource: resolveSource,
  getComponentName: getComponentName,
  findReactFiberKeys: findReactFiberKeys,
  classifyElement: classifyElement
};
```

Also dispatch a deselection event when Escape is pressed:

```javascript
// Inside the Escape key handler, after clearing selection:
document.dispatchEvent(new CustomEvent('zerofog:deselected'));
```

#### 0.2 Element Classifier Tests

**File**: `scripts/__tests__/visual-inspect.test.ts`
**Changes**: Add test suite for `classifyElement` (~80 lines)

Since `classifyElement` is now a pure function accepting `(componentChain, tagName)`, tests are simple — no fiber mocking needed:

Test cases:
1. Icon component — `classifyElement(['IconSettings'], 'svg')` returns `'icon'`
2. Layout component — `classifyElement(['AppShell'], 'div')` returns `'layout'`
3. Text component — `classifyElement(['Text'], 'span')` returns `'text'`
4. Interactive component — `classifyElement(['Button'], 'button')` returns `'interactive'`
5. Container component — `classifyElement(['Card'], 'div')` returns `'container'`
6. Input component — `classifyElement(['TextInput'], 'input')` returns `'input'`
7. Feedback component — `classifyElement(['Badge'], 'span')` returns `'feedback'`
8. SVG element without components — `classifyElement([], 'svg')` returns `'icon'` (tag fallback)
9. HTML `<button>` without components — `classifyElement([], 'button')` returns `'interactive'` (tag fallback)
10. Parent component classification — `classifyElement(['UnknownWrapper', 'Button'], 'div')` returns `'interactive'` (found at depth 1)
11. Unknown element — `classifyElement([], 'div')` returns `'unknown'`
12. Tabs.Tab interactive — `classifyElement(['Tabs.Tab'], 'button')` returns `'interactive'`
13. Skeleton feedback — `classifyElement(['Skeleton'], 'div')` returns `'feedback'`

#### 0.3 Session Protocol — Update Slash Command

**File**: `.claude/commands/visual.md`
**Changes**: Rewrite the workflow section as a session protocol (not a program loop)

**Key framing change**: A slash command is a prompt that establishes behavioral rules for Claude across conversation turns. It is NOT a program with loops or blocking waits. The "session" is the conversation itself — each user message triggers Claude to follow the protocol.

The new workflow:

```markdown
## Workflow

### 1. On Invocation — Initialize Session

Navigate to the target page and inject scripts:

browser_navigate -> http://localhost:3000/<path>
browser_evaluate -> read and execute scripts/visual-inspect.js
browser_evaluate -> read and execute scripts/visual-toolbar.js  (Phase 1)
browser_evaluate -> inject theme defaults (Phase 1):
  Read app/theme.ts, extract defaultProps for spacing/radius properties,
  serialize as JSON, and set: window.__ZEROFOG__.themeDefaults = <JSON>
browser_take_screenshot

Show the user the current state. Tell them:
"Inspector active. Alt+Click any element to select it, then tell me what to change.
Type 'done' or 'exit' to end the session."

### 2. On Each User Message — Session Turn Protocol

For each subsequent user message, follow these steps. Continue until the user says "done" or "exit".

  a. READ and RESET browser state (read first, then immediately clear to prevent stale data):
     browser_evaluate -> (function() {
       var zf = window.__ZEROFOG__ || {};
       var sel = JSON.stringify(zf.selected);
       var diff = JSON.stringify(zf.styleDiff || null);
       zf.selected = null;
       zf.styleDiff = null;
       return JSON.stringify({ selection: sel, styleDiff: diff });
     })()

  b. ROUTE intent based on context:

     IF styleDiff exists (token toolbar was used):
       -> Token change handler: read diff, determine edit target
          (Mantine prop vs Tailwind class vs theme.ts default)

     ELSE IF selection exists AND user input matches known patterns:
       -> Classify by elementType + input keywords:
          - elementType='icon' + name -> Component swap
          - elementType='layout' + direction word -> Layout change
          - elementType='text' + quoted string -> Text change
          - "hide"/"show"/"remove" keyword -> Visibility change
          - Any other input -> Freeform edit (Claude interprets)

     ELSE IF no selection (user typed without Alt+Clicking):
       -> Page-level instruction (no element target)

  c. FIND source file using selection data:
     High confidence: Grep for data-testid="<testId>" in app/
     Medium confidence: Grep for component name in app/
     Low confidence: Grep for className/text in app/

     If component appears in a list (multiple instances), ask the user:
     "This component is rendered in a list — should I modify all instances
     or add a data-testid to target just this one?"

  d. CONFIRM with user before editing (show matched files)

  e. EDIT source code

  f. VERIFY after HMR:
     browser_evaluate -> JSON.stringify({
       inspector: (window.__ZEROFOG__ || {}).inspectorActive,
       toolbar: (window.__ZEROFOG__ || {}).toolbarActive
     })
     If inspector is false: re-inject scripts/visual-inspect.js
     If toolbar is false: re-inject scripts/visual-toolbar.js + theme defaults
     browser_take_screenshot
     Show result to user
```

### Success Criteria

#### Automated Verification:
- [x] All existing inspector tests still pass: `CI=true npx vitest run scripts/__tests__/visual-inspect.test.ts`
- [x] New classifier tests pass (13 test cases)
- [x] TypeScript type checking passes: `npx tsc --noEmit --skipLibCheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] `/visual` command launches session protocol
- [ ] Alt+Click an element -> selection data includes `elementType` field
- [ ] Type "change to IconShield" after selecting an icon -> Claude identifies the component and offers the edit
- [ ] Type "done" -> session ends
- [ ] Inspector survives HMR after an edit (re-injection works if needed)
- [ ] Multiple selections in one session work correctly
- [ ] `CustomEvent('zerofog:selected')` fires after each Alt+Click (verify via browser console)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 1.

---

## Phase 1: Token-Aware Toolbar

### Overview

Add browser-side token toolbar with segmented buttons for spacing and radius. The toolbar appears after Alt+Click (via `CustomEvent` listener), shows the selected element's current token values, and allows changing them with live preview. On "Done", writes a structured diff for Claude to read and translate to source code edits.

### Changes Required

#### 1.1 Token Toolbar Script

**File**: `scripts/visual-toolbar.js` (NEW — separate from inspector)
**Size estimate**: ~350 lines

The toolbar is a separate injectable script that listens for the inspector's `CustomEvent('zerofog:selected')`.

**Architecture**:

```
visual-inspect.js (inspector)
  |
  +-- Alt+Click -> window.__ZEROFOG__.selected
  +-- document.dispatchEvent(new CustomEvent('zerofog:selected'))
  +-- Ignores elements with data-zerofog-ui="true" (toolbar DOM)
                    |
                    v
visual-toolbar.js (toolbar)
  |
  +-- document.addEventListener('zerofog:selected', ...)
  +-- Reverts previous preview before showing new toolbar
  +-- Shows toolbar UI near selected element (all DOM has data-zerofog-ui="true")
  +-- Token segmented buttons (spacing, radius)
  +-- Live preview via element.style (with full style attribute snapshot for revert)
  +-- [Done] -> writes window.__ZEROFOG__.styleDiff
  +-- destroy() stored as window.__ZEROFOG__.destroyToolbar for idempotent re-injection
```

**Key sections**:

1. **Token scale definitions** (~40 lines): Sentinel element approach to resolve CSS variables to px
2. **Style origin detection** (~50 lines): Walk `_debugOwner` chain to find Mantine component fiber, with theme default lookup table
3. **Toolbar DOM creation** (~80 lines): Build the floating toolbar with segmented buttons. All toolbar DOM elements must have `data-zerofog-ui="true"` attribute (see UI ignore contract below).
4. **Live preview** (~40 lines): Snapshot style attribute, apply changes, restore on cancel
5. **Diff finalization** (~40 lines): Write structured diff to `window.__ZEROFOG__.styleDiff`
6. **Selection event listener** (~20 lines): Listen for `zerofog:selected` / `zerofog:deselected` CustomEvents. On new selection, **revert previous preview** before showing new toolbar.
7. **Toolbar positioning** (~25 lines): Position below selected element, fall back to above, pin to edge
8. **Idempotent lifecycle** (~15 lines): `destroy()` function removes all event listeners + DOM, stored as `window.__ZEROFOG__.destroyToolbar`. Called before re-injection to prevent leaks.

**UI ignore contract** — Both scripts share a `data-zerofog-ui="true"` attribute on all injected DOM. The inspector must early-return when the hover/click target is part of the UI:

```javascript
// In visual-inspect.js handleHover/handleClick, add at the top:
if (target.closest('[data-zerofog-ui="true"]')) return;
```

This prevents the inspector from highlighting or selecting toolbar buttons, preventing confusing flicker and mis-selection.

**Token scales to include**:

| Property Category | Mantine Props | Computed Style (longhand) | CSS Variable Pattern |
|---|---|---|---|
| Padding (padding, p, px, py, pt, pb, pl, pr) | `padding`, `p`, `px`, `py`, `pt`, `pb`, `pl`, `pr` | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | `--mantine-spacing-{size}` |
| Margin (margin, m, mx, my, mt, mb, ml, mr) | `margin`, `m`, `mx`, `my`, `mt`, `mb`, `ml`, `mr` | `marginTop`, `marginRight`, `marginBottom`, `marginLeft` | `--mantine-spacing-{size}` |
| Gap | `gap` | `rowGap`, `columnGap` | `--mantine-spacing-{size}` |
| Border Radius | `radius` | `borderTopLeftRadius`, `borderTopRightRadius`, `borderBottomLeftRadius`, `borderBottomRightRadius` | `--mantine-radius-{size}` + sentinel for `full` |

**NOTE**: Always read longhand computed properties, never shorthands. `getComputedStyle(el).padding` returns `"16px 20px 16px 20px"` which won't match token lookups.

**Token value reading at runtime — Sentinel Element Approach**:

CSS variables are stored in rem (`--mantine-spacing-md: 1rem`) but `getComputedStyle(element).paddingTop` returns px (`16px`). Direct string comparison would never match. The sentinel approach resolves both to the same px unit.

**IMPORTANT**: Always read **longhand** computed properties (`paddingTop`, `marginLeft`, `borderTopLeftRadius`), never shorthands (`padding`, `margin`, `borderRadius`). Shorthand accessors return multi-value strings like `"16px 20px 16px 20px"` which won't match single-value token lookups.

```javascript
// Build reverse map: resolved px value -> token name
// Uses sentinel element to let the browser resolve rem/calc/scale to px
function buildTokenMaps(styleGetter) {
  var _getStyle = styleGetter || function(el) { return getComputedStyle(el); };
  var spacingMap = {};
  var radiusMap = {};
  var sizes = ['xs', 'sm', 'md', 'lg', 'xl'];

  // Create hidden sentinel element for CSS variable resolution
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
  document.body.appendChild(sentinel);

  for (var i = 0; i < sizes.length; i++) {
    var s = sizes[i];

    // Resolve spacing: apply CSS variable as padding, read back resolved px
    sentinel.style.padding = 'var(--mantine-spacing-' + s + ')';
    var spacingPx = _getStyle(sentinel).paddingTop;
    if (spacingPx && spacingPx !== '0px') spacingMap[spacingPx] = s;

    // Resolve radius: apply CSS variable as border-radius, read back resolved px
    sentinel.style.borderRadius = 'var(--mantine-radius-' + s + ')';
    var radiusPx = _getStyle(sentinel).borderTopLeftRadius;
    if (radiusPx && radiusPx !== '0px') radiusMap[radiusPx] = s;
  }

  document.body.removeChild(sentinel);

  // Special radius values
  radiusMap['0px'] = 'none';
  // radius="full" resolves to a very large value; match anything > 1000px
  // (browser may clamp 9999px differently depending on element size)
  spacingMap.__isSentinelResolved = true; // marker for tests
  radiusMap.__isSentinelResolved = true;

  return { spacing: spacingMap, radius: radiusMap };
}

// Reverse lookup: given a computed px value, find the token name
function reverseTokenLookup(maps, category, pxValue) {
  var map = category === 'radius' ? maps.radius : maps.spacing;
  if (map[pxValue]) return map[pxValue];
  // For radius="full", check if value is very large
  if (category === 'radius') {
    var num = parseFloat(pxValue);
    if (num > 1000) return 'full';
  }
  return null; // Non-token value (e.g., gap={4} = "4px")
}
```

**Style origin detection — walks `_debugOwner` chain**:

The DOM element's fiber is a host element (`div`/`button`) whose `memoizedProps` has `className`/`style` — NOT Mantine token props. The actual Mantine props (`p`, `radius`, `gap`) live on the component fiber accessible via `_debugOwner`. This function walks that chain.

```javascript
// THEME_DEFAULTS is dynamically injected at session start — NOT hardcoded.
// The /visual command reads app/theme.ts, extracts defaultProps for spacing/radius,
// and passes them to the toolbar script via browser_evaluate:
//
//   browser_evaluate -> (function() {
//     window.__ZEROFOG__.themeDefaults = <parsed JSON from theme.ts>;
//   })()
//
// This prevents the map from going stale when theme.ts is edited.
// Fallback: if themeDefaults is not set (e.g., injection failed), treat all
// values as 'unknown' origin (safe — just won't show "change all?" prompt).
// Guard for Node.js test environment (window is undefined in vitest)
const THEME_DEFAULTS = (typeof window !== 'undefined' && window.__ZEROFOG__?.themeDefaults) || {};

// Expected shape after injection (derived from app/theme.ts defaultProps):
// {
//   'Button': { radius: 'sm' },
//   'Card': { radius: 'md', padding: 'lg' },
//   'Paper': { radius: 'md' },
//   'Modal': { radius: 'lg' },
//   'Badge': { radius: 'sm' },
//   'Dialog': { radius: 'md' },
//   'TextInput': { radius: 'sm' },
//   ... (all form inputs with radius: 'sm')
// }

// Determine where the current style value comes from
// Walks _debugOwner chain to find the Mantine component fiber
function detectStyleOrigin(element, property, findFiberKeysFn) {
  var _findKeys = findFiberKeysFn || findReactFiberKeys;
  var fiberKeys = _findKeys(element);

  if (fiberKeys.length > 0) {
    var domFiber = element[fiberKeys[0]];

    // Walk _debugOwner to find the Mantine component fiber
    var owner = domFiber ? domFiber._debugOwner : null;
    var depth = 0;
    var MAX_DEPTH = 20; // Match resolveSource depth

    while (owner && depth < MAX_DEPTH) {
      var compName = '';
      if (owner.type) {
        compName = owner.type.displayName || owner.type.name || '';
      }

      if (compName && owner.memoizedProps) {
        // Check 1: Explicit Mantine prop on this component
        // NOTE: 'padding' (long form) is included alongside 'p' (shorthand)
        // because Mantine components like Card use `padding` in defaultProps,
        // not `p`. Both are valid Mantine props. Same for 'margin'.
        var propMap = {
          'padding': ['padding', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr'],
          'margin': ['margin', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr'],
          'gap': ['gap'],
          'border-radius': ['radius']
        };
        var candidates = propMap[property] || [];
        for (var i = 0; i < candidates.length; i++) {
          if (owner.memoizedProps[candidates[i]] !== undefined) {
            // Snapshot the prop value at detection time (protect against re-renders)
            return {
              origin: 'mantine-prop',
              prop: candidates[i],
              value: owner.memoizedProps[candidates[i]],
              component: compName
            };
          }
        }

        // Check 2: Theme defaultProps — only if this component+property pair exists in THEME_DEFAULTS
        var defaults = THEME_DEFAULTS[compName];
        if (defaults) {
          var defaultPropName = (property === 'border-radius') ? 'radius' : property;
          if (defaults[defaultPropName] !== undefined) {
            return {
              origin: 'mantine-default',
              component: compName,
              defaultValue: defaults[defaultPropName]
            };
          }
        }
      }

      owner = owner._debugOwner;
      depth++;
    }
  }

  // Check 3: Tailwind className
  var classes = element.className || '';
  if (typeof classes === 'string') {
    var twPatterns = {
      'padding': /\bp[xytblr]?-(\S+)/,
      'margin': /\bm[xytblr]?-(\S+)/,
      'gap': /\bgap-(\S+)/,
      'border-radius': /\brounded(?:-(\S+))?/
    };
    if (twPatterns[property] && twPatterns[property].test(classes)) {
      var match = classes.match(twPatterns[property]);
      return { origin: 'tailwind', className: match[0] };
    }
  }

  // Check 4: CSS Module (hashed class — specific pattern to avoid false positives)
  if (typeof classes === 'string') {
    var classTokens = classes.split(/\s+/);
    for (var j = 0; j < classTokens.length; j++) {
      if (/^[a-zA-Z][a-zA-Z0-9-]+_[a-z0-9]{5,8}$/.test(classTokens[j])) {
        return { origin: 'css-module' };
      }
    }
  }

  return { origin: 'unknown' };
}
```

**Toolbar UI** (injected DOM, not React):

```
┌─ Token Toolbar ────────────── [X] ──┐
│                                       │
│ Padding                               │
│ [xs] [sm] [md] [●lg] [xl]           │
│                                       │
│ Margin                                │
│ [xs] [sm] [md] [●lg] [xl]           │
│                                       │
│ Gap                                   │
│ [xs] [sm] [md] [●lg] [xl]           │
│                                       │
│ Radius                                │
│ [none] [xs] [sm] [●md] [lg] [xl]    │
│                                       │
│      [ Done ]  ← Enter in terminal   │
└───────────────────────────────────────┘
```

- Current value highlighted with filled background
- Non-token values (e.g., `gap={4}`) show a `[custom: 4px]` indicator (display-only, no button highlighted)
- Only show categories relevant to the element type:

  | elementType | Categories shown |
  |---|---|
  | icon | No toolbar (icons don't have configurable spacing) |
  | text | margin only |
  | interactive | padding, radius |
  | container | padding, margin, gap, radius |
  | input | radius only |
  | feedback | radius only |
  | layout | gap, padding |
  | unknown | all (let user decide) |

- Hover over a token button = live preview (element.style applied temporarily)
- Click a token button = change persists until Done or Cancel
- [X] = cancel (revert all previewed changes via style attribute snapshot)
- [Done] = finalize diff to `window.__ZEROFOG_STYLE_DIFF__`, show "Press Enter in terminal" hint

**Live preview — style attribute snapshot approach**:

Mantine components use inline CSS custom properties (e.g., `style="--card-padding: var(--mantine-spacing-lg)"`). Naive property-level revert would destroy these. Instead, snapshot the entire `style` attribute:

```javascript
var styleSnapshot = null;

function snapshotStyle(element) {
  styleSnapshot = element.getAttribute('style'); // null if no inline style
}

function applyPreview(element, cssProp, value) {
  if (styleSnapshot === null && !element.getAttribute('style')) {
    styleSnapshot = null; // Explicitly track "had no style"
  } else if (styleSnapshot === null) {
    styleSnapshot = element.getAttribute('style');
  }
  element.style.setProperty(cssProp, value, 'important');
}

function revertPreview(element) {
  if (styleSnapshot === null) {
    element.removeAttribute('style');
  } else {
    element.setAttribute('style', styleSnapshot);
  }
  styleSnapshot = null;
}
```

**Selection event listener**:

```javascript
// Listen for inspector's selection CustomEvent — no polling needed
document.addEventListener('zerofog:selected', function(e) {
  // CRITICAL: revert any preview on the PREVIOUS element before showing new toolbar
  // Otherwise selecting element B while A has preview styles leaves A mutated
  hideToolbar(); // reverts preview + removes DOM (no-op if no toolbar open)

  var selection = e.detail;
  if (selection && selection.elementType !== 'icon') {
    showToolbar(selection);
  }
});

document.addEventListener('zerofog:deselected', function() {
  hideToolbar(); // reverts preview + removes DOM
});
```

**Toolbar positioning**:

```javascript
function positionToolbar(toolbarEl, targetBounds) {
  var MARGIN = 8;
  var toolbarHeight = toolbarEl.offsetHeight;
  var toolbarWidth = toolbarEl.offsetWidth;
  var viewportHeight = window.innerHeight;
  var viewportWidth = window.innerWidth;

  // Prefer below the element
  var top = targetBounds.bottom + MARGIN;

  // Fall back to above if below would go off-screen
  if (top + toolbarHeight > viewportHeight) {
    top = targetBounds.top - toolbarHeight - MARGIN;
  }

  // Pin to viewport edge as last resort
  if (top < 0) top = MARGIN;
  if (top + toolbarHeight > viewportHeight) top = viewportHeight - toolbarHeight - MARGIN;

  // Horizontal: center-align with element, clamp to viewport
  var left = targetBounds.left + (targetBounds.width / 2) - (toolbarWidth / 2);
  if (left < MARGIN) left = MARGIN;
  if (left + toolbarWidth > viewportWidth) left = viewportWidth - toolbarWidth - MARGIN;

  toolbarEl.style.position = 'fixed';
  toolbarEl.style.top = top + 'px';
  toolbarEl.style.left = left + 'px';
  toolbarEl.style.zIndex = '2147483647'; // Max z-index, same as inspector
}

// Dismiss toolbar on scroll (selected element moves, toolbar can't follow cheaply)
window.addEventListener('scroll', function() {
  if (window.__ZEROFOG__?.toolbarActive) {
    hideToolbar(); // hideToolbar() calls revertPreview() before removing DOM
  }
}, { passive: true });
```

**Diff output** (`window.__ZEROFOG_STYLE_DIFF__`):

```javascript
{
  elementSelector: '[data-testid="risk-card"]', // Proper CSS selector, not bare attribute
  componentChain: ['MultiDimensionalRiskCard', 'RiskList'],
  elementType: 'container',
  changes: [
    {
      property: 'padding',           // Category
      token: 'xl',                   // New token name
      previousToken: 'lg',           // Old token name (string | null — null for numeric/custom values)
      previousCssValue: '20px',      // Original computed CSS value (always px)
      cssProperty: 'padding',        // Longhand CSS property
      cssValue: '24px',              // New computed CSS value (always px)
      styleOrigin: {
        origin: 'mantine-prop',
        prop: 'p',
        value: 'lg',
        component: 'Card'
      }
    }
  ],
  timestamp: '2026-02-18T14:30:00.000Z'
}
```

**Consolidated namespace** (`window.__ZEROFOG__`):

All visual editing globals are consolidated under a single namespace object to prevent global pollution:

| Property | Type | Purpose |
|--------|------|---------|
| `window.__ZEROFOG__.selected` | `object \| null` | Selection data from inspector (replaces `__ZEROFOG_SELECTED__`) |
| `window.__ZEROFOG__.styleDiff` | `object \| null` | Finalized style changes from toolbar (replaces `__ZEROFOG_STYLE_DIFF__`) |
| `window.__ZEROFOG__.inspectorActive` | `boolean` | Whether inspector is active (replaces `__ZEROFOG_INSPECTOR_ACTIVE__`) |
| `window.__ZEROFOG__.toolbarActive` | `boolean` | Whether toolbar is visible (replaces `__ZEROFOG_TOOLBAR_ACTIVE__`) |
| `window.__ZEROFOG__.themeDefaults` | `object` | Injected theme defaultProps from `theme.ts` |

**Migration**: Inspector script initializes the namespace on first load: `window.__ZEROFOG__ = window.__ZEROFOG__ || {};`. Both scripts read/write properties on this shared object. The inspector's existing `__ZEROFOG_SELECTED__` and `__ZEROFOG_INSPECTOR_ACTIVE__` are replaced with the namespaced equivalents.

#### 1.2 Token Toolbar Tests

**File**: `scripts/__tests__/visual-toolbar.test.ts` (NEW)
**Size estimate**: ~250 lines

Test cases for the non-browser functions (exported via `module.exports`). Functions that use browser globals (`buildTokenMaps`, `positionToolbar`) accept dependency-injected alternatives for testability.

**Token map building** (pass mock `styleGetter`):
1. `buildTokenMaps` returns correct spacing map — sentinel reads back `20px` for lg, maps to `'lg'`
2. `buildTokenMaps` returns correct radius map including 'none' (0px) and 'full' (>1000px)
3. `buildTokenMaps` handles missing CSS variables gracefully (sentinel returns '0px')
4. `buildTokenMaps` maps are keyed by px strings, not rem strings

**Style origin detection** (pass mock `findFiberKeysFn`):
5. Detects Mantine prop origin when `_debugOwner` fiber has `memoizedProps.p`
6. Detects Mantine prop origin for radius when `_debugOwner` fiber has `memoizedProps.radius`
7. Detects Mantine default origin for Card padding (Card is in THEME_DEFAULTS with padding)
8. Does NOT return mantine-default for Stack gap (Stack is not in THEME_DEFAULTS)
9. Detects Tailwind origin when className contains `p-4`
10. Detects Tailwind origin when className contains `rounded-lg`
11. Detects CSS Module origin when className has hashed pattern like `Card_abc12`
12. Does not false-positive CSS Module on Mantine class like `mantine-Card-root`
13. Returns 'unknown' when no origin detected (plain div, no classes)

**Diff finalization**:
14. `finalizeDiff` produces correct structure with single change
15. `finalizeDiff` produces correct structure with multiple changes
16. `finalizeDiff` uses `[data-testid="..."]` format when testId available
17. `finalizeDiff` falls back to component-based selector when no testId
18. `finalizeDiff` sets `previousToken: null` when current value is a non-token numeric (e.g., `gap={4}`)

**Token reverse lookup**:
19. `reverseTokenLookup` maps '16px' to 'md' for spacing
20. `reverseTokenLookup` maps '12px' to 'sm' for spacing
21. `reverseTokenLookup` returns 'full' for radius values > 1000px
22. `reverseTokenLookup` returns null for non-token values (e.g., '4px')

#### 1.3 Toolbar Integration — Update Slash Command

**File**: `.claude/commands/visual.md`
**Changes**: Already included in Phase 0's section 0.3 rewrite. The session protocol handles toolbar injection in step 1 and reads `__ZEROFOG_STYLE_DIFF__` in step 2a.

Update step 2b (Route intent) to handle token toolbar diff:
```
IF styleDiff exists:
  -> Read diff, check styleOrigin
  -> If origin is 'mantine-default':
     First occurrence in session: ask "Change all [Component]s via theme.ts, or just this one?"
     Subsequent occurrences: use same answer from earlier in session
  -> If origin is 'mantine-prop': Edit the prop directly
  -> If origin is 'tailwind': Edit the className
  -> If origin is 'css-module': Edit the CSS Module file
  -> If origin is 'unknown': Best-effort edit based on component type
```

#### 1.4 Edit-to-Code Translation Logic — Claude's Reference

**File**: `.claude/commands/visual.md`
**Changes**: Add a reference section for Claude's edit routing

This is not code — it's instruction for Claude on how to translate toolbar diffs into source code changes:

```markdown
## Edit-to-Code Translation

When processing a token toolbar diff, use this priority:

### Mantine Component (check styleOrigin.component)

| CSS Property | Mantine Prop | Example Edit |
|---|---|---|
| padding | `p=`, `px=`, `py=`, `pt=`, `pb=` | `<Card p="lg">` -> `<Card p="xl">` |
| margin | `m=`, `mx=`, `my=`, `mt=`, `mb=` | `<Box mt="sm">` -> `<Box mt="md">` |
| gap | `gap=` | `<Stack gap="md">` -> `<Stack gap="lg">` |
| border-radius | `radius=` | `<Button radius="sm">` -> `<Button radius="md">` |

When previousToken is null (numeric value like gap={4}):
  -> Change from numeric to token: `<Stack gap={4}>` -> `<Stack gap="md">`

### Non-Mantine Element (wrapper div, html element)

| CSS Property | Tailwind Class | Example Edit |
|---|---|---|
| padding | `p-*`, `px-*`, `py-*` | `className="p-4"` -> `className="p-6"` |
| margin | `m-*`, `mx-*`, `my-*` | `className="mt-2"` -> `className="mt-4"` |
| gap | `gap-*` | `className="gap-4"` -> `className="gap-6"` |
| border-radius | `rounded-*` | `className="rounded-md"` -> `className="rounded-lg"` |

### Theme Defaults (from `app/theme.ts`)

Components with defaultProps that affect toolbar properties:

| Component | Default radius | Default padding |
|---|---|---|
| Button | sm | - |
| Card | md | lg |
| Paper | md | - |
| Modal | lg | - |
| Badge | sm | - |
| All form inputs | sm | - |
| Dialog | md | - |

When styleOrigin is 'mantine-default', the current value comes from theme.ts
defaultProps, not an explicit prop. The first time this occurs in a session, ask:
1. Add an explicit prop override (changes just this instance)
2. Modify theme.ts defaultProps (changes all instances of this component)

Use the same answer for subsequent mantine-default cases in the same session.
```

### Success Criteria

#### Automated Verification:
- [x] All inspector tests pass: `CI=true npx vitest run scripts/__tests__/visual-inspect.test.ts`
- [x] All toolbar tests pass: `CI=true npx vitest run scripts/__tests__/visual-toolbar.test.ts`
- [x] TypeScript type checking passes: `npx tsc --noEmit --skipLibCheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Alt+Click a Card component -> toolbar appears below the element
- [ ] Current padding (lg) and radius (md) are highlighted in toolbar
- [ ] Element with `gap={4}` shows `[custom: 4px]` indicator (no button highlighted)
- [ ] Hovering over "xl" padding button shows live preview
- [ ] Clicking "xl" padding button persists the preview
- [ ] Clicking [X] -> reverts all previewed changes (Mantine inline CSS variables preserved)
- [ ] Clicking [Done] -> `window.__ZEROFOG_STYLE_DIFF__` contains the diff with px values
- [ ] Pressing Enter in terminal -> Claude reads diff and offers to edit `p="lg"` to `p="xl"`
- [ ] Toolbar correctly detects Mantine prop vs theme default origin (Card p="lg" = mantine-prop, Card default radius = mantine-default)
- [ ] Stack without explicit gap prop does NOT trigger "change all?" dialog (Stack not in THEME_DEFAULTS for gap)
- [ ] Toolbar handles viewport edge cases (element near bottom -> toolbar shows above)
- [ ] Toolbar disappears when Escape is pressed, a new element is selected, or page is scrolled
- [ ] HMR re-injection restores both inspector and toolbar

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2 (Font + Color, separate plan).

---

## Testing Strategy

### Unit Tests (automated, TDD)

**Phase 0**:
- `classifyElement` — 13 test cases covering all element types + fallbacks
- Pure function tests: pass `(componentChain, tagName)` directly, no fiber mocking needed
- Same test file as existing inspector tests

**Phase 1**:
- `buildTokenMaps` — 4 test cases for token map construction (injected `styleGetter` for Node.js testing)
- `detectStyleOrigin` — 9 test cases for origin detection (injected `findFiberKeysFn` for fiber mocking)
- `finalizeDiff` — 5 test cases for diff output (including `previousToken: null` case)
- `reverseTokenLookup` — 4 test cases for value-to-token mapping (all values in px)

### Integration Tests (manual, via `/visual`)

1. Full session: navigate -> select -> type instruction -> edit -> verify -> select again -> done
2. Token toolbar: select Card -> change padding via toolbar -> Done -> Enter -> source code updated
3. Theme default detection: select Button -> toolbar shows sm radius from defaultProps -> change to md -> first time asks "all or just this?" -> subsequent times uses same answer
4. Mixed session: token toolbar change + Point+Prompt change in same session
5. Non-token value: select Stack with `gap={4}` -> toolbar shows custom indicator -> change to md -> diff has `previousToken: null`

### Edge Cases to Verify

- Element with no fiber (plain HTML) — should show toolbar with tag-based detection
- Element with both Mantine prop and Tailwind class for same property — Mantine prop takes priority (detected first via `_debugOwner` walk)
- Element near viewport edge — toolbar repositions (below -> above -> pin)
- HMR after toolbar change — both inspector and toolbar re-injected if needed
- Multiple rapid selections — previous toolbar dismissed via `zerofog:selected` event, new one shown
- Scrolling while toolbar is open — toolbar dismisses
- Tab/NavLink components — classified as 'interactive', radius toolbar shown

## Performance Considerations

- Token maps are built once on toolbar activation via sentinel element (~10 DOM operations)
- Sentinel element is created, measured, and removed synchronously — no layout thrash
- Toolbar DOM is minimal (~25 elements total)
- No polling — all communication is event-driven via `CustomEvent` or manual (Done + Enter)
- Scroll listener uses `{ passive: true }` for no jank
- Style snapshot/restore is O(1) string copy, not property-by-property tracking

## Migration Notes

No migration needed. This is purely additive:
- `scripts/visual-inspect.js` gets new functions + CustomEvent dispatch (backward compatible)
- `scripts/visual-toolbar.js` is a new file
- `.claude/commands/visual.md` is updated (slash commands are not versioned)

## Known Debt / Future Work

- **Multi-instance disambiguation**: When a component appears multiple times in a list, Claude asks about scope. A future enhancement could auto-detect list rendering contexts.
- **`_debugOwner` fragility**: React's internal fiber API could change in any major version. If this breaks, a fallback approach could serialize component metadata into `data-*` attributes during dev builds via a Babel plugin.

## File Summary

| File | Action | Phase | Estimated Lines Changed/Added |
|---|---|---|---|
| `scripts/visual-inspect.js` | Edit | 0 | +30 (classifier + CustomEvent + exports) |
| `scripts/__tests__/visual-inspect.test.ts` | Edit | 0 | +70 (classifier tests) |
| `.claude/commands/visual.md` | Rewrite | 0+1 | ~180 (session protocol + toolbar instructions) |
| `scripts/visual-toolbar.js` | Create | 1 | ~350 (toolbar implementation) |
| `scripts/__tests__/visual-toolbar.test.ts` | Create | 1 | ~250 (toolbar tests) |

## References

- Research: `thoughts/shared/research/2026-02-18-visual-editor-panel-feasibility.md`
- Inspector: `scripts/visual-inspect.js` (278 lines)
- Inspector tests: `scripts/__tests__/visual-inspect.test.ts` (231 lines)
- Slash command: `.claude/commands/visual.md` (104 lines)
- Theme config: `app/theme.ts` (297 lines, spacing lines 137-143, radius lines 146-153, defaults lines 172-293)
- CSP: `app/lib/middleware/security-headers.ts` (lines 26-28)
- Globals CSS: `app/globals.css` (46 lines)
- Tailwind config: `tailwind.config.ts` (borderRadius lines 41-47, colors lines 11-25)

## Review History

Plan reviewed by 4-agent team (2026-02-18). All fixes from review incorporated:

| # | Issue | Fix Applied |
|---|---|---|
| T1 | Selection hook undefined (4/4 reviewers) | `CustomEvent('zerofog:selected')` dispatched by inspector |
| T2-1 | `detectStyleOrigin` reads wrong fiber (3/4) | Walks `_debugOwner` chain to find Mantine component fiber |
| T2-2 | Live preview revert fragile (3/4) | Full `style` attribute snapshot/restore |
| T3-1 | Slash command LOOP framing (2/4) | Rewritten as per-turn session protocol |
| T3-2 | `buildTokenMaps` rem/px mismatch (2/4) | Sentinel element approach resolves to px |
| T3-3 | `findReactFiberKeys` not exported (2/4) | Added to `module.exports` |
| T3-4 | `classifyElement` depth inconsistency (2/4) | Now pure function on `componentChain`, no fiber walk |
| T3-5 | `buildTokenMaps` untestable in Node.js (2/4) | Accepts `styleGetter` parameter for DI |
| T3-6 | HMR re-injection omits toolbar (2/4) | Checks both `INSPECTOR_ACTIVE` and `TOOLBAR_ACTIVE` |
| T4-1 | `previousToken` can be null (1/4) | Schema updated: `string \| null`, test case added |
| T4-2 | `mantine-default` false positives (1/4) | `THEME_DEFAULTS` lookup table gates the return |
| T4-3 | `elementSelector` format (1/4) | Proper CSS selector: `[data-testid="..."]` |
| T4-4 | Stale diff from previous turn (1/4) | Read-then-reset in single `browser_evaluate` call |
| T4-5 | Numeric pixel props UX (1/4) | `[custom: 4px]` indicator when no token matches |
| T4-6 | Multi-instance components (1/4) | Claude asks about scope when component is in a list |

Subsequent review by Gemini 2.5 Pro (2026-02-18). 3 additional fixes incorporated:

| # | Issue | Fix Applied |
|---|---|---|
| G1 | ES5 convention unnecessary for new code | `visual-toolbar.js` uses ES6+; `visual-inspect.js` retains ES5 |
| G2 | `THEME_DEFAULTS` hardcoded, will go stale | Dynamically injected from `theme.ts` at session start via `browser_evaluate` |
| G3 | Multiple `__ZEROFOG_*` globals pollute namespace | Consolidated under `window.__ZEROFOG__` namespace object |

Subsequent review by GPT-5.2-Pro (2026-02-18). 8 additional fixes incorporated:

| # | Issue | Fix Applied |
|---|---|---|
| O1 | `padding` vs `p` prop mismatch — Card uses `padding` in defaultProps | Added `'padding'` and `'margin'` (long form) to propMap candidates |
| O2 | Inspector hovers/selects toolbar DOM | `data-zerofog-ui="true"` contract; inspector early-returns on `target.closest('[data-zerofog-ui]')` |
| O3 | Toolbar re-injection leaks listeners/DOM | `destroy()` lifecycle stored as `window.__ZEROFOG__.destroyToolbar`; called before re-injection |
| O4 | Multi-value computed style shorthands | Always read longhand properties (`paddingTop`, `borderTopLeftRadius`, etc.) |
| O5 | `window` reference crashes Node tests | Guarded with `typeof window !== 'undefined'` |
| O6 | Preview not reverted on re-selection | `hideToolbar()` (which calls `revertPreview()`) before `showToolbar()` on new selection |
| O7 | Naming inconsistency in scroll snippet | Fixed to use `window.__ZEROFOG__?.toolbarActive` |
| O8 | `isServerComponent` misnomer | Noted for rename to `hasReactFiber` / `isReactManaged` during implementation |
