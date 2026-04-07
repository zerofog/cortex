import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel, Annotation, ActivityEntry, StyleCapability } from '../../adapters/types.js'
import { CSSOverrideManager } from '../override.js'
import { CommandStack } from '../command-stack.js'
import { initSelection } from '../selection.js'
import type { SelectionHandle } from '../selection.js'
// @ts-ignore — tinykeys has types but exports field doesn't include a "types" condition (TODO: add declare module shim when tinykeys updates)
import { tinykeys } from 'tinykeys'
import { getDeepActiveElement, isInputFocused, isCortexUIFocused, isRealEvent } from '../focus-utils.js'
import { detectStates } from '../state-detector.js'
import type { StateDeclarations, InteractionState } from '../state-detector.js'
import { HoverOverlay } from './HoverOverlay.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { Panel } from './Panel.js'
import { Toolbar } from './Toolbar.js'
import { CommentPin } from './CommentPin.js'
import { ActivityLog } from './ActivityLog.js'
import { ErrorToast } from './ErrorToast.js'
import { CapabilityBanner } from './CapabilityBanner.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge } from '../hooks/useSnapToEdge.js'
import { useCanvasZoom } from '../hooks/useCanvasZoom.js'

/** UI display state for connection indicator. Extends ConnectionState with transient 'reconnected'. */
export type ConnectionDisplay =
  | { status: 'connected' }
  | { status: 'reconnecting'; retryCount: number; maxRetries: number }
  | { status: 'disconnected' }
  | { status: 'reconnected' }

const MAX_ACTIVITY_ENTRIES = 200

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
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null)
  const [swatches, setSwatches] = useState<string[] | undefined>(undefined)
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
  const [commentMode, setCommentMode] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [capabilitySystems, setCapabilitySystems] = useState<StyleCapability[]>([])
  const commentModeRef = useRef(false)
  commentModeRef.current = commentMode

  // Activity, active state, refs
  const [activityCount, setActivityCount] = useState(0)
  const [active, setActive] = useState(initialActive ?? false)
  const selectionRef = useRef<SelectionHandle | null>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)
  selectedElementRef.current = selectedElement
  const handleExitRef = useRef<(() => void) | null>(null)

  // Panel positioning
  const { position: panelPosition, isSnapping: panelSnapping, setPosition: setPanelPosition, snap: panelSnap } = useSnapToEdge()
  const { handlePointerDown: panelPointerDown, handlePointerMove: panelPointerMove, handlePointerUp: panelPointerUp, handlePointerCancel: panelPointerCancel } = useDrag({
    onDrag(x, y) { setPanelPosition({ x, y }) },
    onDragEnd() { panelSnap() },
  })

  // Canvas zoom (disabled — preserved for future re-enablement)
  useCanvasZoom(false)

  useEffect(() => {
    // Initialize CSS override manager and command stack
    const overrideManager = new CSSOverrideManager()
    overrideRef.current = overrideManager
    const commandStack = new CommandStack()
    commandStackRef.current = commandStack

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
        setActive(true)
      }
      if (msg.type === 'cortex-close') {
        handleExitRef.current?.()
      }
      if (msg.type === 'cortex-toggle') {
        if (msg.active) {
          setActive(true)
        } else {
          handleExitRef.current?.()
        }
      }
      if (msg.type === 'capabilities') {
        setCapabilitySystems(msg.systems.filter(s => s.status !== 'supported'))
      }
      if (msg.type === 'hello') {
        if (msg.swatches && msg.swatches.length > 0) {
          setSwatches(msg.swatches)
        }
      }
      if (msg.type === 'edit_status') {
        if (msg.status === 'done') {
          setActivityCount(c => c + 1)
          if (msg.strategy === 'deferred') {
            overrideRef.current?.markDeferred(msg.editId)
          }
        }
        // Note: commitEdit/cancelEdit removed — CommandStack owns undo/redo state
      }
      if (msg.type === 'hmr_verified') {
        overrideRef.current?.handleHMRVerified(msg.editId, msg.match, msg.kind)
      }
      // Undo/redo sync failure: reset server stack only for stack-invalidating
      // failures (stale file, write error). empty_stack is expected (browser stack
      // leads, server may be shorter). Unknown/missing reason_codes may be transient
      // adapter errors — don't clear server state for those.
      if ((msg.type === 'undo_sync_status' || msg.type === 'redo_sync_status') && msg.status === 'failed') {
        console.warn(`[cortex] Server ${msg.type === 'undo_sync_status' ? 'undo' : 'redo'} sync failed:`, msg.reason)
        if (msg.reason_code === 'stale' || msg.reason_code === 'write_failed') {
          channel.send({ type: 'clear_server_undo' })
        }
      }
      if (msg.type === 'hmr-applied') {
        overrideRef.current?.onHMRApplied()
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
        setActivityEntries(prev =>
          prev.length >= MAX_ACTIVITY_ENTRIES
            ? [...prev.slice(-(MAX_ACTIVITY_ENTRIES - 1)), msg.entry]
            : [...prev, msg.entry]
        )
        setActivityCount(c => c + 1)
      }
    })

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

    return () => {
      unsubscribe()
      unsubStatus()
      if (reconnectedTimer !== undefined) clearTimeout(reconnectedTimer)
      selectionHandle.cleanup()
      selectionRef.current = null
      overrideManager.dispose()
      overrideRef.current = null
      commandStack.clear()
      commandStackRef.current = null
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
      if (!prev) setActivityCount(0) // reset badge on open
      return !prev
    })
  }, [])
  const handleCommentReply = useCallback((annotationId: string, text: string) => {
    channel.send({ type: 'comment-reply', annotationId, text })
  }, [channel])

  const handleSelectElement = useCallback((el: HTMLElement | null) => setSelectedElement(el), [])
  const handleToggleHover = useCallback(() => setHoverEnabled(v => !v), [])

  // Exit handler — notify server, deactivate
  const handleExit = useCallback(() => {
    setCommentMode(false)
    setSelectedElement(null)
    setActive(false)
    channel.send({ type: 'cortex-closed' })
  }, [channel])
  handleExitRef.current = handleExit

  // Cascading Escape — capture phase for host app compat
  useEffect(() => {
    if (!active) return
    function handleEscape(e: KeyboardEvent): void {
      if (!isRealEvent(e)) return
      if (e.key !== 'Escape') return

      // Priority 1: Blur focused input inside Cortex UI
      if (isCortexUIFocused()) {
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

      // Priority 3: Deselect element
      if (selectedElementRef.current) {
        setSelectedElement(null)
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
            channel.send({ type: 'undo' })
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
            channel.send({ type: 'redo' })
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
        <CapabilityBanner systems={capabilitySystems} />
        <ErrorToast channel={channel} />
      </div>
      <HoverOverlay element={hoverEnabled ? hoveredElement : null} />
      <SelectionOverlay
        element={selectedElement}
        availableStates={availableStates}
        activeState={activeState}
        onStateChange={handleStateChange}
        overlaysVisible={hoverEnabled}
      />
      {overrideRef.current && (
        <Panel
          element={selectedElement}
          overrideManager={overrideRef.current}
          commandStack={commandStackRef.current}
          flushCommitRef={flushCommitRef}
          undoInProgressRef={undoInProgressRef}
          onClose={handleExit}
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
          connectionStatus={connectionStatus}
        />
      )}
      <Toolbar
        activityCount={activityCount}
        onClose={handleExit}
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
    </>
  )
}
