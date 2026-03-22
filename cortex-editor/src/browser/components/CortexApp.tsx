import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel, Annotation, ActivityEntry } from '../../adapters/types.js'
import { CSSOverrideManager } from '../override.js'
import { initSelection } from '../selection.js'
import type { SelectionHandle } from '../selection.js'
import { detectStates } from '../state-detector.js'
import type { StateDeclarations, InteractionState } from '../state-detector.js'
import { HoverOverlay } from './HoverOverlay.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { Panel } from './Panel.js'
import { Toolbar } from './Toolbar.js'
import { CommentPin } from './CommentPin.js'
import { ActivityLog } from './ActivityLog.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge } from '../hooks/useSnapToEdge.js'
import { useCanvasZoom } from '../hooks/useCanvasZoom.js'

export interface CortexAppProps {
  channel: CortexChannel
  shadowRoot: ShadowRoot
}

/**
 * Root component. Wires selection events, overlay rendering,
 * CSS override manager, channel message handling, and panel
 * drag/snap positioning. Canvas zoom hook is wired but currently
 * disabled — preserved for future re-enablement.
 */
export function CortexApp({ channel, shadowRoot }: CortexAppProps): JSX.Element | null {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null)
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null)
  const [swatches, setSwatches] = useState<string[] | undefined>(undefined)
  const [activeState, setActiveState] = useState<InteractionState>('default')
  const [availableStates, setAvailableStates] = useState<StateDeclarations | undefined>(undefined)
  const [hasBefore, setHasBefore] = useState(false)
  const [hasAfter, setHasAfter] = useState(false)
  const [hoverEnabled, setHoverEnabled] = useState(true)
  const overrideRef = useRef<CSSOverrideManager | null>(null)
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map())
  const [agentConnected, setAgentConnected] = useState(false)
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  const [commentMode, setCommentMode] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  // Phase 6: Activity, active state, refs
  const [activityCount, setActivityCount] = useState(0)
  const [active, setActive] = useState(false)
  const selectionRef = useRef<SelectionHandle | null>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)
  selectedElementRef.current = selectedElement

  // Phase 6: Panel positioning (lifted from Panel)
  const { position: panelPosition, isSnapping: panelSnapping, setPosition: setPanelPosition, snap: panelSnap } = useSnapToEdge()
  const { handlePointerDown: panelPointerDown, handlePointerMove: panelPointerMove, handlePointerUp: panelPointerUp, handlePointerCancel: panelPointerCancel } = useDrag({
    onDrag(x, y) { setPanelPosition({ x, y }) },
    onDragEnd() { panelSnap() },
  })

  // Phase 6: Canvas zoom (disabled — preserved for future re-enablement)
  useCanvasZoom(false)

  useEffect(() => {
    // Initialize CSS override manager
    const overrideManager = new CSSOverrideManager()
    overrideRef.current = overrideManager

    // Initialize selection system
    const selectionHandle = initSelection(
      shadowRoot,
      setHoveredElement,
      setSelectedElement,
    )
    // Start with design mode disabled — don't intercept events until activated
    selectionHandle.setDesignMode(false)
    selectionRef.current = selectionHandle

    // Subscribe to server messages
    const unsubscribe = channel.onMessage((msg) => {
      if (msg.type === 'cortex') {
        selectionRef.current?.setDesignMode(true)
        setActive(true)
      }
      if (msg.type === 'cortex-close') {
        selectionRef.current?.setDesignMode(false)
        setSelectedElement(null)
        setActive(false)
        channel.send({ type: 'cortex-closed' })
      }
      if (msg.type === 'hello') {
        if (msg.swatches && msg.swatches.length > 0) {
          setSwatches(msg.swatches)
        }
      }
      if (msg.type === 'edit_status' && msg.status === 'done') {
        setActivityCount(c => c + 1)
      }
      if (msg.type === 'annotation-created') {
        setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
      }
      if (msg.type === 'annotation-updated') {
        setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
      }
      if (msg.type === 'agent-status') {
        setAgentConnected(msg.connected)
      }
      if (msg.type === 'activity-entry') {
        setActivityEntries(prev => [...prev, msg.entry])
        setActivityCount(c => c + 1)
      }
    })

    return () => {
      unsubscribe()
      selectionHandle.cleanup()
      selectionRef.current = null
      overrideManager.dispose()
      overrideRef.current = null
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
    setShowActivity(v => !v)
    if (!showActivity) setActivityCount(0) // reset badge on open
  }, [showActivity])
  const handleCommentReply = useCallback((annotationId: string, text: string) => {
    channel.send({ type: 'comment', elementSource: annotationId, text })
  }, [channel])

  const handleClose = useCallback(() => setSelectedElement(null), [])
  const handleSelectElement = useCallback((el: HTMLElement | null) => setSelectedElement(el), [])
  const handleToggleHover = useCallback(() => setHoverEnabled(v => !v), [])

  // Phase 6: Exit handler — notify server, deactivate
  const handleExit = useCallback(() => {
    selectionRef.current?.setDesignMode(false)
    setSelectedElement(null)
    setActive(false)
    channel.send({ type: 'cortex-closed' })
  }, [channel])

  // Phase 6: Keyboard shortcuts — Escape to deselect or exit
  useEffect(() => {
    if (!active) return
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (target?.isContentEditable) return

      if (e.key === 'Escape') {
        if (selectedElementRef.current) {
          // Deselect — stay active
          setSelectedElement(null)
        } else {
          // No selection — exit editor
          handleExit()
        }
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, handleExit])

  if (!active) return null

  return (
    <>
      <HoverOverlay element={hoverEnabled ? hoveredElement : null} />
      <SelectionOverlay
        element={selectedElement}
        availableStates={availableStates}
        activeState={activeState}
        onStateChange={handleStateChange}
        overlaysVisible={hoverEnabled}
      />
      {selectedElement && overrideRef.current && (
        <Panel
          element={selectedElement}
          overrideManager={overrideRef.current}
          onClose={handleClose}
          onSelectElement={handleSelectElement}
          swatches={swatches}
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
        />
      )}
      <Toolbar
        activityCount={activityCount}
        onClose={handleExit}
        commentMode={commentMode}
        onCommentMode={handleCommentMode}
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
    </>
  )
}
