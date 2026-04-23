/**
 * Debug-bridge helpers for Playwright specs.
 *
 * Business purpose: the override lifecycle under test (ZF0-1235 class of
 * bugs) lives inside a closed Shadow DOM, with event listeners gated on
 * `window.__CORTEX_DEBUG_OVERRIDES__`. These helpers encapsulate the
 * two tricks every spec needs:
 *
 *   1. Set the debug flag AND force `attachShadow({ mode: 'open' })`
 *      BEFORE the IIFE runs, so Panel internals are inspectable.
 *   2. Wait for `window.__CORTEX_TEST__` (the bridge CortexApp exposes
 *      when the debug flag is set) — event-based wait, never a
 *      `waitForTimeout`.
 *
 * Divergence collection (step 3) hooks `onDivergence` from the page-side
 * override-bus via an exposed Node-side collector, so specs can assert on
 * the same events the Panel surfaces as EditErrorCards in Task 3.
 */
import type { Page } from '@playwright/test'

/**
 * Shape of the divergence event emitted by `src/browser/override-bus.ts`.
 *
 * Hand-copy rather than import: the e2e tsconfig is a separate project
 * (`rootDir: "."` under `tests/e2e/`) and cannot resolve into `../../src/`,
 * and the package self-import (`import from 'cortex-editor'`) resolves to
 * `dist/index.d.ts` which is gitignored — so clean CI clones would fail
 * typecheck before build runs.
 *
 * The actual source of truth is `OverrideDivergence` +
 * `OverrideDivergenceDiagnostics` in `src/browser/override-bus.ts`. If
 * that shape changes in a way specs depend on, update this interface to
 * match. The shape is small + stable; the duplication cost is lower
 * than either alternative.
 */
export interface OverrideDivergence {
  source: string
  property: string
  expected: string
  actual: string
  pseudo?: '::before' | '::after'
  diagnostics: {
    actualReadFrom: 'inline-style' | 'computed-style' | 'server-mismatch'
    kindUsed?: 'immediate' | 'jsx-immediate' | 'deferred'
    priorValues: readonly string[]
    retryDurationMs?: number
    errorMessage?: string
  }
}

/** Shape of `window.__CORTEX_TEST__` — exposed by CortexApp when the
 *  debug flag is set (see `index.tsx` bootstrap + `CortexApp` mount).
 *  Centralizing this type ends the inline-literal duplication that used
 *  to live at every `page.evaluate` call site. Fields are optional where
 *  CortexApp only attaches them in specific states (selection handlers,
 *  divergence bus); `overrideManager` is always present when the bridge
 *  has resolved (`waitForBridge` guarantees it). */
export interface CortexTestBridge {
  overrideManager: {
    set: (source: string, property: string, value: string) => void
    flush: () => void
    trackPendingEdit: (editId: string, source: string, property: string, value: string) => void
    handleHMRVerified: (editId: string, match: boolean, kind: string) => void
  }
  channel?: unknown
  selectElement?: (el: HTMLElement | null) => void
  onDivergence?: (cb: (d: OverrideDivergence) => void) => () => void
}

/** Guard for helpers that MUST run before `page.goto`. Playwright's
 *  `addInitScript` only applies to subsequent navigations — calling a
 *  setup helper after the first goto silently no-ops, leading to a
 *  downstream "visible: false" failure that reads like a product bug.
 *  Throw at the source instead. */
function assertPreNavigation(page: Page, helperName: string): void {
  const url = page.url()
  if (url && url !== 'about:blank') {
    throw new Error(
      `[bridge] ${helperName}() must be called BEFORE page.goto — ` +
        `page is already at ${url}. addInitScript only affects subsequent navigations.`,
    )
  }
}

/**
 * Arm the debug bridge and force open Shadow DOM. MUST be called before
 * `page.goto` — `addInitScript` only fires on subsequent navigations.
 *
 * The open-shadow patch is load-bearing: CortexApp does
 * `attachShadow({ mode: 'closed' })` by default, which makes Panel DOM
 * inaccessible from Playwright. Overriding `mode` at the prototype level
 * is the only reliable way; the hack is documented in the ZF0-1235 live
 * repros that this harness replaces.
 */
