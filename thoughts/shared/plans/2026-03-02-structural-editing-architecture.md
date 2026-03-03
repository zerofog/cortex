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

---

## Architecture Review Findings (2026-03-02)

Review team: **frontend**, **security**, **mts**, **design**, **dx**, **distsys** (6 personas)
- **frontend**: DOM/iframe architecture, React fiber traversal, CSS override strategy, HMR lifecycle
- **security**: Threat modeling, WebSocket security, CSP, iframe sandbox, input validation
- **mts** (Member of Technical Staff): First-principles correctness, algorithm bugs, type system integrity
- **design**: Designer mental model, UX friction, preview fidelity, undo expectations
- **dx** (Developer Experience): Installation, naming, error messages, framework portability, accessibility
- **distsys** (Distributed Systems): Idempotency, claim fencing, crash recovery, WAL durability, ordering barriers

Mode: **both** (clink multi-model + native Claude agents = 12 parallel reviews)

### Cross-Reviewer Consensus

Issues independently flagged by 3+ reviewers — highest-confidence signals:

| Issue | Flagged By | Consensus Severity |
|---|---|---|
| MutationObserver re-insertion creates infinite loop with React reconciliation | Frontend-clink, MTS-native, DX-native, Distsys-native, Frontend-native (5) | CRITICAL |
| `enumerateFiberChildren` loses siblings after Fragment/wrapper descent | MTS-native, MTS-clink, Frontend-clink, Frontend-native (4) | CRITICAL |
| Position-based `insertionIndex`/`childIndex` fragile across batch operations | Distsys-clink, Distsys-native, MTS-clink, Frontend-native (4) | CRITICAL |
| Component picker severely underspecified (no search, preview, metadata) | Design-native, DX-native, MTS-native, Design-clink (4) | HIGH |
| CSS `order` reorder preview broken for non-flex/grid, misleading for block layout | MTS-native, DX-native, Distsys-native, Frontend-native (4) | HIGH |
| Dynamic children heuristic (3+ same-type) produces false positives on static layouts | MTS-native, Design-clink, MTS-clink, Distsys-native (4) | MEDIUM |
| `_debugSource` unreliable for node_modules detection in modern toolchains | Frontend-clink, MTS-native, Frontend-native (3) | CRITICAL |
| Claim fencing token not propagated to structural operations | Distsys-clink, Distsys-native, MTS-clink (3) | CRITICAL |
| Mode-before-selection inverts designer mental model (object-first, then verb) | Design-native, DX-native, Design-clink (split opinion) | HIGH |
| No keyboard shortcuts or accessibility for mode switching | Design-native, DX-native, Frontend-native (3) | MEDIUM |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1.5

**C1. MutationObserver re-insertion creates infinite loop** (5 reviewers)
- **Spec §8.1**: Proposes re-injecting placeholder DOM nodes via `MutationObserver` when React removes them. React's reconciliation fights back, creating a mutation storm (remove→reinsert→React removes→reinsert). `mutation.nextSibling` is stale by callback time (microtask-batched). In concurrent mode, this corrupts the fiber tree. The `insertBefore` call triggers the observer again, and positional re-insertion becomes nondeterministic with batched mutation records.
- **Fix**: Abandon DOM injection for add previews. Use portal-based overlay approach: absolutely-positioned overlay elements with `data-zerofog-ui="true"`, positioned via `getBoundingClientRect` of the adjacent sibling, outside React's managed subtree. This matches the existing hover highlight pattern (inspector.js:476-515).

**C2. `enumerateFiberChildren` loses siblings after Fragment descent** (4 reviewers)
- **Spec §5.1**: The pseudocode descends into Fragment's `.child` but loses the Fragment's `.sibling` pointer. In a tree like `[Card, Fragment[A, B], Badge]`, after visiting A and B, Badge is never visited. Additionally, Portal fibers (tag 6) are skipped and descended into, but Portal children render to a *different DOM node* — causing incorrect insertion indices for containers with modals/tooltips.
- **Fix**: Use explicit stack-based DFS: `push current.sibling before descending current.child`. For Portals, include as a counted leaf with `isPortal: true` flag but do NOT descend. For Suspense (tag 13), check `fiber.memoizedState` — if non-null, boundary shows fallback; skip enumeration with "Loading content" message.

