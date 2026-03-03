# Structural Editing Architecture

> Predecessor: [2026-03-02-finalize-pipeline-spec.md](./2026-03-02-finalize-pipeline-spec.md) (AccumulatedDiff, edit strategy dispatch, state machine)
> Predecessor: [2026-02-25-visual-editor-implementation.md](./2026-02-25-visual-editor-implementation.md) (Phase 5–6, element classifier)
> Companion: [2026-02-18-visual-editor-panel-feasibility.md](../research/2026-02-18-visual-editor-panel-feasibility.md) (EditIntent model, 5-tier taxonomy)
> Issue: [ZF0-862](https://linear.app/zerofog/issue/ZF0-862)
> Scope: v1.5 / v2 planning — document only, no code changes

---

## 1. Problem Statement

The visual editor's current pipeline handles CSS token overrides:

```
Select element → Classify type → Edit tokens → Preview via native overrides → Finalize diff
```

This pipeline cannot express **structural operations**. Six of ten architecture reviewers on ZF0-860 flagged this: CSS overrides (changing `padding: md → xl`) are a different category from structural edits (inserting a Card, removing a Badge, reordering navigation items). The existing `AccumulatedDiff` format has no representation for "add a component after this sibling" or "remove this element from its parent."

This spec defines an **intent-capture-and-delegate** system for structural editing:

- **Browser** captures the user's structural intent (what to add, remove, or reorder)
- **Claude** performs the actual JSX transformation (where to insert, how to clean imports, what to delete)

### Five Questions This Spec Answers

1. **Mode integration**: How does structural editing coexist with the existing Browse/Select/Style flow?
2. **Intent format**: What data structure represents "add a Card after this Button"?
3. **Claude translation**: How does Claude turn a structural intent into JSX edits?
4. **Insertion/removal detection**: How does the browser determine where children can be added and which elements can be safely removed?
5. **Scope boundaries**: What is explicitly in scope for v1.5 vs. v2, and what is rejected?

---

## 2. Current State

### What's Built (Structural Readiness)

| Component | Status | Location | Structural Relevance |
|-----------|--------|----------|---------------------|
| `classifyElement()` | Implemented | `inspector.js:183` | Categorizes elements as `container`, `text`, `interactive`, etc. — directly maps to mode compatibility |
| `walkComponentChain()` | Implemented | `inspector.js:62` | Traverses React fiber owner chain — needed to identify parent component for structural edits |
| `resolveSource()` | Implemented | `inspector.js:125` | Resolves `testId` + component chain — provides targeting confidence for structural ops |
| `elementMap` | Implemented | `inspector.js:419` | Capped LRU map (50 entries) of `selectionId → DOM element` — needed for sibling enumeration |
| `AccumulatedDiff` | Designed | finalize-pipeline-spec §3.4 | Sidecar-to-Claude contract — needs extension for structural changes |
| `EditIntent` model | Designed | panel-feasibility §Round 3 | Includes `LayoutMoveIntent`, `VisibilityIntent` — precursors to structural intents |
| `findReactFiberKeys()` | Implemented | `inspector.js:46` | Finds `__reactFiber$` keys — entry point for fiber tree walking |
| `detectStyleOrigin()` | Implemented | `toolbar.js:114` | Traces style provenance via fiber chain — same fiber traversal pattern reusable for parent detection |

### The Gap

```
Existing (token editing)              Missing (structural editing)
─────────────────────────             ──────────────────────────
classifyElement → container           → child enumeration
walkComponentChain → parent chain     → insertion point detection
resolveSource → testId/component      → removability analysis
elementMap → element reference        → sibling/position tracking
AccumulatedDiff → style changes       → structural change format
```

What's missing:
- **No child enumeration**: No function walks a container's fiber children to list insertion points
- **No insertion point detection**: No algorithm determines valid positions for new components
- **No removability analysis**: No check determines if an element can be safely removed (event handlers, only-child, layout-critical)
- **No structural intent format**: `ChangeEntry` handles token changes; nothing handles add/remove/reorder

---

## 3. Mode System Architecture

### 3.1 editMode: A New Axis

The current inspector has two boolean state variables:

```javascript
// inspector.js (IIFE closure)
var active = false;     // inspector activated (hover highlights visible)
var selectMode = false; // click-to-select enabled
```

Structural editing introduces `editMode` as a **third axis**, orthogonal to both:

```typescript
type EditMode = 'style' | 'add' | 'delete' | 'reorder';
```

State space:

```
                 active=false         active=true
                 ────────────         ───────────
selectMode=false  Dormant              Browse (hover only)
selectMode=true   N/A                  Select+editMode
                                        ├─ style   (current behavior)
                                        ├─ add     (insertion targets)
                                        ├─ delete  (removable elements)
                                        └─ reorder (child positions)
```

### 3.2 Mode Set BEFORE Selection (Decision D4)

The user declares their intent **before** clicking an element. This is critical:

```
❌ Wrong: Click element → then pick "Add" → ambiguous (add what? where?)
✓ Right: Pick "Add" mode → click container → panel shows insertion points
```

Setting mode first enables **mode-specific hover visuals**:

| Mode | Hover Behavior | Cursor |
|------|---------------|--------|
| `style` | Blue highlight on any element (current) | crosshair |
| `add` | Green highlight on containers only; others dim | plus |
| `delete` | Red highlight on removable elements; blocked elements show ✕ | not-allowed / pointer |
| `reorder` | Yellow highlight on container children; parent outlined | grab |

### 3.3 Element Category → Mode Compatibility

Not every element supports every mode. The existing `classifyElement()` output (inspector.js:183) maps directly:

| Element Category | Style | Add | Delete | Reorder |
|-----------------|-------|-----|--------|---------|
| `container` (Card, Paper, Box, Group, Stack, Flex, Grid) | ✓ | ✓ | warn | ✓ |
| `text` (Text, Title, Heading, p, span) | ✓ | ✗ | ✓ | ✗ |
| `interactive` (Button, ActionIcon, Menu, a) | ✓ | ✗ | ✓ | ✗ |
| `input` (TextInput, Select, Textarea) | ✓ | ✗ | ✓ | ✗ |
| `icon` (Icon*, svg, path) | ✓ | ✗ | ✓ | ✗ |
| `layout` (AppShell, Navbar, Header, Footer, nav, main) | ✓ | ✓ | warn | warn |
| `feedback` (Badge, Alert, Notification) | ✓ | ✗ | ✓ | ✗ |
| `unknown` | ✓ | ✗ | warn | ✗ |

Legend:
- ✓ = supported
- ✗ = not shown as target in this mode
- warn = allowed with confirmation dialog ("This is a layout element. Removing it may break page structure.")

### 3.4 PostMessage Types

Extending the existing message handler dispatch table (inspector.js:644):

```typescript
// Panel → Inspector (new messages)
'inspector:set-edit-mode'     // { mode: EditMode }
'inspector:enumerate-children' // { elementId: number }

// Inspector → Panel (new messages)
'zerofog:container-selected'  // { ...selection, children: ChildInfo[], insertionPoints: InsertionPoint[] }
'zerofog:delete-target'       // { ...selection, removability: RemovabilityResult }
'zerofog:reorder-state'       // { ...selection, children: ChildInfo[], currentOrder: number[] }
'zerofog:mode-incompatible'   // { elementCategory: string, editMode: EditMode, reason: string }
```

### 3.5 Implementation: IIFE State Extension

```javascript
// Inside inspector.js IIFE (additions to existing closure vars)
var editMode = 'style'; // new axis

// Expose on namespace
window.__ZEROFOG__.editMode = editMode;

// Add to message handler dispatch table
messageHandlers['inspector:set-edit-mode'] = function (payload) {
  if (!payload || !payload.mode) return;
  var validModes = ['style', 'add', 'delete', 'reorder'];
  if (validModes.indexOf(payload.mode) === -1) return;
  editMode = payload.mode;
  window.__ZEROFOG__.editMode = editMode;
  // Reset hover state for new mode visuals
  lastHoverTarget = null;
  if (overlay) overlay.style.display = 'none';
  if (labelEl) labelEl.style.display = 'none';
};
```

---

## 4. Structural Intent Types

### 4.1 Reconciling Existing Formats

Three formats currently describe edit operations in this codebase:

| Format | Source | Strengths | Gaps for Structural Ops |
|--------|--------|-----------|------------------------|
| `EditIntent` model | panel-feasibility §Round 3 | Discriminated union, covers 5 tiers, has `LayoutMoveIntent` | Designed for Point+Prompt; no insertion point data |
| Task 6 format | post-strategic-review (referenced) | Addresses structural changes to layout | Not formally specified as TypeScript |
| `AccumulatedDiff` | finalize-pipeline-spec §3.4 | Production contract, WAL-persisted, schema-versioned | Only handles `ChangeEntry[]` (token changes) |

**Decision D3**: Define a `StructuralIntent` discriminated union that complements (not replaces) the existing `ChangeEntry` type. Intents are declarative data describing *what* the user wants; Claude determines *how* to implement it.

### 4.2 StructuralTarget

Every structural intent needs to identify the element being acted upon:

```typescript
/** Target identification for structural operations.
 *  Extends the existing resolveSource() output with confidence metadata. */
interface StructuralTarget {
  /** CSS selector — data-testid preferred, cortex-id fallback */
  selector: string;
  /** React component names from fiber chain (innermost first) */
  componentChain: string[];
  /** Element category from classifyElement() */
  elementType: 'container' | 'text' | 'interactive' | 'input' | 'icon' | 'layout' | 'feedback' | 'unknown';
  /** True if React fiber was found on the DOM element */
  hasClientFiber: boolean;
  /** data-testid value if present (null otherwise) */
  testId: string | null;
}
```

### 4.3 ChildInfo

Information about a container's children, derived from fiber tree enumeration:

```typescript
/** A child element within a container, as seen from the React fiber tree. */
interface ChildInfo {
  /** Position index among siblings (0-based) */
  index: number;
  /** React component name (null for host elements like <div>) */
  componentName: string | null;
  /** HTML tag name */
  tagName: string;
  /** Element category from classifyElement() */
  elementType: string;
  /** data-testid if present */
  testId: string | null;
  /** Truncated text content (first 60 chars) */
  textPreview: string;
  /** Whether this child is dynamically rendered (e.g., inside .map()) */
  isDynamic: boolean;
}
```

### 4.4 StructuralIntent Discriminated Union

```typescript
/** Discriminated union for structural editing intents. */
type StructuralIntent = AddIntent | RemoveIntent | ReorderIntent;

/** Intent to insert a new component into a container. */
interface AddIntent {
  readonly type: 'add';
  /** Container receiving the new child */
  parent: StructuralTarget;
  /** Position among existing children (0 = first child, n = after nth child) */
  insertionIndex: number;
  /** Component to insert (user-selected from picker) */
  componentName: string;
  /** Package providing the component (e.g., '@mantine/core') */
  packageName: string | null;
  /** Default props to apply (from component defaults or user selection) */
  defaultProps: Record<string, unknown>;
  /** Children already in the container, for positional context */
  siblingContext: ChildInfo[];
}

/** Intent to remove an element from its parent. */
interface RemoveIntent {
  readonly type: 'remove';
  /** Element to remove */
  target: StructuralTarget;
  /** Parent container (for Claude to locate the JSX) */
  parent: StructuralTarget;
  /** Index of this child in parent's children */
  childIndex: number;
  /** Removability analysis result */
  removability: RemovabilityResult;
}

/** Intent to reorder children within a container. */
interface ReorderIntent {
  readonly type: 'reorder';
  /** Container whose children are reordered */
  parent: StructuralTarget;
  /** Child being moved */
  target: StructuralTarget;
  /** Original position index */
  fromIndex: number;
  /** New position index */
  toIndex: number;
  /** Full children list for context */
  children: ChildInfo[];
}
```

### 4.5 Confidence Gating (Decision D5)

Structural operations are higher-risk than token changes — inserting a component in the wrong place is harder to recover from than setting the wrong padding value.

**Rule**: Structural intents require `medium` or higher confidence:

| Confidence Level | Criteria | Token Changes | Structural Changes |
|-----------------|----------|---------------|-------------------|
| `high` | `data-testid` present on target | ✓ allowed | ✓ allowed |
| `medium` | Unique component name in chain (no testId) | ✓ allowed | ✓ allowed |
| `low` | DOM heuristic only (no fiber, no testId) | ✓ allowed | ✗ blocked |

When confidence is `low`, the panel shows: "Cannot perform structural edits — this element couldn't be reliably identified. Add a `data-testid` or ensure React DevTools access."

### 4.6 Dynamic Children Detection

Children rendered via `.map()` or dynamic expressions need special handling:

```typescript
/** Flag on ChildInfo indicating dynamic rendering */
isDynamic: boolean;
```

**Detection heuristic** (Decision D7): A child group is likely dynamic when:
1. Multiple consecutive siblings have the same component type (e.g., 5 `<Card>` children)
2. Parent fiber has a Fragment child (tag 7) wrapping multiple same-type children
3. Children have sequential or array-derived keys (`key="item-0"`, `key="item-1"`)

**Behavior**: Dynamic children are detected and reported but NOT automatically edited (Decision D7). The panel shows: "These children appear to be rendered from data. To add/remove items, modify the data source." This prevents Claude from trying to manually duplicate JSX for what should be a data operation.

---

## 5. Insertion Point Detection

### 5.1 Fiber Child Enumeration Algorithm

React fibers form a linked-list tree: each fiber has a `.child` (first child) and `.sibling` (next sibling) pointer. This is the fundamental data structure for enumerating a container's children.

```typescript
/**
 * Walk a fiber's child → sibling chain to enumerate direct children.
 * Skips React internal wrappers (Fragment, Context providers).
 *
 * @param containerFiber - Fiber of the container element
 * @returns Array of ChildInfo objects representing visible children
 */
function enumerateFiberChildren(containerFiber: Fiber): ChildInfo[] {
  const children: ChildInfo[] = [];
  if (!containerFiber || !containerFiber.child) return children;

  let current: Fiber | null = containerFiber.child;
  let index = 0;
  const MAX_CHILDREN = 100; // safety cap

  while (current && index < MAX_CHILDREN) {
    // Skip React internals (§5.2)
    if (shouldSkipFiber(current)) {
      // Descend into the wrapper's children instead
      if (current.child) {
        current = current.child;
        continue;
      }
      current = current.sibling;
      continue;
    }

    const componentName = getComponentName(current);
    const tagName = current.stateNode?.tagName || 'unknown';
    const testId = current.stateNode?.getAttribute?.('data-testid') || null;
    const textContent = (current.stateNode?.textContent || '').substring(0, 60);

    children.push({
      index,
      componentName,
      tagName,
      elementType: classifyElement(
        componentName ? [componentName] : [],
        tagName
      ),
      testId,
      textPreview: textContent,
      isDynamic: false, // set in post-processing pass (§4.6)
    });

    index++;
    current = current.sibling;
  }

  // Post-process: detect dynamic children
  markDynamicChildren(children);

  return children;
}
```

### 5.2 Fragment/Provider Skipping

React's fiber tree includes internal nodes that don't correspond to visible DOM elements. These must be skipped during child enumeration:

```typescript
/**
 * Fiber tags that represent internal React wrappers, not user components.
 * These should be skipped (descended into) during child enumeration.
 */
const SKIP_FIBER_TAGS = {
  7: 'Fragment',           // React.Fragment / <>...</>
  10: 'ContextProvider',   // Context.Provider wrapper
  9: 'ContextConsumer',    // Context.Consumer wrapper
  6: 'HostPortal',         // ReactDOM.createPortal
};

function shouldSkipFiber(fiber: Fiber): boolean {
  // Skip Fragment and Context providers — they're structural, not visual
  if (SKIP_FIBER_TAGS[fiber.tag]) return true;

  // Skip Suspense boundaries (tag 13) — show the resolved child
  if (fiber.tag === 13) return true;

  return false;
}
```

**Why not skip ForwardRef (tag 11) and Memo (tag 14)?** Unlike Fragment/Context, these wrap real components that the user can see and interact with. A `memo(Card)` should appear as a `Card` child, not be skipped.

### 5.3 Dynamic Children Detection Heuristic

```typescript
/**
 * Post-process a children array to detect likely dynamic rendering.
 * Marks children as isDynamic when they appear to come from .map() or similar.
 */
function markDynamicChildren(children: ChildInfo[]): void {
  if (children.length < 2) return;

  // Group consecutive children by component name
  let groupStart = 0;
  for (let i = 1; i <= children.length; i++) {
    const sameType = i < children.length &&
      children[i].componentName === children[groupStart].componentName &&
      children[i].componentName !== null;

    if (!sameType) {
      // End of group — if 3+ consecutive same-type children, mark as dynamic
      if (i - groupStart >= 3) {
        for (let j = groupStart; j < i; j++) {
          children[j].isDynamic = true;
        }
      }
      groupStart = i;
    }
  }
}
```

### 5.4 Drop Zone Rendering

When `editMode === 'add'` and a container is selected, the browser renders visual drop zones between children:

```
┌─ Container (Stack) ─────────────────┐
│  ┄┄┄ [+ Insert here] ┄┄┄           │  ← insertionIndex: 0
│  ┌─ Card "Dashboard" ─────────┐    │
│  └─────────────────────────────┘    │
│  ┄┄┄ [+ Insert here] ┄┄┄           │  ← insertionIndex: 1
│  ┌─ Card "Analytics" ─────────┐    │
│  └─────────────────────────────┘    │
│  ┄┄┄ [+ Insert here] ┄┄┄           │  ← insertionIndex: 2
└──────────────────────────────────────┘
```

Drop zone orientation is **layout-aware**:

| Parent CSS `display` | Drop Zone Orientation | Visual |
|---------------------|----------------------|--------|
| `flex` + `flex-direction: column` (or Stack) | Horizontal bars between children | `┄┄┄` |
| `flex` + `flex-direction: row` (or Group) | Vertical bars between children | `┊` |
| `grid` | Grid-cell placeholders | `□` |
| `block` / other | Horizontal bars (default) | `┄┄┄` |

Drop zones are rendered as DOM elements injected into the container, styled with `pointer-events: auto` (so they're clickable) and `position: relative` (so they don't break layout). They use `data-zerofog-ui="true"` to be excluded from inspector hover/click (same guard as existing overlays, inspector.js:544).

### 5.5 Component Picker UX

After clicking a drop zone (insertion point selected), the panel shows a component picker:

```
┌─ Add Component ──────────────────────┐
│                                      │
│  From this project:                  │
│  [Card] [Badge] [Alert] [Button]     │
│                                      │
│  From @mantine/core:                 │
│  [Text] [Title] [Stack] [Group]      │
│  [Paper] [Flex] [SimpleGrid]         │
│                                      │
│  Custom: [________________] [Add]    │
│                                      │
└──────────────────────────────────────┘
```

**Same-package suggestions**: The picker prioritizes components from the same package as the parent container and its existing children. If the container is a Mantine `Stack` containing Mantine `Card` components, Mantine components are suggested first.

The picker is a panel-side UI element (not injected into the app iframe). Selection produces the `AddIntent` with `componentName` and `packageName`.

---

## 6. Removability Analysis

### 6.1 Analysis Rules

When `editMode === 'delete'` and the user hovers/clicks an element, the inspector runs a removability analysis:

```typescript
interface RemovabilityResult {
  /** Whether the element can be removed */
  removable: boolean;
  /** Confidence in the assessment */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable explanation */
  reason: string;
  /** Warning shown even when removable=true (e.g., "only child") */
  warning: string | null;
}
```

### 6.2 Decision Table

| Condition | Result | Reason |
|-----------|--------|--------|
| No parent fiber found | `removable: false` | "Cannot identify parent component — element may be a root" |
| Component from `node_modules` | `removable: false` | "Library component — edit the parent that renders it instead" |
| Root-level component (no owner) | `removable: false` | "Root component cannot be removed" |
| Layout element (AppShell, Navbar, etc.) | `removable: true, warning` | "Layout element — removing may break page structure" |
| Only child of parent | `removable: true, warning` | "Only child — parent will be empty after removal" |
| Has event handlers (onClick, onSubmit, etc.) | `removable: true, warning` | "Has event handlers — associated behavior will be lost" |
| Standard leaf element | `removable: true` | "Safe to remove" |

### 6.3 Implementation

```typescript
function analyzeRemovability(
  element: Element,
  fiber: Fiber | null
): RemovabilityResult {
  // Hard blocks
  if (!fiber || !fiber.return) {
    return {
      removable: false,
      confidence: 'low',
      reason: 'Cannot identify parent component — element may be a root',
      warning: null,
    };
  }

  // Check if component is from node_modules
  const debugSource = fiber._debugSource;
  if (debugSource && debugSource.fileName &&
      debugSource.fileName.includes('node_modules')) {
    return {
      removable: false,
      confidence: 'high',
      reason: 'Library component — edit the parent that renders it instead',
      warning: null,
    };
  }

  // Check for root-level (no owner component)
  const chain = walkComponentChain(fiber);
  if (chain.length <= 1) {
    return {
      removable: false,
      confidence: 'medium',
      reason: 'Root component cannot be removed',
      warning: null,
    };
  }

  // Warnings (removable but risky)
  const warnings: string[] = [];

  // Layout element check
  const elementType = classifyElement(chain, element.tagName);
  if (elementType === 'layout') {
    warnings.push('Layout element — removing may break page structure');
  }

  // Only child check
  const parentFiber = fiber.return;
  if (parentFiber && !fiber.sibling && parentFiber.child === fiber) {
    warnings.push('Only child — parent will be empty after removal');
  }

  // Event handler check
  const props = fiber.memoizedProps || {};
  const handlerKeys = Object.keys(props).filter(k => /^on[A-Z]/.test(k));
  if (handlerKeys.length > 0) {
    warnings.push('Has event handlers (' + handlerKeys.join(', ') + ') — associated behavior will be lost');
  }

  return {
    removable: true,
    confidence: fiber._debugSource ? 'high' : 'medium',
    reason: warnings.length > 0 ? warnings[0] : 'Safe to remove',
    warning: warnings.length > 0 ? warnings.join('; ') : null,
  };
}
```

---

## 7. Claude Edit Strategy Extensions

### 7.1 AccumulatedDiff v2 (Decision D2)

Extend the existing `AccumulatedDiff` (finalize-pipeline-spec §3.4) to carry structural changes alongside token changes. Backward compatible — `structuralChanges` is optional:

```typescript
/** AccumulatedDiff v2 — extends v1 with structural changes.
 *  v1 consumers that don't understand structuralChanges simply ignore it. */
interface AccumulatedDiff {
  version: 2;                          // bumped from 1
  sessionId: string;
  elements: ElementDiff[];             // token changes (unchanged)
  structuralChanges?: StructuralChange[];  // NEW: structural intents
  metadata: {
    createdAt: string;
    updatedAt: string;
    totalChanges: number;              // includes both token + structural
    totalStructuralChanges: number;    // NEW: structural-only count
  };
}

/** A structural change within the aggregate diff. */
interface StructuralChange {
  intent: StructuralIntent;            // AddIntent | RemoveIntent | ReorderIntent
  confidence: 'high' | 'medium';      // low confidence is blocked at capture time
  timestamp: string;                   // ISO-8601 UTC
}
```

**Why extend, not separate (Decision D2)**: One contract, one WAL file, one finalize endpoint. A separate `StructuralDiff` would require a second state machine, a second WAL, and a second `/api/diff/claim` endpoint — all for data that flows through the same pipeline.

### 7.2 Claude Edit Strategies for Structural Operations

#### Add Strategy

**Key insight (Decision D9)**: Structural edits target the **parent file** (where JSX composition happens), not the child's definition file.

```
User intent:  "Add a Card after the second child in this Stack"
Target file:  The file containing <Stack>...<Card/>...[INSERT HERE]...</Stack>
NOT:          The file defining function Card() { ... }
```

**Steps:**

1. **Resolve parent file**: Use `parent.componentChain[0]` to grep for the parent component definition. If the parent is a page-level component (e.g., `Dashboard`), look for the file exporting that component.

2. **Locate insertion point in JSX**: Find the JSX return statement. Count children to find position `insertionIndex`. Account for:
   - Fragment wrappers (`<>...</>`) — look inside
   - Conditional rendering (`{show && <Card/>}`) — count only the static positions
   - Mapped children (`{items.map(...)}`) — treat the entire `.map()` expression as one child

3. **Insert JSX**: Add the new component at the target position:
   ```tsx
   // insertionIndex: 1, componentName: 'Card', packageName: '@mantine/core'
   // Before
   <Stack>
     <Card>Dashboard</Card>
     <Card>Analytics</Card>
   </Stack>

   // After
   <Stack>
     <Card>Dashboard</Card>
     <Card></Card>           {/* ← inserted */}
     <Card>Analytics</Card>
   </Stack>
   ```

4. **Manage imports**: Check if the component is already imported. If not, add the import:
   ```tsx
   // If Card is not yet imported:
   import { Card } from '@mantine/core';
   ```
   Respect existing import style (named vs. default, single-line vs. multi-line).

#### Remove Strategy

1. **Resolve parent file**: Same as Add — the parent file contains the JSX composition.

2. **Locate target JSX**: Find the element at `childIndex` in the parent's JSX children. Verify against `target.componentChain[0]` and `target.testId` if available.

3. **Delete the JSX node**: Remove the entire JSX element and any associated conditional wrappers:
   ```tsx
   // Before
   <Stack>
     <Card>Dashboard</Card>
     <Badge>Beta</Badge>       {/* ← target for removal */}
     <Card>Analytics</Card>
   </Stack>

   // After
   <Stack>
     <Card>Dashboard</Card>
     <Card>Analytics</Card>
   </Stack>
   ```

4. **Clean imports**: If the removed component was the last usage in this file, remove its import statement. Use grep to confirm no other references exist in the same file before removing.

5. **Handle conditional wrappers**: If the element is wrapped in a condition (`{show && <Badge/>}`), remove the entire conditional expression, not just the inner JSX.

#### Reorder Strategy

Two sub-strategies based on whether children are static JSX or dynamically rendered:

**Static children (v1.5)**:
1. Resolve parent file
2. Locate the child at `fromIndex`
3. Move the JSX node to `toIndex` (cut + paste in the JSX return)
4. Preserve whitespace/formatting around moved elements

```tsx
// fromIndex: 0, toIndex: 2
// Before
<Stack>
  <Card>Dashboard</Card>     {/* move this */}
  <Card>Analytics</Card>
  <Card>Settings</Card>
</Stack>

// After
<Stack>
  <Card>Analytics</Card>
  <Card>Settings</Card>
  <Card>Dashboard</Card>     {/* moved here */}
</Stack>
```

**Dynamic children (v2 — Decision D7)**:
Dynamic children (rendered via `.map()`) cannot be reordered by moving JSX — the order comes from the data source. Claude reports: "These children are dynamically rendered from data. Reordering requires modifying the data source or adding a sort parameter."

---

## 8. Preview Strategy

Structural previews use different mechanisms than token previews (which use CSS overrides via the native rendering engine). Each structural operation type has a lightweight preview that doesn't require actual JSX transformation.

### 8.1 Add Preview

**Mechanism**: Inject a placeholder DOM element at the insertion point.

```html
<!-- Placeholder for "Add Card at position 1" -->
<div data-zerofog-ui="true"
     data-zerofog-placeholder="add"
     style="border: 2px dashed #22c55e;
            padding: 16px;
            text-align: center;
            color: #22c55e;
            font-family: monospace;
            font-size: 12px;
            opacity: 0.8;
            border-radius: 8px;
            margin: 4px 0;">
  + Card
</div>
```

**React interference**: React may remove manually injected DOM nodes on re-render. Use a `MutationObserver` on the parent container to re-inject the placeholder if React removes it:

```javascript
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const removed of mutation.removedNodes) {
      if (removed.dataset?.zerofogPlaceholder === 'add') {
        // Re-insert at the same position
        mutation.target.insertBefore(removed, mutation.nextSibling);
      }
    }
  }
});
observer.observe(parentElement, { childList: true });
```

### 8.2 Remove Preview

**Mechanism**: Use the existing CSS override sheet to apply visual treatment without DOM mutation.

```css
/* Remove preview — element fades and shows dashed outline */
[data-testid="badge-beta"] {
  opacity: 0.3 !important;
  outline: 2px dashed #ef4444 !important;
  outline-offset: -2px !important;
  pointer-events: none !important;
}
```

This leverages the existing `parseOverrideRules()` / `buildOverrideCSS()` infrastructure (inspector.js:283–360).

### 8.3 Reorder Preview

**Mechanism**: CSS `order` property for flex/grid containers; numbered overlay for block layout.

For flex/grid containers:
```css
/* Reorder preview — move first child to position 2 */
[data-testid="card-dashboard"] { order: 2 !important; }
[data-testid="card-analytics"] { order: 0 !important; }
[data-testid="card-settings"]  { order: 1 !important; }
```

For block layout (where CSS `order` doesn't apply):
```
┌─ Container ─────────────────────────────┐
│  ┌─ Card "Analytics" ──── ② ──────┐    │  ← position numbers overlay
│  └─────────────────────────────────┘    │
│  ┌─ Card "Settings" ───── ③ ──────┐    │
│  └─────────────────────────────────┘    │
│  ┌─ Card "Dashboard" ─── ① ──────┐    │  ← highlighted as "being moved"
│  └─────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

Position numbers are rendered as overlay badges (similar to the existing label element, inspector.js:496) positioned at the top-right corner of each child.

---

## 9. Pipeline Integration

### 9.1 Data Flow

```
Panel UI                    Inspector (iframe)           Sidecar                  Claude Code
────────                    ──────────────────           ───────                  ──────────
1. User sets editMode  ──► set-edit-mode msg  ──►  editMode = 'add'
2. User clicks element ──►                   ──►  enumerate children
                          ◄── container-selected   (fiber walk)
3. User picks insertion    (panel-side UI)
4. User picks component    (panel-side UI)
5. Panel builds intent     AddIntent object
6. Panel sends "finalize"  ──────────────────────► WS 'finalize'
                                                   ──► aggregate into
                                                       AccumulatedDiff v2
                                                       (structuralChanges[])
                                                   ──► persist to WAL
                                                   ──► stdout signal
7.                                                                          Claude claims diff
                                                   ◄── POST /api/diff/claim ◄──
                                                   ──► return AccumulatedDiff v2
8.                                                                          Claude resolves
                                                                            parent file via
                                                                            grep, reads JSX,
                                                                            inserts component
9.                                                                          Claude reports
                                                   ◄── POST /api/complete   ◄──
                                                   ──► forward to browser
                           ◄── WS 'edit-complete'
                           ◄── WS 'hmr-detected'
10. Clear previews         Remove placeholders,
                           clear CSS overrides
```

### 9.2 WebSocket Message: finalize with Structural Changes

The existing `finalize` WebSocket message (finalize-pipeline-spec §9.1) carries `DiffResult[]`. With structural editing, it also carries `StructuralIntent[]`:

```typescript
// Browser → Sidecar
{
  type: 'finalize',
  payload: {
    styleDiffs: DiffResult[],           // existing token changes
    structuralIntents: StructuralIntent[], // NEW: structural changes
  }
}
```

The sidecar aggregates both into `AccumulatedDiff v2`.

### 9.3 CompletionReport Extension

```typescript
/** Extended CompletionReport for v2 diffs. */
interface CompletionReport {
  applied: number[];                    // indices of applied token changes
  failed: FailedChange[];              // failed token changes
  structuralApplied: number[];         // NEW: indices of applied structural changes
  structuralFailed: StructuralFailedChange[];  // NEW
}

interface StructuralFailedChange {
  index: number;                        // index into AccumulatedDiff.structuralChanges
  reason: string;
  // Possible reasons:
  // - "Parent component not found in source"
  // - "Cannot determine insertion point — JSX structure too complex"
  // - "Component is from node_modules"
  // - "Dynamic children detected — reorder requires data source modification"
  // - "Low confidence targeting — add data-testid for reliable structural edits"
}
```

---

## 10. Scope Boundary Table

### In Scope — v1.5

| Feature | Description | Rationale |
|---------|-------------|-----------|
| Add (static insertion) | Insert a component at a specific position in a container | Core structural operation |
| Remove | Delete an element from its parent | Core structural operation |
| Insertion detection (static) | Enumerate static JSX children of a container | Required for Add |
| Removability analysis | Determine if an element can be safely removed | Required for Delete |
| Tree view | Panel displays container's children as a list | Required for position selection |
| Confidence gating | Block structural ops on low-confidence targets | Safety measure |
| Up/down reorder (Decision D8) | Move a child one position up or down via buttons | Simplest reorder UX |
| editMode axis | New mode enum alongside existing active/selectMode | Framework for all structural ops |
| AccumulatedDiff v2 | Backward-compatible extension with structuralChanges | Pipeline integration |
| Claude Add/Remove strategies | JSX insertion, deletion, import management | Code translation |

### In Scope — v2

| Feature | Description | Rationale |
|---------|-------------|-----------|
| Drag-to-reorder | Drag children to new positions within container | Better UX than up/down buttons |
| Dynamic children handling | Detect and report .map()-rendered content | Inform user about data-source edits |
| Cross-container reparenting | Move an element from one container to another | Advanced layout editing |
| Slot editing | Insert into named slots (e.g., AppShell header/footer) | Framework-specific feature |
| Multi-select structural | Select multiple elements for batch remove/reorder | Power user feature |

### Rejected (Not In Any Version)

| Feature | Reason |
|---------|--------|
| Component creation from scratch | "Design me a new Card component" is Point+Prompt territory (Tier 4/5 in the 5-tier taxonomy), not structural editing |
| Arbitrary prop editing | Changing `onClick` or `className` programmatically is too open-ended; error-prone and breaks the token-constrained philosophy |
| Component library browser | Loading all available components into a browser panel duplicates documentation and bloats the inspector; component picker is sufficient |
| Cross-file structural edits | Moving a component's definition from one file to another is refactoring, not visual editing |
| Template/snippet system | Pre-built component arrangements ("add a login form") are Claude prompt territory, not visual editor features |
| Undo stack for structural edits | Git stash (finalize-pipeline-spec §6.3) is sufficient; a custom undo system is over-engineering |

---

## 11. v1.5 vs v2 Phasing

### v1.5 — Foundation

Validates the structural editing pipeline end-to-end with the simplest possible interactions.

| Step | Deliverable | Depends On |
|------|-------------|------------|
| 1 | `editMode` enum + `inspector:set-edit-mode` message handler | — |
| 2 | `enumerateFiberChildren()` — walk child→sibling fiber chain | findReactFiberKeys (existing) |
| 3 | `shouldSkipFiber()` — Fragment/Context provider filtering | Step 2 |
| 4 | Insertion point detection — static children, drop zone rendering | Steps 2, 3 |
| 5 | `analyzeRemovability()` — rules engine for remove safety | walkComponentChain (existing) |
| 6 | `StructuralIntent` types — AddIntent, RemoveIntent, ReorderIntent | — |
| 7 | `AccumulatedDiff v2` — extend with `structuralChanges[]` | finalize-pipeline-spec (ZF0-860) |
| 8 | Claude Add strategy — resolve parent, insert JSX, manage imports | Steps 6, 7 |
| 9 | Claude Remove strategy — delete JSX, clean imports | Steps 6, 7 |
| 10 | Claude Reorder strategy — static JSX reorder (up/down) | Steps 6, 7 |
| 11 | Preview: Add placeholder, Remove opacity, Reorder CSS order | Steps 4, 5 |
| 12 | Tree view panel — list children with position controls | Step 2 |

**Exit criteria**: A user can select a Mantine Stack in the visual editor, insert a new Card at position 2, preview it, send to Claude, and see the real JSX update via HMR.

### v2 — Interaction

Builds on v1.5 foundation with richer interactions.

| Step | Deliverable | Depends On |
|------|-------------|------------|
| 1 | Drag-to-reorder — HTML5 drag/drop or pointer events on children | v1.5 complete |
| 2 | Dynamic children detection — .map() heuristic, user-facing warnings | v1.5 Step 2 |
| 3 | Cross-container reparenting — select source, select destination | v1.5 Steps 4, 8 |
| 4 | Slot editing — AppShell header/navbar/aside slot targeting | v1.5 Steps 2, 4 |
| 5 | Multi-select — Ctrl+Click for batch operations | v1.5 complete |

**Exit criteria**: A user can drag a Card from one Stack to another Stack, and Claude applies the cross-container JSX edit.

---

## 12. Decisions Log

| # | Decision | Rationale | Alternative Considered |
|---|----------|-----------|----------------------|
| D1 | `editMode` as separate axis from `selectMode` | Backward compatible; mode changes without re-selection; orthogonal concerns | Merge into single state enum — breaks existing active/selectMode consumers |
| D2 | Extend `AccumulatedDiff` (not separate `StructuralDiff`) | One contract, one WAL, one endpoint; version field handles evolution | Separate `StructuralDiff` — doubles the pipeline surface area |
| D3 | Intents are declarative data, not imperative commands | Claude determines HOW (which file, what JSX); browser captures WHAT (add Card at position 2) | Imperative commands ("insert `<Card/>` at line 42 of Dashboard.tsx") — browser doesn't know file paths or line numbers |
| D4 | `editMode` set BEFORE element selection | Prevents "what did you mean?" ambiguity; enables mode-specific hover visuals and target filtering | Mode set after selection — requires disambiguation step, no hover preview |
| D5 | Confidence gating: `medium+` for structural ops | Higher risk than token changes (inserting wrong component vs. wrong padding); low-confidence targeting makes structural edits fragile | Same confidence threshold as tokens — acceptable for CSS overrides but dangerous for JSX insertion |
| D6 | Fiber child enumeration (not DOM children) | React fiber tree reflects the component tree, not the rendered DOM; Fragments and Context providers are invisible in fiber children | `element.children` DOM traversal — misses component boundaries, includes non-React DOM nodes |
| D7 | Dynamic children detected but NOT auto-edited | `.map()` children come from data sources; Claude editing JSX to add a static element among mapped children is fragile and semantically wrong | Auto-insert among dynamic children — breaks data-driven rendering contract |
| D8 | Reorder via up/down buttons in v1.5, drag in v2 | Up/down buttons validate the reorder pipeline (parent file resolution, JSX node movement) without drag-drop complexity | Drag-to-reorder in v1.5 — significant frontend effort (drag preview, drop targets, scroll during drag) before validating the pipeline works |
| D9 | Resolve parent file (not child) for structural edits | Parent controls JSX composition — adding `<Card/>` means editing the file that contains `<Stack>...[here]...</Stack>`, not the file defining `function Card()` | Resolve child definition file — wrong target; you can't add a Card to a Stack by editing Card.tsx |

---

## 13. Open Questions

### Q1: Component Picker Source Data

Where does the component picker get its list of available components? Options:
- **Static list**: Hardcode Mantine components + project components discovered via glob at session start
- **Dynamic inference**: Scan the project's imports to build a component registry
- **Manual configuration**: User maintains a list in `.cortex/components.json`

**Recommendation**: Start with static Mantine list + grep-discovered project components. Defer dynamic inference to v2.

### Q2: Nested Container Selection

When a Card is inside a Stack which is inside a Grid, which container receives the Add operation? The immediate parent (Stack) or does the user need to explicitly select the target container?

**Recommendation**: Mode-aware hover should highlight the **nearest container ancestor** of the hovered element. Shift+Click could cycle through container ancestors (Stack → Grid → page root).

### Q3: Import Style Detection

When Claude adds an import for a new component, how should it determine the import style?
- Named import: `import { Card } from '@mantine/core'`
- Default import: `import Card from './Card'`
- Namespace import: `import * as Mantine from '@mantine/core'`
- Barrel re-export: `import { Card } from './components'`

**Recommendation**: Claude reads the existing imports in the file and matches the style. If the file already has `import { Stack, Group } from '@mantine/core'`, add `Card` to that import group.

### Q4: Structural Edit Ordering

When a finalization contains both token changes and structural changes, which should Claude apply first?

**Recommendation**: Structural changes first (they affect JSX structure which may invalidate line numbers), then token changes (they modify props/classes within existing elements).

### Q5: Slot Detection for Framework-Specific Containers

Mantine's AppShell has named slots (`navbar`, `header`, `aside`, `footer`). How does the fiber enumeration distinguish slots from regular children?

**Deferred to v2**: Slot detection requires framework-specific knowledge. For v1.5, AppShell children are enumerated like any container; slot-aware insertion is a v2 feature.

### Q6: Redo After Undo

If a user's structural edit is applied (Claude edits JSX), then the user runs `git stash pop` to undo, the browser still shows the preview. Should the panel detect the undo and restore the pre-finalization state?

**Recommendation**: After `git stash pop`, HMR will revert the page to the pre-edit state. The panel should detect HMR after a rollback and clear structural previews. The `edit-complete` → HMR → clear-preview flow handles this if the panel tracks whether the last HMR was forward (edit applied) or backward (undo).

### Q7: Concurrent Structural and Token Edits

Can a user make token edits (padding change) and structural edits (add a Card) in the same finalization batch?

**Recommendation**: Yes. `AccumulatedDiff v2` carries both `elements[]` (token) and `structuralChanges[]` (structural). Claude processes structural changes first (§Q4), then token changes. The panel should allow switching between `style` and `add`/`delete`/`reorder` modes freely within a session.

### Q8: Maximum Children for Enumeration

The `MAX_CHILDREN = 100` cap in `enumerateFiberChildren()` is arbitrary. What happens when a container has 200+ children (e.g., a virtualized list)?

**Recommendation**: For v1.5, cap at 100 and show "Showing first 100 of N children" in the tree view. Virtualized lists are inherently dynamic-children scenarios (rendered from data), so they should trigger the dynamic children warning rather than full enumeration.
