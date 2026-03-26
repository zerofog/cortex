---
ticket: ZF0-894
step: 8
substep: step-8-complete
branch: zf0-894
linear-url: https://linear.app/zerofog/issue/ZF0-894/phase-8b-keyboard-shortcuts-localstorage-persistence-webpack-adapter
timestamp: 2026-03-25T12:00:00Z
---

## Gates

SENTRY_AVAILABLE: false

## Step 3: Implementation Execution Strategy

Plan: `docs/superpowers/plans/2026-03-25-phase-8b-shortcuts-persistence-polish.md`
Tasks file: `docs/prds/cortex-v2/tasks/phase-8b-shortcuts-persistence-polish.md`

### Execution Order (parallel where possible)

```
Batch 1 (parallel):
  ZF0-935 — Task 1: Focus utilities (2pts, Sonnet)
  ZF0-936 — Task 2: Persistence utility (2pts, Sonnet)
  ZF0-941 — Task 7: Resolver cache (1pt, Sonnet)

Batch 2 (sequential, depends on Batch 1):
  ZF0-937 — Task 3: Escape cascade ATOMIC (3pts, Opus) — depends on ZF0-935

Batch 3 (sequential, depends on Batch 2):
  ZF0-938 — Task 4: Cmd+Shift+. toggle (3pts, Opus) — depends on ZF0-935, ZF0-937

Batch 4 (sequential, depends on Batch 3):
  ZF0-939 — Task 5: tinykeys shortcuts (3pts, Sonnet) — depends on ZF0-935, ZF0-937, ZF0-938

Batch 5 (can run after Batch 1):
  ZF0-940 — Task 6: Persistence integration (2pts, Sonnet) — depends on ZF0-936
```

### Task Completion Tracker

| Task | Linear ID | Status | Commit |
|------|-----------|--------|--------|
| 1. Focus utilities | ZF0-935 | done | b915281+77b05bc |
| 2. Persistence utility | ZF0-936 | done | ab38d45 |
| 3. Escape cascade | ZF0-937 | done | d17c59e+1c38110 |
| 4. Toggle shortcut | ZF0-938 | done | 6f5ca07+8a58ee5 |
| 5. tinykeys shortcuts | ZF0-939 | done | 7af4147+55c8963+243c3a5 |
| 6. Persistence integration | ZF0-940 | done | adeb38b+1c38110 |
| 7. Resolver cache | ZF0-941 | done | 2a483ba+77b05bc |

### Per-Task Subagent Instructions

Each subagent receives:
1. "Read the full plan at docs/superpowers/plans/2026-03-25-phase-8b-shortcuts-persistence-polish.md"
2. "Execute ONLY Task N" with TDD: test first, verify fail, implement, verify pass
3. "Run cd cortex-editor && npx vitest run [specific test] then npx vitest run for full suite"
4. "Commit with message from the plan"
5. "Do NOT modify files not listed in Task N"

Use Opus for Tasks 3+4 (complex, multi-file). Sonnet for others.

### After All 7 Tasks Complete

Resume /ship-task at Step 4:
- Step 4: /architecture-review on git diff main...HEAD
- Step 5: /simplify
- Step 6: /security-review + silent-failure-hunter
- Steps 7+8: /preflight full + /e2e fast (parallel)
- Step 9: Verify success criteria against ZF0-894 Linear ticket
- Step 10: Ship readiness assessment
- Step 11: /commit-commands:commit-push-pr
- Step 12: Copilot review response

---

## Step 1: Context

### Ticket Summary
Phase 8b: Keyboard shortcuts + localStorage persistence + webpack adapter + polish.
Absorbed escape fixes + Cmd+Shift+. toggle from ZF0-928 (architecturally independent of Agent Module).

### Success Criteria (7 automated + 4 manual)

**Automated:**
1. Escape inside Shadow DOM input does NOT deselect (from ZF0-928)
2. Escape in chat input does NOT exit editor (from ZF0-928)
3. Cmd+Shift+. toggles editor open/closed (from ZF0-928)
4. Keyboard shortcuts fire correct actions
5. Shortcuts respect state guards (don't fire in wrong context)
6. localStorage values persist and restore correctly
7. Webpack adapter produces correct transform and injection

**Manual:**
1. Cmd+Shift+. opens editor when closed, closes when open
2. All keyboard shortcuts work as documented
3. Panel position survives page refresh
4. Performance: no jank during rapid scrubbing

### Task-Specific Dimensional Criteria

**Performance (on top of universal baseline):**
- tinykeys adds ~650B — verify no bundle regression
- localStorage reads must not block render (async or deferred init)
- getSnapPoints() caching — avoid repeated Array.from + sort
- Webpack loader must not add latency vs Vite transform

**Security (on top of universal baseline):**
- Cmd+Shift+. toggle must not leak state into host app
- isOwnUI guard must use composedPath() for Shadow DOM boundary
- localStorage keys namespaced to prevent collision
- Webpack adapter: no arbitrary code execution in loader

**Experience (on top of universal baseline):**
- Shortcuts respect input focus (don't fire in text fields)
- Cascading Escape follows user mental model (innermost → outermost)
- Panel/toolbar position restores naturally after refresh
- Keyboard shortcuts discoverable (optional help overlay)

**Maintainability (on top of universal baseline):**
- tinykeys centralizes shortcut registration (vs scattered listeners)
- Webpack adapter follows Next.js adapter pattern
- localStorage persistence testable with mock storage
- All shortcuts tested with state guard variations

### Dependencies
- ZF0-891 (Phase 6: Toolbar) — Done
- ZF0-893 (Phase 8a: CSS Modules + undo/redo) — Done
- ZF0-928 — Escape fixes + Cmd+Shift+. absorbed into this ticket

### Key Codebase Findings
- No tinykeys dependency yet
- ts-morph lazy loading already exists (ensureTsMorph in tailwind.ts)
- No localStorage usage (explicit comment in useSnapToEdge.ts)
- Keyboard events scattered across ~10 files
- Next.js adapter already has webpack loader pattern (next-source-loader.ts)
- State management is all useState (no signals/stores/context)
- TailwindResolver.getSnapPoints() creates + sorts new arrays every call

## Evidence Accumulated

### Performance
- tinykeys: ~650B bundle impact (minimal)
- ts-morph lazy loading already exists — no additional work needed
- getSnapPoints() hot path: creates new Array.from() and sorts on every call
- findClass() normalizer runs per call (lookup Map built once at construction)

### Security
- selection.ts Escape handler missing isOwnUI guard (bug — absorbed from ZF0-928)
- CortexApp uses e.target instead of composedPath()[0] (Shadow DOM bug)
- No existing localStorage — clean slate, can design namespacing from scratch

### Experience
- 7 automated + 4 manual success criteria identified
- Cascading Escape partially implemented (comment mode → deselect → exit) but buggy in Shadow DOM
- Panel always starts top-right — no position memory

### Maintainability
- Keyboard listeners scattered across 10+ files — tinykeys will centralize globals
- Webpack adapter can reuse next-source-loader.ts pattern
- 480 tests in suite (post Phase 8a)