**C3. `_debugSource` unreliable for node_modules detection** (3 reviewers)
- **Spec §6**: `analyzeRemovability()` depends on `fiber._debugSource.fileName.includes('node_modules')` to block deletion of library components. `_debugSource` is stripped in production, absent in React 19 with Vite+SWC (the dominant toolchain), and not part of any public API. Users will be offered "safe to remove" on framework-critical components (`<NavLink>`, `<AppShell>`).
- **Fix**: Replace with component name registry + `fiber.return` ascent strategy. Match component names against known library component lists. Fall back to checking the import graph, not fiber metadata.

**C4. Position-based indices fragile across batch operations** (4 reviewers)
- **Spec §4, §7**: `insertionIndex`, `childIndex`, `fromIndex`, `toIndex` are positional integers that shift when earlier structural edits in the same batch modify the same container. Double-applied `AddIntent` inserts duplicate components; removing by index after an insertion targets the wrong sibling. Retry/recovery can double-apply or mis-apply when array order changes.
- **Fix**: For v1.5, enforce one structural edit per container per batch. Add immutable `opId` (UUID) per structural change for idempotent replay. For v2, use anchor-based references ("after component with key X") and maintain dedupe log keyed by `(sessionId, opId)`.

**C5. Claim fencing token not propagated to structural operations** (3 reviewers)
- **Spec §9**: The finalize-pipeline spec defines a claim fencing token pattern (`POST /api/diff/claim → {claimToken, leaseUntil, epoch}`), but the structural editing spec shows the old pattern without fencing. Concurrent Claude actors can race `POST /api/complete`; split-brain completion is possible because `CompletionReport` has no claim-bound token.
- **Fix**: Require `{claimToken, epoch}` on complete; reject stale epochs (fencing token pattern). Add `intentId` UUIDs for structural operations with partial completion journaling.

**C6. No in-product undo for structural edits** (2 reviewers, both CRITICAL)
- **Spec §10 (rejected)**: The spec explicitly rejects "Undo stack for structural edits" and relies on `git stash pop`. Designers expect Cmd+Z; requiring git fluency for rollback is trust-destroying for the target audience. State can desync between browser preview and git state.
- **Fix**: Add in-product structural undo/redo (session stack + one-click revert button). Keep git as deep fallback. The preview state already captures enough to restore pre-edit state.

**C7. React 19 fiber traversal fundamentally incomplete** (2 reviewers)
- **inspector.js:62-95, Spec §5.1**: Strategy B for React 19 uses `fiber.return` traversal with tag filter `[0, 1]`, making ForwardRef-wrapped components (tag 11 — used by every Mantine `Button`, `ActionIcon`, `Paper`, etc.) invisible. Component chains will be empty/truncated on React 19 / Next.js 15+, collapsing confidence to `low` and gating out all structural operations.
- **Fix**: Expand tag filter to `[0, 1, 11, 14, 15]` (matching `detectStyleOrigin` in toolbar.js:146). For ForwardRef fibers, resolve name via `fiber.type.render.displayName`. Investigate `_debugStack` / React DevTools global hook as alternative owner source.

#### HIGH — Should fix in v1.5

**H1. `data-cortex-id` selectors don't survive React reconciliation or HMR** (Frontend-native)
- **inspector.js:747-766, Spec §4.2**: `data-cortex-id` is assigned directly to DOM elements but not in the React VDOM. Reconciliation, HMR, and Suspense boundary resolution destroy/recreate DOM nodes without this attribute. `elementMap` accumulates stale references. The structural spec uses this selector as primary identifier sent to Claude.
- **Fix**: Use component chain + child index as composite key. For structural edits, require `data-testid` (gate on `high` confidence). For CSS overrides, re-apply attribute via `MutationObserver` after React commits, or use inline `style.setProperty()`.

**H2. CSWSH — WebSocket accepts connections without Origin header** (2 security reviewers)
- **server.ts:438-441**: Origin header is optional in WebSocket upgrade requests. If omitted, the connection is allowed. A malicious webpage can connect to `ws://localhost:3100/__zerofog` without Origin.
- **Fix**: `if (!origin || !isLoopbackOrigin(origin)) { socket.destroy(); return; }` — one-line fix.

