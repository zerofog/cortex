import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
import type { CSSOverrideManager } from '../override.js'
import { parseCortexSource } from '../label.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge, PANEL_WIDTH } from '../hooks/useSnapToEdge.js'
import { PanelHeader } from './PanelHeader.js'
import { SpacingSection } from './sections/SpacingSection.js'
import type { SpacingChange } from './sections/SpacingSection.js'
import { LayoutSection, parseLayoutValues } from './sections/LayoutSection.js'
import type { LayoutChange } from './sections/LayoutSection.js'
import { TypographySection, parseTypographyValues, getWeightsForFamily, stripCSSQuotes } from './sections/TypographySection.js'
import type { TypographyChange } from './sections/TypographySection.js'

export interface PanelProps {
  element: HTMLElement
  overrideManager: CSSOverrideManager
  onClose: () => void
  onSelectElement: (el: HTMLElement | null) => void
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
}: PanelProps): JSX.Element | null {
  // ALL hooks first — no conditional returns before hooks
  const [contentKey, setContentKey] = useState(0)
  const [isEntering, setIsEntering] = useState(true)
  const [isCrossFading, setIsCrossFading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const prevElementRef = useRef<HTMLElement | null>(null)


  const { position, isSnapping, setPosition, snap } = useSnapToEdge()
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) { setPosition({ x, y }) },
    onDragEnd() { snap() },
  })

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (prevElementRef.current && prevElementRef.current !== element) {
      setContentKey(k => k + 1)
      setIsCrossFading(true)
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

  // C1: Cache getComputedStyle results — avoids forced layout on every drag frame
  const computedStyles = useMemo(() => {
    if (!element) {
      return {
        spacing: parseSpacingValues({} as CSSStyleDeclaration),
        layout: parseLayoutValues({} as CSSStyleDeclaration),
        typography: parseTypographyValues({} as CSSStyleDeclaration),
      }
    }
    const cs = getComputedStyle(element)
    return {
      spacing: parseSpacingValues(cs),
      layout: parseLayoutValues(cs),
      typography: parseTypographyValues(cs),
    }
  }, [element, styleVersion])

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

  // Shared override application — warns if element lacks source attribution
  const applyOverride = useCallback((property: string, value: string, commitRender: boolean) => {
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (!source) {
      console.warn('[cortex] Cannot apply override: element missing data-cortex-source')
      return
    }
    overrideManager.set(source, property, value)
    if (commitRender) {
      overrideManager.flush()
      setStyleVersion(v => v + 1)
    }
  }, [element, overrideManager])

  const handleSpacingCommit = useCallback((c: SpacingChange) => applyOverride(c.property, `${c.value}px`, true), [applyOverride])
  const handleScrub = useCallback((c: SpacingChange) => applyOverride(c.property, `${c.value}px`, false), [applyOverride])

  const handleLayoutCommit = useCallback((c: LayoutChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleLayoutScrub = useCallback((c: LayoutChange) => applyOverride(c.property, c.value, false), [applyOverride])
  const handleTypographyCommit = useCallback((c: TypographyChange) => applyOverride(c.property, c.value, true), [applyOverride])
  const handleTypographyScrub = useCallback((c: TypographyChange) => applyOverride(c.property, c.value, false), [applyOverride])

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

  // Null guard AFTER all hooks
  if (!element) return null

  const sourceInfo = parseCortexSource(element)
  const tagName = element.tagName.toLowerCase()
  const componentName = sourceInfo?.componentName ?? null
  const sourceFile = sourceInfo?.fileName ?? null
  const sourceLine = sourceInfo?.line ?? null
  const filePath = sourceInfo?.filePath ?? null
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      <div class="cortex-panel__body" ref={bodyRef} key={contentKey}>
        <LayoutSection
          values={computedStyles.layout}
          onChange={handleLayoutCommit}
          onScrub={handleLayoutScrub}
          onScrubEnd={handleLayoutCommit}
        />
        <SpacingSection
          padding={computedStyles.spacing.padding}
          margin={computedStyles.spacing.margin}
          gap={computedStyles.spacing.gap}
          isFlexOrGrid={isFlexOrGrid}
          onChange={handleSpacingCommit}
          onScrub={handleScrub}
          onScrubEnd={handleSpacingCommit}
        />
        <TypographySection
          values={computedStyles.typography}
          availableWeights={availableWeights}
          onChange={handleTypographyCommit}
          onScrub={handleTypographyScrub}
          onScrubEnd={handleTypographyCommit}
        />
      </div>
    </div>
  )
}
