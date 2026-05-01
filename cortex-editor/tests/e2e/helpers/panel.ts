/**
 * Panel UI helpers for Playwright specs.
 *
 * Business purpose: the Panel header chrome (Apply button, drift banner, apply
 * error banner) and per-control stale indicators live inside a closed Shadow
 * DOM that ordinary Playwright locators cannot reach. These helpers encapsulate
 * the three-line shadow-root dance (host lookup → shadowRoot access → null
 * fallback) for every Panel UI surface, so specs can assert on business-level
 * outcomes without writing DOM traversal code.
 *
 * All getters are safe to call whether or not the Panel is mounted — they
 * return empty-state defaults (visible: false, etc.) when the shadow root is
 * not reachable. This prevents spurious Playwright errors when a spec asserts
 * a "not visible" state without first asserting that the Panel rendered.
 *
 * Companion to `bridge.ts`. Selectors use stable CSS classes + `data-action`
 * attributes — never text content. Text content is localization-fragile and
 * can match unintended elements.
 *
 * Pre-goto helpers (`installSendSpy`) MUST be called BEFORE `page.goto` and
 * MUST call `assertPreNavigation` to fail loudly on out-of-order use.
 *
 * Ordering constraint for `installSendSpy`:
 *   Call `setupDebugBridge(page)` first (which stubs `__cortex_send__` to
 *   no-op), then call `installSendSpy(page)`. Playwright runs init scripts in
 *   registration order, so the spy's init script fires AFTER the no-op stub
 *   and replaces it with the collecting spy. The Vite channel closure-captures
 *   `__cortex_send__` at bootstrap (channel.ts:132), so the spy persists for
 *   the lifetime of the page — including after any tombstone or reconnect.
 */
import type { Page } from '@playwright/test'
import { assertPreNavigation } from './bridge.js'

// ─── Send spy ────────────────────────────────────────────────────────────────

/**
 * Pre-goto initScript: replaces `window.__cortex_send__` with a spy that
 * pushes every outbound BrowserToServer message onto
 * `window.__cortexSentMessages__`. The Vite channel closure-captures
 * `__cortex_send__` at bootstrap (channel.ts:132), so the spy persists
 * post-tombstone.
 *
 * MUST be called BEFORE `page.goto`. MUST be called AFTER
 * `setupDebugBridge(page)` in the boot sequence. Init scripts run in
 * registration order on every navigation; calling earlier means
 * `setupDebugBridge`'s no-op stub overwrites the spy and the spy silently
 * captures nothing — every assertion that reads `getSentMessages` returns
 * `[]` and the spec passes for the wrong reason.
 *
 * Usage:
 * ```ts
 * await setupDebugBridge(page)  // installs no-op stub
 * await installSendSpy(page)    // overwrites with collecting spy
 * await installFixtureServer(page)
 * await page.goto(FIXTURE_URL)
 * ```
 */
export async function installSendSpy(page: Page): Promise<void> {
  assertPreNavigation(page, 'installSendSpy')
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __cortexSentMessages__?: unknown[] }).__cortexSentMessages__ = []
    ;(globalThis as unknown as { __cortex_send__?: (msg: unknown) => void }).__cortex_send__ = (msg: unknown) => {
      ;(globalThis as unknown as { __cortexSentMessages__?: unknown[] }).__cortexSentMessages__?.push(msg)
    }
  })
}

/**
 * Read the array of outbound BrowserToServer messages captured by the spy
 * installed by `installSendSpy`. Returns an empty array if the spy was not
 * installed or no messages have been sent.
 *
 * The returned array is a snapshot — it reflects messages sent up to the
 * moment of the call. Subsequent sends are NOT reflected until the next call.
 */
export async function getSentMessages(page: Page): Promise<unknown[]> {
  return await page.evaluate(() => {
    return (globalThis as unknown as { __cortexSentMessages__?: unknown[] }).__cortexSentMessages__ ?? []
  })
}

