import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel, ConnectionDisplay, Annotation, ActivityEntry, StyleCapability } from '../../adapters/types.js'
import type { EditError } from './EditErrorCard.js'
import { CSSOverrideManager } from '../override.js'
import { onDivergence } from '../override-bus.js'
import { CommandStack } from '../command-stack.js'
import { initSelection } from '../selection.js'
import type { SelectionHandle } from '../selection.js'
import { cortexAppReducer, initialCortexAppReducerState, applySelectionUpdate } from '../cortex-app-reducer.js'
import { expandSharedSource } from '../selection-source-expand.js'
import type { CortexAppReducerState, CortexAppAction, CortexAppEffect, EditDispatchEntry } from '../cortex-app-reducer.js'
// @ts-ignore — tinykeys has types but exports field doesn't include a "types" condition (TODO: add declare module shim when tinykeys updates)
import { tinykeys } from 'tinykeys'
import { getDeepActiveElement, isInputFocused, isCortexUIFocused, isRealEvent } from '../focus-utils.js'
import { detectStates } from '../state-detector.js'
import type { StateDeclarations, InteractionState } from '../state-detector.js'
import { HoverOverlay } from './HoverOverlay.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { SecondarySelectionOverlay } from './SecondarySelectionOverlay.js'
import { Panel } from './Panel.js'
import { Toolbar } from './Toolbar.js'
import { CommentPin } from './CommentPin.js'
import { ActivityLog } from './ActivityLog.js'
import { ErrorToast } from './ErrorToast.js'
import { CapabilityBanner } from './CapabilityBanner.js'
import { NoAnnotationsBanner } from './NoAnnotationsBanner.js'
import { TooltipLayer } from './TooltipLayer.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge } from '../hooks/useSnapToEdge.js'
import { useCanvasZoom } from '../hooks/useCanvasZoom.js'
import { captureSelectionMetadata, reResolveSelection, shouldRefreshOnHMR } from '../selection-metadata.js'
import type { SelectionMetadata } from '../selection-metadata.js'
import { dismissTopmostPopover, hasOpenPopover } from '../popover-stack.js'

export interface CortexAppProps {
  channel: CortexChannel
  shadowRoot: ShadowRoot
  initialActive?: boolean
}

/**
 * Root component. Wires selection events, overlay rendering,
 * CSS override manager, channel message handling, and panel
 * drag/snap positioning. Canvas zoom hook is wired but currently
 * disabled — preserved for future re-enablement.
 */
