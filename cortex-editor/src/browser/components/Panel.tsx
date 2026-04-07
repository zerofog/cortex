import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
import type { CSSOverrideManager } from '../override.js'
import { onOverrideChange } from '../override-bus.js'
import { CommandStack } from '../command-stack.js'
import { PropertyEditCommand } from '../edit-command.js'
import type { PropertyChange } from '../edit-command.js'
import { parseCortexSource, isLibraryComponent, findUserAncestor } from '../label.js'
import { PANEL_WIDTH } from '../hooks/useSnapToEdge.js'
import { formatShortcut } from '../format-shortcut.js'
import { extractUtilities } from '../class-extractor.js'
import { PanelHeader } from './PanelHeader.js'
import { SpacingSection } from './sections/SpacingSection.js'
import type { SpacingChange } from './sections/SpacingSection.js'
import { LayoutSection, parseLayoutValues } from './sections/LayoutSection.js'
import type { LayoutChange } from './sections/LayoutSection.js'
import { TypographySection, parseTypographyValues, getWeightsForFamily, stripCSSQuotes } from './sections/TypographySection.js'
import type { TypographyChange } from './sections/TypographySection.js'
import { FillSection, parseFillValues, summarizeFill } from './sections/FillSection.js'
import type { FillChange } from './sections/FillSection.js'
import { BorderSection, parseBorderValues, summarizeBorder } from './sections/BorderSection.js'
import type { BorderChange } from './sections/BorderSection.js'
import { ShadowSection, parseShadowValues, summarizeShadow, addShadow } from './sections/ShadowSection.js'
import type { ShadowChange } from './sections/ShadowSection.js'
import { EffectsSection, parseEffectsValues } from './sections/EffectsSection.js'
import type { EffectsChange } from './sections/EffectsSection.js'
import { PositionSection, parsePositionValues } from './sections/PositionSection.js'
import type { PositionChange } from './sections/PositionSection.js'
import type { InteractionState } from '../state-detector.js'
import { detectSharedClasses } from '../shared-class-detector.js'
import type { SharedClassInfo } from '../shared-class-detector.js'
import { CommentInput } from './CommentInput.js'
import { SectionGroup } from './SectionGroup.js'
import { CollapsibleSection } from './CollapsibleSection.js'
import type { CortexChannel, ConnectionDisplay } from '../../adapters/types.js'

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

