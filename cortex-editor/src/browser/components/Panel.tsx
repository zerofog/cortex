import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CSSOverrideManager } from '../override.js'
import { parseCortexSource } from '../label.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge, PANEL_WIDTH } from '../hooks/useSnapToEdge.js'
import { PanelHeader } from './PanelHeader.js'
import { TabNav } from './TabNav.js'
import { SpacingSection } from './sections/SpacingSection.js'
import type { SpacingChange } from './sections/SpacingSection.js'

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
  const [activeTab, setActiveTab] = useState('spacing')
  const [contentKey, setContentKey] = useState(0)
  const [isEntering, setIsEntering] = useState(true)
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
    }
    prevElementRef.current = element
  }, [element])

  const handleSpacingChange = useCallback((change: SpacingChange) => {
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (source) {
      overrideManager.set(source, change.property, `${change.value}px`)
    }
  }, [element, overrideManager])

  const handleScrub = useCallback((change: SpacingChange) => {
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (source) {
      overrideManager.set(source, change.property, `${change.value}px`)
    }
  }, [element, overrideManager])

  const handleScrubEnd = useCallback((change: SpacingChange) => {
    if (!element) return
    const source = element.getAttribute('data-cortex-source')
    if (source) {
      overrideManager.set(source, change.property, `${change.value}px`)
    }
  }, [element, overrideManager])

  const handleSelectParent = useCallback(() => {
    if (!element) return
    if (element.parentElement && element.parentElement !== document.documentElement) {
      onSelectElement(element.parentElement)
    }
  }, [element, onSelectElement])

  const handleSelectChild = useCallback(() => {
    if (!element) return
    if (element.children.length > 0) {
      onSelectElement(element.children[0] as HTMLElement)
    }
  }, [element, onSelectElement])

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId)
    const section = bodyRef.current?.querySelector(`[data-section-id="${tabId}"]`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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

  const cs = getComputedStyle(element)
  const spacing = parseSpacingValues(cs)
  const display = cs.display
  const isFlexOrGrid = display === 'flex' || display === 'inline-flex' || display === 'grid' || display === 'inline-grid'

  const panelClasses = [
    'cortex-panel',
    isEntering && 'cortex-panel--entering',
    isSnapping && 'cortex-panel--snapping',
  ].filter(Boolean).join(' ')

  return (
    <div
      class={panelClasses}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
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
      <TabNav activeTab={activeTab} onTabClick={handleTabClick} />
      <div class="cortex-panel__body" ref={bodyRef} key={contentKey}>
        <SpacingSection
          padding={spacing.padding}
          margin={spacing.margin}
          gap={spacing.gap}
          isFlexOrGrid={isFlexOrGrid}
          onChange={handleSpacingChange}
          onScrub={handleScrub}
          onScrubEnd={handleScrubEnd}
        />
        <div data-section-id="layout" />
        <div data-section-id="type" />
        <div data-section-id="fill" />
        <div data-section-id="border" />
        <div data-section-id="shadow" />
        <div data-section-id="effects" />
      </div>
    </div>
  )
}
