import { isNonEditable } from './classify-non-editable.js'

export interface SelectionHandle {
  /** Remove all event listeners */
  cleanup: () => void
  /** Toggle design mode on/off (disables event interception when off) */
  setDesignMode: (enabled: boolean) => void
  /** Toggle click interception — when false, clicks pass through to host app (canvas mode) */
  setInterceptClicks: (enabled: boolean) => void
}

/** Check if an event originated from inside Cortex's own Shadow DOM. */
export function isOwnUI(event: Event): boolean {
  const path = event.composedPath()
  return path.some(
    el => el instanceof HTMLElement && el.hasAttribute('data-cortex-host'),
  )
}

/**
 * Initialize capture-phase event interception for element selection.
 *
 * Events from within Cortex's own Shadow DOM (detected via composedPath)
 * are passed through so panel interactions work normally.
 *
 * The `onSelect` callback receives an array of elements and a selection action:
 * - No modifier key → `([el], 'replace')` — replaces current selection
 * - Shift key        → `([el], 'add')` — adds element to selection
 * - Meta/Ctrl key    → `([el], 'toggle')` — toggles element in selection
 * - Click on backdrop / null target → `([], 'replace')` — clears selection
 */
export function initSelection(
  _shadowRoot: ShadowRoot,
  onHover: (el: HTMLElement | null) => void,
  onSelect: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void,
): SelectionHandle {
  let designMode = true
  let interceptClicks = true

  function getTargetElement(event: MouseEvent): HTMLElement | null {
    const el = document.elementFromPoint(event.clientX, event.clientY)
    if (!el || !(el instanceof HTMLElement)) return null
    if (el.hasAttribute('data-cortex-host') || el.hasAttribute('data-cortex-root')) return null
    if (el === document.documentElement || el === document.body) return null
    if (isNonEditable(el)) return null
    return el
  }

  // Sentinel value distinct from null — ensures first null dispatch is not deduped
  let lastHovered: HTMLElement | null | undefined = undefined

  function updateHover(el: HTMLElement | null): void {
    if (el === lastHovered) return
    lastHovered = el
    onHover(el)
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!designMode) return
    if (isOwnUI(event)) {
      // Mouse is over Cortex UI — clear hover to prevent distracting overlay
      if (lastHovered !== null) {
        lastHovered = null
        onHover(null)
      }
      return
    }
    updateHover(getTargetElement(event))
  }

  function handleScroll(): void {
    if (!designMode) return
    // Clear hover on scroll — the element the user was hovering moved away.
    // Next mousemove will pick up whatever is under the cursor.
    if (lastHovered != null) {
      lastHovered = null
      onHover(null)
    }
  }

  function handleClick(event: MouseEvent): void {
    if (!designMode) return
    if (isOwnUI(event)) return
    if (!interceptClicks) return
    event.preventDefault()
    event.stopPropagation()
    const el = getTargetElement(event)
    if (!el) {
      // Backdrop / null target — clear selection
      onSelect([], 'replace')
      return
    }
    // Translate modifier keys to selection action
    let action: 'replace' | 'add' | 'toggle'
    if (event.shiftKey) {
      action = 'add'
    } else if (event.metaKey || event.ctrlKey) {
      action = 'toggle'
    } else {
      action = 'replace'
    }
    onSelect([el], action)
  }

  window.addEventListener('mousemove', handleMouseMove, { capture: true })
  window.addEventListener('click', handleClick, { capture: true })
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true })

  return {
    cleanup() {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true })
      window.removeEventListener('click', handleClick, { capture: true })
      window.removeEventListener('scroll', handleScroll, { capture: true })
    },
    setDesignMode(enabled: boolean) {
      designMode = enabled
    },
    setInterceptClicks(enabled: boolean) {
      interceptClicks = enabled
    },
  }
}
