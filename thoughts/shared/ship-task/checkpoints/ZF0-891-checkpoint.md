---
ticket: ZF0-891
step: 2
branch: zf0-891
linear-url: https://linear.app/zerofog/issue/ZF0-891/phase-6-toolbar-viewport-auto-position-auto-scroll-canvas-zoom
timestamp: 2026-03-18T13:00:00Z
---

## Gates

SENTRY_AVAILABLE: false (no cortex-editor project in Sentry — dev tool not deployed to production)

## Step 1: Context

### Ticket Summary
Phase 6: Toolbar + Viewport — Build the floating toolbar (mode switching, activity badge, drag-to-dock), panel auto-positioning (moves when overlapping selection), auto-scroll on element selection, and lightweight zoom-out canvas mode.

### Sub-Features
1. **6.1 Toolbar Component** — Floating pill-shaped toolbar (~240x40px) with: Cortex logo drag handle, Select mode (V), Comment mode (C), Canvas toggle (Cmd+0), Activity badge (source write count), Close button (Escape). Dockable to any viewport edge, position persisted to localStorage.
2. **6.2 Panel Auto-Positioning** — When selected element overlaps panel (20px margin), panel slides to opposite horizontal side (200ms ease-out).
3. **6.3 Auto-Scroll on Selection** — When selected element is partially off-viewport or behind panel, smooth-scroll to reveal it.
4. **6.4 Canvas Toggle (Zoom-Out)** — CSS transform scale on body (0.5x-1.0x range), Cmd+scroll incremental zoom, Space+drag pan, toggle via toolbar button or Cmd+0.

### Success Criteria (Automated)
1. Toolbar renders inside shadow root at bottom-center by default
2. Toolbar buttons switch modes (select/comment/canvas)
3. Activity badge count updates when edits are completed
4. Auto-positioning: panel moves when overlap detected
5. Canvas toggle: body transform applied and removed correctly

### Success Criteria (Manual)
1. Toolbar visible on page load, compact pill shape
2. Drag toolbar to different edges → snaps with spring animation
3. Click comment mode → cursor changes to crosshair
4. Select element near panel → panel auto-slides to opposite side
5. Select element below fold → page smooth-scrolls to reveal it
6. Toggle canvas mode → page zooms out, Cmd+scroll adjusts zoom level

### Branch
zf0-891 (from main at 0a0e686)

### Sibling Status
| Status | Issues |
|--------|--------|
| Done | ZF0-885 (Phase 2), ZF0-886 (Phase 3), ZF0-887 (Phase 4), ZF0-888 (Phase 5a), ZF0-889 (Phase 5b), ZF0-890 (Phase 5c) |
| Current | ZF0-891 (Phase 6) |

### Sentry
SENTRY_AVAILABLE: false — dev tool not deployed to production. All Sentry sub-steps skipped.

### Task-Specific Dimensional Criteria
- **Performance**: Toolbar rendering must not cause layout thrash; canvas zoom coordinates must be efficient; auto-scroll must not fight user scroll
- **Security**: N/A (no new data paths, all browser-side UI)
- **Experience**: Toolbar must be always visible and accessible; auto-positioning must feel smooth (200ms); canvas zoom must not break click/hover coordinate mapping
- **Maintainability**: Reuse existing useDrag/useSnapToEdge hooks; follow established Preact patterns; toolbar should be independently testable

### Key Files to Modify/Create
**New:**
- `src/browser/components/Toolbar.tsx` — Toolbar component
- `src/browser/hooks/useAutoPosition.ts` — Panel auto-positioning hook
- `tests/browser/toolbar.test.tsx` — Toolbar tests
- `tests/browser/hooks/use-auto-position.test.tsx` — Auto-position tests

**Modify:**
- `src/browser/components/CortexApp.tsx` — Wire toolbar, auto-position, canvas zoom state
- `src/browser/components/Panel.tsx` — Accept auto-position coordinates
- `src/browser/hooks/useDrag.ts` — Extend for toolbar (drag handle restriction)
- `src/browser/hooks/useSnapToEdge.ts` — Extend for toolbar snap behavior
- `src/browser/styles.css` — Toolbar styles, canvas mode styles, auto-position transitions
- `src/browser/styles.css.d.ts` — New class declarations
- `src/browser/selection.ts` — Auto-scroll on selection
- `tests/browser/cortex-app.test.tsx` — Integration tests

### Existing Patterns (from subagent research)
- Preact with hooks (useState, useRef, useEffect, useCallback)
- position:fixed + transform:translate() for movable elements
- RAF loops with cancelAnimationFrame cleanup
- Mutable refs for high-frequency state (drag position)
- CSS class composition via array filter(Boolean).join(' ')
- PointerEvent API with capture/release
- Custom renderHook helper for Preact testing
- useDrag already handles pointer capture, coordinate tracking, isDragging state
- useSnapToEdge already handles spring animation to nearest edge, overlap detection with recheckOverlap

## Evidence Accumulated

### Performance
- Canvas zoom applies CSS transform to body — lightweight, no DOM traversal
- Auto-scroll uses native window.scrollTo with behavior: 'smooth'
- Toolbar rendering is static UI — minimal re-render cost

### Security
- N/A — all browser-side UI, no new data paths or auth changes

### Experience
- 5 automated + 6 manual success criteria identified
- Toolbar always visible, never hides
- Auto-position 200ms ease-out, snap 300ms spring cubic-bezier
- Canvas zoom 0.5x-1.0x range, no zoom-in past actual size

### Maintainability
- Reuses useDrag/useSnapToEdge from Phase 3
- Follows established component patterns (Panel, SelectionOverlay)
- New hooks useToolbarDock/useCanvasZoom follow existing hook conventions

## Step 2: Plan

### Implementation Plan
`docs/superpowers/plans/2026-03-18-phase-6-toolbar-viewport.md`

### Key Design Decisions
1. Separate `useToolbarDock` hook (4-edge snap + orientation) vs extending `useSnapToEdge` (2-edge only)
2. Panel position lifted to CortexApp for `recheckOverlap` wiring (auto-position needs both panel pos + selection)
3. Canvas zoom as pure CSS transform — no DOM traversal
4. Activity badge count from `edit_status` messages with `status: 'done'`
5. Keyboard shortcuts in CortexApp (not selection.ts) — mode state lives in React
6. Comment mode is a placeholder — actual comment pinning is Phase 7

### Task Structure (6 tasks)
| Task | Files | Parallelizable |
|------|-------|----------------|
| 1. useToolbarDock | hook + tests | Wave 1 (parallel with Task 3) |
| 2. Toolbar component | component + tests | After Task 1 |
| 3. useCanvasZoom | hook + tests | Wave 1 (parallel with Task 1) |
| 4. CortexApp wiring | CortexApp + Panel refactor + tests | After Tasks 1-3 |
| 5. CSS styles | styles.css | After Task 2 |
| 6. Integration verification | all tests + tsc | Final |

### Plan Review
- Round 1: 2 Critical, 2 High, 6 Medium issues found
- All fixed: broken import, missing act, panel test scope, contentEditable guard, findNearestEdge dimensions, 20px margin, dual-effect merge, tooltip orientation, test flushing, SSR guard
- Round 2: Approved
