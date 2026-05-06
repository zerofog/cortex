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
  return <svg {...svgProps}><circle cx="6" cy="4" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="4" r="1.5" fill="currentColor" stroke="none" /><circle cx="6" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>
}

function IconClose(): JSX.Element {
  return <svg {...svgProps}><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
}

function IconComment(): JSX.Element {
  // Rounded speech bubble with bottom-left tail
  return <svg {...svgProps}><path d="M3 10V4A1.5 1.5 0 014.5 2.5h7A1.5 1.5 0 0113 4v4.5a1.5 1.5 0 01-1.5 1.5H7l-4 3.5z" /></svg>
}

function IconSelect(): JSX.Element {
  // Cursor pointer — kite shape
  return <svg {...svgProps}><path d="M3 2.5L7 14L9.5 9.5L14 7z" /></svg>
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
        <IconGrip />
      </div>

      {activityCount > 0 && (
        <button
          type="button"
          class="cortex-toolbar__badge"
          onClick={onActivityToggle}
          aria-label={`${activityCount} ${activityCount === 1 ? 'change' : 'changes'}`}
          data-tooltip={`${activityCount} ${activityCount === 1 ? 'change' : 'changes'}`}
          data-tooltip-placement={tooltipPlacement}
        >
          {activityCount}
        </button>
      )}

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
          <IconSelect />
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
          <IconComment />
        </button>
      </div>

      <div class="cortex-toolbar__divider" />

      <button
        type="button"
        class="cortex-toolbar__btn cortex-toolbar__btn--close"
        data-action="close"
        onClick={onClose}
        aria-label="Close Cortex"
        data-tooltip="Close Cortex"
        data-tooltip-placement={tooltipPlacement}
      >
        <IconClose />
      </button>
    </div>
  )
}