**H3. Session ID leakage via unauthenticated GET endpoints** (2 security reviewers)
- **server.ts:179-182**: Session ID embedded in all client scripts served via GET with no authentication. Any localhost process can extract the sole authentication credential.
- **Fix**: Deliver session ID via one-time handshake (HttpOnly cookie or short-lived token endpoint requiring `Sec-Fetch-Site: same-origin`).

**H4. Mode-before-selection inverts designer mental model** (3 reviewers, split opinion)
- **Spec §3, Decision D4**: Designers think object-first then verb-second: select a Card, then decide to delete it. The spec forces mode selection first. Design-clink considered this a "strong interaction foundation" for power users, while Design-native and DX-native flagged it as friction.
- **Fix**: Support both flows. Default to select-then-act (right-click context menu or action panel after selection). Keep mode-first as power-user shortcut.

**H5. CSS override selectors break with CSS-in-JS, CSS Modules, and Tailwind** (Frontend-native)
- **inspector.js:283-360, Spec §8.2**: CSS Module hashes change per build/HMR. CSS-in-JS generates runtime-unique class names. Tailwind utility classes match too broadly. The `!important` specificity war is unpredictable.
- **Fix**: For previews, use `element.style.setProperty(prop, value, 'important')` directly (highest specificity, no selector needed). For persistent overrides, use `data-cortex-id` with reconciliation-aware re-application.

**H6. Parent file resolution via `componentChain[0]` + grep is not robust** (MTS-clink)
- **Spec §7.1-7.2**: Ambiguous component names, HOCs, default exports, and repeated names across files can lead to wrong-file edits. Structural edits target the parent file (where composition happens), but grep-based resolution is fragile.
- **Fix**: Resolve via ownership/import graph and source provenance. If >1 candidate, block and ask user for disambiguation.

**H7. `AccumulatedDiff v2` backward compatibility claim is inaccurate** (MTS-clink, Distsys-native)
- **Spec §7, §9**: Hard `version: 2` bump is a breaking change. Strict v1 consumers will fail parse on version mismatch, even though `structuralChanges` is structurally optional.
- **Fix**: Retain `version: 1` with additive optional fields (true backward compatibility), or specify explicit dual-parser compatibility mode.

**H8. Crash mid-processing recovery undefined for structural edits** (Distsys-clink, Distsys-native)
- **Spec §9**: If Claude crashes after writing some files but before `POST /api/complete`, replay behavior is undefined and can duplicate mutations. WAL durability/integrity mechanics (fsync, checksums) are not specified.
- **Fix**: Persist per-op apply checkpoints. Use atomic write protocol (`write temp → fsync → rename → fsync dir`). Add `baseRevision` for source file precondition checks.

**H9. Cross-origin iframe restrictions block OAuth and SameSite cookies** (Frontend-native)
- **server.ts:251-264**: OAuth flows redirect iframe to third-party origins, breaking postMessage bridge. Cookies with `SameSite=Strict` won't be sent cross-port (Safari treats ports as different sites). Service Workers can bypass proxy entirely.
- **Fix**: Detect navigation away from proxied origin and show "return to app" overlay. Rewrite `Set-Cookie` headers. Unregister Service Workers on first load.

**H10. `stateNode` assumptions break for function components** (MTS-native)
- **Spec §5.1**: The spec assumes fiber `stateNode` consistently points to DOM elements, but for function components (tag 0) `stateNode` is null, and for class components (tag 1) it's the class instance, not the DOM node.
- **Fix**: Walk down from the fiber to the first `HostComponent` descendant (tag 5) to find the actual DOM element.

#### MEDIUM

