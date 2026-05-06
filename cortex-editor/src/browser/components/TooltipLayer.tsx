import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom'

const TOOLTIP_ID = 'cortex-tooltip'
const DEFAULT_DELAY_MS = 200
const DEFAULT_PLACEMENT: Placement = 'top'

interface ActiveTooltip {
  readonly anchor: HTMLElement
  readonly describedElement: HTMLElement
  readonly text: string
  readonly placement: Placement
}

export interface TooltipLayerProps {
  readonly shadowRoot: ShadowRoot
  readonly delayMs?: number
}

function isElement(value: EventTarget | Node | null): value is Element {
  return value instanceof Element
}

function resolveTooltipTarget(target: EventTarget | null): HTMLElement | null {
  const element = isElement(target)
    ? target
    : target instanceof Node && isElement(target.parentElement)
      ? target.parentElement
      : null
  const tooltipTarget = element?.closest('[data-tooltip]')
  if (!(tooltipTarget instanceof HTMLElement)) return null

  const text = tooltipTarget.dataset['tooltip']?.trim()
  if (!text) return null
  if (tooltipTarget.getAttribute('aria-disabled') === 'true') return null
  if ('disabled' in tooltipTarget && Boolean((tooltipTarget as HTMLButtonElement | HTMLInputElement).disabled)) return null
  return tooltipTarget
}

function readPlacement(anchor: HTMLElement): Placement {
  const placement = anchor.dataset['tooltipPlacement']
  return placement ? placement as Placement : DEFAULT_PLACEMENT
}

function removeDescribedByToken(anchor: HTMLElement): void {
  const current = anchor.getAttribute('aria-describedby')
  if (!current) return
  const next = current.split(/\s+/).filter(token => token && token !== TOOLTIP_ID)
  if (next.length > 0) anchor.setAttribute('aria-describedby', next.join(' '))
  else anchor.removeAttribute('aria-describedby')
}

export function TooltipLayer({ shadowRoot, delayMs = DEFAULT_DELAY_MS }: TooltipLayerProps): JSX.Element | null {
  const [tooltip, setTooltip] = useState<ActiveTooltip | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAnchorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    activeAnchorRef.current = tooltip?.anchor ?? null
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
        middleware: [offset(6), flip(), shift({ padding: 6 })],
      }).then(({ x, y }) => {
        if (cancelled) return
        floating.style.left = `${x}px`
        floating.style.top = `${y}px`
      }).catch((err) => {
        if (cancelled) return
        console.warn('[cortex] Tooltip positioning failed:', err instanceof Error ? err.message : err)
        const rect = tooltip.anchor.getBoundingClientRect()
        const startAligned = tooltip.placement.endsWith('-start')
        const below = tooltip.placement.startsWith('bottom')
        floating.style.left = `${startAligned ? rect.left : rect.left + rect.width / 2}px`
        floating.style.top = `${below ? rect.bottom + 6 : rect.top - floating.offsetHeight - 6}px`
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

    const scheduleShow = (anchor: HTMLElement, describedElement = anchor) => {
      const text = anchor.dataset['tooltip']?.trim()
      if (!text) {
        hide()
        return
      }
      if (activeAnchorRef.current === anchor) return
      clearShowTimer()
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null
        setTooltip({ anchor, describedElement, text, placement: readPlacement(anchor) })
      }, delayMs)
    }

    const handlePointerOver = (event: Event) => {
      const anchor = resolveTooltipTarget(event.target)
      if (!anchor || !shadowRoot.contains(anchor)) {
        hide()
        return
      }
      scheduleShow(anchor)
    }

    const handlePointerOut = (event: Event) => {
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
      scheduleShow(anchor, describedElement)
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