/**
 * Inject a ServerToBrowser message into the page by calling
 * `window.__cortex_channel__.handleServerMessage(msg)`.
 *
 * `__cortex_channel__` is a frozen global with `configurable: true` whose
 * `handleServerMessage` is the ONLY way to inject server→browser messages
 * post-boot (per ZF0-1473 architecture constraints). This helper wraps the
 * call so spec authors don't need to know the global name.
 *
 * Throws if the channel global is not present (bundle not booted or wrong
 * test build).
 */
export async function simulateServerMessage(page: Page, msg: unknown): Promise<void> {
  await page.evaluate((message) => {
    const ch = (globalThis as unknown as {
      __cortex_channel__?: { handleServerMessage: (m: unknown) => void }
    }).__cortex_channel__
    if (!ch) throw new Error('[panel] __cortex_channel__ not present — is the bundle booted?')
    ch.handleServerMessage(message)
  }, msg)
}

// ─── Apply button ─────────────────────────────────────────────────────────────

/**
 * Snapshot of the Apply button state.
 *
 * Fields:
 * - `visible`: true if `[data-action="apply"]` is present in the shadow DOM.
 *   Corresponds to the `bufferSize > 0 && !pendingClaude` condition in
 *   PanelHeader.tsx:263.
 * - `label`: text content of the button (`"Apply (N)"` or `"Delivering…"`).
 *   null when not visible.
 * - `disabled`: true if the button has the `disabled` attribute. Corresponds
 *   to `delivering === true` (PanelHeader.tsx:270).
 * - `ariaBusy`: true if `aria-busy="true"` is set. Same condition as disabled.
 */
export interface ApplyButtonState {
  visible: boolean
  label: string | null
  disabled: boolean
  ariaBusy: boolean
}

/**
 * Snapshot the Apply button (`[data-action="apply"]`) from the Panel's Shadow
 * DOM. Returns `{ visible: false, label: null, disabled: false, ariaBusy: false }`
 * when the shadow root is not reachable or the button is not rendered.
 *
 * The button visibility follows a 3-state machine in PanelHeader.tsx:
 *   Hidden (`visible: false`) → `Apply (N)` → `Delivering…` (disabled) → Hidden
 */
export async function getApplyButtonState(page: Page): Promise<ApplyButtonState> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return { visible: false, label: null, disabled: false, ariaBusy: false }
    const btn = root.querySelector<HTMLButtonElement>('[data-action="apply"]')
    if (!btn) return { visible: false, label: null, disabled: false, ariaBusy: false }
    return {
      visible: true,
      label: btn.textContent?.trim() ?? null,
      disabled: btn.disabled,
      ariaBusy: btn.getAttribute('aria-busy') === 'true',
    }
  })
}

/**
 * Click the Apply button (`[data-action="apply"]`) in the Panel's Shadow DOM.
 * Returns `true` if the button was found and clicked, `false` otherwise —
 * callers should assert `true` so a missing/renamed button fails loudly.
 *
 * Does NOT wait for any resulting state transitions. Use `getApplyButtonState`
 * with `expect.poll` to assert the transition outcome.
 */
export async function clickApplyButton(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return false
    const btn = root.querySelector<HTMLButtonElement>('[data-action="apply"]')
    if (!btn) return false
    btn.click()
    return true
  })
}

// ─── Drift banner ─────────────────────────────────────────────────────────────

/**
 * Snapshot of the StagingDriftBanner state.
 *
 * Fields:
 * - `visible`: true if `.cortex-drift-banner` is present in the shadow DOM.
 * - `intentCount`: the count read from `[data-row="intent"]`'s `data-count`
 *   attribute. 0 if the intent row is absent.
 * - `staleCount`: the count read from `[data-row="stale"]`'s `data-count`
 *   attribute. 0 if the stale row is absent.
 * - `dismissAvailable`: true if `.cortex-drift-banner__dismiss` is present.
 */
export interface DriftBannerState {
  visible: boolean
  intentCount: number
  staleCount: number
  dismissAvailable: boolean
}

