/**
 * Pure state-machine for cortex activation. Used by both the Vite and Webpack
 * adapters so the server-side activation contract has one authoritative
 * implementation and one test surface.
 *
 * No I/O. No DOM. No WebSocket. The adapter wires this helper to its transport
 * — the helper just answers "given current state and this request, what's the
 * next state and what should be broadcast?".
 *
 * Single-tab gating: when a browser tab sends cortex/set-active, the first tab
 * to do so is adopted as activeBrowserId and receives all subsequent
 * targetTabId-scoped broadcasts. Other tabs that try to activate get a
 * rejection and never see the cortex/active-changed broadcast.
 *
 * Pillar 3 (multi-tab fan-out) replaces activeBrowserId: string | null with a
 * Set<string> here and the broadcast loop in the adapters; this helper's
 * inputs and outputs do not need to change.
 */

/** Server-side activation state, owned by the dev-server adapter. */
export interface ActiveState {
  /** True when the cortex panel should be visible to the active client. */
  readonly editorActive: boolean
  /** ID of the browser tab currently in the broadcast set. null when no tab
   *  has claimed activation yet, or when activation came from a CLI client. */
  readonly activeBrowserId: string | null
}

/** Initial state at adapter startup — panel inactive, no tab adopted. */
export const initialActiveState: ActiveState = {
  editorActive: false,
  activeBrowserId: null,
}

/** A request to change activation state. tabId is present on browser-originated
 *  requests and absent on CLI-originated (MCP) requests. */
export interface SetActiveRequest {
  readonly active: boolean
  readonly tabId?: string
}

/** What the adapter should broadcast (or undefined when no broadcast needed). */
export interface ActiveChangedBroadcast {
  readonly active: boolean
  /** When set, only the addressed tab applies this broadcast. */
  readonly targetTabId?: string
}

/** Single-tab rejection signal — adapter sends cortex/inactive-tab to this tab. */
export interface InactiveTabRejection {
  readonly targetTabId: string
}

/** Evaluation result. The adapter writes back .next, broadcasts .broadcast if
 *  set, and sends .reject to the requesting tab if set. */
export interface SetActiveResult {
  readonly next: ActiveState
  readonly broadcast?: ActiveChangedBroadcast
  readonly reject?: InactiveTabRejection
}

/**
 * Decide what happens when a client requests an activation change.
 *
 * Idempotency: requests that match current state are no-ops (no state change,
 * no broadcast, no rejection). This is what makes cortex_activate safe to call
 * from any session without first checking status.
 *
 * Single-tab gate: when activeBrowserId is set, only that tab can drive
 * activation changes. Other tabs requesting activation are rejected; other
 * tabs requesting deactivation are silently no-op'd (they aren't the active
 * tab, so they have nothing to deactivate).
 */
export function evaluateSetActive(
  state: ActiveState,
  request: SetActiveRequest,
): SetActiveResult {
  const isFromBrowser = typeof request.tabId === 'string'

  // Single-tab gate (browser-originated only): a non-active tab cannot drive state.
  if (isFromBrowser && state.activeBrowserId !== null && state.activeBrowserId !== request.tabId) {
    if (request.active) {
      return { next: state, reject: { targetTabId: request.tabId as string } }
    }
    // Non-active tab requesting deactivation — silent no-op (they have nothing
    // to deactivate). Distinct from rejecting an activation attempt.
    return { next: state }
  }

  // Idempotency: state already matches request.
  if (state.editorActive === request.active) {
    // For browser-originated activations, also check tab adoption: if the
    // active tab matches us, no-op. If activeBrowserId is null and we're a
    // browser activation, adopt us even though editorActive is already true
    // (rare race: CLI activated first; first browser to ack adopts).
    if (!isFromBrowser || state.activeBrowserId === request.tabId) {
      return { next: state }
    }
    if (state.activeBrowserId === null && request.active) {
      const next: ActiveState = { editorActive: true, activeBrowserId: request.tabId ?? null }
      return { next, broadcast: { active: true, targetTabId: request.tabId } }
    }
    return { next: state }
  }

  // State change: apply it.
  const next: ActiveState = {
    editorActive: request.active,
    activeBrowserId: request.active ? (request.tabId ?? null) : null,
  }
  const broadcast: ActiveChangedBroadcast = isFromBrowser
    ? { active: request.active, targetTabId: request.tabId }
    : { active: request.active }
  return { next, broadcast }
}

/**
 * Called when the active browser tab disconnects (WebSocket close). Clears the
 * adoption pointer and deactivates so the next request can be honored.
 *
 * Returns a broadcast only when state actually changed. Adapters check
 * `result.broadcast` before sending.
 */
export function clearActiveBrowser(state: ActiveState, tabId: string): SetActiveResult {
  if (state.activeBrowserId !== tabId) {
    return { next: state }
  }
  if (!state.editorActive) {
    return { next: { editorActive: false, activeBrowserId: null } }
  }
  return {
    next: { editorActive: false, activeBrowserId: null },
    broadcast: { active: false },
  }
}
