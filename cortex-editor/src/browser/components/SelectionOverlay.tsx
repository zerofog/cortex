import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { getSelectionLabel } from '../label.js'

export interface SelectionOverlayProps {
  element: HTMLElement | null
}

/**
 * Persistent selection outline with transition. Uses RAF to track position
 * continuously (element may move from scroll/resize while selected).
 */
export function SelectionOverlay({ element }: SelectionOverlayProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  // RAF-based continuous position tracking for the selected element
  useEffect(() => {
    if (!element || !overlayRef.current) return

    let rafId = 0
    // Cache previous rect to skip redundant DOM writes
    let prevTop = ''
    let prevLeft = ''
    let prevWidth = ''
    let prevHeight = ''

    function update(): void {
      if (!element || !overlayRef.current) return
      // Stop RAF loop when element is detached from DOM (e.g. HMR, navigation)
      if (!element.isConnected) return
      const r = element.getBoundingClientRect()
      const top = `${r.top}px`
      const left = `${r.left}px`
      const width = `${r.width}px`
      const height = `${r.height}px`

      // Only write to DOM when values changed
      const el = overlayRef.current
      if (top !== prevTop) { el.style.top = top; prevTop = top }
      if (left !== prevLeft) { el.style.left = left; prevLeft = left }
      if (width !== prevWidth) { el.style.width = width; prevWidth = width }
      if (height !== prevHeight) { el.style.height = height; prevHeight = height }

      rafId = requestAnimationFrame(update)
    }

    update()
    return () => cancelAnimationFrame(rafId)
  }, [element])

  if (!element) return null

  const label = getSelectionLabel(element)
  const r = element.getBoundingClientRect()
  const labelAbove = r.top > 30
  const cs = getComputedStyle(element)

  return (
    <div
      ref={overlayRef}
      class="cortex-selection-overlay"
      style={{
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        borderRadius: cs.borderRadius || '0px',
      }}
    >
      <span class={`cortex-label ${labelAbove ? 'cortex-label--above' : 'cortex-label--below'}`}>
        {label}
      </span>
    </div>
  )
}