/**
 * Snapshot the StagingDriftBanner (`.cortex-drift-banner`) from the Panel's
 * Shadow DOM. Returns `{ visible: false, intentCount: 0, staleCount: 0,
 * dismissAvailable: false }` when the shadow root is not reachable or the
 * banner is not rendered.
 *
 * Count extraction reads `data-count` from each `[data-row="intent" | "stale"]`
 * element (set by `StagingDriftBanner.tsx`). Structural attributes are stable
 * against title-text edits and localization, unlike a regex over title text.
 */
export async function getDriftBannerState(page: Page): Promise<DriftBannerState> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return { visible: false, intentCount: 0, staleCount: 0, dismissAvailable: false }
    const banner = root.querySelector('.cortex-drift-banner')
    if (!banner) return { visible: false, intentCount: 0, staleCount: 0, dismissAvailable: false }

    const readRowCount = (rowKey: 'intent' | 'stale'): number => {
      const row = banner.querySelector<HTMLElement>(`[data-row="${rowKey}"]`)
      if (!row) return 0
      const raw = row.dataset['count']
      if (raw === undefined) return 0
      const n = parseInt(raw, 10)
      return Number.isFinite(n) ? n : 0
    }

    return {
      visible: true,
      intentCount: readRowCount('intent'),
      staleCount: readRowCount('stale'),
      dismissAvailable: !!banner.querySelector('.cortex-drift-banner__dismiss'),
    }
  })
}

/**
 * Click the Dismiss button (`.cortex-drift-banner__dismiss`) on the
 * StagingDriftBanner. Returns `true` if found and clicked, `false` otherwise.
 *
 * The dismiss button uses `data-action="dismiss"` (StagingDriftBanner.tsx:100)
 * and sets internal `dismissed` state — the banner unmounts on the next render.
 */
export async function dismissDriftBanner(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return false
    const btn = root.querySelector<HTMLButtonElement>('.cortex-drift-banner__dismiss')
    if (!btn) return false
    btn.click()
    return true
  })
}

// ─── Apply error banner ───────────────────────────────────────────────────────

/**
 * Snapshot of the apply error banner state.
 *
 * Fields:
 * - `visible`: true if `.cortex-apply-error[role="alert"]` is present in the
 *   shadow DOM (Panel.tsx:1211, 1391).
 * - `message`: text content of the `<span>` inside the banner, or null when
 *   not visible.
 */
export interface ApplyErrorBannerState {
  visible: boolean
  message: string | null
}

/**
 * Snapshot the apply error banner (`.cortex-apply-error[role="alert"]`) from
 * the Panel's Shadow DOM. Returns `{ visible: false, message: null }` when
 * the shadow root is not reachable or the banner is not rendered.
 *
 * The banner appears when `sendAndAck` rejects — `onApplyError` in Panel.tsx
 * sets `applyError` state, which renders the alert. The `<span>` child holds
 * the error message (typically the rejection's `.message` string).
 */
export async function getApplyErrorBannerState(page: Page): Promise<ApplyErrorBannerState> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return { visible: false, message: null }
    const banner = root.querySelector('.cortex-apply-error[role="alert"]')
    if (!banner) return { visible: false, message: null }
    const msgEl = banner.querySelector('span')
    return {
      visible: true,
      message: msgEl?.textContent?.trim() ?? null,
    }
  })
}

/**
 * Click the Dismiss button (`.cortex-apply-error__dismiss`) on the apply
 * error banner. Returns `true` if found and clicked, `false` otherwise.
 *
 * The dismiss button's `onClick` sets `applyError` to null in Panel.tsx, which
 * unmounts the banner on the next render. Callers should assert the return
 * value is `true` so a missing/renamed button fails loudly.
 */
export async function dismissApplyErrorBanner(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-cortex-host]')
    const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) return false
    const btn = root.querySelector<HTMLButtonElement>('.cortex-apply-error__dismiss')
    if (!btn) return false
    btn.click()
    return true
  })
}

