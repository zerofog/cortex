import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'
import { CSSOverrideManager } from '../override.js'
import { initSelection } from '../selection.js'
import { detectStates } from '../state-detector.js'
import type { StateDeclarations, InteractionState } from '../state-detector.js'
import { HoverOverlay } from './HoverOverlay.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { Panel } from './Panel.js'

export interface CortexAppProps {
  channel: CortexChannel
  shadowRoot: ShadowRoot
}

/**
 * Root component. Wires selection events, overlay rendering,
 * CSS override manager, and channel message handling.
 */
export function CortexApp({ channel, shadowRoot }: CortexAppProps): JSX.Element {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null)
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null)
  const [swatches, setSwatches] = useState<string[] | undefined>(undefined)
  const [activeState, setActiveState] = useState<InteractionState>('default')
  const [availableStates, setAvailableStates] = useState<StateDeclarations | undefined>(undefined)
  const [hasBefore, setHasBefore] = useState(false)
  const [hasAfter, setHasAfter] = useState(false)
  const [hoverEnabled, setHoverEnabled] = useState(true)
  const overrideRef = useRef<CSSOverrideManager | null>(null)

  useEffect(() => {
    // Initialize CSS override manager
    const overrideManager = new CSSOverrideManager()
    overrideRef.current = overrideManager

    // Initialize selection system
    const { cleanup: cleanupSelection } = initSelection(
      shadowRoot,
      setHoveredElement,
      setSelectedElement,
    )

    // Subscribe to server messages
    const unsubscribe = channel.onMessage((msg) => {
      if (msg.type === 'hello') {
        if (msg.swatches && msg.swatches.length > 0) {
          setSwatches(msg.swatches)
        }
      }
    })

    return () => {
      unsubscribe()
      cleanupSelection()
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

  const handleClose = useCallback(() => setSelectedElement(null), [])
  const handleSelectElement = useCallback((el: HTMLElement | null) => setSelectedElement(el), [])
  const handleToggleHover = useCallback(() => setHoverEnabled(v => !v), [])

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
        />
      )}
    </>
  )
}