- Dynamic children heuristic (3+ consecutive same-type siblings) produces false positives on static dashboard layouts with repeated Cards (4 reviewers). **Fix**: require composite evidence (key pattern + Fragment/`.map()` signal + runtime key analysis).
- Component picker has no search, preview, variant metadata, or empty state (4 reviewers). **Fix**: add metadata-backed picker with `variant`, `size`, required props, allowed parent/slot, and tokenized defaults.
- CSS `order` reorder preview incorrect for `display: block` or non-flex/grid containers; accessibility misleading (tab/screen reader order unchanged) (4 reviewers). **Fix**: for block layout, use `display: flex; flex-direction: column; order: N` as preview, or use `position: absolute` repositioning.
- No keyboard shortcuts or accessibility for mode switching (3 reviewers). **Fix**: define keyboard shortcuts (e.g., `1`=Style, `2`=Add, `3`=Delete, `4`=Reorder) and ARIA labels.
- Error messages and confidence gating messages written for developers, not designers (2 reviewers). **Fix**: rewrite all user-facing copy from designer perspective; replace "ensure React DevTools access" with actionable guidance.
- CSP weakening enables XSS amplification — strips `frame-ancestors`, replaces `'none'` with `'self'`, no nonce for injected scripts (2 security reviewers). **Fix**: generate per-request nonce, add to both rewritten CSP and injected `<script>` tags.
- `iframe sandbox="allow-same-origin allow-scripts"` is equivalent to no sandbox since iframe content is same-origin as shell (2 security reviewers). **Fix**: serve inspector via different origin or document as accepted dev-only risk.
- No rate limiting or size validation on WebSocket messages (2 security reviewers). **Fix**: add per-connection rate limiter (100 msg/s), message type allowlist, payload schema validation.
- No input validation on `componentName` in structural intents — could trick Claude into injecting arbitrary imports/JSX (2 security reviewers). **Fix**: validate `componentName` matches `^[A-Z][A-Za-z0-9_.]*$`, validate `packageName` against `^@?[a-z0-9][-a-z0-9./]*$`.
- Split-brain naming: `zerofog` vs `cortex` vs `inspector` used simultaneously across attributes, namespaces, message prefixes, API paths (DX-native). **Fix**: unify naming convention.
- `editMode` as third axis creates 16 possible states; spec only defines behavior for a subset; stale DOM artifacts may persist across mode switches (MTS-native). **Fix**: enumerate all state combinations and define behavior or explicitly mark invalid.
- Remove strategy can over-delete by dropping conditional wrappers (`{cond && <X/>}`) (MTS-clink). **Fix**: AST transform should remove only target branch when safe; fail with actionable error otherwise.
- No progress indication during 5-30s structural edit pipeline (DX-native). **Fix**: define progress states and corresponding UI indicators.
- `elementType` field name collision between `StructuralTarget` (union type) and `ChildInfo` (plain string) (DX-native). **Fix**: rename one to avoid semantic confusion.
- No installation or first-run path defined anywhere in the spec (DX-native, DX-clink). **Fix**: define one-command flow (e.g., `npx cortex dev`).
- Hardcoded Mantine component names in `classifyElement` make the tool framework-specific without acknowledging the limitation (Frontend-native). **Fix**: make classification configurable via `.cortex/components.json` with Mantine defaults.
- Memory leak via `elementMap` holding references to detached DOM nodes; `pruneDetachedElements` only runs on navigation (Frontend-native). **Fix**: run pruning on debounced `MutationObserver` or use `WeakRef` for map values.
- Prototype pollution defense incomplete — inconsistent `Object.create(null)` usage (2 security reviewers). **Fix**: use `Object.create(null)` consistently for all objects built from external data.
- `pushState` monkey-patching race with framework routers after HMR (Frontend-native). **Fix**: use Navigation API where available; fall back to polling `location.href`.

#### LOW

