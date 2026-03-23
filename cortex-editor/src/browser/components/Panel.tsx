import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
import type { CSSOverrideManager } from '../override.js'
import { parseCortexSource, isLibraryComponent, findUserAncestor } from '../label.js'
import { PANEL_WIDTH } from '../hooks/useSnapToEdge.js'
import { PanelHeader } from './PanelHeader.js'
import { SpacingSection } from './sections/SpacingSection.js'
import type { SpacingChange } from './sections/SpacingSection.js'
import { LayoutSection, parseLayoutValues } from './sections/LayoutSection.js'
import type { LayoutChange } from './sections/LayoutSection.js'
import { TypographySection, parseTypographyValues, getWeightsForFamily, stripCSSQuotes } from './sections/TypographySection.js'
import type { TypographyChange } from './sections/TypographySection.js'
import { FillSection, parseFillValues } from './sections/FillSection.js'
import type { FillChange } from './sections/FillSection.js'
import { BorderSection, parseBorderValues } from './sections/BorderSection.js'
import type { BorderChange } from './sections/BorderSection.js'
import { ShadowSection, parseShadowValues } from './sections/ShadowSection.js'
import type { ShadowChange } from './sections/ShadowSection.js'
import { EffectsSection, parseEffectsValues } from './sections/EffectsSection.js'
import type { EffectsChange } from './sections/EffectsSection.js'
import type { InteractionState } from '../state-detector.js'
import { CommentInput } from './CommentInput.js'
import type { CortexChannel } from '../../adapters/types.js'

/**
 * All CSS properties checked for dimming (default vs forced-state comparison).
 * Covers every section's managed properties.
 */
export const ALL_DIMMING_PROPERTIES = [
  'display', 'visibility', 'flex-direction', 'justify-content', 'align-items', 'width', 'height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align',
  'background-color',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'box-shadow',
  'opacity', 'overflow', 'cursor', 'filter', 'backdrop-filter',
] as const

export interface PanelProps {
  element: HTMLElement
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
  channel?: CortexChannel
  agentConnected?: boolean
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
  channel,
  agentConnected,
}: PanelProps): JSX.Element | null {
  // ALL hooks first — no conditional returns before hooks
  const [contentKey, setContentKey] = useState(0)
  const [isEntering, setIsEntering] = useState(true)
  const [isCrossFading, setIsCrossFading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const prevElementRef = useRef<HTMLElement | null>(null)

  // Pseudo-element tab state — internal to Panel
  const [activePseudo, setActivePseudo] = useState<'element' | '::before' | '::after'>('element')

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

  // C1: Cache getComputedStyle results + compute dimmed properties in a single useMemo
  // to avoid double forced layout. CRITICAL: activeState + activePseudo in deps so
  // useMemo re-runs after state forcing (getComputedStyle returns a live reference).
  const { computedStyles, dimmedProperties } = useMemo(() => {
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
        },
        dimmedProperties: undefined as Set<string> | undefined,
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

    return { computedStyles: parsed, dimmedProperties: dimmed }
  }, [element, styleVersion, activeState, activePseudo])

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

  // Shared override application — warns if element lacks source attribution.
  // Passes pseudo parameter to CSSOverrideManager when editing a pseudo-element.
  const applyOverride = useCallback((property: string, value: string, commitRender: boolean) => {
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (!source) {
      console.warn('[cortex] Cannot apply override: element missing data-cortex-source')
      return
    }
    const pseudo = activePseudo !== 'element' ? activePseudo : undefined
    overrideManager.set(source, property, value, pseudo)
    if (commitRender) {
      overrideManager.flush()
      setStyleVersion(v => v + 1)
    }
  }, [element, overrideManager, activePseudo])

  const handleSpacingCommit = useCallback((c: SpacingChange) => applyOverride(c.property, `${c.value}px`, true), [applyOverride])
  const handleScrub = useCallback((c: SpacingChange) => applyOverride(c.property, `${c.value}px`, false), [applyOverride])

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
        if (!annotationId && msg.type === 'annotation-created') {
          const ann = msg.annotation
          if (ann.text === text && ann.elementSource === source && !ann.pinPosition) {
            annotationId = ann.id
            if (ann.status !== 'pending') { settle(); resolve() }
          }
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
        if (commentCleanupRef.current === settleRef) commentCleanupRef.current = null
      }
      const settleRef = settle
      commentCleanupRef.current = settle
    })
  }, [element, channel])

  // Null guard AFTER all hooks
  if (!element) return null

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

  const panelClasses = [
    'cortex-panel',
    isEntering && 'cortex-panel--entering',
    isSnapping && 'cortex-panel--snapping',
    isCrossFading && 'cortex-panel--cross-fade',
  ].filter(Boolean).join(' ')

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
      <div class="cortex-panel__body" ref={bodyRef} key={contentKey}>
        <LayoutSection
          values={computedStyles.layout}
          onChange={handleLayoutCommit}
          onScrub={handleLayoutScrub}
          onScrubEnd={handleLayoutCommit}
          dimmedProperties={dimmedProperties}
        />
        <SpacingSection
          padding={computedStyles.spacing.padding}
          margin={computedStyles.spacing.margin}
          gap={computedStyles.spacing.gap}
          isFlexOrGrid={isFlexOrGrid}
          onChange={handleSpacingCommit}
          onScrub={handleScrub}
          onScrubEnd={handleSpacingCommit}
          dimmedProperties={dimmedProperties}
        />
        <TypographySection
          values={computedStyles.typography}
          availableWeights={availableWeights}
          onChange={handleTypographyCommit}
          onScrub={handleTypographyScrub}
          onScrubEnd={handleTypographyCommit}
          swatches={swatches}
          dimmedProperties={dimmedProperties}
        />
        <FillSection
          values={computedStyles.fill}
          onChange={handleFillCommit}
          swatches={swatches}
          dimmedProperties={dimmedProperties}
        />
        <BorderSection
          values={computedStyles.border}
          onChange={handleBorderCommit}
          onScrub={handleBorderScrub}
          onScrubEnd={handleBorderCommit}
          swatches={swatches}
          dimmedProperties={dimmedProperties}
        />
        <ShadowSection
          values={computedStyles.shadow}
          onChange={handleShadowCommit}
          swatches={swatches}
          dimmedProperties={dimmedProperties}
        />
        <EffectsSection
          values={computedStyles.effects}
          onChange={handleEffectsCommit}
          onScrub={handleEffectsScrub}
          onScrubEnd={handleEffectsCommit}
          dimmedProperties={dimmedProperties}
        />
        {channel && (
          <CommentInput
            agentConnected={agentConnected ?? false}
            onSubmit={handleCommentSubmit}
          />
        )}
      </div>
    </div>
  )
}
