/**
 * ExpandableOptions — Panel v2 Task 8 (ZF0-1186)
 *
 * Collapse/expand container for secondary controls inside a section
 * (e.g. flex wrap, Min/Max sizing extras). The body is always in the
 * DOM — visibility is controlled by `grid-template-rows: 0fr → 1fr`
 * with a 150ms ease-out transition per DESIGN.md motion rules.
 *
 * Contract:
 *   - Content rendered lazily? No — always mounted. Lets focused
 *     inputs survive collapse/expand without remount jitter.
 *   - Animation compositor-only: `grid-template-rows` is a grid track
 *     change that animates via interpolation (CSS Grid Level 2).
 *     No `height` transitions. Skipped entirely when
 *     `prefers-reduced-motion: reduce` is set.
 *   - Accessibility: trigger is `aria-expanded`, body has
 *     `aria-hidden` flipped synchronously with the open state.
 *     Body is `inert` when collapsed so keyboard focus skips past
 *     the hidden controls.
 *   - Controlled: parent owns `open` state via `defaultOpen` +
 *     uncontrolled internal state for now — all Task 8 usage is
 *     local to FlexControls with no cross-component coordination.
 *     If Task 10 needs external control it can be added as a
 *     `open` prop without a breaking change.
 */
import type { ComponentChildren, JSX } from 'preact'
import { useId, useState, useCallback } from 'preact/hooks'
import { ChevronRight } from '../icons.js'

export interface ExpandableOptionsProps {
  /** Trigger label text — usually "More options". */
  label: string
  /**
   * Initial open state. Uncontrolled — the component owns the flag
   * afterwards. Defaults to `false` (collapsed). Pass `true` to
   * remount in the expanded state (e.g. to preserve state across
   * a tab switch where the parent restored the open flag).
   */
  defaultOpen?: boolean
  /** Body content — typically one or two form controls. */
  children: ComponentChildren
}

export function ExpandableOptions({
  label,
  defaultOpen = false,
  children,
}: ExpandableOptionsProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const bodyId = useId()

  const handleToggle = useCallback(() => {
    setIsOpen((v) => !v)
  }, [])

  return (
    <div
      class={[
        'cortex-expandable-options',
        isOpen && 'cortex-expandable-options--open',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={isOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        class="cortex-expandable-options__trigger"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-controls={bodyId}
        onClick={handleToggle}
      >
        <span
          class={[
            'cortex-expandable-options__chevron',
            isOpen && 'cortex-expandable-options__chevron--open',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          <ChevronRight size={12} />
        </span>
        <span class="cortex-expandable-options__label">{label}</span>
      </button>
      <div
        id={bodyId}
        class="cortex-expandable-options__body"
        aria-hidden={isOpen ? 'false' : 'true'}
        // Matches CollapsibleSection's `inert` pattern — Preact flips
        // the attribute on/off via the `|| undefined` idiom so it's
        // present only when truthy. happy-dom doesn't enforce inert,
        // but real browsers skip focus when present.
        inert={!isOpen || undefined}
      >
        <div class="cortex-expandable-options__inner">{children}</div>
      </div>
    </div>
  )
}
