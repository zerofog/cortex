import type { JSX, ComponentChildren } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { cortexSessionStorage } from '../persistence.js'

function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean' }

export interface CollapsibleSectionProps {
  sectionId: string
  label: string
  summary?: string
  headerAction?: ComponentChildren
  defaultExpanded?: boolean
  children: ComponentChildren
}

export function CollapsibleSection({
  sectionId,
  label,
  summary,
  headerAction,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps): JSX.Element {
  const [expanded, setExpanded] = useState(
    () => cortexSessionStorage.get(`collapsed:${sectionId}`, defaultExpanded, isBoolean),
  )

  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev
      cortexSessionStorage.set(`collapsed:${sectionId}`, next)
      return next
    })
  }, [sectionId])

  return (
    <div class="cortex-collapsible" data-expanded={String(expanded)}>
      <div class="cortex-collapsible__header">
        <button
          class="cortex-collapsible__toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={`collapsible-${sectionId}`}
          onClick={toggle}
        >
          <svg class="cortex-collapsible__chevron" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2l4 3-4 3" />
          </svg>
          <span class="cortex-collapsible__label">{label}</span>
          {!expanded && summary && (
            <span class="cortex-collapsible__summary">{summary}</span>
          )}
        </button>
        {headerAction && (
          <span class="cortex-collapsible__action">
            {headerAction}
          </span>
        )}
      </div>
      <div class="cortex-collapsible__body" id={`collapsible-${sectionId}`}>
        <div class="cortex-collapsible__body-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
