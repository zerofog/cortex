import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'
import { CSSOverrideManager } from '../override.js'
import { initSelection } from '../selection.js'
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

  const handleClose = useCallback(() => setSelectedElement(null), [])
  const handleSelectElement = useCallback((el: HTMLElement | null) => setSelectedElement(el), [])

  return (
    <>
      <HoverOverlay element={hoveredElement} />
      <SelectionOverlay element={selectedElement} />
      {selectedElement && overrideRef.current && (
        <Panel
          element={selectedElement}
          overrideManager={overrideRef.current}
          onClose={handleClose}
          onSelectElement={handleSelectElement}
          swatches={swatches}
        />
      )}
    </>
  )
}
