import type { JSX, ComponentChildren } from 'preact'

interface SectionGroupProps {
  label: string
  groupId: string
  children: ComponentChildren
  /**
   * Optional right-aligned slot inside the header. Tasks 5-16 use this for
   * per-section toggles (e.g. Typography's `T` affordance in Task 12, the
   * Position lock badge in Task 5). Intentionally additive: every existing
   * caller in Panel.tsx passes only `label` + `groupId` + `children`, so
   * omitting this prop must render the exact same DOM as before.
   */
  headerAction?: ComponentChildren
}

export function SectionGroup({ label, groupId, children, headerAction }: SectionGroupProps): JSX.Element {
  const titleId = `cortex-section-title-${groupId}`
  return (
    <div class="cortex-section-group" data-group={groupId} role="group" aria-labelledby={titleId}>
      <div class="cortex-section-group__header">
        <span id={titleId} class="cortex-section-group__title">{label}</span>
        {headerAction && (
          <div class="cortex-section-group__header-action">{headerAction}</div>
        )}
      </div>
      <div class="cortex-section-group__content">
        {children}
      </div>
    </div>
  )
}
