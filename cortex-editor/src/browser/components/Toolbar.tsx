import type { JSX } from 'preact'
import { useDrag } from '../hooks/useDrag.js'
import { useToolbarDock, TOOLBAR_LENGTH, TOOLBAR_THICKNESS } from '../hooks/useToolbarDock.js'

export type CortexMode = 'select' | 'comment' | 'canvas'

export interface ToolbarProps {
  mode: CortexMode
  onModeChange: (mode: CortexMode) => void
  activityCount: number
  onClose: () => void
  canvasActive?: boolean
}

export function Toolbar({
  mode,
  onModeChange,
  activityCount,
  onClose,
  canvasActive = false,
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

  const width = isHorizontal ? TOOLBAR_LENGTH : TOOLBAR_THICKNESS
  const height = isHorizontal ? TOOLBAR_THICKNESS : TOOLBAR_LENGTH

  return (
    <div
      class={classes}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Logo — drag handle (not a button, so useDrag allows drag from here) */}
      <div class="cortex-toolbar__logo" aria-label="Cortex — drag to reposition">
        ◇
      </div>

      <button
        type="button"
        class={`cortex-toolbar__btn${mode === 'select' ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="select"
        onClick={() => onModeChange('select')}
        data-tooltip="Select (V)"
      >
        ↖
      </button>

      <button
        type="button"
        class={`cortex-toolbar__btn${mode === 'comment' ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="comment"
        onClick={() => onModeChange('comment')}
        data-tooltip="Comment (C)"
      >
        💬
      </button>

      <button
        type="button"
        class={`cortex-toolbar__btn${canvasActive ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="canvas"
        onClick={() => onModeChange('canvas')}
        data-tooltip="Canvas (⌘0)"
      >
        ⊞
      </button>

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
        ✕
      </button>
    </div>
  )
}