// ─── NumericInput stale state ─────────────────────────────────────────────────

/**
 * Snapshot of a NumericInput control's stale indicator state.
 *
 * Fields:
 * - `stale`: true if the wrapper has CSS class `cortex-numeric-input--stale`.
 *   Applied by NumericInput.tsx:238 when `stale` prop is true.
 * - `tooltipText`: value of the `data-tooltip` attribute on the wrapper, or
 *   null if absent. When stale, this is `"Edit saved but HMR didn't apply —
 *   refresh to verify"` (NumericInput.tsx:230).
 * - `hasOverriddenClass`: true if the wrapper has `cortex-numeric-input--overridden`.
 *   Mutually exclusive with stale (NumericInput.tsx:239): `overridden && !stale`.
 */
export interface NumericInputStaleState {
  stale: boolean
  tooltipText: string | null
  hasOverriddenClass: boolean
}

/**
 * Snapshot the stale indicator state of a NumericInput in the Panel's Shadow
 * DOM. Returns `{ stale: false, tooltipText: null, hasOverriddenClass: false }`
 * when the shadow root is not reachable or no matching control is found.
 *
 * Selector strategy: in the current Panel design only one element is selected
 * at a time, so any `.cortex-numeric-input` in the shadow root belongs to that
 * selected element. When `property` is omitted, the first `.cortex-numeric-input`
 * is returned (caller asserts which property). When `property` is provided, the
 * lookup matches the control's `__label` text exactly (case-insensitive equality
 * after trim). Empty/missing labels never match — a missing label fails loudly
 * instead of silently picking the wrong control.
 *
 * Future-extension: when the Panel grows to render multiple selections at once,
 * add a `source` parameter and scope the lookup via the selection metadata. Not
 * adding it now to avoid a tautological dead arg.
 *
 * @param property - Optional label text (case-insensitive exact match after
 *   trim) to disambiguate when multiple controls are visible. The label text
 *   is the abbreviated section label (e.g. `"T"` for padding-top, set in the
 *   parent section's `<span class="cortex-numeric-input__label">`). When the
 *   property doesn't match any non-empty label, the helper returns the empty
 *   default (`stale: false`) so callers see a falsifiable failure.
 */
export async function getNumericInputStaleState(
  page: Page,
  property?: string,
): Promise<NumericInputStaleState> {
  return await page.evaluate(
    (prop) => {
      const host = document.querySelector('[data-cortex-host]')
      const root = host && (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) return { stale: false, tooltipText: null, hasOverriddenClass: false }

      const allInputs = Array.from(root.querySelectorAll('.cortex-numeric-input'))
      if (allInputs.length === 0) return { stale: false, tooltipText: null, hasOverriddenClass: false }

      let target: Element | null = null

      if (prop) {
        // Match by exact label text (case-insensitive). Empty/missing labels
        // never match — a missing label would otherwise tautologically match
        // every property because "" is the prefix of any string. No silent
        // fallback to first-stale: a wrong-call site MUST fail loudly so the
        // assertion is falsifiable.
        const propLower = prop.toLowerCase()
        target = allInputs.find((el) => {
          const labelEl = el.querySelector('.cortex-numeric-input__label')
          const labelText = labelEl?.textContent?.toLowerCase().trim() ?? ''
          return labelText.length > 0 && labelText === propLower
        }) ?? null
      } else {
        // No property filter — return the first control. Caller asserts which
        // property they expect (sub-issue D selects exactly one element with
        // a single relevant control).
        target = allInputs[0] ?? null
      }

      if (!target) return { stale: false, tooltipText: null, hasOverriddenClass: false }

      return {
        stale: target.classList.contains('cortex-numeric-input--stale'),
        tooltipText: (target as HTMLElement).dataset['tooltip'] ?? null,
        hasOverriddenClass: target.classList.contains('cortex-numeric-input--overridden'),
      }
    },
    property ?? null,
  )
}
