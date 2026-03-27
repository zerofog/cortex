import type { JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useDrag } from '../hooks/useDrag.js'
import { useToolbarDock } from '../hooks/useToolbarDock.js'
import { formatShortcut } from '../format-shortcut.js'

export interface ToolbarProps {
  activityCount: number
  onClose: () => void
  commentMode?: boolean
  onCommentMode?: () => void
  onActivityToggle?: () => void
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

function IconComment(): JSX.Element {
  return <svg {...svgProps}><path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 3V4z" /></svg>
}

function IconSelect(): JSX.Element {
  return <svg {...svgProps}><path d="M4 2l8 6.5-3.5.5 2 4.5-2 .8-2-4.5L4 12V2z" /></svg>
}

export function Toolbar({
  activityCount,
  onClose,
  commentMode,
  onCommentMode,
  onActivityToggle,
}: ToolbarProps): JSX.Element {
  const { position, isHorizontal, isSnapping, setPosition, snap } = useToolbarDock()

  const { handlePointerDown: dragPointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) { setPosition({ x, y }) },
    onDragEnd() { snap() },
  })

  // Only start drag from the grip handle — not badge or other toolbar areas
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest('.cortex-toolbar__grip')) return
    dragPointerDown(e)
  }, [dragPointerDown])

  const modesRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ transform: 'translateX(0)', width: '36px' })

  useEffect(() => {
    const container = modesRef.current
    if (!container) return
    const buttons = container.querySelectorAll('.cortex-toolbar__mode') as NodeListOf<HTMLElement>
    const activeIdx = commentMode ? 1 : 0
    const btn = buttons[activeIdx]
    if (!btn) return
    setIndicatorStyle({
      transform: `translateX(${btn.offsetLeft - 2}px)`,
      width: `${btn.offsetWidth}px`,
    })
  }, [commentMode])

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
      <div class="cortex-toolbar__grip" aria-label="Drag to reposition">
        <IconGrip />
      </div>

      {activityCount > 0 && (
        <button
          type="button"
          class="cortex-toolbar__badge"
          onClick={onActivityToggle}
          data-tooltip={`${activityCount} ${activityCount === 1 ? 'change' : 'changes'}`}
        >
          {activityCount}
        </button>
      )}

      <div class="cortex-toolbar__modes" ref={modesRef} role="radiogroup" aria-label="Editor mode">
        <div class="cortex-toolbar__modes-indicator" style={indicatorStyle} />
        <button
          type="button"
          class={`cortex-toolbar__mode${!commentMode ? ' cortex-toolbar__mode--active' : ''}`}
          role="radio"
          aria-checked={!commentMode ? 'true' : 'false'}
          data-tooltip={`Select (${formatShortcut('v')})`}
          onClick={commentMode ? onCommentMode : undefined}
        >
          <IconSelect />
        </button>
        <button
          type="button"
          class={`cortex-toolbar__mode${commentMode ? ' cortex-toolbar__mode--active' : ''}`}
          role="radio"
          aria-checked={commentMode ? 'true' : 'false'}
          data-tooltip={`Comment (${formatShortcut('c')})`}
          onClick={!commentMode ? onCommentMode : undefined}
        >
          <IconComment />
        </button>
      </div>

      <div class="cortex-toolbar__divider" />

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
