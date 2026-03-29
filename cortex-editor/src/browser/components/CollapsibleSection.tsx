import type { JSX, ComponentChildren } from 'preact'

export interface CollapsibleSectionProps {
  sectionId: string
  label: string
  summary?: string
  hasValue: boolean
  onAdd?: () => void
  onRemove?: () => void
  canAddMore?: boolean
  children: ComponentChildren
}

export function CollapsibleSection({
  sectionId,
  label,
  summary,
  hasValue,
  onAdd,
  onRemove,
  canAddMore,
  children,
}: CollapsibleSectionProps): JSX.Element {
  const showAdd = onAdd && (!hasValue || canAddMore)
  const showRemove = hasValue && onRemove && !canAddMore

  return (
    <div class="cortex-collapsible" data-section-id={sectionId} data-has-value={String(hasValue)}>
      <div class="cortex-collapsible__header">
        <span class="cortex-collapsible__label">{label}</span>
        {!hasValue && summary && (
          <span class="cortex-collapsible__summary">{summary}</span>
        )}
        {showAdd && (
          <button
            class="cortex-collapsible__btn"
            type="button"
            data-tooltip={`Add ${label.toLowerCase()}`}
            onClick={onAdd}
          >
            +
          </button>
        )}
        {showRemove && (
          <button
            class="cortex-collapsible__btn cortex-collapsible__btn--remove"
            type="button"
            data-tooltip={`Remove ${label.toLowerCase()}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <div class="cortex-collapsible__body">
        <div class="cortex-collapsible__body-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
