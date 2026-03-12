import type { JSX } from 'preact'
import { getLabel } from '../label.js'

export interface HoverOverlayProps {
  element: HTMLElement | null
}

/**
 * Semi-transparent hover highlight. Positioned via getBoundingClientRect().
 * Re-rendered on every mousemove by the parent — no internal RAF needed.
 */
export function HoverOverlay({ element }: HoverOverlayProps): JSX.Element | null {
  if (!element) return null

  const r = element.getBoundingClientRect()
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
