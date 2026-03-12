export interface SelectionHandle {
  /** Remove all event listeners */
  cleanup: () => void
  /** Toggle design mode on/off (disables event interception when off) */
  setDesignMode: (enabled: boolean) => void
}

/**
 * Initialize capture-phase event interception for element selection.
 *
 * Events from within Cortex's own Shadow DOM (detected via composedPath)
 * are passed through so panel interactions work normally.
 */
export function initSelection(
  _shadowRoot: ShadowRoot,
  onHover: (el: HTMLElement | null) => void,
  onSelect: (el: HTMLElement | null) => void,
): SelectionHandle {
  let designMode = true

  function isOwnUI(event: Event): boolean {
    const path = event.composedPath()
    return path.some(
      el => el instanceof HTMLElement && el.hasAttribute('data-cortex-host'),
    )
  }

  function getTargetElement(event: MouseEvent): HTMLElement | null {
    const el = document.elementFromPoint(event.clientX, event.clientY)
    if (!el || !(el instanceof HTMLElement)) return null
    if (el.hasAttribute('data-cortex-host') || el.hasAttribute('data-cortex-root')) return null
    return el
  }

  // Sentinel value distinct from null — ensures first null dispatch is not deduped
  let lastHovered: HTMLElement | null | undefined = undefined

  function handleMouseMove(event: MouseEvent): void {
    if (!designMode) return
    if (isOwnUI(event)) return
    const el = getTargetElement(event)
    if (el === lastHovered) return
    lastHovered = el
    onHover(el)
  }

  function handleClick(event: MouseEvent): void {
    if (!designMode) return
    if (isOwnUI(event)) return
    event.preventDefault()
    event.stopPropagation()
    const el = getTargetElement(event)
    onSelect(el)
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!designMode) return
    if (event.key === 'Escape') {
      onSelect(null)
    }
  }

  window.addEventListener('mousemove', handleMouseMove, { capture: true })
  window.addEventListener('click', handleClick, { capture: true })
  window.addEventListener('keydown', handleKeyDown, { capture: true })

  return {
    cleanup() {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true })
      window.removeEventListener('click', handleClick, { capture: true })
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    },
    setDesignMode(enabled: boolean) {
      designMode = enabled
    },
  }
}
