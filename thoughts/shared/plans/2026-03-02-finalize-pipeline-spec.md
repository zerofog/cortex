# Finalize Pipeline Architecture

> Predecessor: [2026-02-25-visual-editor-implementation.md](./2026-02-25-visual-editor-implementation.md) (Phase 5, Phase 6)
> Predecessor: [2026-02-25-visual-editor-standalone-product.md](./2026-02-25-visual-editor-standalone-product.md) (Three-Phase Commit, slash command)
> Companion: [2026-03-01-native-rendering-overrides.md](./2026-03-01-native-rendering-overrides.md) (native override engine, affects diff content)
> Issue: [ZF0-860](https://linear.app/zerofog/issue/ZF0-860)
> Unblocks: Phase 6 implementation design

---

## 1. Problem Statement

The visual editor has a complete browser-side pipeline:

```
Select element → Classify type → Edit tokens → Preview via native overrides → Finalize diff
```

`finalizeDiff()` produces JSON. Nothing consumes it. `POST /diff` returns 501. The entire value proposition — "visual edits become real source code changes" — depends on this gap being closed.

9/10 architecture reviewers flagged this as the highest-risk assumption. This spec answers five questions:

1. **Input format**: Is `finalizeDiff()` output sufficient for Claude?
2. **Claude integration**: How does Claude receive the diff, find source files, and apply edits?
3. **Approval flow**: How does the user review and roll back proposed changes?
4. **MVP definition**: What's the minimum that validates the concept?
5. **System interactions**: How does this connect to WebSocket, state machine, and selection scope?

---

## 2. Current State

### What's Built

| Component | Status | Location |
|-----------|--------|----------|
| `finalizeDiff()` | Implemented | `visual-editor/src/client/toolbar.js:245` |
| `DiffResult` type | Typed | `visual-editor/src/client/toolbar.d.ts:15` |
| `StyleOrigin` union | Typed | `visual-editor/src/client/toolbar.d.ts:8` |
| `resolveSource()` | Implemented | `visual-editor/src/client/inspector.js:125` |
| `walkComponentChain()` | Implemented | `visual-editor/src/client/inspector.js:62` |
| `buildSelector()` | Implemented | `visual-editor/src/client/inspector.js:747` |
| `classifyElement()` | Implemented | `visual-editor/src/client/inspector.js:183` |
| `detectStyleOrigin()` | Implemented | `visual-editor/src/client/toolbar.js:189` |
| Native rendering overrides | Designed | `2026-03-01-native-rendering-overrides.md` |
| `POST /diff` | Stub (501) | `visual-editor/src/server.ts:214` |
| `POST /complete` | Stub (501) | `visual-editor/src/server.ts:218` |
| State machine | Planned only | Implementation plan Phase 5 |
| Claude integration | Not started | — |
| Slash command template | Draft in plans | — |

### The Gap

```
Browser                    Sidecar                    Claude Code
────────                   ───────                    ──────────
finalizeDiff()             POST /diff (501)           ???
  ↓ JSON                     ↓                         ↓
window.__ZEROFOG__         State machine?             Find source files?
  .styleDiff               WAL persistence?           Edit strategy?
                           Stdout signal?             Report results?
```

The browser-side is done. The server-side is stubbed. The Claude side doesn't exist.

---

## 3. Input Format

### 3.1 Current DiffResult

```typescript
// visual-editor/src/client/toolbar.d.ts:15-22
interface DiffResult {
  elementSelector: string;      // '[data-testid="card-1"]' or 'unknown'
  componentChain: string[];     // ['Card', 'Dashboard', 'App']
  elementType: string;          // 'container' | 'text' | 'interactive' | ...
  changes: unknown[];           // ← untyped; see §3.2
  timestamp: string;            // ISO-8601
}
```

### 3.2 Proposed ChangeEntry Type

The runtime shape exists (visible in test fixtures at `toolbar.test.ts:597`) but isn't formally typed. Proposed:

```typescript
/** A single property change within a diff. */
interface ChangeEntry {
  property: 'padding' | 'margin' | 'gap' | 'border-radius';
  token: string;                    // new token name ('xl')
  previousToken: string | null;     // previous token, null if wasn't a token value
  previousCssValue: string;         // previous resolved CSS value ('20px')
  cssProperty: string;              // CSS property name ('padding')
  cssValue: string;                 // new resolved CSS value ('24px')
  styleOrigin: StyleOrigin;         // discriminated union (toolbar.d.ts:8)
}
```

**Decision**: Replace `changes: unknown[]` with `changes: ChangeEntry[]` in `DiffResult`. Non-breaking — the runtime shape is already this. Enables type-safe consumption in the sidecar.

### 3.3 Assessment: Is DiffResult Sufficient?

**No.** Sufficient for browser-side operations, insufficient for source code editing. Missing:

| Gap | Why It Matters | Resolution |
|-----|---------------|------------|
| No source file path | Claude needs to know _which file_ to edit | Resolved at claim time by Claude via grep (see §4.1) |
| Untyped changes | Prevents type-safe sidecar consumption | Formalize as `ChangeEntry[]` (§3.2) |
| No multi-element aggregation | One finalization includes edits to many elements | Sidecar aggregates into `AccumulatedDiff` (§3.4) |
| No scope intent | "This Card" vs "all Cards" is ambiguous | Default to component definition; see §7 |

### 3.4 AccumulatedDiff: The Sidecar-to-Claude Contract

The sidecar receives individual `DiffResult` objects via WebSocket, aggregates them, persists to WAL, and serves the aggregate via `GET /api/diff`. This is what Claude receives:

```typescript
/** Aggregate diff served by GET /api/diff. Central data contract. */
interface AccumulatedDiff {
  version: 1;                     // schema version for forward compat
  sessionId: string;
  elements: ElementDiff[];
  metadata: {
    createdAt: string;            // ISO-8601, first element added
    updatedAt: string;            // ISO-8601, last element added
    totalChanges: number;         // sum of all changes across elements
  };
}

/** Per-element diff within the aggregate. */
interface ElementDiff {
  elementSelector: string;        // from DiffResult
  componentChain: string[];       // from DiffResult — Claude uses [0] to find file
  elementType: string;            // from DiffResult — informational for Claude
  changes: ChangeEntry[];         // typed per §3.2
}
```

**Design decisions:**

1. **Flat element list, not grouped by file.** Claude groups by target file at claim time via grep. The sidecar doesn't index the project's source tree and shouldn't need to.

2. **No source file paths in the diff.** File resolution is Claude's responsibility (§4). The browser doesn't know file paths. The sidecar could use `_debugSource` data if the browser sent it, but this adds complexity for marginal gain in MVP (see §4.2).

3. **No explicit scope field.** Whether to edit "this instance" or "all instances" is determined by Claude's edit strategy based on `styleOrigin` and component chain context (§7). Encoding scope in the diff would require the browser to make architectural decisions it lacks context for.

4. **Schema version.** Allows the format to evolve without breaking deployed slash commands.

### 3.5 Native Rendering Impact

With the native rendering override architecture (ZF0-861), changes now contain framework-native values instead of raw pixels:

| Before (CSS !important) | After (native rendering) |
|-------------------------|-------------------------|
| `cssValue: '24px'` only | `cssValue: '24px'` + `styleOrigin.origin: 'mantine-prop'` + `styleOrigin.prop: 'p'` |
| Claude guesses the edit | Claude knows: change `p="lg"` to `p="xl"` on the `Card` component |

This is a major improvement. The `styleOrigin` discriminated union already carries enough information for Claude to determine the exact edit without ambiguity in the common case:

- `mantine-prop` → change the JSX prop (`p="lg"` → `p="xl"`)
- `tailwind` → swap the utility class (`p-4` → `p-6`)
- `css-module` → edit the CSS module file
- `mantine-default` → needs a decision (theme change vs instance override)
- `unknown` → flag as unapplyable; explain to user

---

## 4. Source File Resolution

How Claude maps `componentChain: ['Card', 'Dashboard', 'App']` to a file path.

### 4.1 Strategy: Component Name → Grep

For MVP, Claude uses its standard tools (grep, glob) to find source files:

```
componentChain[0] = 'Card'

1. grep -r "function Card" src/ --include="*.tsx" --include="*.jsx"
   → src/components/Card.tsx (component definition)

2. grep -r "export.*Card" src/ --include="*.tsx" --include="*.jsx"
   → confirms: src/components/Card.tsx exports Card

3. Read the file, locate the JSX prop to change
```

**Why this works for MVP:**
- Claude Code already has grep/glob/read tools
- Component names are typically unique in a project
- The slash command instructs Claude to use `componentChain[0]` as the search term
- No browser-side changes needed

**Limitations:**
- Re-exported components may have multiple matches
- Dynamic component names (HOCs, `memo()` wrappers) may not grep cleanly
- `node_modules` components can't be edited — Claude should detect and report

### 4.2 Future: `_debugSource` Enrichment

React dev builds attach source location to fibers:

```typescript
fiber._debugSource = {
  fileName: '/Users/dev/app/src/components/Dashboard.tsx',
  lineNumber: 42,
  columnNumber: 6
}
```

**Important distinction**: `_debugSource` points to the **usage site** (where `<Card>` appears in JSX), not the **component definition** (where `function Card()` is declared). This is useful for instance-specific edits but not for definition edits.

**Assessment:**
- React 18: `_debugSource` available on fibers via `_debugOwner` chain
- React 19: Moved to owner stacks / `__debugInfo` — different API, less reliable
- Requires modifying `resolveSource()` to extract and include `_debugSource`
- **Recommendation**: Skip for MVP. Add in Tier 2 as an optimization that reduces grep round-trips.

### 4.3 Ambiguity Resolution

When grep returns multiple files for a component name:

```
grep "function Card" →
  src/components/Card.tsx          ← component definition
  src/components/Card.stories.tsx  ← Storybook (skip)
  src/components/CardV2.tsx        ← different component (partial match)
```

**Strategy:**
1. Filter out test files (`*.test.*`, `*.spec.*`, `*.stories.*`)
2. Prefer files where the component is a **default export** or **named export matching the component name**
3. If still ambiguous (>1 match): report all matches, let Claude choose based on `componentChain` context (the parent components narrow it down)
4. If zero matches: report to user — "Component 'Card' not found in source. It may be from a library."

Claude is good at this kind of reasoning. The slash command doesn't need to encode all disambiguation rules — it just needs to instruct Claude to handle ambiguity gracefully.

---

## 5. Claude Integration

### 5.1 Two Roles (Unchanged from Product Architecture)

| Role | When | What Claude Does |
|------|------|-----------------|
| **Design Advisor** | While user edits in browser | Answers questions, explains constraints, suggests alternatives |
| **Code Translator** | On finalization | Reads diff, finds files, applies edits, reports results |

This spec focuses on the **Code Translator** role.

### 5.2 Edit Strategy Dispatch

The core business logic: given a `ChangeEntry` with a `styleOrigin`, what does Claude do?

#### `mantine-prop` — Edit the JSX prop value

**Target file:** Component definition (`componentChain[0]` → grep for definition)

**Edit rule:** Change the prop specified in `styleOrigin.prop` to the new `token` value.
- If the change is uniform across all sides (e.g., all padding changed to `xl`), use the shorthand prop (`p="xl"`)
- If sides differ (e.g., only padding-top changed), decompose: keep `p` for the unchanged value, add the specific side prop (`pt="xl"`)

```tsx
// Uniform change: styleOrigin.prop = 'p', token = 'xl'
// Before
<Card p="lg">...</Card>
// After
<Card p="xl">...</Card>

// Per-side change: only padding-top changed to 'xl', rest stays 'lg'
// Before
<Card p="lg">...</Card>
// After
<Card p="lg" pt="xl">...</Card>
```

**Ambiguous case:** If the component is found in multiple files, use `componentChain` parent context to disambiguate. If still ambiguous, list files and ask the user.

#### `mantine-default` — Modify the theme (all components of that type)

**Target file:** Theme configuration file (typically `src/theme.ts` or `src/theme/index.ts`)

**Edit rule:** Default behavior is to change the Mantine theme default for this component type. This affects ALL instances of that Mantine component across the entire app — not just the user's wrapper component. This is the correct default because the user edited a value that comes from the theme, signaling intent to change the design system default.

```typescript
// styleOrigin: { origin: 'mantine-default', component: 'Card', defaultValue: 'md' }
// token = 'xl'

// Before — src/theme.ts
const theme = createTheme({
  components: {
    Card: {
      defaultProps: {
        p: 'md',
      },
    },
  },
});

// After
const theme = createTheme({
  components: {
    Card: {
      defaultProps: {
        p: 'xl',
      },
    },
  },
});
```

**Exception:** If the user explicitly says "just this component," add an explicit prop to the component definition instead (falls back to `mantine-prop` strategy targeting the wrapper component).

**Ambiguous case:** If no theme config file exists, create the `defaultProps` entry. Report to the user: "Created theme override for Card. All Card components will use padding xl."

#### `tailwind` — Swap the utility class

**Target file:** Component definition (`componentChain[0]` → grep for definition)

**Edit rule:** Replace the current Tailwind utility class (`styleOrigin.className`) with the class that produces the new `cssValue`. The token system's `cssValue` is the bridge — it's the resolved pixel value from the project's actual CSS variables, so it accounts for any custom Tailwind config.

Claude finds the correct replacement class by:
1. Reading the `cssValue` (e.g., `24px` for token `xl`)
2. Finding the Tailwind utility that produces that value for the given CSS property
3. If the project has a custom `tailwind.config`, check it for non-standard spacing scales

```tsx
// styleOrigin: { origin: 'tailwind', className: 'p-4' }
// token = 'xl', cssValue = '24px'

// Before
<div className="p-4 rounded-md bg-white">...</div>
// After — p-6 produces 24px in standard Tailwind
<div className="p-6 rounded-md bg-white">...</div>

// Per-side: only padding-top changed
// Before
<div className="p-4 rounded-md">...</div>
// After
<div className="p-4 pt-6 rounded-md">...</div>
```

**Ambiguous case:** If the className string is dynamically constructed (e.g., template literals, `clsx()`), Claude should attempt the edit within the dynamic expression. If too complex, report: "Dynamic className — could not apply automatically."

#### `css-module` — Edit the CSS module file

**Target file:** The `.module.css` file associated with the component (typically co-located: `Card.module.css` next to `Card.tsx`)

**Edit rule:** Find the CSS rule that applies to the element and change the property value. Use the `cssValue` as the new value. If the project uses CSS variables for tokens, prefer the variable reference over the raw pixel value.

```css
/* styleOrigin: { origin: 'css-module' }
   cssProperty = 'padding', cssValue = '24px' */

/* Before — Card.module.css */
.card {
  padding: 16px;
}

/* After */
.card {
  padding: 24px;
}

/* Or, if the project uses CSS variables: */
.card {
  padding: var(--spacing-xl);
}
```

**Ambiguous case:** If the CSS module has multiple selectors that could apply (specificity conflicts), Claude should edit the most specific matching rule. If the selector can't be determined, report: "Ambiguous CSS module selector — multiple rules match."

#### `unknown` — Best-effort inline style

**Target file:** Component definition or usage site (best guess from `componentChain`)

**Edit rule:** Attempt a best-effort inline style edit. This is the fallback when the style origin can't be determined — the value might come from a global stylesheet, inherited styles, or a framework Claude doesn't recognize.

```tsx
// styleOrigin: { origin: 'unknown' }
// cssProperty = 'padding', cssValue = '24px'

// Before
<div>...</div>
// After — inline style as last resort
<div style={{ padding: '24px' }}>...</div>

// If element already has inline styles:
// Before
<div style={{ margin: '8px' }}>...</div>
// After
<div style={{ margin: '8px', padding: '24px' }}>...</div>
```

**Caveat:** Report to user: "Style origin unknown — applied as inline style. This may not match the project's styling approach. Consider refactoring to use your design system." Mark as applied but flagged.

#### Dispatch Summary

| Origin | Target File | Edit Type | Scope |
|--------|------------|-----------|-------|
| `mantine-prop` | Component definition | Change JSX prop value | Component (all instances) |
| `mantine-default` | Theme config | Change `defaultProps` | All Mantine components of that type |
| `tailwind` | Component definition | Swap utility class | Component (all instances) |
| `css-module` | Co-located `.module.css` | Change CSS property value | Component (all instances) |
| `unknown` | Component definition | Add/merge inline `style` | Component (all instances) |

### 5.3 Slash Command: Finalization Section

The slash command template (`.claude/commands/visual.md`) instructs Claude on the finalization flow. This is the "prompt" — there's no separate prompt engineering step.

**Critical insight:** Claude is already running as a Claude Code session. The slash command is instructions within that session. Claude has full access to grep, read, edit tools. The "prompt" is just structured instructions.

```markdown
## When you see "Diff received" in sidecar output (auto-trigger)

1. Claim the diff:
   curl -s http://localhost:4000/__zerofog/api/diff \
     -H "X-Session-Id: $SESSION_ID"

   Parse the JSON response as AccumulatedDiff.
   If empty or error: tell user "No pending changes."

2. Group changes by target component:
   For each element in the diff, use componentChain[0] as the component name.
   Multiple elements with the same componentChain[0] are edits to the same
   component — batch them.

3. For each component group, resolve the source file:
   - Search for the component definition: function/const/class [Name]
   - Filter out test/story files
   - If multiple matches: use the parent components in componentChain to
     disambiguate. If still ambiguous, report all matches to the user.
   - If zero matches: skip and report "Component not found in source"

4. For each resolved file, apply the edit strategy based on styleOrigin (see §5.2):
   - mantine-prop: change the JSX prop value. Use shorthand (p) if uniform,
     decompose to per-side (pt/pr/pb/pl) if sides differ.
   - mantine-default: change the Mantine theme defaultProps for that component.
     This affects ALL instances of that Mantine component type.
   - tailwind: swap the utility class. Use cssValue to find the matching class.
   - css-module: edit the co-located .module.css file.
   - unknown: best-effort inline style. Flag to user as approximate.

5. Report how many instances of each component exist in the project:
   Count occurrences of <ComponentName in *.tsx/*.jsx files.
   If >1 instance exists: "This component is used in N places.
   All instances will reflect this change."

6. After all edits, report results:
   curl -s -X POST http://localhost:4000/__zerofog/api/complete \
     -H "Content-Type: application/json" \
     -H "X-Session-Id: $SESSION_ID" \
     -d '{"applied": [...indices], "failed": [{"index": N, "reason": "..."}]}'
```

### 5.4 Structured Output: Completion Report

Claude sends a structured completion report to the sidecar via `POST /api/complete`:

```typescript
interface CompletionReport {
  applied: number[];              // indices of successfully applied changes
  failed: FailedChange[];         // changes that couldn't be applied
}

interface FailedChange {
  index: number;                  // index into AccumulatedDiff.elements
  reason: string;                 // human-readable explanation
  // Possible reasons:
  // - "Component 'Card' not found in source"
  // - "Component is from node_modules (library component)"
  // - "Ambiguous: Card found in 3 files"
  // - "Style origin 'unknown' — cannot determine edit strategy"
}
```

The sidecar forwards this to the browser via WebSocket:
- For `applied` changes: browser waits for HMR, then clears CSS overrides
- For `failed` changes: browser re-applies CSS overrides and shows failure reasons

---

## 6. Approval Flow

### 6.1 Target Flow: Auto-Apply

In the target tier, edits are applied automatically:

```
User clicks "Send to Claude" in browser
  → Sidecar receives diff, logs "Diff received"
  → Claude auto-claims (POST /api/diff)
  → Claude edits source files using its Edit tool
  → Claude reports results (POST /api/complete)
  → HMR updates the page with real code
  → Browser clears CSS overrides for applied changes
```

The user does NOT approve individual edits. They see the result via HMR and can undo if needed.

**Why no approval gate:** Token-constrained editing limits the blast radius. The user already chose "xl" instead of "lg" — the only question is whether Claude can mechanically apply that to source code. Adding an approval step would make the UX feel like a code review tool, not a design tool.

### 6.2 Partial Success Handling

When some changes succeed and others fail:

```
Browser panel shows:
  "5/8 changes applied. 3 need attention:"
  ├─ Card padding: Component 'Card' found in 3 files (ambiguous)
  ├─ Badge radius: Component is from @mantine/core (library)
  └─ Gap: Style origin unknown
```

For failed changes, CSS overrides remain visible so the design doesn't regress. The user can:
- Provide more context ("The Card is in src/components/Card.tsx")
- Accept the override as temporary
- Discard the failed changes

### 6.3 Rollback Mechanism

**Layer 1 — Git safety net:**
Before applying edits, Claude creates a git checkpoint:
```bash
git stash push -m "cortex-pre-finalize-$(date +%s)" --include-untracked
```
On failure or user request, revert:
```bash
git stash pop
```

**Layer 2 — Claude Code undo:**
Each file edit made by Claude Code can be individually undone via the tool's undo mechanism. This is more granular than git stash.

**Layer 3 — CSS override persistence:**
For failed changes, CSS overrides remain applied in the browser. The design intent is preserved even if source code changes fail. The user can retry finalization after resolving the issue.

---

## 7. Selection Scope

### 7.1 The Question

If a user selects a Card and changes its padding from `lg` to `xl`:
- Does Claude change the `Card` component definition (all Cards change)?
- Or does Claude change just this one `<Card p="lg">` usage?

### 7.2 Default: Component Definition (All Instances)

Consistent with the product architecture: "Default = All Instances (Like Figma Components)."

When the user edits a Card's padding, Claude changes the component definition. All instances of Card reflect the change. This maps to:

```tsx
// Before — in src/components/Card.tsx
export function Card({ children }) {
  return <MantineCard p="lg">{children}</MantineCard>
}

// After
export function Card({ children }) {
  return <MantineCard p="xl">{children}</MantineCard>
}
```

### 7.3 Instance-Specific Override (Exception)

When the user explicitly wants "just this one," the edit targets the usage site:

```tsx
// Before — in src/pages/Dashboard.tsx
<Card />

// After — explicit prop override on this instance
<Card p="xl" />
```

**How scope is determined:**
- **MVP**: Default to component definition. If the user says "just this one" in the terminal, Claude uses the `elementSelector` (testId) to find the specific JSX usage via `_debugSource` or grep.
- **Future**: The browser panel could expose a toggle: "All Cards" vs "Just this one." This would add a `scope: 'definition' | 'instance'` field to the diff.

### 7.4 Blast Radius Reporting

Before applying edits, Claude counts and reports component usage:

```
Found 'Card' used in 4 files (12 instances):
  src/pages/Dashboard.tsx (3 instances)
  src/pages/Settings.tsx (2 instances)
  src/pages/Profile.tsx (5 instances)
  src/components/CardGrid.tsx (2 instances)

Changing Card's padding from lg to xl. All 12 instances will update.
```

This gives the user visibility into the blast radius before HMR shows the result.

---

## 8. MVP Tiers

### Tier 0: Copy to Clipboard (Minimum Viable)

**What it does:** User clicks "Send to Claude" → diff JSON is formatted as a structured prompt → copied to clipboard → user pastes into any Claude session.

**Implementation:**
- Browser-side only. No sidecar changes needed.
- "Send to Claude" button formats the diff as markdown with instructions
- Uses `navigator.clipboard.writeText()` to copy

**What it validates:**
- Is the diff format sufficient for Claude to understand the intent?
- Can Claude reliably find and edit source files from component names?
- Does the edit strategy dispatch work for real-world components?

**What it doesn't validate:**
- Auto-trigger flow
- State machine / WAL
- HMR coordination
- Partial success handling

**Effort:** ~1 day. Browser-side change only.

### Tier 1: Slash Command with Manual Trigger

**What it does:** User runs `/visual`, makes edits, says "finalize" in terminal → Claude fetches diff from sidecar → applies edits → reports results.

**Implementation:**
- `POST /diff` returns the accumulated diff (implement the 501 stub)
- `POST /complete` accepts completion report (implement the 501 stub)
- Slash command template (`.claude/commands/visual.md`) with finalization instructions
- State machine: `idle → pending_diff → processing → idle`
- WAL: `.cortex/pending-diff.json`

**What it validates:**
- Full pipeline: browser → sidecar → Claude → source code → HMR
- State machine correctness
- WAL persistence and crash recovery
- Edit strategy for all styleOrigin types

**What it doesn't validate:**
- Auto-trigger (user still says "finalize" manually)
- WebSocket-based HMR coordination (uses timeout fallback)

**Effort:** ~3-4 days. Server + slash command + state machine.

### Tier 2: Auto-Trigger (Target)

**What it does:** User clicks "Send to Claude" → sidecar auto-triggers Claude → edits applied → HMR updates page → overrides cleared.

**Implementation:**
- Everything from Tier 1, plus:
- Sidecar stdout signal: `[cortex] Diff received (N changes). Ready for finalization.`
- Claude detects stdout and auto-claims
- WebSocket `edit-complete` message to browser
- HMR detection: sidecar observes HMR WebSocket traffic, pushes `zerofog:hmr-detected`
- Browser clears overrides after HMR confirmation (or 5s timeout)

**What it validates:**
- Zero-friction UX: edit in browser, see real code update automatically
- The full three-phase commit
- HMR coordination

**Effort:** ~2 days on top of Tier 1. Stdout signal + WebSocket messages + HMR detection.

### Validation Criteria per Tier

| Criterion | Tier 0 | Tier 1 | Tier 2 |
|-----------|--------|--------|--------|
| Diff → source edit works | Manual test | Automated | Automated |
| All styleOrigin types handled | Manual test | Slash cmd test | Slash cmd test |
| State machine correctness | N/A | Unit tests | Unit tests |
| Crash recovery (WAL) | N/A | Unit test | Unit test |
| HMR clears overrides | N/A | N/A | Integration test |
| Auto-trigger works | N/A | N/A | Integration test |
| User sees blast radius report | N/A | Terminal output | Terminal + panel |

**Recommendation:** Build Tier 1 first. It validates the critical assumptions (can Claude turn a diff into source edits?) without the complexity of auto-trigger and HMR coordination. Tier 0 is useful as a quick prototype but doesn't exercise the state machine.

---

## 9. System Interactions

### 9.1 WebSocket Message Flow

Extending the existing WebSocket protocol (defined in `server.ts:379`):

```
Browser → Sidecar (new messages):

  { type: 'finalize', payload: DiffResult[] }
    Browser sends accumulated diffs when user clicks "Send to Claude."
    Sidecar aggregates into AccumulatedDiff, persists to WAL, ACKs.

  Response: { type: 'finalize-ack', changeCount: number }
    Confirms receipt. Browser shows "Changes sent. Applying..."


Sidecar → Browser (new messages):

  { type: 'edit-complete', payload: CompletionReport }
    Sent after Claude POSTs to /api/complete.
    Browser processes applied/failed lists.

  { type: 'hmr-detected' }
    Sent when sidecar observes HMR activity on the proxied WebSocket
    after an edit-complete. Browser uses this to time override clearing.

  { type: 'processing-timeout' }
    Sent when the 120s processing timeout expires.
    State reverts to pending_diff. Browser shows "Timed out. Retry?"
```

### 9.2 State Machine Integration

The state machine (Phase 5, `src/state.ts`) governs the diff lifecycle:

```
                  Browser WS              Claude GET              Claude POST
                  'finalize'              /api/diff               /api/complete
                  ──────────              ─────────               ─────────────
                       │                      │                        │
  ┌──────┐             ▼                      ▼                        ▼
  │ idle │────────► pending_diff ────────► processing ────────────► idle
  └──────┘             │                      │                        │
                       │                      │                        │
                  Persist WAL            Start 120s timer         Delete WAL
                  Log to stdout          Return diff JSON         Forward to browser
                  ACK browser            Reject if not            Clear timer
                  Reject if not idle     pending_diff             Reject if not
                  (409)                  (409)                    processing (409)
                       │                      │
                       │                      ▼
                       │                 On timeout:
                       │                 Revert to pending_diff
                       │                 Push 'processing-timeout'
                       │                 Log warning
                       ▼
                  On startup:
                  Check for WAL
                  If found → resume
                  as pending_diff
```

**Key integration points with the finalize pipeline:**
- `receiveDiff()` is called when WebSocket receives `finalize` message
- `claimDiff()` is called when `GET /api/diff` is hit
- `complete()` is called when `POST /api/complete` is hit
- The state machine rejects out-of-order operations with 409

### 9.3 HMR Coordination

After Claude edits source files, the dev server's HMR system pushes updates to the browser. The sidecar detects this because it proxies all WebSocket traffic:

```
Dev Server ──HMR WS──► Sidecar (proxy) ──HMR WS──► Browser (iframe)
                              │
                              ├── Observes HMR messages
                              ├── If post-edit-complete: push 'hmr-detected' to editor WS
                              └── Browser clears CSS overrides on 'hmr-detected'
```

**Timeout fallback:** If no HMR activity within 5s of `edit-complete`, the browser clears overrides anyway. The edited file might not be currently imported (e.g., editing a component that's not on the current page), so HMR may never fire.

### 9.4 Interaction with Nav-Blocker

The nav-blocker (already implemented, `nav-blocker.js`) prevents navigation while edits are pending. Its activation state should align with the diff lifecycle:

- **Activate** when the first change is made (token button clicked in toolbar)
- **Keep active** during `pending_diff` and `processing` states
- **Deactivate** when all changes are applied (or discarded) and state returns to `idle`

The panel controls nav-blocker activation via postMessage. The finalize pipeline doesn't directly interact with the nav-blocker — it's mediated through the panel's state awareness.

---

## 10. Decisions Log

| # | Decision | Rationale | Alternative Considered |
|---|----------|-----------|----------------------|
| D1 | Claude resolves files via grep, not browser-side `_debugSource` | Simpler MVP; no browser changes needed; Claude is good at grep | Add `_debugSource` to diff — deferred to Tier 2 |
| D2 | Flat element list in AccumulatedDiff, not grouped by file | Sidecar doesn't know project structure; Claude groups at claim time | Pre-group by component — requires sidecar to index source |
| D3 | No approval gate before applying edits | Token-constrained editing limits blast radius; approval breaks the "design tool" UX | Add approval panel — reconsidered for Tier 2 if needed |
| D4 | Default scope = component definition (all instances) | Matches Figma mental model; product plan says "default = all instances" | Default to instance — conflicts with product philosophy |
| D5 | Git stash as primary rollback mechanism | Already in user's workflow; slash command can automate it | Custom undo stack — over-engineering for MVP |
| D6 | Build Tier 1 before Tier 0 | Tier 1 validates the full pipeline; Tier 0 only validates diff format | Build Tier 0 first — faster but doesn't test state machine |
| D7 | Schema version in AccumulatedDiff | Forward compatibility as diff format evolves | No version — breaks deployed slash commands on format change |

---

## 11. Open Questions

1. **`mantine-default` strategy**: When a component uses Mantine's default theme value (not an explicit prop), should Claude modify the theme config or add an explicit prop? This affects all instances of that Mantine component across the entire app, not just the user's component. Needs UX decision.

2. **Per-side spacing**: The toolbar supports per-side spacing edits (padding-top independently of padding-bottom). Does `finalizeDiff()` capture per-side changes correctly, or does it collapse them into a single `padding` change? Verify against test fixtures.

3. **Compound Mantine props**: Mantine uses shorthand props (`p` for all padding, `pt` for padding-top, `px` for horizontal padding). If the user changes only padding-top, Claude needs to know whether to change `p` (all sides) to `pt`+`pr`+`pb`+`pl` or just add `pt` alongside `p`. The edit strategy needs to handle prop decomposition.

4. **HMR detection reliability**: Does the sidecar reliably distinguish HMR WebSocket messages from other WebSocket traffic? Needs investigation during Tier 2 implementation. The proxied WebSocket may carry non-HMR traffic (e.g., app-level real-time features).

5. **`_debugSource` in React 19**: The `walkComponentChain()` function already handles React 18 vs 19 fiber traversal differences. If `_debugSource` is added in Tier 2, the same version-adaptive approach is needed. Assess whether React 19's `__debugInfo` provides equivalent data.

---

## 12. Implementation Sequence

Phase 6 implementation should proceed in this order:

1. **Type formalization** — Add `ChangeEntry` type to `toolbar.d.ts`, update `DiffResult.changes` typing
2. **State machine** — Implement `src/state.ts` with transitions, WAL, timeout, recovery (Phase 5 spec)
3. **Server endpoints** — Replace 501 stubs with real `POST /diff` and `POST /complete` handlers
4. **WebSocket messages** — Add `finalize`, `finalize-ack`, `edit-complete` message handlers
5. **Slash command** — Write `.claude/commands/visual.md` with finalization instructions
6. **Integration test** — End-to-end: browser edit → finalize → Claude applies → HMR → verify
7. **HMR coordination** — Sidecar observes proxied HMR traffic, pushes `hmr-detected`
8. **Auto-trigger** — Stdout signal + Claude auto-claim (Tier 2)

Steps 1-5 = Tier 1. Steps 6-8 = Tier 2.

---

## Architecture Review Findings (2026-03-02)

**Review team:** distsys, security, frontend, mts (master tech strategist), dx
**Selection rationale:** Document covers distributed state machines, browser-side DOM/fiber traversal, HTTP security surface, API contract design, and developer-facing CLI integration. These five personas cover the critical axes.
**Mode:** both (clink multi-model + native Claude agents, 10 total reviews)

### Cross-Reviewer Consensus

Issues flagged independently by 3+ reviewers — highest-confidence signals:

| # | Issue | Flagged By | Consensus Severity |
|---|-------|------------|-------------------|
| C1 | HTTP method inconsistency: spec says both POST /diff (stub) and GET /api/diff (slash cmd) | distsys×2, dx×2, mts×2, security | CRITICAL |
| C2 | GET /api/diff bypasses session auth (middleware only checks POST/PUT/DELETE/PATCH) | security×2, dx, distsys | CRITICAL |
| C3 | State transition on GET violates HTTP semantics (GET claim causes pending→processing) | distsys×2, mts×2, security | CRITICAL |
| C4 | No claim fencing token — duplicate processing possible on retry or concurrent sessions | distsys×2, mts×2 | CRITICAL |
| C5 | grep-based source resolution fragile for re-exports, HOCs, barrel files | mts×2, frontend×2 | HIGH |
| C6 | React 19 fiber traversal: `_debugOwner` absent, tag filter may miss component types | frontend×2, mts | HIGH |
| C7 | Selectors may not survive HMR — stale element references between edit-complete and HMR | frontend×2, dx | HIGH |
| C8 | `mantine-default` scope: theme change affects ALL Mantine components globally, insufficient warning | mts, frontend, security | HIGH |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1

**1. HTTP endpoint inconsistency (C1)**
The spec contradicts itself on how Claude fetches the diff:
- §3.4 and §5.3 slash command: `GET /api/diff`
- §9.2 state machine diagram: "Claude GET /api/diff"
- `server.ts:214` existing stub: `POST /diff`

**Fix:** Standardize. Use `POST /api/diff/claim` for the state-mutating claim operation (satisfies C1 + C3). Keep `GET /api/diff` as a read-only peek (no state transition) for debugging. Update the server stub, state machine diagram, and slash command template.

**2. GET /api/diff bypasses session auth (C2)**
`server.ts:193-200` — the session middleware checks `['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)`. GET requests pass through without session validation. Any process on localhost can read the accumulated diff.

**Fix:** Extend session middleware to cover GET on protected API endpoints. Add `X-Session-Id` header check to GET /api/diff (and the new POST /api/diff/claim).

**3. State transition on GET violates HTTP semantics (C3)**
The state machine transitions `pending_diff → processing` when Claude hits GET /api/diff. GET is a safe method — it must not cause side effects. This breaks: HTTP caching, automatic retries by clients/proxies, and idempotency guarantees.

**Fix:** Introduce `POST /api/diff/claim` as the explicit claim endpoint. GET /api/diff remains a safe read (returns diff without state change). The claim endpoint returns a `claimToken` (UUID) that must be included in the completion report.

**4. No claim fencing token (C4)**
Nothing prevents duplicate processing. Scenarios: network retry of claim request, two Claude sessions running concurrently, or user running `/visual` in multiple terminals.

**Fix:** `POST /api/diff/claim` returns `{ claimToken: uuid, diff: AccumulatedDiff }`. `POST /api/complete` requires `{ claimToken, applied, failed }`. Server rejects completion with mismatched token (409). Second claim attempt while processing returns 409.

**5. `mantine-default` global scope needs explicit warning (C8 elevated to CRITICAL)**
Changing theme `defaultProps` for `Card` affects **every Mantine Card** in the app — not just the user's `Card` wrapper component. The blast radius report (§7.4) counts component instances but doesn't distinguish between "your Card component used in 4 files" and "Mantine's Card primitive used everywhere."

**Fix:** §5.2 `mantine-default` strategy must include a distinct warning: "Theme change: This modifies the Mantine default for ALL Card components globally. Confirm intent before applying." Add this to the slash command template and the CompletionReport.

#### HIGH — Should fix in v1

**1. grep-based source resolution fragility (C5)**
Known failure modes not explicitly documented:
- Barrel files (`export { Card } from './Card'`) — grep finds the re-export, not the definition
- HOC wrappers (`export default memo(Card)`) — "function Card" grep misses
- Dynamic names (`const Card = styled(Box)`) — grep for "function Card" returns nothing
- Monorepo component sharing — multiple packages may define `Card`

**Mitigation:** Document these limitations in §4.3. Add grep fallback patterns: `export default`, `const Card`, `Card =`. Claude's disambiguation ability covers most cases. `_debugSource` in Tier 2 resolves this properly.

**2. React 19 fiber traversal gaps (C6)**
`detectStyleOrigin()` uses `Object.prototype.hasOwnProperty.call(domFiber, '_debugOwner')` to choose strategy. React 19 removes `_debugOwner` entirely → falls to `fiber.return` with tag filter `[0, 1, 11, 14, 15]`. If React 19+ adds new component tags, the filter silently misses them.

**Mitigation:** The existing dual strategy is sound. Add a catch-all: if `fiber.return` traversal yields no owner after MAX_DEPTH, log a warning. Track React release notes for tag changes. Consider a "tag allowlist" config for forward compat.

**3. Selectors may not survive HMR (C7)**
Between `edit-complete` and HMR landing, the browser holds element references that may become stale. After HMR re-renders, `data-testid` selectors are stable, but `cortex-id` (generated at runtime) will be regenerated with new values.

**Fix:** Override clearing after HMR should re-query the DOM using `data-testid` selectors (stable) rather than holding element references. For elements without `data-testid`, use `componentChain` + position heuristics to re-locate.

**4. WAL crash recovery could double-apply edits**
If Claude edits source files but crashes before `POST /api/complete`, the WAL still contains the pending diff. On restart, the state resumes as `pending_diff`, and Claude re-processes already-applied edits → duplicate changes.

**Fix:** Two options: (a) Record applied changes incrementally in WAL (complex), or (b) rely on git — if the source file has changed since the diff was created, warn Claude to diff against current state before re-applying. Option (b) is simpler and leverages the existing git stash mechanism.

**5. `$SESSION_ID` in slash command is undefined (dx)**
§5.3 references `$SESSION_ID` in curl headers. This is not a shell environment variable — there's no specification of how Claude obtains it.

**Fix:** Specify that the sidecar outputs `[cortex] Session: <uuid>` on startup (already planned for stdout logging). The slash command instructs Claude to capture this from terminal output, or the sidecar provides it via a well-known file (`.cortex/session`).

**6. Hardcoded port 4000**
The slash command hardcodes `localhost:4000`. Users with port conflicts have no recourse.

**Fix:** Sidecar outputs the actual port on startup. Slash command reads from `.cortex/config.json` or sidecar stdout. Default remains 4000.

**7. CSP nonce injection (frontend-clink)**
If the target app uses nonce-based Content-Security-Policy, injected scripts are blocked. The proxy needs to either rewrite the CSP header or inject script nonces.

**Mitigation:** Document as known limitation for Tier 1. Add CSP header rewriting to the proxy in a future pass (the proxy already rewrites HTML — adding nonce injection is incremental).

**8. iframe sandbox vs. OAuth (frontend-native)**
Sandbox permissions configured in ZF0-858 may still block OAuth redirect flows (popup windows, cross-origin redirects).

**Mitigation:** ZF0-858 made sandbox permissions configurable. Document the required permissions for apps that use OAuth. Consider `allow-popups-to-escape-sandbox` as opt-in.

#### MEDIUM

- `escapeAttrValue()` only escapes `\` and `"` — other special chars in testId values could break attribute selectors
- WAL file `.cortex/pending-diff.json` should be outside the source tree to avoid git noise; use `~/.cortex/` or a temp directory
- 120s processing timeout is arbitrary — complex diffs with many components could legitimately exceed this; make configurable
- No rate limiting on diff submissions — spamming "Send to Claude" queues unbounded work
- Missing WebSocket reconnection specification if connection drops during processing state
- Slash command doesn't handle case where dev server is stopped (no HMR available) — should fall back gracefully
- `MAX_DEPTH = 20` for fiber traversal is hardcoded — deep component trees (design system wrappers) could exceed this
- CSS module file resolution assumes co-location naming (`Card.module.css` next to `Card.tsx`) — not universal
- CompletionReport uses array indices for change references — fragile if diff mutated between claim and complete
- No specification of concurrent edit handling: user makes new browser edits while Claude processes existing diff
- `git stash` rollback doesn't handle case where user has existing uncommitted changes (stash collision)
- Missing structured error codes in `FailedChange.reason` — free-text strings are hard to programmatically handle

#### LOW

- Timestamp format should mandate UTC (ISO-8601 alone allows local time offsets)
- AccumulatedDiff lacks a hash/checksum for integrity verification
- `elementType` values are informational but not formally enumerated — could diverge between inspector and consumer
- The spec references line numbers in toolbar.js / inspector.js that will shift as code evolves — use function names instead
- `escapeAttrValue` is intentionally duplicated between toolbar.js and inspector.js — consider shared utility in Tier 2

### Positive Practices — Preserve These

1. **Token-constrained editing** (xs/sm/md/lg/xl only) — limits blast radius by design, preventing arbitrary pixel values from entering the codebase
2. **StyleOrigin discriminated union** — enables precise edit strategy dispatch; Claude knows exactly what kind of edit to make without guessing
3. **MVP tiering (0/1/2)** — validates the riskiest assumption first (can Claude turn diffs into source edits?) before adding complexity
4. **WAL persistence** — production-grade resilience thinking from day one; crash recovery is not an afterthought
5. **Native rendering overrides** (ZF0-861) — eliminates the CSS `!important` hack; gives Claude framework-native information that directly maps to source code constructs
6. **Schema versioning** in AccumulatedDiff — forward compatibility without breaking deployed slash commands
7. **Git stash as rollback** — leverages user's existing workflow rather than building custom undo infrastructure
8. **Separation of diff generation from processing** — clean architecture boundary between browser (generates diffs), sidecar (persists/serves), and Claude (applies)
9. **Flat element list** (not pre-grouped by file) — keeps the sidecar simple; file grouping is Claude's job at claim time
10. **Batch read/write pattern** in `buildTokenMaps()` — avoids layout thrash, demonstrates awareness of browser performance pitfalls

### Review Methodology Note

**Clink (multi-model) via PAL:**
- 5 reviews distributed across Codex, Gemini, and Claude models
- Strengths: broader perspective diversity, caught CSP nonce issue and Tailwind regex concerns, faster turnaround
- Limitations: no direct codebase access, analysis based solely on document content

**Native (Claude Task agents):**
- 5 reviews with full codebase read access
- Strengths: deeper grounding — referenced specific line numbers in `server.ts`, `toolbar.js`, `inspector.js`; identified the session middleware gap by reading actual code; more thorough state machine analysis
- Limitations: slower, higher compute cost

**Comparison:** Clink caught 3 issues native missed (CSP nonce, regex ReDoS concern, installation path). Native caught 4 issues clink missed (session middleware bypass on GET, WAL double-apply, `$SESSION_ID` undefined, CompletionReport index fragility). 70% overlap on critical findings. **Recommendation:** "both" mode is worth the compute for architecture reviews where correctness matters.
