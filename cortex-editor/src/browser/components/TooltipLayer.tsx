import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom'

const TOOLTIP_ID = 'cortex-tooltip'
const DEFAULT_DELAY_MS = 200
const TOOLTIP_OFFSET_PX = 6
const DEFAULT_PLACEMENT: Placement = 'top'
const VALID_PLACEMENTS: readonly Placement[] = [
  'top',
  'top-start',
  'top-end',
  'right',
  'right-start',
  'right-end',
  'bottom',
  'bottom-start',
  'bottom-end',
  'left',
  'left-start',
  'left-end',
]

interface ActiveTooltip {
  readonly anchor: HTMLElement
  readonly describedElement: HTMLElement
  readonly text: string
  readonly placement: Placement
  readonly trigger: 'focus' | 'pointer'
}

export interface TooltipLayerProps {
  readonly shadowRoot: ShadowRoot
  readonly delayMs?: number
}

function isElement(value: EventTarget | Node | null): value is Element {
  return value instanceof Element
}

function isDisabledTooltipTarget(target: HTMLElement): boolean {
  if (target.getAttribute('aria-disabled') === 'true') return true
  return 'disabled' in target && Boolean((target as HTMLButtonElement | HTMLInputElement).disabled)
}

function resolveTooltipTarget(target: EventTarget | null): HTMLElement | null {
  let element: Element | null = isElement(target)
    ? target
    : target instanceof Node && isElement(target.parentElement)
      ? target.parentElement
      : null

  while (element) {
    if (element instanceof HTMLElement && element.hasAttribute('data-tooltip')) {
      const text = element.dataset['tooltip']?.trim()
      if (text && !isDisabledTooltipTarget(element)) return element
    }
    element = element.parentElement
  }

  return null
}

function isPlacement(value: string | undefined): value is Placement {
  return value !== undefined && (VALID_PLACEMENTS as readonly string[]).includes(value)
}

function readPlacement(anchor: HTMLElement): Placement {
  const placement = anchor.dataset['tooltipPlacement']
  return isPlacement(placement) ? placement : DEFAULT_PLACEMENT
}

function removeDescribedByToken(anchor: HTMLElement): void {
  const current = anchor.getAttribute('aria-describedby')
  if (!current) return
  const next = current.split(/\s+/).filter(token => token && token !== TOOLTIP_ID)
  if (next.length > 0) anchor.setAttribute('aria-describedby', next.join(' '))
  else anchor.removeAttribute('aria-describedby')
}

function getFallbackPosition(anchor: HTMLElement, floating: HTMLElement, placement: Placement): { left: number, top: number } {
  const rect = anchor.getBoundingClientRect()
  const floatingWidth = floating.offsetWidth
  const floatingHeight = floating.offsetHeight
  const [side, alignment] = placement.split('-') as [string, string | undefined]

  let left: number
  let top: number

  if (side === 'top' || side === 'bottom') {
    if (alignment === 'start') left = rect.left
    else if (alignment === 'end') left = rect.right - floatingWidth
    else left = rect.left + (rect.width - floatingWidth) / 2

    top = side === 'bottom'
      ? rect.bottom + TOOLTIP_OFFSET_PX
      : rect.top - floatingHeight - TOOLTIP_OFFSET_PX
  } else {
    left = side === 'right'
      ? rect.right + TOOLTIP_OFFSET_PX
      : rect.left - floatingWidth - TOOLTIP_OFFSET_PX

    if (alignment === 'start') top = rect.top
    else if (alignment === 'end') top = rect.bottom - floatingHeight
    else top = rect.top + (rect.height - floatingHeight) / 2
  }

  return { left, top }
}

