import type { JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useDrag } from '../hooks/useDrag.js'
import { useToolbarDock } from '../hooks/useToolbarDock.js'
import { formatShortcut } from '../format-shortcut.js'
import { GripVertical, MessageSquare, MousePointer2 } from './icons.js'

export interface ToolbarProps {
  commentMode?: boolean
  onCommentMode?: () => void
}

// Close-from-toolbar removed in favor of Esc-to-deactivate.
// CortexApp.tsx's cascading Escape handler (Priority 4) already calls
// handleClose() when nothing else consumed the key — same behavior the
// old X button triggered. The hotkey (cmd+shift+. / ctrl+shift+.) still
// reactivates Cortex from anywhere. See thoughts/ for the UX rationale:
// the X button was rarely used and added visual noise; Esc is the
// industry-standard "get out of here" affordance.
export function Toolbar({
  commentMode,
  onCommentMode,
}: ToolbarProps): JSX.Element {
  const { position, isHorizontal, isSnapping, setPosition, snap } = useToolbarDock()

  const { handlePointerDown: dragPointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) { setPosition({ x, y }) },
    onDragEnd() { snap() },
  })

  // Only start drag from the grip handle — not buttons or other toolbar areas
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest('.cortex-toolbar__grip')) return
    dragPointerDown(e)
  }, [dragPointerDown])

  const modesRef = useRef<HTMLDivElement>(null)
  const [indicatorTransform, setIndicatorTransform] = useState('translateX(0)')

  useEffect(() => {
    const container = modesRef.current
    if (!container) return
    const buttons = container.querySelectorAll('.cortex-toolbar__mode') as NodeListOf<HTMLElement>
    const activeIdx = commentMode ? 1 : 0
    const btn = buttons[activeIdx]
    if (!btn) return
    // offsetLeft already includes container padding — do not subtract it.
    // See CLAUDE.md "UI Positioning Rules".
    // Width is fixed at 36px in CSS — only translateX changes.
    setIndicatorTransform(`translateX(${btn.offsetLeft}px)`)
  }, [commentMode])

  const classes = [
    'cortex-toolbar',
    isHorizontal ? 'cortex-toolbar--horizontal' : 'cortex-toolbar--vertical',
    isSnapping && 'cortex-toolbar--snapping',
  ].filter(Boolean).join(' ')
  const tooltipPlacement = isHorizontal ? undefined : 'right'

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
      <div class="cortex-toolbar__grip" role="presentation">
        <GripVertical size={16} />
      </div>

      <div class="cortex-toolbar__modes" ref={modesRef} role="radiogroup" aria-label="Editor mode">
        <div class="cortex-toolbar__modes-indicator" style={{ transform: indicatorTransform }} />
        <button
          type="button"
          class={`cortex-toolbar__mode${!commentMode ? ' cortex-toolbar__mode--active' : ''}`}
          role="radio"
          aria-checked={!commentMode ? 'true' : 'false'}
          aria-label="Select mode"
          data-mode="select"
          data-tooltip={`Select (${formatShortcut('v')})`}
          data-tooltip-placement={tooltipPlacement}
          onClick={commentMode ? onCommentMode : undefined}
        >
          <MousePointer2 size={16} />
        </button>
        <button
          type="button"
          class={`cortex-toolbar__mode${commentMode ? ' cortex-toolbar__mode--active' : ''}`}
          role="radio"
          aria-checked={commentMode ? 'true' : 'false'}
          aria-label="Comment mode"
          data-mode="comment"
          data-tooltip={`Comment (${formatShortcut('c')})`}
          data-tooltip-placement={tooltipPlacement}
          onClick={!commentMode ? onCommentMode : undefined}
        >
          <MessageSquare size={16} />
        </button>
      </div>
    </div>
  )
}
