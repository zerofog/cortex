import type { JSX } from 'preact'
import { getLabel } from '../label.js'

export interface HoverOverlayProps {
  element: HTMLElement | null
  /** Canvas zoom scale factor — divide rect values by this to correct coordinates */
  scale?: number
}

/**
 * Semi-transparent hover highlight. Positioned via getBoundingClientRect().
 * Re-rendered on every mousemove by the parent — no internal RAF needed.
 */
export function HoverOverlay({ element, scale = 1 }: HoverOverlayProps): JSX.Element | null {
  if (!element) return null

  const raw = element.getBoundingClientRect()
  // Correct for CSS transform scale on body during canvas zoom
  const r = scale !== 1
    ? { top: raw.top / scale, left: raw.left / scale, width: raw.width / scale, height: raw.height / scale }
    : raw
  const cs = getComputedStyle(element)
  const borderRadius = cs.borderRadius || '0px'
  const label = getLabel(element)
  const labelAbove = r.top > 30

  return (
    <div
      class="cortex-hover-overlay"
      style={{
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        borderRadius,
      }}
    >
      <span class={`cortex-label ${labelAbove ? 'cortex-label--above' : 'cortex-label--below'}`}>
        {label}
      </span>
    </div>
  )
}
