import type { JSX } from 'preact'
import { useState, useEffect } from 'preact/hooks'

export interface StagingDriftBannerProps {
  intentDriftCount: number    // 0 = trigger 1 hidden
  staleOverrideCount: number  // 0 = trigger 2 hidden
  onIntentRefresh: () => void // called when intent-trigger Refresh clicked
  onStaleRefresh: () => void  // called when stale-trigger Refresh clicked
  onDismiss: () => void       // called on X button
}

export function StagingDriftBanner({
  intentDriftCount,
  staleOverrideCount,
  onIntentRefresh,
  onStaleRefresh,
  onDismiss,
}: StagingDriftBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)

  // Reset dismissal whenever a new divergence event fires (count changes).
  // This reopens the banner so the user sees the new signal.
  useEffect(() => {
    setDismissed(false)
  }, [intentDriftCount, staleOverrideCount])

  const hasIntent = intentDriftCount > 0
  const hasStale = staleOverrideCount > 0

  if ((!hasIntent && !hasStale) || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss()
  }

  return (
    <div
      class="cortex-drift-banner"
      role="status"
      aria-live="polite"
    >
      <div class="cortex-drift-banner__body">
        {hasIntent && (
          <div class="cortex-drift-banner__row">
            <div class="cortex-drift-banner__copy">
              <span class="cortex-drift-banner__title">
                {intentDriftCount} staged edit(s) may be affected by external changes
              </span>
              <span class="cortex-drift-banner__desc">
                Source code in some files has changed since you staged these edits. Review what's different.
              </span>
            </div>
            <button
              type="button"
              class="cortex-drift-banner__btn"
              data-action="intent-refresh"
              aria-label="Refresh staged edits"
              onClick={onIntentRefresh}
            >
              Refresh
            </button>
          </div>
        )}
        {hasStale && (
          <div class={`cortex-drift-banner__row${hasIntent ? ' cortex-drift-banner__row--bordered' : ''}`}>
            <div class="cortex-drift-banner__copy">
              <span class="cortex-drift-banner__title">
                {staleOverrideCount} edit(s) saved but HMR didn't apply
              </span>
              <span class="cortex-drift-banner__desc">
                Try refreshing the page to see the actual file state.
              </span>
            </div>
            <button
              type="button"
              class="cortex-drift-banner__btn"
              data-action="stale-refresh"
              aria-label="Refresh page to see file state"
              onClick={onStaleRefresh}
            >
              Refresh
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        class="cortex-drift-banner__dismiss"
        data-action="dismiss"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        {/* Lucide X icon — 14×14 */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
          <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
        </svg>
      </button>
    </div>
  )
}
