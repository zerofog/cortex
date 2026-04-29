import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
import type { CSSOverrideManager } from '../override.js'
import { onOverrideChange } from '../override-bus.js'
import { CommandStack } from '../command-stack.js'
import { PropertyEditCommand, CompoundEditCommand } from '../edit-command.js'
import type { PropertyChange } from '../edit-command.js'
import { parseCortexSource, isLibraryComponent, findUserAncestor } from '../label.js'
import { PANEL_WIDTH } from '../hooks/useSnapToEdge.js'
import { formatShortcut } from '../format-shortcut.js'
import { extractUtilities } from '../class-extractor.js'
import { PanelHeader } from './PanelHeader.js'
import { ElementTree } from './sections/ElementTree.js'
import { DEFAULT_LAYER_HEIGHT, MIN_LAYER_HEIGHT } from './LayerTree.js'
import type { SectionChange } from './sections/types.js'
import { LayoutSection } from './sections/LayoutSection.js'
import {
  TypographySection,
  getWeightsForFamily,
  stripCSSQuotes,
  TYPOGRAPHY_LINKED_PROPERTIES,
  COLOR_LINKED_PROPERTIES,
} from './sections/TypographySection.js'
import { summarizeFill } from './sections/fill-utils.js'
import { BorderSection, summarizeBorder } from './sections/BorderSection.js'
import { EffectsSection, addShadow } from './sections/EffectsSection.js'
import { PositionSection } from './sections/PositionSection.js'
import { AppearanceSection } from './sections/AppearanceSection.js'
import type { InteractionState } from '../state-detector.js'
import { detectSharedClasses } from '../shared-class-detector.js'
import type { SharedClassInfo } from '../shared-class-detector.js'
import { EditErrorCard } from './EditErrorCard.js'
import type { EditError } from './EditErrorCard.js'
import { CommentInput } from './CommentInput.js'
import { SectionGroup } from './SectionGroup.js'
import { IconButton } from './controls/IconButton.js'
import { BackgroundSection } from './sections/BackgroundSection.js'
import { Plus } from './icons.js'
import type { CortexChannel, ConnectionDisplay } from '../../adapters/types.js'
import { computePanelStyleSnapshot } from './panel-style-snapshot.js'
import { ALL_DIMMING_PROPERTIES } from './sections/spacing-utils.js'
import { useEditStagingBuffer, createPanelSyncEmitter } from '../hooks/useEditStagingBuffer.js'
import type { PendingEdit, SyncEmitter } from '../hooks/useEditStagingBuffer.js'
import { generateId } from '../uuid.js'

// ── Connection status footer ─────────────────────────────────────────

function connectionStatusText(status: ConnectionDisplay): string {
  switch (status.status) {
    case 'reconnecting':
      return `Reconnecting\u2026 (${status.retryCount}/${status.maxRetries})`
    case 'disconnected':
      return 'Disconnected \u2014 edits won\u2019t save to files'
    case 'reconnected':
      return 'Reconnected'
    case 'connected':
      return ''
    default: {
      const _: never = status
      return _
    }
  }
}