export async function setupDebugBridge(page: Page): Promise<void> {
  assertPreNavigation(page, 'setupDebugBridge')
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true

    // Stub `__cortex_send__` to a no-op so the bundle's Vite channel branch
    // fires (index.tsx:123) instead of falling through to the WebSocket
    // fallback (index.tsx:125-128). Without this, every spec hits a real
    // `new WebSocket('ws://cortex-fixture.test:24678/cortex')` whose failure
    // triggers an exponential-backoff reconnect storm — spam in CI logs,
    // a flaky "Reconnecting" chip in Panel screenshots, and silent queueing
    // of any `channel.send` calls a future spec makes. The spread preserves
    // the shape expected by `createViteChannel`; the function body discards.
    ;(globalThis as unknown as { __cortex_send__?: (msg: unknown) => void }).__cortex_send__ = () => {
      /* no-op: fixture runs offline */
    }

    // Patch attachShadow so the Cortex host's closed root becomes open.
    // Scoped to `[data-cortex-host]` so third-party widgets in future
    // richer fixtures (Stripe Elements, reCAPTCHA, etc.) keep their
    // closed roots — avoids silently mutating unrelated shadow trees.
    // The `{ ...init }` spread preserves `delegatesFocus` and
    // `slotAssignment` from the original init — only `mode` is overridden.
    const original = Element.prototype.attachShadow
    Element.prototype.attachShadow = function patchedAttachShadow(init: ShadowRootInit) {
      if ((this as Element).matches?.('[data-cortex-host]')) {
        return original.call(this, { ...init, mode: 'open' })
      }
      return original.call(this, init)
    }
  })
}

/**
 * Arm the Panel's "active" state (design mode on) BEFORE bootstrap.
 *
 * Why this exists: CortexApp gates its render on `active === true`
 * (see `CortexApp.tsx:698`). In production that flips via a server-sent
 * `cortex`/`cortex-toggle` message; in e2e specs there's no server, and
 * without it the Panel — and therefore the EditErrorCard — never
 * render no matter how many divergences fire. `index.tsx:136` reads
 * `document.documentElement.hasAttribute('data-cortex-active')` at
 * bootstrap time and feeds it into CortexApp as `initialActive`, which
 * is the documented escape hatch for pre-activating the editor.
 *
 * Call BEFORE `page.goto` (same constraint as `setupDebugBridge`) —
 * the attribute must be present when `bootstrap()` runs, not after.
 * Specs that only assert bus events without touching the Panel (smoke
 * test, canonicalization spec) don't need this; anything that reaches
 * into the shadow DOM for a Panel element does.
 */
export async function activateDesignMode(page: Page): Promise<void> {
  assertPreNavigation(page, 'activateDesignMode')
  await page.addInitScript(() => {
    // `addInitScript` runs at document_start — BEFORE `<html>` is
    // parsed, so `document.documentElement` is `null`. Setting the
    // attribute synchronously at that moment throws. Use a
    // `readystatechange` listener: by the time the doctype/`<html>`
    // lands, `readyState` transitions to `interactive` (or goes
    // straight from `loading`) and `documentElement` is available.
    // Must fire before the IIFE bundle's `bootstrap()` reads the
    // attribute — bootstrap is wired to `DOMContentLoaded`, which
    // fires AFTER `readystatechange` to `interactive`, so the
    // ordering is safe.
    const setFlag = () => {
      document.documentElement?.setAttribute('data-cortex-active', '')
    }
    if (document.documentElement) {
      setFlag()
    } else {
      document.addEventListener('readystatechange', setFlag, { once: true })
    }
  })
}