export function TooltipLayer({ shadowRoot, delayMs = DEFAULT_DELAY_MS }: TooltipLayerProps): JSX.Element | null {
  const [tooltip, setTooltip] = useState<ActiveTooltip | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAnchorRef = useRef<HTMLElement | null>(null)
  const activeTriggerRef = useRef<ActiveTooltip['trigger'] | null>(null)

  useEffect(() => {
    activeAnchorRef.current = tooltip?.anchor ?? null
    activeTriggerRef.current = tooltip?.trigger ?? null
  }, [tooltip])

  useEffect(() => {
    if (!tooltip) return
    const describedElement = tooltip.describedElement
    const current = describedElement.getAttribute('aria-describedby')
    const tokens = current?.split(/\s+/).filter(Boolean) ?? []
    if (!tokens.includes(TOOLTIP_ID)) {
      describedElement.setAttribute('aria-describedby', [...tokens, TOOLTIP_ID].join(' '))
    }
    return () => removeDescribedByToken(describedElement)
  }, [tooltip])

  useEffect(() => {
    if (!tooltip) return
    const floating = tooltipRef.current
    if (!floating) return

    let cancelled = false
    const update = () => {
      computePosition(tooltip.anchor, floating, {
        strategy: 'fixed',
        placement: tooltip.placement,
        middleware: [offset(TOOLTIP_OFFSET_PX), flip(), shift({ padding: TOOLTIP_OFFSET_PX })],
      }).then(({ x, y }) => {
        if (cancelled) return
        floating.style.left = `${x}px`
        floating.style.top = `${y}px`
      }).catch((err) => {
        if (cancelled) return
        console.warn('[cortex] Tooltip positioning failed:', err instanceof Error ? err.message : err)
        const { left, top } = getFallbackPosition(tooltip.anchor, floating, tooltip.placement)
        floating.style.left = `${left}px`
        floating.style.top = `${top}px`
      })
    }

    const cleanupAutoUpdate = autoUpdate(tooltip.anchor, floating, update)
    return () => {
      cancelled = true
      try {
        cleanupAutoUpdate()
      } catch (err) {
        console.warn('[cortex] Tooltip autoUpdate cleanup failed:', err instanceof Error ? err.message : err)
      }
    }
  }, [tooltip])

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
    }

    const hide = () => {
      clearShowTimer()
      setTooltip(null)
    }

    const scheduleShow = (
      anchor: HTMLElement,
      describedElement: HTMLElement,
      trigger: ActiveTooltip['trigger'],
    ) => {
      const text = anchor.dataset['tooltip']?.trim()
      if (!text) {
        hide()
        return
      }
      if (activeAnchorRef.current === anchor) {
        clearShowTimer()
        setTooltip(current => current && current.anchor === anchor
          ? { anchor, describedElement, text, placement: readPlacement(anchor), trigger }
          : current)
        return
      }
      clearShowTimer()
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null
        setTooltip({ anchor, describedElement, text, placement: readPlacement(anchor), trigger })
      }, delayMs)
    }

    const handlePointerOver = (event: Event) => {
      const anchor = resolveTooltipTarget(event.target)
      if (!anchor || !shadowRoot.contains(anchor)) {
        if (activeTriggerRef.current === 'pointer') hide()
        return
      }
      scheduleShow(anchor, anchor, 'pointer')
    }

    const handlePointerOut = (event: Event) => {
      if (activeTriggerRef.current === 'focus') return
      const anchor = activeAnchorRef.current ?? resolveTooltipTarget(event.target)
      if (!anchor) {
        hide()
        return
      }
      const relatedTarget = (event as PointerEvent).relatedTarget
      if (isElement(relatedTarget) && anchor.contains(relatedTarget)) return
      hide()
    }

    const handleFocusIn = (event: Event) => {
      const anchor = resolveTooltipTarget(event.target)
      if (!anchor || !shadowRoot.contains(anchor)) return
      const describedElement = event.target instanceof HTMLElement ? event.target : anchor
      scheduleShow(anchor, describedElement, 'focus')
    }

    const handleFocusOut = () => hide()
    const handlePointerDown = () => hide()

    shadowRoot.addEventListener('pointerover', handlePointerOver)
    shadowRoot.addEventListener('pointerout', handlePointerOut)
    shadowRoot.addEventListener('focusin', handleFocusIn)
    shadowRoot.addEventListener('focusout', handleFocusOut)
    shadowRoot.addEventListener('pointerdown', handlePointerDown, { capture: true })

    return () => {
      clearShowTimer()
      shadowRoot.removeEventListener('pointerover', handlePointerOver)
      shadowRoot.removeEventListener('pointerout', handlePointerOut)
      shadowRoot.removeEventListener('focusin', handleFocusIn)
      shadowRoot.removeEventListener('focusout', handleFocusOut)
      shadowRoot.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [delayMs, shadowRoot])

  if (!tooltip) return null

  return (
    <div
      ref={tooltipRef}
      id={TOOLTIP_ID}
      class="cortex-tooltip"
      role="tooltip"
      style={{ position: 'fixed' }}
    >
      {tooltip.text}
    </div>
  )
}
