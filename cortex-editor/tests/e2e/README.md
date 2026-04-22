# Cortex e2e harness

Playwright specs that exercise the cortex-editor browser bundle against a synthetic fixture — no real dev server, no user-source mutation, no network I/O.

## Prerequisite

Before the first run (and after any change to `src/browser/`):

```sh
npm run build    # produces dist/browser/index.js — the IIFE the fixture loads
npm run test:e2e # runs all specs; rebuilds are NOT automatic
```

If you skip `npm run build`, `installFixtureServer` fails with an actionable message pointing you here.

## Canonical spec skeleton

Every spec follows this shape. Copy-paste ready:

```ts
import { test, expect } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR, FIXTURE_SEED_SOURCE } from './helpers/fixture-server.js'
import { bootFixture } from './helpers/boot.js'
import type { CortexTestBridge } from './helpers/bridge.js'

test.describe('my feature', () => {
  test('happy path', async ({ page }) => {
    // `bootFixture` is the one-line orchestrator: it arms the debug
    // bridge, optionally activates design mode, installs route
    // interception, navigates, waits for bundle boot + bridge online,
    // optionally selects an element, and returns a divergence collector.
    const { events, unsubscribe } = (await bootFixture(page, {
      activateDesignMode: true,        // omit if no Panel assertions
      selectElement: FIXTURE_SEED_SELECTOR, // omit if no selection needed
    }))!

    // Drive the bridge via the typed `CortexTestBridge` handle. Inside
    // `page.evaluate` the type annotation is Node-side only — the cast
    // is still required because `window.__CORTEX_TEST__` is untyped in
    // the browser context.
    await page.evaluate((source) => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
      bridge.overrideManager.set(source, 'padding-top', '32px')
      // ... drive the lifecycle
    }, FIXTURE_SEED_SOURCE)

    // Assert observable outcomes. See existing specs for concrete patterns.

    await unsubscribe()
  })
})
```

For finer-grained control — e.g. asserting that the bundle fails to boot, or
running a spec with a custom ordering of init-scripts — the primitive
helpers (`setupDebugBridge`, `activateDesignMode`, `installFixtureServer`,
`waitForBridge`, `collectDivergences`) remain importable from
`helpers/bridge.js` and `helpers/fixture-server.js`.

## Four tripwires (read before writing your first spec)

Each of these burned a prior task. They're fixed at the helper layer where possible, but you still need to know them.

### 1. Init-script helpers must run BEFORE `page.goto`

`setupDebugBridge` and `activateDesignMode` use `page.addInitScript`, which only applies to **subsequent** navigations. Calling them after `page.goto` silently no-ops — downstream you'd see "bridge not found" or "visible: false" failures that read like product bugs.

**Caught by**: `assertPreNavigation` at `helpers/bridge.ts` throws if you reorder — but the error is only seen AFTER you write the spec wrong. Just don't.

### 2. `page.evaluate(fn, arg)` runs `fn` in the browser — module imports are NOT in scope

```ts
// WRONG — FIXTURE_SEED_SOURCE is undefined inside the evaluate
await page.evaluate(() => {
  const source = FIXTURE_SEED_SOURCE
})

// RIGHT — pass as the second argument
await page.evaluate((source) => {
  // ...
}, FIXTURE_SEED_SOURCE)
```

TypeScript won't catch this. It fails at runtime as a `ReferenceError`.

### 3. Absence assertions use `expect(async () => ...).toPass({ timeout })`, NOT `expect.poll(...).toBe(0)`

`expect.poll(() => events.length).toBe(0)` returns on the first pass — if `events` is empty at t=0, it succeeds immediately without waiting. That's the WRONG pattern for "events stays empty for N ms".

```ts
// WRONG — returns immediately if events is [] right now
await expect.poll(() => events.length).toBe(0)

// RIGHT — re-asserts for the full budget; fails immediately if events goes > 0
await expect(async () => {
  expect(events).toHaveLength(0)
}).toPass({ timeout: 1500 })
```

Use this for "no stale divergence from superseded edit" and similar absence claims.

### 4. Panel assertions require `activateDesignMode`; bus-only assertions don't

CortexApp gates its Panel render on `active === true`. In production that flips via a server message; in e2e there's no server, so `activateDesignMode` sets `<html data-cortex-active>` which `bootstrap()` reads at mount.

