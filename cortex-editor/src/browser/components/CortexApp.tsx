import type { JSX } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
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
        // Connection established
      }
    })

    return () => {
      unsubscribe()
      cleanupSelection()
      overrideManager.dispose()
      overrideRef.current = null
    }
  }, [channel, shadowRoot])

  const handleClose = () => {
    setSelectedElement(null)
  }

  const handleSelectElement = (el: HTMLElement | null) => {
    setSelectedElement(el)
  }

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
        />
      )}
    </>
  )
}