/** Connection-status footer. Exported for direct-render leaf testing. */
export function ConnectionStatusFooter({ status }: { status?: ConnectionDisplay }): JSX.Element {
  // aria-live regions must exist in DOM BEFORE content is injected —
  // screen readers observe mutations to existing regions, not newly inserted ones.
  // Always render the container; gate only the visible content.
  if (!status || status.status === 'connected') {
    return <div class="cortex-connection-status cortex-connection-status--hidden" role="status" aria-live="polite" aria-atomic="true" />
  }
  return (
    <div
      class={`cortex-connection-status cortex-connection-status--${status.status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="cortex-connection-status__dot" aria-hidden="true" />
      <span class="cortex-connection-status__text">
        {connectionStatusText(status)}
      </span>
    </div>
  )
}

// ── Blast-radius highlight utilities ──────────────────────────────────
// These operate on the REAL page DOM (outside Shadow DOM) via a data attribute.
// A <style> injected into the page <head> provides the visual treatment; the
// attribute toggle is batched inside requestAnimationFrame to prevent layout thrashing.

const HIGHLIGHT_ATTR = 'data-cortex-blast-radius'

function ensureBlastRadiusStyle(): void {
  // Query DOM instead of module-level ref — survives Vite HMR module re-execution
  if (document.head.querySelector('[data-cortex-blast-radius-style]')) return
  const style = document.createElement('style')
  style.setAttribute('data-cortex-blast-radius-style', '')
  style.textContent = `[${HIGHLIGHT_ATTR}] { outline: 2px dashed #f97316 !important; outline-offset: 2px !important; }`
  document.head.appendChild(style)
}

let highlightFrame = 0
let clearFrame = 0

function highlightSharedElements(info: SharedClassInfo, selected: HTMLElement | null): void {
  ensureBlastRadiusStyle()
  cancelAnimationFrame(clearFrame)
  cancelAnimationFrame(highlightFrame)
  highlightFrame = requestAnimationFrame(() => {
    for (const el of info.elements) {
      if (el === selected) continue
      el.setAttribute(HIGHLIGHT_ATTR, '')
    }
  })
}

function clearHighlights(): void {
  cancelAnimationFrame(highlightFrame)
  cancelAnimationFrame(clearFrame)
  clearFrame = requestAnimationFrame(() => {
    const highlighted = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`)
    for (const el of highlighted) {
      el.removeAttribute(HIGHLIGHT_ATTR)
    }
  })
}

function removeBlastRadiusStyle(): void {
  document.head.querySelector('[data-cortex-blast-radius-style]')?.remove()
}


/**
 * True when `element` has at least one non-empty (trimmed) `TEXT_NODE` child.
 *
 * Used by Panel v2 to decide whether to render the Typography section group:
 * only elements that directly render text are typography-relevant. Pure
 * container elements (whose only children are other elements) don't have
 * font/color decisions to make — those live on the descendant text elements
 * themselves. An element with `<span>` + `'Some text'` mixed children returns
 * `true` because it still renders a text node (even nested inside a span).
 *
 * Form inputs are always typography-sensitive (they render user text
 * via browser internals, even without text-node children).
 */
const TYPOGRAPHY_ELEMENTS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function hasTypographyContent(element: Element): boolean {
  if (TYPOGRAPHY_ELEMENTS.has(element.tagName)) return true
  return (element.textContent ?? '').trim() !== ''
}

export interface PanelProps {
  element: HTMLElement | null
  overrideManager: CSSOverrideManager
  onClose: () => void
  onSelectElement: (el: HTMLElement | null) => void
  swatches?: string[]
  /** Design-system text-component bundles (size + line-height + letter-spacing + weight).
   *  Resolved once per dev-server lifetime; `undefined` = not yet received; `[]` = none defined. */
  textComponents?: import('../../core/text-components.js').TextComponent[]
  /** Design-system named color chips (token name + browser-ready hex). */
  colorChips?: Array<{ name: string; hex: string }>

  activeState?: InteractionState
  hasBefore?: boolean
  hasAfter?: boolean
  hoverEnabled?: boolean
  onToggleHover?: () => void
  position: { x: number; y: number }
  isSnapping: boolean
  panelPointerDown: (e: PointerEvent) => void
  panelPointerMove: (e: PointerEvent) => void
  panelPointerUp: (e: PointerEvent) => void
  panelPointerCancel: (e: PointerEvent) => void
  commandStack?: CommandStack | null
  /** Ref written by Panel — CortexApp calls it to flush pending coalesced commits
   *  before undo (microtask commits haven't fired yet when blur+undo runs synchronously). */
  flushCommitRef?: { current: (() => void) | null }
  /** Set by CortexApp during undo/redo — suppresses phantom re-edits from Panel re-renders. */
  undoInProgressRef?: { current: boolean }
  channel?: CortexChannel
  agentConnected?: boolean
  connectionStatus?: ConnectionDisplay
  editErrors?: Map<string, EditError>
  onEditDispatch?: (editId: string, source: string, property: string, value: string) => void
  onDismissError?: (key: string) => void
  /** Monotonic counter bumped by CortexApp on every `hmr-applied` message
   *  (ZF0-1292). Forces a getComputedStyle re-read and shared-class re-detect,
   *  covering out-of-band source edits that don't mutate the selected
   *  element's own class/style attributes — stylesheet rule changes, @theme
   *  token changes, and ancestor cascade changes — which the
   *  MutationObserver cannot see.
   *
   *  Required (not optional): forgetting to pass it leaves the Panel silently
   *  unable to react to HMR. Architecture review flagged the original
   *  optional signature as a silent-failure hazard for future integration
   *  sites. Tests must pass `hmrAppliedVersion={0}` explicitly. */
  hmrAppliedVersion: number
}

export function Panel({
  element,
  overrideManager,
  onClose,
  onSelectElement,
  swatches,
  textComponents,
  colorChips,
  activeState = 'default',
  hasBefore = false,
  hasAfter = false,
  hoverEnabled = true,
  onToggleHover,
  position,
  isSnapping,
  panelPointerDown,
  panelPointerMove,
  panelPointerUp,
  panelPointerCancel,
  commandStack,
  flushCommitRef,
  undoInProgressRef,
  channel,
  agentConnected,
  connectionStatus,
  editErrors,
  onEditDispatch,
  onDismissError,
  hmrAppliedVersion,
}: PanelProps): JSX.Element | null {
  // ALL hooks first — no conditional returns before hooks
  const [isEntering, setIsEntering] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)
  const prevElementRef = useRef<HTMLElement | null>(null)

  // Tracks previous override values during a scrub gesture for undo command creation.
  // Key: source\0property\0pseudo (null-byte separated — source paths contain colons).
  const scrubPreviousRef = useRef<Map<string, string>>(new Map())
  // Tracks the last committed value per property to suppress phantom commits
  // from HMR re-render blur events (same value committed twice for the same property).
  const lastCommitValueRef = useRef<Map<string, string>>(new Map())
  // Coalesces synchronous multi-property commits (e.g., linked padding left+right)
  // into a single atomic command via microtask.
  const commitPendingRef = useRef(false)

  // SyncEmitter wires the browser-canonical buffer to the server-side
  // StagedEditsCache mirror. Each mutation method sends a corresponding
  // BrowserToServer message; channel.send auto-stamps the token. Without
  // this, the server cache stays empty and Claude's MCP tools see nothing
  // of what the designer staged.
  //
  // useRef (not useMemo) for stable identity across renders — the hook's
  // emitterRef.current = emitter reassignment must always see the same
  // object, otherwise the rehydrate-on-mount syncFullState path could be
  // bypassed. The factory delegates to channel.send, which is stable for
  // the channel's lifetime, so a one-time construction is correct.
  //
  // When channel is absent (e.g., test mounts without one), the buffer
  // operates browser-canonical only — no emitter is wired and the server
  // cache stays out of sync. This is the same backward-compat behavior as
  // before T2.
  const syncEmitterRef = useRef<SyncEmitter | null>(null)
  if (syncEmitterRef.current === null && channel) {
    syncEmitterRef.current = createPanelSyncEmitter(channel)
  }

  // Staging buffer for property edits — accumulates browser-side before Apply gesture.
  const buffer = useEditStagingBuffer(syncEmitterRef.current ?? undefined)

  // Handle server → browser discard message: when Claude calls cortex_discard_edits, the
  // server sends 'staged-edits-discard' so the browser canonical buffer stays in sync.
  //
  // Echo-loop note: staged-edits-discard is server-originated (the MCP server's
  // cortex_discard_edits tool emitted it after mutating its cache). Calling
  // buffer.remove(ids) here keeps the browser-canonical buffer in lockstep.
  // When SyncEmitter wiring lands (deferred), buffer.remove will fire
  // syncRemove → server staged-edit-remove → server cache.remove (idempotent —
  // terminates at depth 1, since the second remove is a no-op on an empty set).
  // If the round-trip becomes a measurable cost, add a flag to skip emission
  // for server-originated removes. Tracked as a follow-up under ZF0-1452+.
  //
  // IMPORTANT: this depth-1 termination depends on `cache.remove(ids)` being
  // idempotent (no side-effect on already-removed ids). If you ever add a
  // non-idempotent server-side reaction to staged-edit-remove (logging,
  // telemetry, undo-stack push), this echo loop would generate duplicates —
  // add an "is this server-originated?" guard before propagating the remove
  // from buffer back through the SyncEmitter.
  useEffect(() => {
    if (!channel) return
    return channel.onMessage((msg) => {
      if (msg.type === 'staged-edits-discard') {
        const ids = (msg as { type: 'staged-edits-discard'; intentIds: string[] }).intentIds
        buffer.remove(ids)
      }
    })
  }, [channel, buffer])

  // Pseudo-element tab state — internal to Panel
  const [activePseudo, setActivePseudo] = useState<'element' | '::before' | '::after'>('element')

  // Shared class detection + scope toggle for instance-level editing (ZF0-1018)
  const [sharedInfo, setSharedInfo] = useState<SharedClassInfo | null>(null)
  const [editScope, setEditScope] = useState<'instance' | 'all'>('instance')

  // Typography section dual-mode toggle: auto picks from detected token classes

  // Elements section (LayerTree) height — owned by Panel so the resize handle
  // can sit between SectionGroups as the section divider.
  const [layerHeight, setLayerHeight] = useState(DEFAULT_LAYER_HEIGHT)
  const layerResizeRef = useRef({ dragging: false, startY: 0, startH: 0 })
  const handleLayerResizeDown = useCallback((e: PointerEvent) => {
    layerResizeRef.current = { dragging: true, startY: e.clientY, startH: layerHeight }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [layerHeight])
  const handleLayerResizeMove = useCallback((e: PointerEvent) => {
    const r = layerResizeRef.current
    if (!r.dragging) return
    const maxH = Math.floor(window.innerHeight * 0.5)
    setLayerHeight(Math.max(MIN_LAYER_HEIGHT, Math.min(maxH, r.startH + (e.clientY - r.startY))))
  }, [])
  const handleLayerResizeUp = useCallback((e: PointerEvent) => {
    if (!layerResizeRef.current.dragging) return
    layerResizeRef.current.dragging = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }, [])

  // Default computed styles snapshot for dimming comparison.
  // Plain object snapshot (NOT a live CSSStyleDeclaration) — taken once per element.
  const defaultStylesRef = useRef<Record<string, string> | null>(null)

  // Cleanup for pending comment subscription + timeout
  const commentCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { commentCleanupRef.current?.() }, [])
  useEffect(() => { commentCleanupRef.current?.() }, [element])
  useEffect(() => {
    if (!element) { defaultStylesRef.current = null; return }
    const cs = getComputedStyle(element)
    const snapshot: Record<string, string> = {}
    for (const prop of ALL_DIMMING_PROPERTIES) {
      snapshot[prop] = typeof cs.getPropertyValue === 'function'
        ? cs.getPropertyValue(prop)
        : ''
    }
    defaultStylesRef.current = snapshot
    // Force useMemo re-run with fresh snapshot so dimming comparison
    // uses the NEW element's defaults, not the previous element's.
    setStyleVersion(v => v + 1)
  }, [element])

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (prevElementRef.current && prevElementRef.current !== element) {
      // No cross-fade or body remount — sections update via normal prop changes.
      setActivePseudo('element') // reset pseudo tab on element change
    }
    prevElementRef.current = element
    scrubPreviousRef.current.clear() // abandon any in-progress scrub state
    lastCommitValueRef.current.clear()
  }, [element])

  // Abandon in-progress scrub state when switching pseudo-element tabs.
  // Without this, scrub state from ::before would contaminate a ::after commit.
  useEffect(() => {
    scrubPreviousRef.current.clear()
    lastCommitValueRef.current.clear()
  }, [activePseudo])

  // Clear blast-radius highlights and remove injected style tag on unmount
  useEffect(() => () => { clearHighlights(); removeBlastRadiusStyle() }, [])

  // Scope reset + blast-radius highlight clear fire on element change only
  // (ZF0-1018/1019). This was originally one effect with sharedInfo detection;
  // keeping scope reset pinned to [element] prevents the scope-reset regression
  // where an HMR bump would silently flip a user's "All" scope back to
  // "instance" mid-edit (cubic + Copilot flagged in ZF0-1292 review).
  useEffect(() => {
    clearHighlights()
    setEditScope('instance')
  }, [element])

  // Detect shared CSS classes when a new element is selected (ZF0-1018), and
  // re-run on hmrAppliedVersion bumps (ZF0-1292) because `sharedInfo.elements`
  // caches DOM refs — a stylesheet-only HMR edit can add or remove siblings
  // matching the shared selector without mutating the primary element.
  useEffect(() => {
    if (element) {
      try {
        setSharedInfo(detectSharedClasses(element))
      } catch (err) {
        // Cross-origin CSSOM access throws SecurityError — known path, don't
        // warn. Anything else is a bug; log it so it shows up in devtools.
        // Either way, disable the scope toggle so the Panel stays usable.
        if (!(err instanceof DOMException && err.name === 'SecurityError')) {
          console.warn('[cortex] detectSharedClasses unexpected error', err)
        }
        setSharedInfo(null)
      }
    } else {
      setSharedInfo(null)
    }
  }, [element, hmrAppliedVersion])


  // Sync strategy: bump counter on committed changes to force getComputedStyle re-read.
  // During scrub, trust NumericInput local state (no re-render per frame).
  const [styleVersion, setStyleVersion] = useState(0)

  // Re-read computed styles whenever overrides change externally (undo/redo clearAll,
  // hmr_verified removal). Without this, Panel shows stale values after undo because
  // clearAll doesn't bump styleVersion — only applyOverride does.
  useEffect(() => {
    return onOverrideChange(() => setStyleVersion(v => v + 1))
  }, [])

  // `hmrAppliedVersion` is a dep on the `computedStyles` useMemo below so
  // HMR-driven invalidation happens in the render pass triggered by the
  // prop change — no intermediate state bump, no extra render. Covers
  // stylesheet-only source edits (App.css rule changes, @theme token
  // changes, ancestor cascade changes) that don't mutate the selected
  // element's own class/style attributes and therefore don't trip the
  // MutationObserver below.

  // Observe class AND style attribute mutations on the selected element.
  // The Panel lives in a shadow-DOM Preact tree decoupled from the user's
  // React tree — when HMR re-renders their component and flips className
  // or inline style, nothing else signals the Panel. Without this, bundle
  // detection (typographyClassName memo) keeps returning the pre-HMR class
  // and the typography pill never updates after a classOp edit; similarly,
  // SegmentedControl values (text-align, etc.) stay stale after an
  // InlineStyleRewriter edit lands via HMR because the memoized
  // `computedStyles` never refreshes.
  //
  // Both attributes matter because the server has two rewriter paths:
  //   - Tailwind class swap (className changes)
  //   - Inline style rewrite (style attribute changes, new in ZF0-1215
  //     for properties without a matching Tailwind utility on the element)
  //
  // Microtask coalescing: React Fast Refresh commonly emits several
  // mutations within a single paint (reconciler diff + side-effect passes).
  // Collapsing them into one styleVersion bump prevents `computedStyles`
  // from thrashing (2-3× getComputedStyle calls per property group per
  // mutation). This is correctness-hygiene, not a perf optimization — it
  // keeps one user-visible DOM change mapped to one Panel render.
  useEffect(() => {
    if (!element) return
    let pending = false
    const bump = (): void => {
      if (pending) return
      pending = true
      queueMicrotask(() => {
        pending = false
        setStyleVersion(v => v + 1)
      })
    }
    const observer = new MutationObserver(bump)
    observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => observer.disconnect()
  }, [element])

  // C1: Cache getComputedStyle results + compute dimmed properties in a single useMemo
  // to avoid double forced layout. CRITICAL: activeState + activePseudo in deps so
  // useMemo re-runs after state forcing (getComputedStyle returns a live reference).
  const { computedStyles, dimmedProperties, mixedProperties } = useMemo(
    () => computePanelStyleSnapshot({
      element,
      activePseudo,
      activeState,
      sharedInfo,
      editScope,
      overrideManager,
      defaultStyles: defaultStylesRef.current,
    }),
    [element, styleVersion, hmrAppliedVersion, activeState, activePseudo, sharedInfo, editScope],
  )

  const availableWeights = useMemo(
    () => {
      const family = computedStyles.typography.fontFamily ?? ''
      return getWeightsForFamily(stripCSSQuotes(family.split(',')[0]?.trim() ?? ''))
    },
    [computedStyles.typography.fontFamily],
  )

  // Extract Tailwind utility classes from element's className.
  // Enables the "direct class path": send the actual class name to the server
  // instead of relying on fragile computed-style → hex → class-name reverse lookup.
  const extractedUtilities = useMemo(() => {
    if (!element) return new Map<string, string>()
    // SVG elements return SVGAnimatedString for .className — use getAttribute instead
    const cls = typeof element.className === 'string'
      ? element.className
      : (element.getAttribute('class') ?? '')
    return extractUtilities(cls)
  }, [element, styleVersion])

  // Raw className attribute — TypographySection detects bundle + chip membership against it.
  const typographyClassName = useMemo(() => {
    if (!element) return ''
    return typeof element.className === 'string'
      ? element.className
      : (element.getAttribute('class') ?? '')
  }, [element, styleVersion])

  // Null-byte separator for composite scrub keys — never appears in CSS properties or source paths.
  const SEP = '\0'

  // Commit phase: builds an atomic PropertyEditCommand from accumulated scrub state,
  // records it on the CommandStack, flushes visual overrides, and sends server edits.
  // Separated from applyOverride so batch handlers can accumulate multiple properties
  // via scrub calls and commit once (one undo entry for the whole gesture).
  const commitScrub = useCallback(() => {
    // Suppress phantom re-edits from Panel re-renders during undo/redo.
    // Without this, undo changes overrides → Panel re-renders → inputs fire
    // onChange with stale values → new phantom command overwrites the undo.
    if (undoInProgressRef?.current) {
      scrubPreviousRef.current.clear()
      return
    }
    if (!element || scrubPreviousRef.current.size === 0) return
    const source = element.getAttribute('data-cortex-source')
    if (!source) {
      scrubPreviousRef.current.clear()
      return
    }

    // Build PropertyChange[] from accumulated scrub previous values.
    // Filter out no-op changes where value didn't change.
    const changes: PropertyChange[] = []
    for (const [key, previousValue] of scrubPreviousRef.current) {
      const [s, p, ps] = key.split(SEP) as [string, string, string]
      const parsedPseudo = (ps || undefined) as '::before' | '::after' | undefined
      const currentValue = overrideManager.get(s, p, parsedPseudo) ?? ''
      if (currentValue === previousValue) continue
      changes.push({
        source: s,
        property: p,
        value: currentValue,
        previousValue,
        pseudo: parsedPseudo,
      })
    }

    // Build PendingEdits up front. They are the single source of truth for both
    // (a) the initial buffer.append loop below, and (b) the PropertyEditCommand's
    // undo/redo bookkeeping — undo removes these intentIds; redo re-appends these
    // exact shapes. Sharing one array avoids the desync where the buffer entry
    // and the command's view of "what was appended" could drift apart.
    //
    // Filter to the selected element's source to deduplicate scope='all' sibling entries.
    const editedProps = changes.filter(c => c.source === source)
    const instanceSources = sharedInfo && editScope === 'all'
      ? sharedInfo.elements.map(el => el.getAttribute('data-cortex-source')).filter((s): s is string => s !== null)
      : undefined
    const pendingEdits: PendingEdit[] = editedProps.map(c => ({
      intentId: generateId(),
      source,
      property: c.property,
      value: c.value,
      previousValue: c.previousValue,
      // Use the change's own pseudo, not the closure-scoped `activePseudo`.
      // They're equal today via a useEffect that clears scrubPreviousRef on
      // pseudo change, but that invariant is action-at-a-distance — local
      // truth (`c.pseudo`) is always correct.
      pseudo: c.pseudo,
      // PendingEdit.scope mirrors the server's CortexEdit.scope contract
      // ('instance' | 'all'); editScope already uses the same shape.
      scope: editScope,
      instanceSources,
      timestamp: Date.now(),
    }))

    // Record command on stack. Overrides are already applied during scrub phase,
    // so record() stores without re-executing (avoids double-apply). The command
    // owns the staging-buffer side of undo/redo via pendingEdits + bufferOps.
    if (changes.length > 0) {
      if (commandStack) {
        const cmd = new PropertyEditCommand({
          changes,
          overrideManager,
          pendingEdits,
          bufferOps: buffer,
        })
        commandStack.record(cmd)
      } else {
        console.warn('[cortex] Edit committed without undo stack — this edit cannot be undone')
      }
      // Track committed values to suppress phantom re-commits from HMR re-render.
      for (const c of changes) {
        lastCommitValueRef.current.set(`${c.source}${SEP}${c.property}${SEP}${c.pseudo ?? ''}`, c.value)
      }
    }

    overrideManager.flush()
    setStyleVersion(v => v + 1)
    scrubPreviousRef.current.clear()

    // Initial append to the staging buffer (deferred to Apply gesture).
    // Subsequent redo() of the recorded command re-appends these same shapes
    // via PropertyEditCommand.execute → bufferOps.append.
    for (const edit of pendingEdits) {
      buffer.append(edit)
      // A new edit supersedes any prior divergence card for the same source+property.
      // Pre-pivot, this clear happened in CortexApp.handleEditDispatch when the edit
      // went out via channel.send. Now that the edit is buffer-appended, dispatch
      // doesn't fire — so we re-establish the contract here.
      onDismissError?.(`${edit.source}${SEP}${edit.property}`)
    }
  }, [element, overrideManager, buffer, sharedInfo, editScope, commandStack, onDismissError])

  // Expose flush for CortexApp to call before undo/redo — microtask commits
  // haven't fired yet when blur+undo runs synchronously in the same tick.
  useEffect(() => {
    if (flushCommitRef) {
      flushCommitRef.current = () => {
        if (commitPendingRef.current) {
          commitPendingRef.current = false
          commitScrub()
        }
      }
      return () => { flushCommitRef.current = null }
    }
  }, [flushCommitRef, commitScrub])

  // Scrub phase: captures previousValue on first touch per property, applies override.
  // On commit (commitRender=true): delegates to commitScrub() for atomic command creation.
  const applyOverride = useCallback((property: string, value: string, commitRender: boolean) => {
    // Suppress phantom re-edits triggered by Preact re-renders after undo/redo.
    // Preact's setTimeout-based batching fires AFTER the keyboard handler completes,
    // causing section inputs to re-render with new values and fire onChange.
    if (undoInProgressRef?.current) return
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (!source) return
    const pseudo = activePseudo !== 'element' ? activePseudo : undefined
    const prevKey = `${source}${SEP}${property}${SEP}${pseudo ?? ''}`

    // Phantom re-commit guard: after HMR re-render, input blur can fire onCommit
    // with the same value that was just committed. Bail BEFORE applying the override
    // so no stale !important rule is (re-)introduced into the style element.
    if (commitRender) {
      const lastCommitted = lastCommitValueRef.current.get(prevKey)
      if (lastCommitted === value) {
        // Only suppress if the override is still in place. If HMR or undo
        // removed the override externally, the user genuinely wants to
        // re-apply the same value — allow it through.
        const currentOverride = overrideManager.get(source, property, pseudo)
        if (currentOverride === value) {
          scrubPreviousRef.current.delete(prevKey)
          return
        }
        // Override was removed externally — stale guard entry, clear it
        lastCommitValueRef.current.delete(prevKey)
      }
    }

    // Capture previousValue BEFORE set() — only on first touch per property per gesture.
    // If an override already exists, use that. Otherwise capture the computed style
    // so undo can set it as a temporary override even after HMR has removed the
    // original override and the CSS file has the new value.
    if (!scrubPreviousRef.current.has(prevKey)) {
      const existing = overrideManager.get(source, property, pseudo)
      if (existing !== undefined) {
        scrubPreviousRef.current.set(prevKey, existing)
      } else {
        const computed = getComputedStyle(element, pseudo ?? null).getPropertyValue(property).trim()
        scrubPreviousRef.current.set(prevKey, computed || '')
      }
    }

    // scope='all': apply CSS override preview to ALL shared elements so
    // the user sees the effect everywhere, not just on the selected element.
    if (sharedInfo && editScope === 'all') {
      for (const el of sharedInfo.elements) {
        const elSource = el.getAttribute('data-cortex-source')
        if (elSource) {
          const elPrevKey = `${elSource}${SEP}${property}${SEP}${pseudo ?? ''}`
          if (!scrubPreviousRef.current.has(elPrevKey)) {
            const elExisting = overrideManager.get(elSource, property, pseudo)
            if (elExisting !== undefined) {
              scrubPreviousRef.current.set(elPrevKey, elExisting)
            } else {
              const computed = getComputedStyle(el, pseudo ?? null).getPropertyValue(property).trim()
              scrubPreviousRef.current.set(elPrevKey, computed || '')
            }
          }
          overrideManager.set(elSource, property, value, pseudo)
        }
      }
    } else {
      overrideManager.set(source, property, value, pseudo)
    }

    if (commitRender) {
      // Coalesce synchronous multi-property commits into one atomic command.
      // When linked padding fires onChange for both left and right in the same
      // tick, both accumulate in scrubPreviousRef and commit once via microtask.
      if (!commitPendingRef.current) {
        commitPendingRef.current = true
        queueMicrotask(() => {
          commitPendingRef.current = false
          commitScrub()
        })
      }
    }
  }, [element, overrideManager, activePseudo, sharedInfo, editScope, commitScrub])

  const handleCommit = useCallback((c: SectionChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleScrub = useCallback((c: SectionChange) => applyOverride(c.property, c.value, false), [applyOverride])

  /**
   * Dispatch a className mutation (classOp) to the server, optionally followed
   * by per-property inline-style edits for the same element. Used by the new
   * Typography section: linking a bundle is `{add: 'body-md', inlineProps: []}`
   * (class goes on, inline styles come off), unlinking is
   * `{remove: 'body-md', inlineProps: [{property:'font-size', value:'14px'}, ...]}`
   * (class comes off, inline styles from the bundle preserve the rendered look).
   *
   * classOps bypass the scrub/commit dance — they are atomic by nature
   * (no "half-linked" state). Follow-up inline props go through the normal
   * applyOverride path so they participate in undo coalescing.
   */
  // Describe a compound edit for onEditDispatch's activity log.
  // Kept local (not exported) because it's a UI-detail formatter —
  // the '__class__' sentinel tells consumers to render this differently
  // than regular property edits.
  const formatCompoundDescription = (opts: {
    remove?: string
    add?: string
    inlineSets?: ReadonlyArray<{ property: string; value: string }>
    inlineRemoves?: ReadonlyArray<{ property: string }>
  }): string => {
    const parts: string[] = []
    if (opts.remove) parts.push(`-${opts.remove}`)
    if (opts.add) parts.push(`+${opts.add}`)
    if (opts.inlineSets?.length) parts.push(`set(${opts.inlineSets.length})`)
    if (opts.inlineRemoves?.length) parts.push(`rm(${opts.inlineRemoves.length})`)
    return parts.join(' ')
  }

  const applyClassChange = useCallback(
    (opts: {
      remove?: string
      add?: string
      /** Inline property SETS to apply alongside the class change. The
       *  server writes these to source as `style={{...}}` properties.
       *  Locally, they're applied as !important overrides for immediate
       *  visual feedback while HMR processes the source write. */
      inlineSets?: ReadonlyArray<{ property: string; value: string }>
      /** Inline property REMOVES to apply alongside the class change.
       *  The server removes them from source. Locally, any matching
       *  !important overrides are cleared so the new class's cascade
       *  takes effect immediately. */
      inlineRemoves?: ReadonlyArray<{ property: string }>
    }) => {
      if (!element || !channel) return
      const source = element.getAttribute('data-cortex-source')
      if (!source) return
      if (!opts.remove && !opts.add) return  // classOp required for compound path

      // Drain any pending property-commit microtask BEFORE issuing the
      // compound edit. Otherwise a classOp could land in the server's
      // file-lock queue AHEAD of a pending PropertyEditCommand, producing
      // an inverted undo stack order. The flush is a no-op when no
      // scrub is in flight.
      flushCommitRef?.current?.()

      const pseudo = activePseudo !== 'element' ? activePseudo : undefined
      const editId = generateId()

      // Capture previous override values BEFORE mutating, so the
      // Single-pass iteration: snapshot previousValue, build the
      // CompoundEditCommand change entry, AND apply the optimistic
      // override — all in one loop per kind. The critical constraint
      // is order: overrideManager.get must run BEFORE overrideManager.set
      // so the snapshot reflects the pre-edit state. Single-pass
      // respects this because get + push + set fire in that order for
      // each property before moving to the next.
      //
      // Local !important overrides give IMMEDIATE visual feedback. The
      // server's HMR-verified handshake (trackPendingEdit →
      // handleHMRVerified) releases them once the source write lands
      // and React re-renders. Without the local override, the user
      // would see OLD styles until HMR completes (100-500ms).
      const changes: PropertyChange[] = []
      if (opts.inlineSets) {
        for (const s of opts.inlineSets) {
          const previousValue = overrideManager.get(source, s.property, pseudo) ?? ''
          changes.push({ source, property: s.property, value: s.value, previousValue, pseudo })
          overrideManager.set(source, s.property, s.value, pseudo)
          // trackPendingEdit shares editId across the whole compound so
          // HMR-verification releases all properties of this gesture together.
          overrideManager.trackPendingEdit(editId, source, s.property, s.value, pseudo)
        }
      }
      // inlineRemoves: clear any stale overrides locally so the new
      // class's cascade wins immediately. Structurally redundant with
      // the H7 part A pre-clear in handleTypographyChange but idempotent
      // and keeps this function self-contained.
      if (opts.inlineRemoves) {
        for (const r of opts.inlineRemoves) {
          const previousValue = overrideManager.get(source, r.property, pseudo) ?? ''
          overrideManager.remove(source, r.property, pseudo)
          if (previousValue === '') continue  // nothing to restore on undo — no-op remove
          changes.push({ source, property: r.property, value: '', previousValue, pseudo })
        }
      }

      // Record on browser commandStack so Ctrl+Z's `if (cmd)` gate fires
      // and dispatches `{ type: 'undo' }` to the server — without this,
      // the server's compound UndoFileChange is never popped.
      // record() stores without re-executing — overrides were already
      // applied above, matching the PropertyEditCommand pattern.
      if (commandStack) {
        const cmd = new CompoundEditCommand({ changes, overrideManager, editId })
        commandStack.record(cmd)
      } else {
        // Observability parity with commitScrub at line 593 — a
        // compound edit committed without a commandStack cannot be
        // undone. Warn so missing-stack wiring is diagnosable.
        console.warn('[cortex] Compound edit committed without undo stack — this edit cannot be undone')
      }

      // ONE compound WebSocket message. Server routes to
      // handleCompoundEdit when classOp + (inlineSets || inlineRemoves)
      // are all present; to handleClassOp when only classOp; to the
      // property path when only property/value. Falsifiable hook for
      // onEditDispatch is the '__class__' sentinel — the Panel's
      // activity log uses it to render compound ops as a single row.
      onEditDispatch?.(editId, source, '__class__', formatCompoundDescription(opts))
      channel.send({
        type: 'edit',
        editId,
        source,
        property: '',
        value: '',
        elementSelector: element.tagName.toLowerCase(),
        classOp:
          opts.remove && opts.add ? { kind: 'swap' as const, remove: opts.remove, add: opts.add }
          : opts.add ? { kind: 'add' as const, add: opts.add }
          : opts.remove ? { kind: 'remove' as const, remove: opts.remove }
          : undefined,
        ...(opts.inlineSets && opts.inlineSets.length > 0 ? { inlineSets: opts.inlineSets } : {}),
        ...(opts.inlineRemoves && opts.inlineRemoves.length > 0 ? { inlineRemoves: opts.inlineRemoves } : {}),
      })
    },
    [element, channel, onEditDispatch, overrideManager, activePseudo, commandStack],
  )

  /**
   * Route a TypographyChange (discriminated union) to the right dispatcher.
   *
   * - Plain {property, value} → applyOverride (scrub/commit dance)
   * - link-* → applyClassChange with `add` + inline clear of the 5 props
   * - unlink-* → applyClassChange with `remove` + inline preservation
   * - vertical-align → three property edits fanned into one undo entry:
   *   display:flex, flex-direction:column, align-items:<value>
   */
  const handleTypographyChange = useCallback(
    (change: import('./sections/TypographySection.js').TypographyChange) => {
      if ('property' in change) {
        applyOverride(change.property, change.value, true)
        return
      }

      // Shared by link handlers (H7 part A): clear any in-flight browser
      // !important overrides for the properties the link is about to own.
      // Without this, a prior scrub (e.g., user dragged font-size to 24px)
      // leaves an override in overrideManager; when the link lands, the
      // class's font-size: 1rem loses the cascade to the override, and
      // the Panel shows "linked" while the visual stays at 24px. These
      // removes are LOCAL — no WebSocket message, no source edit —
      // the source-file inline-style cleanup is handled separately by
      // the compound-edit message introduced in C2 (inlineRemoves).
      const clearLinkedOverrides = (properties: ReadonlyArray<string>): void => {
        if (!element) return
        const source = element.getAttribute('data-cortex-source')
        if (!source) return
        const pseudo = activePseudo !== 'element' ? activePseudo : undefined
        for (const property of properties) {
          overrideManager.remove(source, property, pseudo)
        }
      }

      switch (change.kind) {
        case 'link-text-component': {
          // Compound edit (C2 + H7 part B): add the new text- class AND
          // request removal of any stale inline style= values from the
          // 5 typography properties. Prior to C2, link handlers only
          // sent classOp — the rendered view still wins from inline
          // styles left over from a prior unlink. The compound message
          // makes link "truly fresh": new class + no stale inline.
          //
          // clearLinkedOverrides is kept for IMMEDIATE visual feedback
          // (local override clear) while the compound roundtrips to
          // server. Redundant with applyClassChange's internal
          // inlineRemoves clear but idempotent.
          clearLinkedOverrides(TYPOGRAPHY_LINKED_PROPERTIES)
          applyClassChange({
            remove: change.removeClass,
            add: `text-${change.component.name}`,
            inlineRemoves: TYPOGRAPHY_LINKED_PROPERTIES.map((property) => ({ property })),
          })
          return
        }
        case 'unlink-text-component': {
          // Compound edit: remove the bundle class AND write preserving
          // inline styles to source IN ONE MESSAGE. Before C2 this was
          // ONE classOp message + FIVE applyOverride edit messages,
          // producing 6 server undo entries for one user gesture.
          // After C2: ONE compound undo entry → one Ctrl+Z restores
          // the whole gesture.
          applyClassChange({
            remove: change.removeClass,
            inlineSets: change.inline,
          })
          return
        }
        case 'link-color-chip': {
          clearLinkedOverrides(COLOR_LINKED_PROPERTIES)
          applyClassChange({
            remove: change.removeClass,
            add: `text-${change.chip.name}`,
            inlineRemoves: COLOR_LINKED_PROPERTIES.map((property) => ({ property })),
          })
          return
        }
        case 'unlink-color-chip': {
          applyClassChange({
            remove: change.removeClass,
            inlineSets: change.inline,
          })
          return
        }
        case 'vertical-align': {
          // Three edits batched via the scrub→commit microtask queue: they
          // all accumulate in scrubPreviousRef and commit as one PropertyEditCommand.
          applyOverride('display', 'flex', false)
          applyOverride('flex-direction', 'column', false)
          applyOverride('align-items', change.value, true)
          return
        }
        default: {
          // Exhaustive check — TypeScript errors here if TypographyChange
          // gains a new kind without a handler. Mirrors the pattern used
          // by connectionStatusText at line 47. Runtime no-op with log
          // so misconfigurations are observable without crashing the panel.
          const _exhaustive: never = change
          console.error('[cortex] Unhandled TypographyChange kind:', _exhaustive)
        }
      }
    },
    [applyOverride, applyClassChange],
  )

  // Property section state — driven by computed values, not user toggle
  const fillSummary = useMemo(() => summarizeFill(computedStyles.fill), [computedStyles.fill])
  const fillHasValue = fillSummary !== 'transparent'
  const borderSummary = useMemo(() => summarizeBorder(computedStyles.border), [computedStyles.border])
  const borderHasValue = borderSummary !== 'none'
  const handleFillAdd = useCallback(() => {
    applyOverride('background-color', '#ffffff', true)
  }, [applyOverride])
  // Inverse of handleFillAdd — applied via override so `summarizeFill` returns
  // 'transparent' and `fillHasValue` flips false, collapsing the section and
  // re-surfacing the "+" add button in the SectionGroup header. Using override
  // (rather than overrideManager.remove) keeps behavior deterministic regardless
  // of what background the element's natural CSS cascade would reveal.
  const handleFillRemove = useCallback(() => {
    applyOverride('background-color', 'transparent', true)
  }, [applyOverride])
  // Apply one width value to the shorthand AND all 4 per-side longhands.
  //
  // The override manager is a flat `Map<property, value>` with no shorthand
  // awareness: Map iteration order (= insertion order) becomes declaration
  // order in the injected stylesheet (see override.ts rebuild()). Per CSS
  // cascade rules, a longhand declared after a shorthand wins over the
  // shorthand's expansion — and `Map.set` never moves existing keys. That
  // means once `border-top-width` lands in the Map from user per-side edits
  // or a prior minus action, any later write of `border-width` alone gets
  // silently overruled by the stale longhand.
  //
  // Both `handleBorderAdd` and `handleBorderRemove` therefore write all five
  // width properties through this helper. Add/remove become idempotent and
  // symmetric: "+" always paints a uniform 1px border, "-" always fully
  // zeroes every width slot regardless of prior per-side customization.
  const setBorderWidths = useCallback((width: string) => {
    applyOverride('border-width', width, false)
    applyOverride('border-top-width', width, false)
    applyOverride('border-right-width', width, false)
    applyOverride('border-bottom-width', width, false)
    applyOverride('border-left-width', width, false)
  }, [applyOverride])
  // Batch: 7 properties → 1 undo entry. All 5 width properties are written
  // (via setBorderWidths) so any orphan per-side override from a prior
  // remove→add cycle is cleared — otherwise the longhands would win the
  // cascade and the new border would render with the old per-side values.
  const handleBorderAdd = useCallback(() => {
    setBorderWidths('1px')
    applyOverride('border-style', 'solid', false)
    applyOverride('border-color', '#000000', false)
    commitScrub()
  }, [setBorderWidths, applyOverride, commitScrub])
  // Inverse of handleBorderAdd. Symmetric with handleFillRemove: writes
  // explicit 0 values rather than calling overrideManager.remove, so a
  // Tailwind utility class like `border` or `border-t-2` on the element
  // can't resurface through the natural cascade after removal. Style and
  // color are left untouched — minimal surface area, and handleBorderAdd
  // will overwrite them from defaults on the next `+` click.
  const handleBorderRemove = useCallback(() => {
    setBorderWidths('0px')
    commitScrub()
  }, [setBorderWidths, commitScrub])
  const handleShadowAdd = useCallback(() => {
    applyOverride('box-shadow', addShadow(computedStyles.effects.boxShadow), true)
  }, [computedStyles.effects.boxShadow, applyOverride])


  const handleSelectParent = useCallback(() => {
    if (!element) return
    if (element.parentElement && element.parentElement !== document.documentElement) {
      onSelectElement(element.parentElement)
    }
  }, [element, onSelectElement])

  const handleSelectChild = useCallback(() => {
    if (!element) return
    const firstChild = element.children[0]
    if (firstChild instanceof HTMLElement) {
      onSelectElement(firstChild)
    }
  }, [element, onSelectElement])

  const handleCommentSubmit = useCallback(async (text: string): Promise<void> => {
    const source = element?.getAttribute('data-cortex-source')
    if (!source || !channel) return

    commentCleanupRef.current?.()
    channel.send({ type: 'comment', elementSource: source, text })

    // Resolve as soon as the server creates the annotation (annotation-created).
    // Agent processing (acknowledged/resolved) happens asynchronously afterward.
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settle()
        reject(new Error('timeout'))
      }, 15_000)

      const unsubscribe = channel.onMessage((msg) => {
        if (settled) return
        if (msg.type === 'annotation-created' && !msg.annotation.pinPosition) {
          settle()
          resolve()
        }
      })

      function settle() {
        settled = true
        clearTimeout(timeout)
        unsubscribe()
        if (commentCleanupRef.current === cancelRef) commentCleanupRef.current = null
      }
      function cancel() { settle(); reject(new Error('cancelled')) }
      const cancelRef = cancel
      commentCleanupRef.current = cancel
    })
  }, [element, channel])

  const panelClasses = [
    'cortex-panel',
    isEntering && 'cortex-panel--entering',
    isSnapping && 'cortex-panel--snapping',
  ].filter(Boolean).join(' ')

  // Empty state: panel shell visible, no sections
  if (!element) {
    return (
      <div
        class={panelClasses}
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, width: `${PANEL_WIDTH}px` }}
      >
        <PanelHeader
          tagName=""
          componentName="Cortex"
          sourceFile={null}
          sourceLine={null}
          filePath={null}
          hasParent={false}
          hasChildren={false}
          onClose={onClose}
          onSelectParent={() => {}}
          onSelectChild={() => {}}
          onPointerDown={panelPointerDown}
          onPointerMove={panelPointerMove}
          onPointerUp={panelPointerUp}
          onPointerCancel={panelPointerCancel}
          hoverEnabled={hoverEnabled}
          onToggleHover={onToggleHover}
        />
        <div class="cortex-panel__body">
          <div class="cortex-panel__empty">
            <p class="cortex-panel__empty-action">Click any element to start editing</p>
            <p class="cortex-panel__empty-hint">Changes write to your source files</p>
            <p class="cortex-panel__empty-shortcut">{formatShortcut('$mod+Shift+Period')} to toggle</p>
          </div>
        </div>
        <ConnectionStatusFooter status={connectionStatus} />
      </div>
    )
  }

  const sourceInfo = parseCortexSource(element)
  const tagName = element.tagName.toLowerCase()
  const componentName = sourceInfo?.componentName ?? null
  const sourceFile = sourceInfo?.fileName ?? null
  const sourceLine = sourceInfo?.line ?? null
  const filePath = sourceInfo?.filePath ?? null
  const isLibrary = isLibraryComponent(element)
  const ancestor = isLibrary ? findUserAncestor(element) : null
  const hasParent = element.parentElement !== null && element.parentElement !== document.documentElement
  const hasChildren = element.children.length > 0
  // Typography section only renders for elements that directly render text.
  // Pure container elements have nothing to do in Typography.
  const showTypography = hasTypographyContent(element)
  // Position section is instance-specific — hide when editing a shared class.
  const showPosition = !(sharedInfo && editScope === 'all')

  return (
    <div
      class={panelClasses}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: `${PANEL_WIDTH}px`,
      }}
    >
      <PanelHeader
        tagName={tagName}
        componentName={componentName}
        sourceFile={sourceFile}
        sourceLine={sourceLine}
        filePath={filePath}
        hasParent={hasParent}
        hasChildren={hasChildren}
        onClose={onClose}
        onSelectParent={handleSelectParent}
        onSelectChild={handleSelectChild}
        onPointerDown={panelPointerDown}
        onPointerMove={panelPointerMove}
        onPointerUp={panelPointerUp}
        onPointerCancel={panelPointerCancel}
        hasBefore={hasBefore}
        hasAfter={hasAfter}
        activePseudo={activePseudo}
        onPseudoChange={setActivePseudo}
        isLibrary={isLibrary}
        ancestorSource={ancestor?.source.fileName ?? null}
        ancestorLine={ancestor?.source.line ?? null}
        hoverEnabled={hoverEnabled}
        onToggleHover={onToggleHover}
      />
      {editErrors && element?.getAttribute('data-cortex-source') && (
        <EditErrorCard
          errors={editErrors}
          elementSource={element.getAttribute('data-cortex-source')!}
          agentConnected={agentConnected ?? false}
          onDismiss={(key) => onDismissError?.(key)}
          onAskAI={(error) => {
            if (!channel) {
              console.warn('[cortex] Cannot send fix request: no channel')
              return
            }
            channel.send({
              type: 'comment',
              kind: 'fix-request',
              fixMeta: { property: error.property, value: error.value, reason: error.reason },
              elementSource: error.source,
              text: `${error.property} edit failed: ${error.reason}`,
            })
          }}
        />
      )}
      {sharedInfo && (
        <div class="cortex-panel__scope">
          <span class="cortex-panel__scope-label">
            Shared by {sharedInfo.count} elements
          </span>
          <div
            class="cortex-panel__scope-toggle"
            role="radiogroup"
            aria-label="Editing scope"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                const next = editScope === 'instance' ? 'all' : 'instance'
                setEditScope(next)
                if (next === 'all') highlightSharedElements(sharedInfo, element)
                else clearHighlights()
              }
            }}
          >
            <button
              type="button"
              class={`cortex-panel__scope-btn ${editScope === 'instance' ? 'cortex-panel__scope-btn--active' : ''}`}
              role="radio"
              aria-checked={editScope === 'instance'}
              tabIndex={editScope === 'instance' ? 0 : -1}
              onClick={() => { setEditScope('instance'); clearHighlights() }}
            >
              This element
            </button>
            <button
              type="button"
              class={`cortex-panel__scope-btn ${editScope === 'all' ? 'cortex-panel__scope-btn--active' : ''}`}
              role="radio"
              aria-checked={editScope === 'all'}
              tabIndex={editScope === 'all' ? 0 : -1}
              onClick={() => { setEditScope('all'); highlightSharedElements(sharedInfo, element) }}
              onMouseEnter={() => { if (editScope !== 'all') highlightSharedElements(sharedInfo, element) }}
              onMouseLeave={() => { if (editScope !== 'all') clearHighlights() }}
            >
              All
            </button>
          </div>
        </div>
      )}
      <div class="cortex-panel__body" ref={bodyRef}>
        {/* Section ordering per DESIGN.md: Elements → Position → Layout →
            Typography → Appearance → Background → Border → Effects.
            Typography conditional on hasTypographyContent; Position hidden
            in shared-class "All" scope. */}
        <SectionGroup label="Elements" groupId="elements">
          <ElementTree element={element} onSelectElement={onSelectElement} height={layerHeight} hmrAppliedVersion={hmrAppliedVersion} />
        </SectionGroup>
        <div
          class="cortex-section-resize"
          onPointerDown={handleLayerResizeDown}
          onPointerMove={handleLayerResizeMove}
          onPointerUp={handleLayerResizeUp}
          onPointerCancel={handleLayerResizeUp}
        />
        {showPosition && (
          <SectionGroup label="Position" groupId="position">
            <PositionSection
              values={computedStyles.position}
              onChange={handleCommit}
              onScrub={handleScrub}
              onScrubEnd={handleCommit}
              dimmedProperties={dimmedProperties}
            />
          </SectionGroup>
        )}
        <SectionGroup label="Layout" groupId="layout">
          <LayoutSection
            values={computedStyles.layout}
            onChange={handleCommit}
            onScrub={handleScrub}
            onScrubEnd={handleCommit}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
            spacing={{ padding: computedStyles.spacing.padding, margin: computedStyles.spacing.margin }}
            onSpacingChange={handleCommit}
            onSpacingScrub={handleScrub}
            onSpacingScrubEnd={handleCommit}
          />
        </SectionGroup>
        {showTypography && (
          <SectionGroup label="Typography" groupId="typography">
            <TypographySection
              values={computedStyles.typography}
              availableWeights={availableWeights}
              className={typographyClassName}
              onChange={handleTypographyChange}
              onScrub={handleScrub}
              onScrubEnd={handleCommit}
              swatches={swatches}
              textComponents={textComponents}
              colorChips={colorChips}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          </SectionGroup>
        )}
        <SectionGroup label="Appearance" groupId="appearance">
          <AppearanceSection
            values={computedStyles.appearance}
            onChange={handleCommit}
            onScrub={handleScrub}
            onScrubEnd={handleCommit}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
            resetKey={`${element.tagName}|${element.id}|${element.getAttribute('data-cortex-source') ?? ''}`}
          />
        </SectionGroup>
        <SectionGroup
          label="Background"
          groupId="background"
          headerAction={
            !fillHasValue ? (
              <IconButton icon={<Plus size={14} />} ariaLabel="Add background" tooltip="Add background color" onClick={handleFillAdd} />
            ) : undefined
          }
        >
          {fillHasValue && (
            <BackgroundSection
              backgroundColor={computedStyles.fill.backgroundColor}
              backgroundToken={extractedUtilities.get('background-color') ?? null}
              onChange={handleCommit}
              onRemove={handleFillRemove}
              swatches={swatches}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          )}
        </SectionGroup>
        <SectionGroup
          label="Border"
          groupId="border"
          headerAction={
            !borderHasValue ? (
              <IconButton icon={<Plus size={14} />} ariaLabel="Add border" tooltip="Add border" onClick={handleBorderAdd} />
            ) : undefined
          }
        >
          {borderHasValue && (
            <BorderSection
              values={computedStyles.border}
              borderToken={extractedUtilities.get('border-color') ?? null}
              onChange={handleCommit}
              onScrub={handleScrub}
              onScrubEnd={handleCommit}
              onRemove={handleBorderRemove}
              swatches={swatches}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          )}
        </SectionGroup>
        <SectionGroup
          label="Effects"
          groupId="effects"
          headerAction={
            <IconButton icon={<Plus size={14} />} ariaLabel="Add effect" tooltip="Add shadow effect" onClick={handleShadowAdd} />
          }
        >
          <EffectsSection
            values={computedStyles.effects}
            onChange={handleCommit}
            onScrub={handleScrub}
            onScrubEnd={handleCommit}
            swatches={swatches}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
          />
        </SectionGroup>
        {channel && (
          <CommentInput
            agentConnected={agentConnected ?? false}
            onSubmit={handleCommentSubmit}
          />
        )}
      </div>
      <ConnectionStatusFooter status={connectionStatus} />
    </div>
  )
}