- Asserting divergence events fire? → `setupDebugBridge` only.
- Asserting EditErrorCard visible? → `setupDebugBridge` + `activateDesignMode`.

Skipping `activateDesignMode` when you need the Panel is the #1 cause of mystery "card not visible" failures.

## Falsifiability proofs

Per `CLAUDE.md` Test Anti-Patterns §2, assertions must be falsifiable. For specs that exercise a new code region not already mutation-proven by a sibling spec, document a mutation-based proof in the spec's header JSDoc:

```ts
/**
 * Falsifiability proof performed YYYY-MM-DD:
 *   Mutation: temporarily patched <file:line> to <specific change>
 *   Observed failure:
 *     - Case 1 FAILED — <specific divergence / assertion shape that fired>
 *     - Case N: <expected behavior under mutation>
 *   Revert: restored <file>, rebuilt, re-ran — all cases green.
 */
```

Gold-standard examples: `override-canonicalization.spec.ts:17-42`, `override-retry-window.spec.ts:45-107`.

Specs that ride on already-proven machinery may justify omission explicitly in the header (e.g., `override-divergence-card.spec.ts`).

## Debugging a CI failure

When a spec fails in GitHub Actions:

1. Open the failed run in the Actions tab.
2. Scroll to the bottom for the "Artifacts" panel — download `playwright-report-node<version>`.
3. Unzip and open `index.html`. Click the failing test for a full trace + screenshot + DOM snapshot + network log.
4. For deeper debugging, `playwright.config.ts` sets `trace: 'on-first-retry'` — the trace file is in the artifact.

## Helper surface reference

### `helpers/boot.ts`
- `bootFixture(page, opts?)` — one-line orchestrator that composes the primitives below into the canonical 5-step arm sequence; returns a ready-to-use `DivergenceCollector | null`

### `helpers/fixture-server.ts`
- `FIXTURE_URL` — `https://cortex-fixture.test/` (synthetic, no DNS)
- `FIXTURE_SEED_SELECTOR` — `#center`
- `FIXTURE_SEED_SOURCE` — `fixture:1:1`
- `installFixtureServer(page)` — route-intercepts fixture HTML + bundle

### `helpers/bridge.ts`
- `setupDebugBridge(page)` — pre-goto; sets debug flag + scoped attachShadow patch + WS stub
- `activateDesignMode(page)` — pre-goto; sets `data-cortex-active` so Panel renders
- `waitForBridge(page, timeout=5000)` — waits for `__CORTEX_TEST__.{overrideManager, channel}`; throws with actionable hints on timeout
- `collectDivergences(page)` — returns `{ events, unsubscribe }`; ONE collector per Page
- `getEditErrorCardState(page)` — shadow-DOM query for Panel's EditErrorCard
- `clickEditErrorCardDismiss(page)` — clicks the Dismiss button; returns `boolean`

Types exported: `CortexTestBridge`, `DivergenceCollector`, `EditErrorCardState`. The `OverrideDivergence` event type is re-exported from the main `cortex-editor` package.

## Why route interception, not `cortex-demo`?

Running the real `cortex-demo` Vite server would require:
- a free port (contention in CI)
- the user's filesystem (forbidden per ticket ZF0-1297 non-goal §2)
- a rebuild for every contributor

`page.route()` fulfillment from a synthetic origin is portable, hermetic, and fast. No network I/O hits the runner — even the bundle's WebSocket fallback is stubbed to a no-op in `setupDebugBridge`.

## Extending the harness

Before adding new helpers:
1. Check if an existing one fits (the surface is small by design).
2. If you need a cross-spec pattern that shows up in 2+ places, lift it here rather than copy-pasting.
3. If you're querying a new Panel region, add a helper to `bridge.ts` (or a new `panel.ts` if the Panel surface keeps growing) with stable CSS class selectors, not tag names.
4. Every new init-script helper must call `assertPreNavigation` to fail loudly on post-goto use.
5. Every pre-goto helper needs `Call before `page.goto`` in its JSDoc.

## History

- ZF0-1297 (2026-04-22): initial harness + 3 specs replacing 6 throwaway `/tmp/zf0-1235-*.mjs` repros from ZF0-1235. Closes F6 happy-dom coverage gap (`tests/browser/override.test.ts:1303`).
