import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { TextComponent } from '../../../core/text-components.js'

export interface TextComponentPickerProps {
  components: readonly TextComponent[]
  /** Bundle name currently applied to the selected element, or null if unlinked. */
  currentName: string | null
  /** Fired when a bundle option is clicked. The picker does NOT self-dismiss;
   *  the caller decides whether to keep the picker open (e.g. for preview) or
   *  close it after a pick. */
  onPick: (component: TextComponent) => void
  /** Fired on outside click or Escape key — the caller is responsible for
   *  unmounting the picker. */
  onDismiss: () => void
}

/**
 * Popover listing text-component bundles. Renders as a listbox with one
 * button per bundle. Shows the bundle name + a metadata glyph (size/weight)
 * so users can distinguish bundles without opening a preview.
 *
 * Empty-state: when `components` is empty the popover still mounts and
 * shows a helpful message — important because the caller guarantees the
 * user only opens it when they already have linked typography, but
 * racing hello/theme reloads could leave components momentarily empty.
 */
export function TextComponentPicker({
  components,
  currentName,
  onPick,
  onDismiss,
}: TextComponentPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onDismiss])

  if (components.length === 0) {
    return (
      <div ref={ref} class="cortex-text-component-picker cortex-text-component-picker--empty">
        <span>No text components defined in @theme</span>
      </div>
    )
  }

  return (
    <div ref={ref} class="cortex-text-component-picker" role="listbox">
      {components.map((c) => (
        <button
          key={c.name}
          type="button"
          role="option"
          aria-selected={c.name === currentName}
          class={`cortex-text-component-picker__option${c.name === currentName ? ' cortex-text-component-picker__option--active' : ''}`}
          onClick={() => onPick(c)}
        >
          <span class="cortex-text-component-picker__name">{c.name}</span>
          <span class="cortex-text-component-picker__meta">
            {c.fontSize} / {c.fontWeight}
          </span>
        </button>
      ))}
    </div>
  )
}
