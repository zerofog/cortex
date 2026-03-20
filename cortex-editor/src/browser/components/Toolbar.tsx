import type { JSX } from 'preact'
import { useDrag } from '../hooks/useDrag.js'
import { useToolbarDock } from '../hooks/useToolbarDock.js'

export interface ToolbarProps {
  activityCount: number
  onClose: () => void
}

// Inline SVG icons — 16×16 viewBox, stroke-based, 1.5px stroke
const iconSize = 16
const svgProps = { width: iconSize, height: iconSize, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const }

function IconGrip(): JSX.Element {
  // 2×3 grip dots — universal drag handle indicator
  return <svg {...svgProps}><circle cx="6" cy="4" r="1.2" fill="currentColor" stroke="none" /><circle cx="10" cy="4" r="1.2" fill="currentColor" stroke="none" /><circle cx="6" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="10" cy="12" r="1.2" fill="currentColor" stroke="none" /></svg>
}

function IconClose(): JSX.Element {
  return <svg {...svgProps}><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
}

export function Toolbar({
  activityCount,
  onClose,
}: ToolbarProps): JSX.Element {
  const { position, isHorizontal, isSnapping, setPosition, snap } = useToolbarDock()

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) { setPosition({ x, y }) },
    onDragEnd() { snap() },
  })

  const classes = [
    'cortex-toolbar',
    isHorizontal ? 'cortex-toolbar--horizontal' : 'cortex-toolbar--vertical',
    isSnapping && 'cortex-toolbar--snapping',
  ].filter(Boolean).join(' ')

  return (
    <div
      class={classes}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Grip — drag handle (smaller, visually distinct from action buttons) */}
      <div class="cortex-toolbar__grip" aria-label="Drag to reposition">
        <IconGrip />
      </div>

      {activityCount > 0 && (
        <span class="cortex-toolbar__badge">
          {activityCount} {activityCount === 1 ? 'change' : 'changes'}
        </span>
      )}

      <button
        type="button"
        class="cortex-toolbar__btn cortex-toolbar__btn--close"
        data-action="close"
        onClick={onClose}
        data-tooltip="Close Cortex"
      >
        <IconClose />
      </button>
    </div>
  )
}
