import type { JSX, ComponentChildren } from 'preact'

interface SectionGroupProps {
  label: string
  groupId: string
  children: ComponentChildren
}

export function SectionGroup({ label, groupId, children }: SectionGroupProps): JSX.Element {
  return (
    <div class="cortex-section-group" data-group={groupId}>
      <div class="cortex-section-group__header">
        <span class="cortex-section-group__title">{label}</span>
      </div>
      <div class="cortex-section-group__content">
        {children}
      </div>
    </div>
  )
}
