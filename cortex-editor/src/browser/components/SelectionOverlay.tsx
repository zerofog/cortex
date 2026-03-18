import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { getSelectionLabel } from '../label.js'
import type { StateDeclarations } from '../state-detector.js'

type InteractionState = 'default' | 'hover' | 'focus' | 'active'

export interface SelectionOverlayProps {
  element: HTMLElement | null
  availableStates?: StateDeclarations
  activeState?: InteractionState
  onStateChange?: (state: InteractionState) => void
}

/**
 * Persistent selection outline with transition. Uses RAF to track position
 * continuously (element may move from scroll/resize while selected).
 */
export function SelectionOverlay({ element, availableStates, activeState, onStateChange }: SelectionOverlayProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  // RAF-based continuous position tracking for the selected element
  useEffect(() => {
    if (!element || !overlayRef.current) return

    let rafId = 0
    // Cache previous rect to skip redundant DOM writes
    let prevTop = ''
    let prevLeft = ''
    let prevWidth = ''
    let prevHeight = ''

    // Layout shift tracking — document-relative coordinates
    let stableDocTop: number | null = null // baseline for total shift threshold
    let stableDocLeft: number | null = null
    let prevDocTop: number | null = null // previous frame for movement detection
    let prevDocLeft: number | null = null
    let lastChangeTime = 0
    let scrollCooldownUntil = 0
    const STABLE_THRESHOLD_MS = 400
    const SHIFT_THRESHOLD_PX = 50
    const SCROLL_COOLDOWN_MS = 1000

    function update(): void {
      if (!element || !overlayRef.current) return
      // Stop RAF loop when element is detached from DOM (e.g. HMR, navigation)
      if (!element.isConnected) return
      const r = element.getBoundingClientRect()
      const top = `${r.top}px`
      const left = `${r.left}px`
      const width = `${r.width}px`
      const height = `${r.height}px`

      // Only write to DOM when values changed
      const el = overlayRef.current
      if (top !== prevTop) { el.style.top = top; prevTop = top }
      if (left !== prevLeft) { el.style.left = left; prevLeft = left }
      if (width !== prevWidth) { el.style.width = width; prevWidth = width }
      if (height !== prevHeight) { el.style.height = height; prevHeight = height }

      // Shift detection uses document-relative coordinates
      const docTop = r.top + window.scrollY
      const docLeft = r.left + window.scrollX

      // Initialize on first read — no shift detection until second frame
      if (stableDocTop === null) {
        stableDocTop = docTop
        stableDocLeft = docLeft
        prevDocTop = docTop
        prevDocLeft = docLeft
        rafId = requestAnimationFrame(update)
        return
      }

      // During scroll cooldown: keep baseline current but skip shift detection
      if (performance.now() < scrollCooldownUntil) {
        stableDocTop = docTop
        stableDocLeft = docLeft
        prevDocTop = docTop
        prevDocLeft = docLeft
        rafId = requestAnimationFrame(update)
        return
      }

      // Detect frame-to-frame movement (> 2px jitter filter)
      const dTop = docTop - (prevDocTop as number)
      const dLeft = docLeft - (prevDocLeft as number)
      const shifted = Math.abs(dTop) > 2 || Math.abs(dLeft) > 2

      if (shifted) {
        lastChangeTime = performance.now()
      }
      prevDocTop = docTop
      prevDocLeft = docLeft

      // After position stabilizes for STABLE_THRESHOLD_MS, check total shift from baseline
      const timeSinceChange = performance.now() - lastChangeTime
      if (timeSinceChange > STABLE_THRESHOLD_MS && lastChangeTime > 0) {
        const totalShift = Math.hypot(
          docTop - (stableDocTop as number),
          docLeft - (stableDocLeft as number),
        )
        if (totalShift > SHIFT_THRESHOLD_PX) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          scrollCooldownUntil = performance.now() + SCROLL_COOLDOWN_MS
        }
        stableDocTop = docTop
        stableDocLeft = docLeft
        lastChangeTime = 0 // reset — don't re-trigger
      }

      rafId = requestAnimationFrame(update)
    }

    update()
    return () => cancelAnimationFrame(rafId)
  }, [element])

  if (!element) return null

  const label = getSelectionLabel(element)
  const r = element.getBoundingClientRect()
  const cs = getComputedStyle(element)

  // Determine if the state lens should be shown
  const showLens = !!(availableStates && (
    availableStates.hover.size > 0 ||
    availableStates.focus.size > 0 ||
    availableStates.active.size > 0
  ))

  // Positioning threshold depends on whether the lens is shown
  // With lens: need ~54px above (24px lens + 4px gap + 20px label + 6px gap)
  // Without lens: original 30px threshold for the label alone
  const labelAbove = showLens ? r.top > 54 : r.top > 30

  // Build the list of available state buttons
  const stateButtons: Array<{ label: string; state: InteractionState }> = []
  if (showLens) {
    stateButtons.push({ label: 'Default', state: 'default' })
    if (availableStates!.hover.size > 0) stateButtons.push({ label: ':hover', state: 'hover' })
    if (availableStates!.focus.size > 0) stateButtons.push({ label: ':focus', state: 'focus' })
    if (availableStates!.active.size > 0) stateButtons.push({ label: ':active', state: 'active' })
  }

  // Lens positioning: above element by default, below when flipped
  // Center horizontally relative to element, clamp to viewport edges
  const lensAbove = labelAbove // lens above when there's room, below when flipped
  const elementCenterX = r.left + r.width / 2
  const viewportWidth = window.innerWidth

  // Estimate lens width (rough: ~60px per button + padding)
  const estimatedLensWidth = stateButtons.length * 60 + 16
  let lensLeft = elementCenterX - estimatedLensWidth / 2
  // Clamp to viewport edges
  if (lensLeft < 4) lensLeft = 4
  if (lensLeft + estimatedLensWidth > viewportWidth - 4) {
    lensLeft = viewportWidth - 4 - estimatedLensWidth
  }

  const lensTop = lensAbove
    ? r.top - 28 // above element (24px height + 4px gap)
    : r.top + r.height + 4 // below element

  return (
    <div
      ref={overlayRef}
      class="cortex-selection-overlay"
      style={{
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        borderRadius: cs.borderRadius || '0px',
      }}
    >
      <span class={`cortex-label ${labelAbove ? 'cortex-label--above' : 'cortex-label--below'}`}>
        {label}
      </span>
      {showLens && (
        <div
          class="cortex-state-lens"
          style={{
            position: 'fixed',
            top: `${lensTop}px`,
            left: `${lensLeft}px`,
          }}
        >
          {stateButtons.map(({ label: btnLabel, state }) => (
            <button
              key={state}
              class={`cortex-state-lens__btn${activeState === state ? ' cortex-state-lens__btn--active' : ''}`}
              onClick={() => onStateChange?.(state)}
            >
              {btnLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