export function CortexApp({ channel, shadowRoot, initialActive }: CortexAppProps): JSX.Element | null {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null)
  const [selectedElements, setSelectedElementsState] = useState<HTMLElement[]>([])
  // Back-compat alias — primaryElement for all CSS parsing and existing callsites (ZF0-1195).
  const selectedElement = selectedElements[0] ?? null
  // Monotonic counter bumped on every `hmr-applied` message (ZF0-1292).
  // Flowed to Panel so stylesheet-only source edits (App.css rule changes,
  // @theme token changes, ancestor cascade changes) force a getComputedStyle
  // re-read and shared-class re-detect. The MutationObserver in Panel only
  // sees the selected element's own attributes — it cannot catch these.
  const [hmrAppliedVersion, setHmrAppliedVersion] = useState(0)
  // ZF0-1470 (T4 fix-up, IMPORTANT 1): monotonic counter that bumps on EVERY
  // hmr-applied event, regardless of shouldRefreshOnHMR(). Used by Panel's
  // buffer-reconcile effect so buffered intents on non-selected elements are
  // re-evaluated when their source files change. hmrAppliedVersion is gated on
  // shouldRefresh (selection-awareness); hmrEventVersion is always-bump —
  // reconcile must run for ALL buffered intents, not just those affecting the
  // selected element.
  const [hmrEventVersion, setHmrEventVersion] = useState(0)
  const [swatches, setSwatches] = useState<string[] | undefined>(undefined)
  const [textComponents, setTextComponents] = useState<
    import('../../core/text-components.js').TextComponent[] | undefined
  >(undefined)
  const [colorChips, setColorChips] = useState<
    Array<{ name: string; hex: string }> | undefined
  >(undefined)
  const [spacingTokens, setSpacingTokens] = useState<
    import('../../core/tailwind-resolver.js').SpacingToken[] | undefined
  >(undefined)
  const [activeState, setActiveState] = useState<InteractionState>('default')
  const [availableStates, setAvailableStates] = useState<StateDeclarations | undefined>(undefined)
  const [hasBefore, setHasBefore] = useState(false)
  const [hasAfter, setHasAfter] = useState(false)
  const [hoverEnabled, setHoverEnabled] = useState(true)
  const overrideRef = useRef<CSSOverrideManager | null>(null)
  const commandStackRef = useRef<CommandStack | null>(null)
  const flushCommitRef = useRef<(() => void) | null>(null)
  // Suppresses phantom re-edits from Panel re-renders during undo/redo.
  // Set true before undo, cleared via nested setTimeout after Preact re-renders settle.
  // undoGenRef prevents rapid Cmd+Z from clearing the flag too early: only the
  // timeout from the latest undo/redo clears it (earlier ones see a stale generation).
  const undoInProgressRef = useRef(false)
  const undoGenRef = useRef(0)
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map())
  const [agentConnected, setAgentConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionDisplay>({ status: 'connected' })
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  // ZF0-1470 (T4): stale override signals from CSSOverrideManager.onStale (T1 API).
  // staleOverrideCount drives the StagingDriftBanner; staleSources drives per-control
  // stale indicator in sections. Both flow down to Panel.
  const [staleOverrideCount, setStaleOverrideCount] = useState(0)
  const [staleSources, setStaleSources] = useState<Set<string>>(new Set())
  // ZF0-1470 (T4): changedFiles from hmr-applied message — passed to Panel so it can
  // call buffer.reconcile() with the bypass readSourceValue callback.
  const [hmrChangedFiles, setHmrChangedFiles] = useState<string[]>([])
  const [commentMode, setCommentMode] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [capabilitySystems, setCapabilitySystems] = useState<StyleCapability[]>([])
  // Error tracking: editId → source+property for lookup when edit_status:failed arrives
  const editDispatchRef = useRef<Map<string, { source: string; property: string; value: string }>>(new Map())
  // Active errors keyed by source\0property
  const [editErrors, setEditErrors] = useState<Map<string, EditError>>(new Map())

  /**
   * Remove an error by key — avoids new Map allocation when key is absent.
   * Mirrors the change into reducerStateRef so the next reducer dispatch
   * doesn't reintroduce the cleared key from a stale snapshot.
   */
  const clearEditError = useCallback((key: string): void => {
    setEditErrors(prev => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    if (reducerStateRef.current.editErrors.has(key)) {
      const nextErrors = new Map(reducerStateRef.current.editErrors)
      nextErrors.delete(key)
      reducerStateRef.current = { ...reducerStateRef.current, editErrors: nextErrors }
    }
  }, [])
  const commentModeRef = useRef(false)
  commentModeRef.current = commentMode

  // Activity, active state, refs
  const [activityCount, setActivityCount] = useState(0)
  const [active, setActive] = useState(initialActive ?? false)
  const selectionRef = useRef<SelectionHandle | null>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)
  selectedElementRef.current = selectedElement
  // Metadata captured at selection time — survives HMR node replacement
  // and drives the smart-fallback re-resolution (ZF0-1292 architecture
  // review: nth-index + content-hash + shadow-root flag). Null whenever
  // selectedElement is null.
  const selectionMetadataRef = useRef<SelectionMetadata[]>([])
  const handleExitRef = useRef<(() => void) | null>(null)
  // Mirror of `handleEditDispatch` for the test bridge. The mount effect that
  // installs `__CORTEX_TEST__` runs once with deps `[channel, shadowRoot]`, so
  // capturing `handleEditDispatch` directly there would freeze the first-render
  // closure. Today that closure is stable (deps are `[clearEditError]`), but a
  // future non-stable dep would silently route the bridge through stale state.
  // The thunk pattern (used by `handleExitRef`) keeps the bridge calling the
  // latest closure regardless of how `handleEditDispatch`'s deps evolve.
  const editDispatchHandlerRef = useRef<((editId: string, source: string, property: string, value: string) => void) | null>(null)
  // Test-only: bridge.stageEdit lets e2e specs seed the staging buffer
  // directly (the prod path is buffer.append() inside Panel.commitScrub —
  // only triggered by user slider release). The bridge surface is gated
  // by __CORTEX_TEST_BUILD__ && debugFlag and DCEs cleanly. The
  // stageEditRef + Panel's useEffect cannot be gated (React Rules of
  // Hooks), so they ship as runtime-inert plumbing — the ref defaults to
  // undefined in prod (CortexApp passes `__CORTEX_TEST_BUILD__ ? ref : undefined`
  // as the prop), the useEffect's `if (stageEditRef)` guard short-circuits,
  // ~150 bytes of dead branch. Returns the intentId so specs can inject discard.
  const stageEditRef = useRef<((source: string, property: string, value: string) => string) | null>(null)
  // TEST-ONLY: bridge.commitEdit triggers the full applyOverride → commitScrub →
  // commandStack.record + buffer.append fan-out so e2e specs can exercise undo
  // without going through actual panel UI. Gated identically to stageEditRef.
  const commitEditRef = useRef<((property: string, value: string) => Promise<void>) | null>(null)
  // TEST-ONLY: bridge.buffer.list/size read the staging buffer contents. Panel
  // populates this via bufferListRef so the bridge can expose them synchronously.
  const bufferListRef = useRef<{
    list: () => import('../hooks/useEditStagingBuffer.js').PendingEdit[]
    size: () => number
  } | null>(null)
  // Exposed outside the useEffect so UI handlers (X-button, Toolbar close) can
  // route through the reducer rather than calling setActive(false) directly.
  // Populated by the mount effect — may be null during first paint when
  // initialActive is true (handleClose has a fallback for that case).
  const dispatchRef = useRef<((action: CortexAppAction) => void) | null>(null)
  // Component-scope mirror of the reducer's state. Component handlers that
  // mutate reducer-owned slices (clearEditError, handleActivityToggle's badge
  // reset, handleExit's safety-net setActive(false)) must keep this in sync,
  // otherwise the next reducer dispatch would overwrite their changes with a
  // stale slice value (Copilot review on PR #84).
  const reducerStateRef = useRef<CortexAppReducerState>({
    ...initialCortexAppReducerState,
    active: initialActive ?? false,
  })

  // Panel positioning
  const { position: panelPosition, isSnapping: panelSnapping, setPosition: setPanelPosition, snap: panelSnap } = useSnapToEdge()
  const { handlePointerDown: panelPointerDown, handlePointerMove: panelPointerMove, handlePointerUp: panelPointerUp, handlePointerCancel: panelPointerCancel } = useDrag({
    onDrag(x, y) { setPanelPosition({ x, y }) },
    onDragEnd() { panelSnap() },
  })

  // Canvas zoom (disabled — preserved for future re-enablement)
  useCanvasZoom(false)

  // Selection setter that keeps selectionMetadataRef in sync. Every path
  // that sets a positive selection must go through this helper so the HMR
  // re-resolver has valid metadata. Empty-array paths (exit, escape, failed
  // re-resolve) also clear metadata here.
  // Declared above the mount effect so later readers see it before its
  // first use — avoids the forward-reference ambiguity a reviewer flagged.
  //
  // Accepts (elements, action). Delegates the replace/add/toggle algorithm to
  // the pure helper `applySelectionUpdate` — single source of truth for
  // selection-state algebra. Identity-stable: when the helper returns `prev`
  // (no-op add or replace-with-same-elements), Preact bails out of the
  // re-render and metadata is not re-captured.
  //
  // ZF0-1195 Follow-up A: incoming `elements` are auto-expanded to include
  // every DOM node sharing the same `data-cortex-source` attribute. This makes
  // the editor model honest — JSX inside `.map()` produces N runtime nodes
  // that share one source, and the CSS override layer keys on source, so
  // editing any one of them affects all N. Expanding selection up-front means
  // the UI shows the user the full set their edit will affect, instead of
  // letting them pick a subset that the override layer cannot honor.
  const setSelection = useCallback((elements: HTMLElement[], action: 'replace' | 'add' | 'toggle' = 'replace'): void => {
    const expanded = expandSharedSource(elements)
    setSelectedElementsState(prev => {
      const next = applySelectionUpdate(prev, expanded, action)
      if (next !== prev) {
        selectionMetadataRef.current = next.map(el => captureSelectionMetadata(el))
      }
      return next
    })
  }, [])

  // Legacy-compat shim — single element or null → setSelection([], 'replace') or setSelection([el], 'replace').
  // Used by the test bridge, HMR re-resolver, and escape/exit paths that set null.
  const setSelectionWithMetadata = useCallback((el: HTMLElement | null): void => {
    setSelection(el ? [el] : [], 'replace')
  }, [setSelection])

  useEffect(() => {
    // Disposal guard for async work (HMR re-resolution timers, rAF callbacks)
    // scheduled from the message handler. When CortexApp unmounts — route
    // change, test teardown — pending timers must not fire state updates
    // against a disposed component. The flag flips in cleanup and is read
    // by attemptReResolve below; timers become no-ops rather than throwing
    // state-update-after-unmount warnings.
    let disposed = false

    // Initialize CSS override manager and command stack
    const overrideManager = new CSSOverrideManager()
    overrideRef.current = overrideManager
    const commandStack = new CommandStack()
    commandStackRef.current = commandStack

    // ZF0-1470 (T4 A1): subscribe to override TTL eviction events. Fires when an
    // applied override passes its 30s TTL without hmr_verified arriving — signals
    // the edit may not have landed on disk. Component-scope setters flow state to
    // Panel's StagingDriftBanner and per-control stale indicators.
    const disposeStale = overrideManager.onStale((staleSet) => {
      setStaleOverrideCount(staleSet.size)
      setStaleSources(new Set(staleSet)) // defensive copy already made by emitStale
    })

    // Initialize selection system. The `setSelection` callback is the ONE
    // point of entry for populating `selectedElements` — the mount effect
    // uses it here, and every keyboard/click handler routes through it.
    // This prevents a new contributor from introducing a fresh selection
    // path that bypasses metadata capture (Round 2 frontend-clink + mts-native finding).
    const selectionHandle = initSelection(
      shadowRoot,
      setHoveredElement,
      setSelection,
    )

    // Debug-only test bridge — dual-gated to close ZF0-1298 (XSS via dev server).
    //
    // `__CORTEX_TEST_BUILD__` is a build-time constant injected by esbuild
    // `define` in tsup.config.ts. Production `npm run build` sets it to `false`;
    // esbuild DCE strips this entire block from the production bundle — the
    // bridge code simply does not exist in customer-shipped bundles, so no
    // runtime flag flip can revive it. `npm run build:test` sets it to `true`,
    // producing the bundle the Playwright harness consumes.
    //
    // `debugFlag` (reading `window.__CORTEX_DEBUG_OVERRIDES__`) is preserved
    // as a defense-in-depth runtime opt-in inside test bundles. Specs arm it
    // explicitly via `setupDebugBridge` in tests/e2e/helpers/bridge.ts.
    //
    // Why dual-gate and not just flip to build-time-only? An attacker who
    // compromises a test fixture still has to flip a second flag to reach
    // the bridge, and `__CORTEX_DEBUG_OVERRIDES__`'s other (legitimate)
    // uses — tracing in override.ts, Debug disclosure in EditErrorCard,
    // debug styles — stay orthogonal to the bridge gate.
    const debugFlag = !!(window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__
    if (__CORTEX_TEST_BUILD__ && debugFlag) {
      ;(window as unknown as { __CORTEX_TEST__?: unknown }).__CORTEX_TEST__ = {
        overrideManager: {
          set: overrideManager.set.bind(overrideManager),
          flush: overrideManager.flush.bind(overrideManager),
          trackPendingEdit: overrideManager.trackPendingEdit.bind(overrideManager),
          handleHMRVerified: overrideManager.handleHMRVerified.bind(overrideManager),
          // TEST-ONLY: synchronously insert a stale tuple key (same format as
          // evictStalePendingEdits) and fire emitStale(). Bypasses the 30s TTL
          // + 5s sweep for deterministic Playwright specs. Accesses private
          // fields via cast — acceptable here since this entire block is DCE'd
          // from prod bundles by the build-gate constant fold (see line 244).
          //
          // Idempotency: only fires `emitStale()` when a NEW entry was added,
          // matching production at override.ts (evictStalePendingEdits only
          // emits when at least one entry was newly added). Calling twice with
          // identical args is a single logical state change → single listener
          // notification — required for tests asserting listener-call count.
          _testOnly_evictStale: (source: string, property: string, pseudo?: '::before' | '::after'): void => {
            // priorValuesKey format: `${source}\0${property}\0${pseudo ?? ''}`
            const mgr = overrideManager as unknown as {
              staleEntries: Set<string>
              emitStale(): void
            }
            const key = `${source}\0${property}\0${pseudo ?? ''}`
            const sizeBefore = mgr.staleEntries.size
            mgr.staleEntries.add(key)
            if (mgr.staleEntries.size !== sizeBefore) {
              mgr.emitStale()
            }
          },
        },
        channel,
        selectElement: setSelectionWithMetadata,
        // Expose the page-side `detectStates` call so Playwright specs can
        // exercise browser-only CSSOM branches without making it a public API.
        // The Map-to-object conversion keeps the bridge return value
        // structured-clone friendly.
        detectStates: (el: HTMLElement) => {
          const states = detectStates(el)
          return {
            hover: Object.fromEntries(states.hover),
            focus: Object.fromEntries(states.focus),
            active: Object.fromEntries(states.active),
          }
        },
        // Expose the page-side `onDivergence` subscription so Playwright
        // specs can collect divergence events through Node-side callbacks.
        // The bus itself is module-scoped (private), but routing through
        // the bridge is strictly better than leaking events onto window:
        // the surface stays minimal, dual-gated, and keeps the same type
        // contract as the internal subscriber.
        onDivergence,
        // Expose handleEditDispatch so unit tests can seed editDispatchRef
        // without going through the scrub UI path. Routed through
        // `editDispatchHandlerRef` so the bridge always hits the latest
        // closure (mirrors the `handleExitRef` pattern). Throws if called
        // before first render commits — silent no-op would mask test setup
        // bugs where the test calls the bridge before render completes.
        handleEditDispatch: (editId: string, source: string, property: string, value: string) => {
          if (!editDispatchHandlerRef.current) {
            throw new Error('[cortex test bridge] handleEditDispatch called before render committed')
          }
          editDispatchHandlerRef.current(editId, source, property, value)
        },
        // TEST-ONLY: directly append a PendingEdit to Panel's staging buffer.
        // Allows e2e specs to drive the Apply button lifecycle without going through
        // the full scrub UI path. Routed through stageEditRef so Panel always exposes
        // the latest buffer.append instance (same pattern as flushCommitRef).
        //
        // Async because Panel's useEffect populates the ref AFTER first paint —
        // calling stageEdit immediately after waitForBridge resolves can race the
        // useEffect commit. Polls the ref at ~one-rAF cadence with a 2s ceiling
        // (well under Playwright's 10s default test timeout). The previous
        // synchronous version flaked ~1/6 times in suite-level runs because the
        // race depended on natural settling delays in caller code.
        //
        // Returns the intentId so callers can pass it to staged-edits-discard.
        stageEdit: async (source: string, property: string, value: string): Promise<string> => {
          const start = performance.now()
          while (!stageEditRef.current) {
            if (performance.now() - start > 2000) {
              throw new Error('[cortex test bridge] stageEdit timeout — Panel did not mount in 2000ms (was activateDesignMode called?)')
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 16))
          }
          return stageEditRef.current(source, property, value)
        },
        // TEST-ONLY: trigger the full applyOverride → commitScrub → commandStack.record
        // + buffer.append fan-out on the currently selected elements. Unlike stageEdit,
        // this path creates a PropertyEditCommand so the gesture is undoable via Cmd+Z.
        // Routed through commitEditRef (same thunk pattern as stageEditRef) so Panel
        // always exposes the latest applyOverride closure. Polls with a 2s ceiling.
        commitEdit: async (property: string, value: string): Promise<void> => {
          const start = performance.now()
          while (!commitEditRef.current) {
            if (performance.now() - start > 2000) {
              throw new Error('[cortex test bridge] commitEdit timeout — Panel did not mount in 2000ms (was activateDesignMode called?)')
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 16))
          }
          return commitEditRef.current(property, value)
        },
        // TEST-ONLY: expose buffer.list() and buffer.size() via bufferListRef.
        // Panel populates this ref; these closures delegate to the live ref so
        // callers always read current buffer state (no staleness risk).
        buffer: {
          list: () => bufferListRef.current?.list() ?? [],
          size: () => bufferListRef.current?.size() ?? 0,
        },
        // TEST-ONLY: set multi-element selection via setSelection(elements, 'replace').
        // Allows e2e specs to seed multi-select state without real click interactions.
        // selectElement (above) handles single-element selection via the legacy shim;
        // selectElements is the multi-element version for ZF0-1195 multi-select specs.
        selectElements: (els: HTMLElement[]) => setSelection(els, 'replace'),
      }
    }
    // Start with design mode disabled — don't intercept events until activated
    selectionHandle.setDesignMode(false)
    selectionRef.current = selectionHandle

    // reducerStateRef is component-scope (declared at line ~115) so component
    // handlers can keep it in sync when they bypass dispatch. The mount effect
    // re-uses that ref directly — no separate local copy.

    // Per-slice setters (not a single setState over the whole state) so Preact
    // can bail out per consumer. The reducer's reference-equality discipline
    // makes each `next.X !== prev.X` a meaningful guard rather than a tautology.
    const applyReducerState = (next: CortexAppReducerState, prev: CortexAppReducerState): void => {
      if (next.active !== prev.active) setActive(next.active)
      if (next.swatches !== prev.swatches) setSwatches(next.swatches)
      if (next.textComponents !== prev.textComponents) setTextComponents(next.textComponents)
      if (next.colorChips !== prev.colorChips) setColorChips(next.colorChips)
      if (next.spacingTokens !== prev.spacingTokens) setSpacingTokens(next.spacingTokens)
      if (next.capabilitySystems !== prev.capabilitySystems) setCapabilitySystems(next.capabilitySystems)
      if (next.activityCount !== prev.activityCount) setActivityCount(next.activityCount)
      if (next.editErrors !== prev.editErrors) setEditErrors(next.editErrors)
      if (next.annotations !== prev.annotations) setAnnotations(next.annotations)
      if (next.agentConnected !== prev.agentConnected) setAgentConnected(next.agentConnected)
      if (next.activityEntries !== prev.activityEntries) setActivityEntries(next.activityEntries)
    }

    const runEffect = (effect: CortexAppEffect): void => {
      // I4: Guard against effects firing after disposal (e.g., a queued
      // microtask from a channel message that arrived during cleanup).
      if (disposed) return
      switch (effect.type) {
        case 'send':
          channel.send(effect.message)
          return
        case 'log_warning':
          console.warn(effect.message)
          return
        case 'invoke_exit':
          handleExitRef.current?.()
          return
        case 'apply_hmr_verified':
          overrideRef.current?.handleHMRVerified(effect.editId, effect.match, effect.kind)
          return
        default: {
          // Compile-time exhaustiveness — mirrors the reducer's `never` default.
          // Forces TS to error if a new CortexAppEffect variant is added without
          // a matching wiring case here. Runtime throw makes the gap observable
          // even if a cast bypasses TS.
          const _exhaustive: never = effect
          throw new Error(`Unhandled cortex-app effect: ${JSON.stringify(_exhaustive)}`)
        }
      }
    }

    const dispatch = (action: CortexAppAction): void => {
      // I4: Guard against in-flight microtasks after disposal (channel message
      // arrives between disposed=true and unsubscribe taking effect).
      if (disposed) return
      const prev = reducerStateRef.current
      const { state: next, effects } = cortexAppReducer(prev, action)
      if (next !== prev) {
        reducerStateRef.current = next
        applyReducerState(next, prev)
      }
      // Per-effect isolation: a throw in one handler (e.g., channel.send
      // closing mid-flight) must not drop subsequent effects from the same
      // dispatch. log_warning + send for undo_sync_status:failed is the
      // canonical case where order matters and silent drop would be visible.
      for (const effect of effects) {
        try {
          runEffect(effect)
        } catch (err) {
          console.warn('[cortex] runEffect failed', err)
        }
      }
    }
    dispatchRef.current = dispatch

    // editDispatchRef is React-side state; the pure reducer can't read refs,
    // so we snapshot the entry into the action before dispatching. Only consume
    // (delete) the entry on terminal statuses — `writing`/`cancelled` keep the
    // entry alive so the eventual `done`/`failed` can consume it.
    const popDispatchEntry = (editId: string): EditDispatchEntry | undefined => {
      const entry = editDispatchRef.current.get(editId)
      if (entry) editDispatchRef.current.delete(editId)
      return entry
    }

    // Listen-first ordering: subscribe to onMessage BEFORE sending init. The server's
    // hello response is async, so attaching this handler first guarantees it's live
    // when the response arrives. Emitting init before this line would race.
    const unsubscribe = channel.onMessage((msg) => {
      // edit_status: ref-lookup before dispatch (impure boundary).
      // The dispatch entry comes from editDispatchRef which is mutable React-side state.
      // We must read AND mutate the ref BEFORE dispatching, so the reducer receives a
      // stable action snapshot.
      if (msg.type === 'edit_status') {
        // Only `done` and `failed` are reducer-modeled. `writing` and `cancelled`
        // pass through silently — and crucially must NOT consume the dispatch
        // entry (a `done` typically follows; the entry must survive). This mirrors
        // the legacy if-chain which only deleted the entry inside done/failed.
        if (msg.status === 'done') {
          dispatch({ type: 'edit_status', status: 'done', editId: msg.editId, dispatch: popDispatchEntry(msg.editId) })
        } else if (msg.status === 'failed') {
          dispatch({ type: 'edit_status', status: 'failed', editId: msg.editId, reason: msg.reason, dispatch: popDispatchEntry(msg.editId) })
        }
        return
      }

      // hmr-applied: STAYS INLINE — out of scope for ZF0-1363 (handled by ZF0-1362's
      // selection-metadata.ts pure functions). The complex HMR re-resolution logic
      // (rAF + setTimeout fan-out, disposal guards, selection-metadata refresh) is
      // not yet modelable as effects-as-data without re-architecting that ticket.
      if (msg.type === 'hmr-applied') {
        overrideRef.current?.onHMRApplied()

        // Defensive: even though the types declare files?: string[], the
        // channel is trusted to enforce the contract. A malformed non-array
        // `files` from a future adapter bug would crash .some() / .map().
        // Normalize to undefined so the downstream gate treats it as "unknown".
        const rawFiles = msg.files
        const files: string[] | undefined = Array.isArray(rawFiles) && rawFiles.every(f => typeof f === 'string')
          ? rawFiles
          : undefined

        // ZF0-1470 (T4 fix-up, IMPORTANT 1): always-bump counter for buffer reconcile.
        // Panel's reconcile effect uses hmrEventVersion (not hmrAppliedVersion) so it
        // fires on every HMR event regardless of selection-awareness. Buffered intents
        // for non-selected elements must be reconciled when their source files change —
        // even when shouldRefreshOnHMR returns false for the selected element.
        setHmrEventVersion(v => v + 1)

        // Gate the Panel refresh (getComputedStyle cascade + detectSharedClasses
        // over full DOM) on whether the changed files can possibly affect the
        // selected element. Skip only when we're confident: server provided a
        // non-empty file list AND no CSS/virtual files AND no ancestor source
        // is in the list (up to 20 levels). Otherwise — absent / empty / typo
        // — err toward refresh. If nothing is selected, there is nothing to
        // refresh (Panel renders empty state, no overlay, no Layer Tree),
        // so skip the version bump outright.
        const shouldRefresh = shouldRefreshOnHMR(files, selectedElementRef.current)
        if (shouldRefresh) {
          setHmrAppliedVersion(v => v + 1)
        }

        // ZF0-1470 (T4 A2): capture changedFiles for Panel's buffer.reconcile() call.
        // Always update — even when shouldRefresh is false — because reconcile uses its
        // own file-intersection logic (stripLineCol on source paths) independently of
        // the DOM-refresh heuristic above. An empty/absent files list is represented
        // as [] so Panel's reconcile early-returns cleanly (changedFiles.length === 0).
        setHmrChangedFiles(files ?? [])

        // Re-resolve the selection after HMR node replacement. Runs
        // synchronously (catches CSS-only / classname-flip cases where the
        // DOM is already committed) AND after double-rAF (catches React
        // Fast Refresh, which schedules DOM commits via the React scheduler
        // past `vite:afterUpdate`'s firing point).
        //
        // Smart-fallback via `reResolveSelection`: primary=nth-index match,
        // secondary=content-search for reorder detection, tertiary=preserve
        // at index for in-place content edits. See selection-metadata.ts.
        // Re-run the resolver against the LIVE DOM. If the saved element is
        // no longer the right answer, swap. This replaces the earlier
        // `isConnected`-gated version — which missed the case where React
        // Fast Refresh defers its DOM commit past the hmr-applied signal,
        // so at that moment the selected node is still connected *in the
        // old DOM tree* that's about to be replaced.
        const attemptReResolve = (): void => {
          // Disposal guard: pending timers/rAFs fire as no-ops after unmount.
          if (disposed) return
          try {
            const current = selectedElementRef.current
            // Re-resolution operates on the primary element (index 0) only.
            // Multi-element re-resolve is intentionally deferred — it will be
            // wired in a later ZF0-1195 task once multi-element gestures
            // actually drive the system. Today the secondary selection slots
            // exist in state but are not exercised by user input.
            const meta = selectionMetadataRef.current[0] ?? null
            if (!current || !meta) return
            const resolved = reResolveSelection(meta)
            if (resolved !== current) {
              // Ref has drifted (element removed, list shrunk, Fast Refresh
              // replaced the node, or content-hash fallback found a better
              // match at a different position). Swap.
              setSelectionWithMetadata(resolved)
              return
            }
            // Same DOM node, but its position in siblings may have shifted
            // (e.g. reorder preserved the Cherry <li> via `key=` but its
            // index changed from 2 → 0). Recapture metadata so the next
            // HMR cycle starts from the correct index.
            if (resolved) {
              const newMeta = captureSelectionMetadata(resolved)
              const indexShifted = newMeta.index !== meta.index
              // Preserve metadata for all elements; only update primary (index 0).
              const updatedMeta = [...selectionMetadataRef.current]
              updatedMeta[0] = newMeta
              selectionMetadataRef.current = updatedMeta
              // If the position drifted, views that cached against the OLD
              // DOM layout (LayerTree's sibling list, SelectionOverlay's
              // position) need to re-read. Bumping hmrAppliedVersion again
              // triggers a fresh Panel render that happens AFTER React Fast
              // Refresh has committed — which the initial bump in the
              // message handler couldn't guarantee because Preact microtasks
              // run before React's scheduler tasks.
              if (indexShifted) {
                setHmrAppliedVersion(v => v + 1)
              }
            }
          } catch (err) {
            console.warn('[cortex] reResolveSelection failed', err)
            setSelectionWithMetadata(null)
          }
        }

        // Gate re-resolution on the same predicate as the version bump
        // (ZF0-1298 follow-up). If the HMR files don't affect our selection,
        // React Fast Refresh can't have swapped the selected DOM node — so
        // `attemptReResolve` has nothing to resolve and its 5 fan-outs
        // (sync + 2 rAFs + 100ms + 250ms setTimeouts) are pure waste.
        // Previously ungated, which meant every HMR event (even unrelated
        // ones) ran reResolveSelection + captureSelectionMetadata against
        // the live DOM. Observable in the "skips Panel refresh when hmr
        // files are fully unrelated" test — the 6 getComputedStyle calls
        // that flaked CI were this ungated work, not the gated refresh.
        if (shouldRefresh) {
          attemptReResolve()
          // Frame-deferred: catches React sync commits + most Fast Refresh commits.
          requestAnimationFrame(() => requestAnimationFrame(attemptReResolve))
          // Scheduler-deferred: React 18's concurrent mode can schedule commits
          // through its priority scheduler beyond 2 rAFs. 100ms is empirically
          // sufficient for typical updates; 250ms is the safety net for slow
          // machines or heavy subtree remounts. Both are bounded and idempotent —
          // if the selection is already settled, each call is a ~microsecond no-op.
          setTimeout(attemptReResolve, 100)
          setTimeout(attemptReResolve, 250)
        }
        return
      }

      // 'error' channel messages aren't reducer-modeled. Other consumers
      // (ErrorToast subscribes to the channel directly) handle them. The legacy
      // if-chain silently fell through; preserve that semantics so the reducer's
      // exhaustive throw doesn't fire on every error message.
      if (msg.type === 'error') return

      // staged-edits-discard is owned by Panel.tsx's onMessage subscriber
      // (which removes the discarded intents from the canonical buffer). It's
      // a browser-side mirror update, not a CortexAppAction — early-return so
      // the reducer's exhaustive default doesn't fire and log on every
      // cortex_discard_edits call.
      if (msg.type === 'staged-edits-discard') return

      // staged-edits-acked (ZF0-1469) is consumed by channel.sendAndAck's
      // one-shot listener — it correlates the requestId and resolves the Apply
      // button's pending Promise. Not a CortexAppAction; early-return so the
      // reducer's exhaustive default doesn't fire and log on every Apply.
      if (msg.type === 'staged-edits-acked') return

      // After the early returns above (edit_status, hmr-applied, error), `msg.type`
      // matches a CortexAppAction discriminant. The cast is a forcing cast — TS
      // does not narrow ServerToBrowser to CortexAppAction across the assignment.
      // The reducer's exhaustive `never` default is the runtime safety net: any
      // new ServerToBrowser variant not modeled by CortexAppAction will throw at
      // dispatch time, surfacing the drift in CI.
      dispatch(msg as CortexAppAction)
    })

    // Handshake signal — server responds with 'hello' carrying swatches + design-system
    // data. Placed AFTER onMessage subscription above so the response is guaranteed
    // to reach the handler. Idempotent on the server, so strict-mode double-mount
    // and HMR re-mount both work without special-casing.
    channel.send({ type: 'init', sessionId: window.__CORTEX_SESSION_ID__ })

    // Track whether we were disconnected for the "reconnected" flash
    let wasDisconnected = false
    let reconnectedTimer: ReturnType<typeof setTimeout> | undefined

    const unsubStatus = channel.onConnectionChange((state) => {
      if (state.status === 'connected' && wasDisconnected) {
        // Transition from disconnected/reconnecting → connected = "reconnected" flash
        setConnectionStatus({ status: 'reconnected' })
        if (reconnectedTimer !== undefined) clearTimeout(reconnectedTimer)
        reconnectedTimer = setTimeout(() => {
          setConnectionStatus({ status: 'connected' })
          reconnectedTimer = undefined
        }, 2000)
        wasDisconnected = false
      } else {
        if (state.status === 'reconnecting' || state.status === 'disconnected') {
          wasDisconnected = true
        }
        setConnectionStatus(state)
        // If we were showing "reconnected" but connection drops again, cancel the auto-dismiss
        if (reconnectedTimer !== undefined) {
          clearTimeout(reconnectedTimer)
          reconnectedTimer = undefined
        }
      }
    })

    // Override divergence → Panel error card. Fires when the browser-side verifier
    // determines the source write succeeded per the server but the DOM didn't
    // reflect the expected value (e.g., React Fast Refresh skipped the element).
    // Dispatched through the reducer so editErrors is a single source of truth.
    const unsubDivergence = onDivergence((d) => dispatch({ type: 'divergence', diagnostic: d }))

    return () => {
      disposed = true
      unsubscribe()
      unsubStatus()
      unsubDivergence()
      disposeStale()
      if (reconnectedTimer !== undefined) clearTimeout(reconnectedTimer)
      selectionHandle.cleanup()
      selectionRef.current = null
      overrideManager.dispose()
      overrideRef.current = null
      commandStack.clear()
      commandStackRef.current = null
      dispatchRef.current = null
      // Clear the debug bridge so a remount (strict mode, HMR, route change)
      // doesn't leave a stale reference to the now-disposed overrideManager.
      // Dual-gate matches the install site — in production bundles this
      // `if` block is DCE'd by esbuild `minifySyntax`. The `debugFlag` read
      // on mount (~line 177) survives DCE (constant folding doesn't remove
      // unused `const` declarations), but the read is side-effect-free
      // (boolean coercion only) and never touches `window.__CORTEX_TEST__`.
      if (__CORTEX_TEST_BUILD__ && debugFlag) {
        delete (window as unknown as { __CORTEX_TEST__?: unknown }).__CORTEX_TEST__
      }
    }
  }, [channel, shadowRoot])

  // Detect interaction states and pseudo-elements on element selection change
  useEffect(() => {
    // Always clear state overrides when selection changes (even to another element)
    overrideRef.current?.clearStateOverrides()

    if (!selectedElement) {
      setAvailableStates(undefined)
      setActiveState('default')
      setHasBefore(false)
      setHasAfter(false)
      return
    }

    // Detect available interaction states via CSSOM inspection
    const states = detectStates(selectedElement)
    setAvailableStates(states)
    setActiveState('default')

    // Detect pseudo-elements
    const beforeContent = getComputedStyle(selectedElement, '::before').content
    const afterContent = getComputedStyle(selectedElement, '::after').content
    setHasBefore(beforeContent !== 'none' && beforeContent !== '')
    setHasAfter(afterContent !== 'none' && afterContent !== '')

    // 6.3: Auto-scroll — bring off-viewport elements into view
    const rect = selectedElement.getBoundingClientRect()
    const offScreen = rect.top < 0 || rect.bottom > window.innerHeight ||
                      rect.left < 0 || rect.right > window.innerWidth
    if (offScreen) {
      selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedElement])

  // Handle state changes from the lens overlay
  const handleStateChange = useCallback((state: InteractionState) => {
    const manager = overrideRef.current
    if (!manager || !selectedElement) return

    if (state === 'default') {
      manager.clearStateOverrides()
      setActiveState(state)
    } else if (availableStates) {
      const declarations = availableStates[state]
      if (declarations.size > 0) {
        const source = selectedElement.getAttribute('data-cortex-source')
        if (source) {
          manager.setStateOverrides(source, declarations)
          setActiveState(state)
        } else {
          console.warn('[cortex] Cannot force state: element missing data-cortex-source')
        }
      }
    }
  }, [selectedElement, availableStates])

  const handleCommentMode = useCallback(() => setCommentMode(m => !m), [])
  const handleActivityToggle = useCallback(() => {
    setShowActivity(prev => {
      if (!prev) {
        setActivityCount(0) // reset badge on open
        // Mirror into reducerStateRef so the next activity-entry dispatch
        // increments from 0, not from the pre-reset count.
        reducerStateRef.current = { ...reducerStateRef.current, activityCount: 0 }
      }
      return !prev
    })
  }, [])
  const handleCommentReply = useCallback((annotationId: string, text: string) => {
    channel.send({ type: 'comment-reply', annotationId, text })
  }, [channel])

  const handleSelectElement = useCallback(
    (el: HTMLElement | null) => setSelectionWithMetadata(el),
    [setSelectionWithMetadata],
  )
  const handleToggleHover = useCallback(() => setHoverEnabled(v => !v), [])

  const handleEditDispatch = useCallback((editId: string, source: string, property: string, value: string) => {
    const map = editDispatchRef.current
    if (map.size >= 500) {
      // Evict oldest entry to prevent unbounded growth if server never responds
      const firstKey = map.keys().next().value
      if (firstKey) map.delete(firstKey)
    }
    map.set(editId, { source, property, value })
    // A new edit supersedes any prior divergence card for the same source+property.
    // Without this, a stale divergence from the previous edit would persist through
    // the new edit's lifecycle and mislead the user.
    clearEditError(`${source}\0${property}`)
  }, [clearEditError])
  editDispatchHandlerRef.current = handleEditDispatch

  const handleDismissError = clearEditError

  // Exit handler — notify server, deactivate.
  // Called by the invoke_exit effect (which fires when the reducer processes a
  // cortex-close action). The setActive(false) + reducerStateRef sync below is
  // a safety net for paths that reach handleExit without going through dispatch
  // (e.g., handleClose's first-paint fallback when dispatchRef isn't yet
  // populated). The normal path already has active: false in reducer state by
  // this point, so the sync is a no-op there.
  const handleExit = useCallback(() => {
    setCommentMode(false)
    setSelectionWithMetadata(null)
    setActive(false)
    reducerStateRef.current = { ...reducerStateRef.current, active: false }
    channel.send({ type: 'cortex-closed' })
  }, [channel, setSelectionWithMetadata])
  handleExitRef.current = handleExit

  // Close handler for UI elements (X-button, Toolbar close).
  // Routes through the reducer so reducerStateRef.active stays in sync —
  // preventing the close→reopen desync where cortex-close left active: true
  // in the reducer ref while React state was false (C1 fix, ZF0-1363).
  // First-paint fallback: dispatchRef is populated inside the mount useEffect.
  // When initialActive is true the toolbar renders before the effect fires, so
  // a click on the close button can race with mount. Falling back to handleExit
  // (which keeps reducerStateRef in sync) makes early closes deactivate
  // correctly without reintroducing the C1 desync (Copilot review on PR #84).
  const handleClose = useCallback(() => {
    if (dispatchRef.current) {
      dispatchRef.current({ type: 'cortex-close' })
      return
    }
    handleExit()
  }, [handleExit])

  // Cascading Escape — capture phase for host app compat
  useEffect(() => {
    if (!active) return
    function handleEscape(e: KeyboardEvent): void {
      if (!isRealEvent(e)) return
      if (e.key !== 'Escape') return

      // Priority 1: Blur focused input inside Cortex UI.
      // Skip when a popover is open — TokenPresetPopover (and any future popover
      // anchored to an input) keeps focus on the input via onMouseDown
      // preventDefault so picks don't blur-commit prematurely. If we still
      // blurred here, the user would need TWO Escape presses to close the
      // popover (first press blurs input, second press dismisses popover).
      // Letting Priority 2.5 dismiss the popover first matches the LIFO
      // expectation: Escape closes the topmost interactive layer.
      if (isCortexUIFocused() && !hasOpenPopover()) {
        const focused = getDeepActiveElement()
        if (focused instanceof HTMLElement) {
          const tag = focused.tagName.toLowerCase()
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || focused.isContentEditable) {
            focused.blur()
            e.stopPropagation()
            e.preventDefault()
            return
          }
        }
      }

      // Skip if user is focused on a host app input — let browser/host handle it
      if (isInputFocused() && !isCortexUIFocused()) return

      // Priority 2: Exit comment mode
      if (commentModeRef.current) {
        setCommentMode(false)
        e.stopPropagation()
        e.preventDefault()
        return
      }

      // Priority 2.5: Dismiss the topmost open popover (chip picker, etc.)
      // before falling through to deselect. Without this, one Escape press
      // would collapse two UI layers — close the picker AND deselect the
      // element — which users reported as "Escape closes the panel."
      if (dismissTopmostPopover()) {
        e.stopPropagation()
        e.preventDefault()
        return
      }

      // Priority 3: Deselect element
      if (selectedElementRef.current) {
        setSelectionWithMetadata(null)
        e.stopPropagation()
        e.preventDefault()
        return
      }

      // No Priority 4 — Cmd+Shift+. and X button are the only close mechanisms.
      // This intentionally deviates from the spec's Section 4 cascade which included
      // a close step. Removed per architecture review finding H5 to prevent accidental
      // editor close on extra Escape press.
    }

    window.addEventListener('keydown', handleEscape, { capture: true })
    return () => window.removeEventListener('keydown', handleEscape, { capture: true })
  }, [active])

  // tinykeys keyboard shortcuts — bubble phase, guarded
  useEffect(() => {
    if (!active) return

    function guardSingleKey(handler: () => void): (e: KeyboardEvent) => void {
      return (e: KeyboardEvent) => {
        if (!isRealEvent(e)) return
        if (isInputFocused() || isCortexUIFocused()) return
        handler()
      }
    }

    function guardModifier(handler: () => void): (e: KeyboardEvent) => void {
      return (e: KeyboardEvent) => {
        if (!isRealEvent(e)) return
        // Block when a host-app input is focused (allow native text undo).
        // Allow when a cortex panel input is focused (Cmd+Z should undo edits).
        if (isInputFocused() && !isCortexUIFocused()) return
        // Prevent browser native text undo/redo in cortex inputs — otherwise
        // it changes the input value, sets userTypedRef, and triggers a phantom
        // edit on blur that conflicts with the cortex undo.
        e.preventDefault()
        handler()
      }
    }

    const unsubscribe = tinykeys(window, {
      'v': guardSingleKey(() => setCommentMode(false)),
      'c': guardSingleKey(() => setCommentMode(m => !m)),
      '$mod+z': guardModifier(() => {
        if (isCortexUIFocused()) {
          const activeEl = getDeepActiveElement()
          if (activeEl instanceof HTMLElement) activeEl.blur()
        }
        flushCommitRef.current?.()
        undoInProgressRef.current = true
        // Preact batches re-renders via setTimeout (macrotask), which fires AFTER
        // requestAnimationFrame. Use nested setTimeout so the flag outlives the
        // Preact re-render that triggers phantom onChange from sections.
        // Generation counter ensures rapid Cmd+Z doesn't clear the flag too early:
        // only the timeout from the latest undo/redo actually clears it.
        const gen = ++undoGenRef.current
        setTimeout(() => setTimeout(() => {
          if (undoGenRef.current === gen) undoInProgressRef.current = false
        }))
        try {
          const cmd = commandStackRef.current?.undo()
          if (cmd) {
            overrideRef.current?.flush()
            // Only send to server if the popped command had a server-side
            // counterpart. Buffer-only PropertyEditCommands (post-pivot)
            // would silently pop an unrelated classOp/comment entry on the
            // server stack, corrupting server-side undo history.
            if (cmd.hasServerEntry) {
              channel.send({ type: 'undo' })
            }
          }
        } catch (err) {
          console.error('[cortex] Undo failed:', err)
        }
      }),
      '$mod+Shift+z': guardModifier(() => {
        if (isCortexUIFocused()) {
          const activeEl = getDeepActiveElement()
          if (activeEl instanceof HTMLElement) activeEl.blur()
        }
        flushCommitRef.current?.()
        undoInProgressRef.current = true
        const gen = ++undoGenRef.current
        setTimeout(() => setTimeout(() => {
          if (undoGenRef.current === gen) undoInProgressRef.current = false
        }))
        try {
          const cmd = commandStackRef.current?.redo()
          if (cmd) {
            overrideRef.current?.flush()
            if (cmd.hasServerEntry) {
              channel.send({ type: 'redo' })
            }
          }
        } catch (err) {
          console.error('[cortex] Redo failed:', err)
        }
      }),
    })

    return unsubscribe
  }, [active, channel])

  // setDesignMode must track active — selection events are otherwise unblocked when inactive
  useEffect(() => {
    selectionRef.current?.setDesignMode(active)
    if (active) {
      document.documentElement.setAttribute('data-cortex-active', '')
    } else {
      document.documentElement.removeAttribute('data-cortex-active')
    }
  }, [active])

  if (!active) return null

  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9998, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
        <NoAnnotationsBanner />
        <CapabilityBanner systems={capabilitySystems} />
        <ErrorToast channel={channel} />
      </div>
      <TooltipLayer shadowRoot={shadowRoot} />
      {/* Wrapper shifts toolbar + every position:fixed UI down by the
          banner's measured height when visible. The transform turns this div
          into the containing block for fixed-positioned descendants (CSS
          spec quirk), so toolbar/hover/selection/panel all reposition
          relative to the wrapper instead of the viewport.
          Critical: --cx-banner-transform falls back to `none` (not
          `translateY(0px)`) when the banner is hidden. `translateY(0px)`
          still creates a containing block per CSS spec, which changes how
          fixed-positioned descendants resolve and produces intra-file test
          pollution in cortex-app.test.tsx. With `none`, no containing block
          forms when banner is hidden — wrapper becomes a plain pass-through.
          Trade-off: during the 200ms dismiss animation, fixed-positioned
          descendants (e.g., dropdown popovers) are coordinate-stable
          relative to the wrapper, but if floating-ui-style positioning
          recomputes against viewport mid-animation, popover position can
          be momentarily off. Bounded: banner is visible only when count=0,
          which means no panel selection (silent filter blocks selection),
          which means no dropdown can open. */}
      <div style={{ transform: 'var(--cx-banner-transform, none)', transition: 'transform 200ms ease-out' }}>
      <HoverOverlay element={hoverEnabled ? hoveredElement : null} />
      <SelectionOverlay
        element={selectedElement}
        availableStates={availableStates}
        activeState={activeState}
        onStateChange={handleStateChange}
        overlaysVisible={hoverEnabled}
        hmrAppliedVersion={hmrAppliedVersion}
      />
      {/* ZF0-1195: render an outline for each non-primary selected element so
          the user can see the full multi-selection. Primary already gets the
          full overlay above (with label + state lens). */}
      {selectedElements.slice(1).map((el, idx) => (
        <SecondarySelectionOverlay
          key={idx}
          element={el}
          overlaysVisible={hoverEnabled}
          hmrAppliedVersion={hmrAppliedVersion}
        />
      ))}
      {overrideRef.current && (
        <Panel
          selectedElements={selectedElements}
          overrideManager={overrideRef.current}
          commandStack={commandStackRef.current}
          flushCommitRef={flushCommitRef}
          stageEditRef={__CORTEX_TEST_BUILD__ ? stageEditRef : undefined}
          commitEditRef={__CORTEX_TEST_BUILD__ ? commitEditRef : undefined}
          bufferListRef={__CORTEX_TEST_BUILD__ ? bufferListRef : undefined}
          undoInProgressRef={undoInProgressRef}
          onClose={handleClose}
          onSelectElement={handleSelectElement}
          onSelectElements={setSelection}
          swatches={swatches}
          textComponents={textComponents}
          colorChips={colorChips}
          spacingTokens={spacingTokens}
          activeState={activeState}
          hasBefore={hasBefore}
          hasAfter={hasAfter}
          hoverEnabled={hoverEnabled}
          onToggleHover={handleToggleHover}
          position={panelPosition}
          isSnapping={panelSnapping}
          panelPointerDown={panelPointerDown}
          panelPointerMove={panelPointerMove}
          panelPointerUp={panelPointerUp}
          panelPointerCancel={panelPointerCancel}
          channel={channel}
          agentConnected={agentConnected}
          connectionStatus={connectionStatus}
          editErrors={editErrors}
          onEditDispatch={handleEditDispatch}
          onDismissError={handleDismissError}
          hmrAppliedVersion={hmrAppliedVersion}
          hmrEventVersion={hmrEventVersion}
          hmrChangedFiles={hmrChangedFiles}
          staleOverrideCount={staleOverrideCount}
          staleSources={staleSources}
        />
      )}
      <Toolbar
        activityCount={activityCount}
        onClose={handleClose}
        commentMode={commentMode}
        onCommentMode={handleCommentMode}
        onActivityToggle={handleActivityToggle}
      />
      <CommentPin
        annotations={[...annotations.values()]}
        commentMode={commentMode}
        channel={channel}
        onReply={handleCommentReply}
      />
      <ActivityLog
        entries={activityEntries}
        visible={showActivity}
        onClose={handleActivityToggle}
      />
      </div>
    </>
  )
}