- `escapeAttrValue` missing null byte and control character filtering (2 reviewers). **Fix**: add `val.replace(/[\x00-\x1f]/g, '')`.
- `elementMap` exposed as mutable reference on global `window.__ZEROFOG__` object (Security-native). **Fix**: use `WeakMap` or `Object.freeze`.
- Persistent `history.pushState` monkey-patching not restored on teardown (Security-native). **Fix**: accept as documented trade-off or use `Proxy`.
- `parseDeclarations` breaks on CSS values containing semicolons (e.g., `content: "a;b"`, data URIs) (Frontend-native). **Fix**: use browser's built-in `CSSStyleDeclaration` parser.
- Service Worker interception can bypass the sidecar proxy entirely (Frontend-native). **Fix**: inject SW unregistration script on first load.
- Preact/non-React compatibility: `__reactFiber$` key is React-specific (Frontend-native). **Fix**: add `findPreactInternalKeys` fallback.
- Module Federation / micro-frontend React instances create multiple fiber trees; first `__reactFiber$` key may be wrong (Frontend-native). **Fix**: validate each key with `element[key].stateNode === element`.
- Shell `path` parameter doesn't sanitize `data:` or `blob:` URIs (Security-native). **Fix**: add explicit protocol validation.
- `MAX_CHILDREN=100` and `MAX_ELEMENT_MAP_SIZE=50` caps interact poorly; no warning when hit (MTS-native, Distsys-native). **Fix**: return `{children, totalCount, truncated}` and surface in UI.
- `RemovabilityResult.reason` field overloads "reason" for three different semantic meanings (DX-native). **Fix**: separate into `reason`, `warning`, `blockMessage`.
- `Shift+Click` for container ancestor cycling (Q2) is undiscoverable (DX-native, DX-clink). **Fix**: add visible breadcrumb trail (e.g., `Grid > Stack > Card`).
- `shouldSkipFiber()` does not skip `React.lazy` wrappers (tag 16) (Distsys-native). **Fix**: add tag 16 to skip list.
- Focus management between shell and iframe unaddressed — keyboard users trapped in iframe (Frontend-native). **Fix**: `postToParent('zerofog:focus-request')` after deactivation.
- No CSRF token on GET endpoints returning sensitive data (Security-native). **Fix**: add `X-Session-Id` validation, `Cache-Control: no-store`.
- DNS rebinding attack surface on localhost (2 security reviewers). **Fix**: add `Sec-Fetch-Site` validation on sensitive endpoints.

### Positive Practices — Preserve These

1. **Decision D3 (intents are declarative, Claude determines implementation)** is architecturally correct and matches the actual competency boundary between browser runtime and LLM. Praised by Frontend-clink, MTS-clink, Distsys-clink, Design-clink.
2. **Decision D7 (detect but don't edit dynamic children)** avoids the most dangerous class of structural edit errors — data source modification. Praised by Frontend-clink, Distsys-clink, MTS-clink.
3. **Decision D2 (extend AccumulatedDiff, not separate StructuralDiff)** — one contract, one WAL, one endpoint — is the right versioning strategy. Praised by Frontend-clink, Design-clink.
4. **Confidence gating (medium+ for structural ops)** is the right safety boundary for operations with higher blast radius than token changes. Praised by Distsys-clink, DX-clink, MTS-clink.
5. **Scope boundary table and decisions log** are unusually crisp; they reduce future drift and scope creep. Praised by MTS-clink, DX-clink.
6. **`data-zerofog-ui="true"` guard pattern** in the existing inspector cleanly separates injected UI from app DOM. Praised by Frontend-clink — should be consistently applied to all structural UI elements.
7. **Clear v1.5/v2 phasing** with pragmatic feature sequencing (up/down buttons before drag, static before dynamic). Praised by DX-clink, Design-clink.
8. **`POST /api/diff/claim`** avoids side-effectful GET semantics for state-changing operations. Praised by Distsys-clink.

### Review Methodology Note

**Both mode** deployed 12 parallel reviews: 6 via PAL clink (multi-model: Codex, Gemini, Claude rotation) and 6 via native Claude agents with direct codebase access.

**What clink uniquely caught**: Broader pattern-level issues — the `AccumulatedDiff v2` backward compatibility problem (MTS-clink), delete-mode blocking on component source rather than parent composition context (Design-clink), and framework lock-in without graceful degradation (DX-clink). Multi-model diversity surfaced concerns that single-model analysis might not prioritize.

**What native uniquely caught**: Deep implementation-level bugs requiring codebase cross-referencing — the `data-cortex-id` reconciliation problem tied to specific inspector.js line numbers (Frontend-native), `stateNode` null for function components (MTS-native), OAuth iframe breakage from server.ts redirect logic (Frontend-native), and the full 15-finding security threat model with line-level attribution (Security-native).

**Recommendation**: Use **both mode** for architecture specs that reference existing code. Clink provides breadth and model-diversity perspective; native provides depth and code-grounded accuracy. The 5 cross-reviewer consensus items all appeared in both clink and native results, confirming they are genuine architectural risks rather than reviewer-specific concerns.

**Reviewer agreement rate**: 10 issues reached 3+ reviewer consensus out of ~90 total deduplicated findings. The top issue (MutationObserver infinite loop) was flagged by 5 of 6 review teams independently — the strongest convergence signal in the review.