function ConnectionStatusFooter({ status }: { status?: ConnectionDisplay }): JSX.Element {
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
 * All CSS properties checked for dimming (default vs forced-state comparison).
 * Covers every section's managed properties.
 */
export const ALL_DIMMING_PROPERTIES = [
  'display', 'visibility', 'flex-direction', 'justify-content', 'align-items', 'width', 'height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align',
  'background-color', 'background-image',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'box-shadow',
  'opacity', 'overflow', 'box-sizing', 'cursor', 'filter', 'backdrop-filter',
  'position', 'left', 'top', 'z-index', 'rotate', 'scale',
  'min-width', 'max-width', 'min-height', 'max-height',
] as const

export interface PanelProps {
  element: HTMLElement | null
  overrideManager: CSSOverrideManager
  onClose: () => void
  onSelectElement: (el: HTMLElement | null) => void
  swatches?: string[]
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
}

function parseSpacingValues(cs: CSSStyleDeclaration) {
  return {
    padding: {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    },
    margin: {
      top: parseFloat(cs.marginTop) || 0,
      right: parseFloat(cs.marginRight) || 0,
      bottom: parseFloat(cs.marginBottom) || 0,
      left: parseFloat(cs.marginLeft) || 0,
    },
    gap: {
      row: parseFloat(cs.rowGap) || 0,
      column: parseFloat(cs.columnGap) || 0,
    },
    boxSizing: cs.boxSizing || 'content-box',
  }
}

export function Panel({
  element,
  overrideManager,
  onClose,
  onSelectElement,
  swatches,
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
}: PanelProps): JSX.Element | null {
  // ALL hooks first — no conditional returns before hooks
  const [contentKey, setContentKey] = useState(0)
  const [isEntering, setIsEntering] = useState(true)
  const [isCrossFading, setIsCrossFading] = useState(false)
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

  // Pseudo-element tab state — internal to Panel
  const [activePseudo, setActivePseudo] = useState<'element' | '::before' | '::after'>('element')

  // Shared class detection + scope toggle for instance-level editing (ZF0-1018)
  const [sharedInfo, setSharedInfo] = useState<SharedClassInfo | null>(null)
  const [editScope, setEditScope] = useState<'instance' | 'all'>('instance')

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
  }, [element]) // only on element change, NOT on styleVersion or activeState

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (prevElementRef.current && prevElementRef.current !== element) {
      setContentKey(k => k + 1)
      setIsCrossFading(true)
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

  // Detect shared CSS classes when a new element is selected (ZF0-1018).
  // Resets scope to 'instance' (safe default) on every element change.
  // Clear stale blast-radius highlights from previous selection (ZF0-1019).
  useEffect(() => {
    clearHighlights()
    if (element) {
      try {
        setSharedInfo(detectSharedClasses(element))
      } catch {
        setSharedInfo(null) // degrade gracefully — editing still works, just no scope toggle
      }
    } else {
      setSharedInfo(null)
    }
    setEditScope('instance')
  }, [element])

  // M3: Clear cross-fade class after animation completes
  useEffect(() => {
    if (!isCrossFading) return
    const timer = setTimeout(() => setIsCrossFading(false), 150)
    return () => clearTimeout(timer)
  }, [isCrossFading])

  // Sync strategy: bump counter on committed changes to force getComputedStyle re-read.
  // During scrub, trust NumericInput local state (no re-render per frame).
  const [styleVersion, setStyleVersion] = useState(0)

  // Re-read computed styles whenever overrides change externally (undo/redo clearAll,
  // hmr_verified removal). Without this, Panel shows stale values after undo because
  // clearAll doesn't bump styleVersion — only applyOverride does.
  useEffect(() => {
    return onOverrideChange(() => setStyleVersion(v => v + 1))
  }, [])

  // C1: Cache getComputedStyle results + compute dimmed properties in a single useMemo
  // to avoid double forced layout. CRITICAL: activeState + activePseudo in deps so
  // useMemo re-runs after state forcing (getComputedStyle returns a live reference).
  const { computedStyles, dimmedProperties, mixedProperties } = useMemo(() => {
    if (!element) {
      return {
        computedStyles: {
          spacing: parseSpacingValues({} as CSSStyleDeclaration),
          layout: parseLayoutValues({} as CSSStyleDeclaration),
          typography: parseTypographyValues({} as CSSStyleDeclaration),
          fill: parseFillValues({} as CSSStyleDeclaration),
          border: parseBorderValues({} as CSSStyleDeclaration),
          shadow: parseShadowValues({} as CSSStyleDeclaration),
          effects: parseEffectsValues({} as CSSStyleDeclaration),
          position: parsePositionValues({} as CSSStyleDeclaration),
        },
        dimmedProperties: undefined as Set<string> | undefined,
        mixedProperties: undefined as Set<string> | undefined,
      }
    }
    const pseudo = activePseudo !== 'element' ? activePseudo : undefined
    const cs = getComputedStyle(element, pseudo)
    const parsed = {
      spacing: parseSpacingValues(cs),
      layout: parseLayoutValues(cs),
      typography: parseTypographyValues(cs),
      fill: parseFillValues(cs),
      border: parseBorderValues(cs),
      shadow: parseShadowValues(cs),
      effects: parseEffectsValues(cs),
      position: parsePositionValues(cs),
    }

    let dimmed: Set<string> | undefined
    if (activeState !== 'default' && defaultStylesRef.current) {
      dimmed = new Set<string>()
      const defaultCs = pseudo ? getComputedStyle(element) : cs
      if (typeof defaultCs.getPropertyValue === 'function') {
        for (const prop of ALL_DIMMING_PROPERTIES) {
          if (defaultCs.getPropertyValue(prop) !== defaultStylesRef.current[prop]) dimmed.add(prop)
        }
      }
    }

    // Compare computed styles across shared elements when editing "All" scope.
    // Properties where siblings differ from the selected element are "mixed".
    let mixed: Set<string> | undefined
    if (sharedInfo && editScope === 'all') {
      mixed = new Set<string>()
      for (const sibling of sharedInfo.elements) {
        if (sibling === element) continue
        const siblingCs = getComputedStyle(sibling, pseudo)
        for (const prop of ALL_DIMMING_PROPERTIES) {
          if (mixed.has(prop)) continue
          if (cs.getPropertyValue(prop) !== siblingCs.getPropertyValue(prop)) {
            mixed.add(prop)
          }
        }
      }
      if (mixed.size === 0) mixed = undefined
    }

    return { computedStyles: parsed, dimmedProperties: dimmed, mixedProperties: mixed }
  }, [element, styleVersion, activeState, activePseudo, sharedInfo, editScope])

  // Derive isFlexOrGrid from normalized layout display
  const layoutDisplay = computedStyles.layout.display
  const isFlexOrGrid = layoutDisplay === 'flex' || layoutDisplay === 'grid'
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
    const pseudo = activePseudo !== 'element' ? activePseudo : undefined

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

    // Record command on stack. Overrides are already applied during scrub phase,
    // so record() stores without re-executing (avoids double-apply).
    if (changes.length > 0) {
      if (commandStack) {
        const cmd = new PropertyEditCommand({ changes, overrideManager })
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

    // Dispatch one server edit per distinct property (not per source — server handles scope='all').
    // Filter to the selected element's source to deduplicate scope='all' sibling entries.
    if (channel) {
      const editedProps = changes.filter(c => c.source === source)
      for (const c of editedProps) {
        const editId = crypto.randomUUID()
        // Track all shared sources so HMR verification clears ALL sibling overrides
        const pendingSources = (sharedInfo && editScope === 'all')
          ? sharedInfo.elements.map(el => el.getAttribute('data-cortex-source')).filter((s): s is string => s !== null)
          : source
        overrideManager.trackPendingEdit(editId, pendingSources, c.property, pseudo)
        channel.send({
          type: 'edit',
          editId,
          source,
          property: c.property,
          value: c.value,
          elementSelector: element.tagName.toLowerCase(),
          cssMapping: element.getAttribute('data-cortex-css') ?? undefined,
          currentClass: extractedUtilities.get(c.property),
          ...(sharedInfo ? {
            scope: editScope,
            ...(editScope === 'all' ? {
              instanceSources: sharedInfo.elements
                .map(el => el.getAttribute('data-cortex-source'))
                .filter((s): s is string => s !== null),
            } : {}),
          } : {}),
        })
      }
    }
  }, [element, overrideManager, activePseudo, channel, sharedInfo, editScope, extractedUtilities, commandStack])

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
        scrubPreviousRef.current.delete(prevKey)
        return
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

  const handleSpacingCommit = useCallback((c: SpacingChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleScrub = useCallback((c: SpacingChange) => applyOverride(c.property, c.value, false), [applyOverride])

  const handleLayoutCommit = useCallback((c: LayoutChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleLayoutScrub = useCallback((c: LayoutChange) => applyOverride(c.property, c.value, false), [applyOverride])
  const handleTypographyCommit = useCallback((c: TypographyChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleTypographyScrub = useCallback((c: TypographyChange) => applyOverride(c.property, c.value, false), [applyOverride])
  const handleFillCommit = useCallback((c: FillChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleBorderCommit = useCallback((c: BorderChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleBorderScrub = useCallback((c: BorderChange) => applyOverride(c.property, c.value, false), [applyOverride])
  const handleShadowCommit = useCallback((c: ShadowChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleEffectsCommit = useCallback((c: EffectsChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleEffectsScrub = useCallback((c: EffectsChange) => applyOverride(c.property, c.value, false), [applyOverride])
  const handlePositionCommit = useCallback((c: PositionChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handlePositionScrub = useCallback((c: PositionChange) => applyOverride(c.property, c.value, false), [applyOverride])

  // Property section state — driven by computed values, not user toggle
  const fillSummary = useMemo(() => summarizeFill(computedStyles.fill), [computedStyles.fill])
  const fillHasValue = fillSummary !== 'transparent'
  const borderSummary = useMemo(() => summarizeBorder(computedStyles.border), [computedStyles.border])
  const borderHasValue = borderSummary !== 'none'
  const shadowSummary = useMemo(() => summarizeShadow(computedStyles.shadow), [computedStyles.shadow])
  const shadowHasValue = shadowSummary !== 'none'

  const handleFillAdd = useCallback(() => {
    applyOverride('background-color', '#ffffff', true)
  }, [applyOverride])
  // Batch: accumulate via scrub, commit once → one atomic undo entry.
  const handleFillRemove = useCallback(() => {
    applyOverride('background-color', 'transparent', false)
    applyOverride('background-image', 'none', false)
    commitScrub()
  }, [applyOverride, commitScrub])
  // Batch: 3 properties → 1 undo entry.
  const handleBorderAdd = useCallback(() => {
    applyOverride('border-width', '1px', false)
    applyOverride('border-style', 'solid', false)
    applyOverride('border-color', '#000000', false)
    commitScrub()
  }, [applyOverride, commitScrub])
  // Intentionally preserves border-color so re-adding restores the user's last choice.
  // Batch: 2 properties → 1 undo entry.
  const handleBorderRemove = useCallback(() => {
    applyOverride('border-style', 'none', false)
    applyOverride('border-width', '0px', false)
    commitScrub()
  }, [applyOverride, commitScrub])
  const handleShadowAdd = useCallback(() => {
    applyOverride('box-shadow', addShadow(computedStyles.shadow.boxShadow), true)
  }, [computedStyles.shadow.boxShadow, applyOverride])

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

    return new Promise<void>((resolve, reject) => {
      let annotationId: string | null = null
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settle()
        reject(new Error('timeout'))
      }, 15_000)

      const unsubscribe = channel.onMessage((msg) => {
        if (settled) return
        if (!annotationId && msg.type === 'annotation-created' && !msg.annotation.pinPosition) {
          annotationId = msg.annotation.id
          if (msg.annotation.status !== 'pending') { settle(); resolve() }
        }
        if (annotationId && msg.type === 'annotation-updated') {
          if (msg.annotation.id === annotationId && msg.annotation.status !== 'pending') {
            settle()
            if (msg.annotation.status === 'dismissed') {
              reject(new Error('dismissed'))
            } else {
              resolve()
            }
          }
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
    isCrossFading && 'cortex-panel--cross-fade',
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
      <div class="cortex-panel__body" ref={bodyRef} key={contentKey}>
        <SectionGroup label="Layout" groupId="layout">
          <LayoutSection
            values={computedStyles.layout}
            onChange={handleLayoutCommit}
            onScrub={handleLayoutScrub}
            onScrubEnd={handleLayoutCommit}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
          />
          <SpacingSection
            padding={computedStyles.spacing.padding}
            margin={computedStyles.spacing.margin}
            gap={computedStyles.spacing.gap}
            isFlexOrGrid={isFlexOrGrid}
            boxSizing={computedStyles.spacing.boxSizing}
            onChange={handleSpacingCommit}
            onScrub={handleScrub}
            onScrubEnd={handleSpacingCommit}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
          />
        </SectionGroup>
        {/* Position is instance-specific — hide when editing shared class */}
        {!(sharedInfo && editScope === 'all') && (
          <SectionGroup label="Position" groupId="position">
            <PositionSection
              values={computedStyles.position}
              onChange={handlePositionCommit}
              onScrub={handlePositionScrub}
              onScrubEnd={handlePositionCommit}
              dimmedProperties={dimmedProperties}
            />
          </SectionGroup>
        )}
        <SectionGroup label="Typography" groupId="typography">
          <TypographySection
            values={computedStyles.typography}
            availableWeights={availableWeights}
            onChange={handleTypographyCommit}
            onScrub={handleTypographyScrub}
            onScrubEnd={handleTypographyCommit}
            swatches={swatches}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
          />
        </SectionGroup>
        <SectionGroup label="Style" groupId="style">
          <CollapsibleSection sectionId="fill" label="Fill" summary={fillSummary} hasValue={fillHasValue} onAdd={handleFillAdd} onRemove={handleFillRemove}>
            <FillSection
              values={computedStyles.fill}
              onChange={handleFillCommit}
              swatches={swatches}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          </CollapsibleSection>
          <CollapsibleSection sectionId="border" label="Border" summary={borderSummary} hasValue={borderHasValue} onAdd={handleBorderAdd} onRemove={handleBorderRemove}>
            <BorderSection
              values={computedStyles.border}
              onChange={handleBorderCommit}
              onScrub={handleBorderScrub}
              onScrubEnd={handleBorderCommit}
              swatches={swatches}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          </CollapsibleSection>
          <CollapsibleSection sectionId="shadow" label="Shadow" summary={shadowSummary} hasValue={shadowHasValue} onAdd={handleShadowAdd} canAddMore>
            <ShadowSection
              values={computedStyles.shadow}
              onChange={handleShadowCommit}
              swatches={swatches}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          </CollapsibleSection>
          <CollapsibleSection sectionId="effects" label="Effects" hasValue={true}>
            <EffectsSection
              values={computedStyles.effects}
              onChange={handleEffectsCommit}
              onScrub={handleEffectsScrub}
              onScrubEnd={handleEffectsCommit}
              dimmedProperties={dimmedProperties}
              mixedProperties={mixedProperties}
            />
          </CollapsibleSection>
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