/**
 * Wait for `window.__CORTEX_TEST__` to exist — i.e., CortexApp has
 * mounted and seen the debug flag. Event-based only (no
 * `waitForTimeout`); raises if the bridge doesn't show up within the
 * timeout, which is almost always a bundle/boot failure.
 */
export async function waitForBridge(page: Page, timeoutMs: number = 5000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const bridge = (globalThis as unknown as { __CORTEX_TEST__?: Record<string, unknown> }).__CORTEX_TEST__
        return !!bridge && !!bridge.overrideManager && !!bridge.channel
      },
      null,
      { timeout: timeoutMs },
    )
  } catch (err) {
    // Rewrap Playwright's generic timeout into an actionable message.
    // The three likely causes are ordered by prior incidence; a spec
    // author reading this in CI logs can triage in seconds instead of
    // chasing a mystery product bug.
    throw new Error(
      `[bridge] waitForBridge timed out after ${timeoutMs}ms. Likely causes:\n` +
        `  1. setupDebugBridge not called before page.goto (addInitScript is no-op post-nav).\n` +
        `  2. Bundle failed to boot — check Playwright console/page-error output for bundle errors.\n` +
        `  3. __CORTEX_DEBUG_OVERRIDES__ flag didn't reach the bundle — confirm setupDebugBridge armed.\n` +
        `Page URL: ${page.url()}\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** Return shape of `collectDivergences` — exported so specs can name
 *  the type explicitly (e.g. in helper signatures) instead of chaining
 *  `Awaited<ReturnType<typeof collectDivergences>>`. */
export interface DivergenceCollector {
  events: OverrideDivergence[]
  unsubscribe: () => Promise<void>
}

/**
 * Subscribe (Node-side) to divergence events emitted by the page's
 * override-bus. Returns `{ events, unsubscribe }`.
 *
 * `events` is a shared array — the `exposeFunction` callback pushes to
 * it as divergences fire in the page. Specs read it synchronously after
 * triggering an override; if they need to await the first event, use
 * `expect.poll(() => events.length).toBeGreaterThan(0)` (event-based,
 * no fixed timeout).
 *
 * Implementation: the debug bridge exposes `onDivergence` — a direct
 * reference to `override-bus.ts`'s module-scoped subscriber. We call it
 * from a `page.evaluate` block (AFTER `waitForBridge` has resolved —
 * `addInitScript` would run too early, before CortexApp has mounted)
 * and forward each event through `page.exposeFunction` into Node. The
 * returned `unsubscribe` calls the real teardown closure to detach the
 * listener before releasing handles.
 *
 * Constraint: ONE collector per Page. Calling this helper twice on the
 * same `page` throws — Playwright's `exposeFunction` rejects duplicate
 * names, and a shared unsubscribe slot on `window` would let the second
 * call silently clobber the first. If a spec needs nested collection,
 * call `unsubscribe()` first or factor assertions into separate `test()`
 * blocks (each gets a fresh Page).
 */
export async function collectDivergences(page: Page): Promise<DivergenceCollector> {
  const events: OverrideDivergence[] = []

  await page.exposeFunction('__cortexOnDivergence', (event: OverrideDivergence) => {
    events.push(event)
  })

  // Wire the page-side subscriber. Must run after CortexApp has mounted
  // (waitForBridge should have resolved before calling this helper) —
  // only then is `__CORTEX_TEST__.onDivergence` present. We stash the
  // unsubscribe closure on `window` so the teardown path below can reach
  // it without serializing a function across the evaluate boundary.
  await page.evaluate(() => {
    // Loud fail on double-call: the unsub slot is single-tenant. Without
    // this guard a second caller would replace the first's unsubscribe
    // closure, and the first's `unsubscribe()` would silently tear down
    // the second's listener — nightmare to debug.
    if ((globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub) {
      throw new Error('[bridge] collectDivergences already active on this page — call unsubscribe() before starting another collector')
    }
    const bridge = (globalThis as unknown as {
      __CORTEX_TEST__?: { onDivergence?: (cb: (d: unknown) => void) => () => void }
    }).__CORTEX_TEST__
    if (!bridge?.onDivergence) {
      throw new Error('[bridge] __CORTEX_TEST__.onDivergence not present — is the debug flag set and CortexApp mounted?')
    }
    const forward = (globalThis as unknown as {
      __cortexOnDivergence?: (d: unknown) => void
    }).__cortexOnDivergence
    if (!forward) {
      throw new Error('[bridge] __cortexOnDivergence not exposed — exposeFunction must run first')
    }
    const unsub = bridge.onDivergence((d) => forward(d))
    ;(globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub = unsub
  })

  return {
    events,
    unsubscribe: async () => {
      await page.evaluate(() => {
        const unsub = (globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub
        unsub?.()
        delete (globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub
      })
    },
  }
}

/**
 * Snapshot of the EditErrorCard surface for assertions. Returns the first
 * card's rendered state — Panel currently renders at most one card per
 * source+property, and the Task 3 spec only ever triggers a single
 * divergence per assertion, so pinning to `[0]` keeps call sites tidy.
 *
 * Shape:
 *  - `visible`: true if any `.cortex-error-card` is mounted in the
 *    Panel's Shadow DOM. Opens up the "no card rendered" failure mode
 *    without callers needing to reason about DOM traversal.
 *  - `property`: text content of `.cortex-error-card__property` (e.g.
 *    `"padding-top edit failed"`). Helps callers assert the card
 *    belongs to the property under test.
 *  - `reason`: text content of `.cortex-error-card__reason`. This is the
 *    human-visible divergence message ("Preview shows 32px but live
 *    value is 10px…") — Task 3's acceptance criteria asserts substring
 *    matches against it.
 *  - `hasDebugDisclosure`: true iff a `<details>` element is nested
 *    inside the card (Debug disclosure, gated by
 *    `__CORTEX_DEBUG_OVERRIDES__ === true`). Callers verify the gate.
 *
 * Assumes `setupDebugBridge` has forced the cortex host's Shadow DOM
 * open — if called without that patch, `host.shadowRoot` is null and
 * every field falls back to its empty default.
 */
export interface EditErrorCardState {
  visible: boolean
  property: string | null
  reason: string | null
  hasDebugDisclosure: boolean
}

export async function getEditErrorCardState(page: Page): Promise<EditErrorCardState> {
  return await page.evaluate(() => {
    // Shared shadow-root resolver inline — addInitScript patches
    // attachShadow to `open` so the host's shadowRoot is reachable.
    // Task 4 and future Panel-asserting helpers can copy this 3-line
    // dance (host lookup → shadowRoot access → null fallback).
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return { visible: false, property: null, reason: null, hasDebugDisclosure: false }
    const card = root.querySelector('.cortex-error-card')
    if (!card) return { visible: false, property: null, reason: null, hasDebugDisclosure: false }
    const property = card.querySelector('.cortex-error-card__property')?.textContent?.trim() ?? null
    const reason = card.querySelector('.cortex-error-card__reason')?.textContent?.trim() ?? null
    const hasDebugDisclosure = !!card.querySelector('details')
    return { visible: true, property, reason, hasDebugDisclosure }
  })
}

/**
 * Click the Dismiss button on the first EditErrorCard in the Panel's
 * Shadow DOM. Returns true if a button was found and clicked, false
 * otherwise — callers should assert `true` so a missing/renamed button
 * fails loudly instead of silently succeeding.
 *
 * The selector is keyed on `data-action="dismiss"` (see
 * `EditErrorCard.tsx`) — more resilient than a text-content match if
 * the button label ever gets localized, but still pinned to the
 * specific action so a future "Dismiss all" button wouldn't be clicked
 * accidentally.
 */
export async function clickEditErrorCardDismiss(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return false
    const btn = root.querySelector<HTMLButtonElement>('.cortex-error-card button[data-action="dismiss"]')
    if (!btn) return false
    btn.click()
    return true
  })
}
