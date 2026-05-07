import type { JSX } from 'preact'
import { useState, useLayoutEffect, useRef } from 'preact/hooks'
import { X } from './icons.js'

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

  // Track previous counts to detect strict increases (edge-trigger).
  // Reset dismissal ONLY when a count strictly increases — this reopens the
  // banner so the user sees a new divergence event. Decreases (e.g. 2→1 when
  // a staged intent is removed) must NOT reset dismissed state, otherwise a
  // dismissed banner reappears during recovery. (ZF0-1474 Item #5)
  const prevIntentRef = useRef(intentDriftCount)
  const prevStaleRef = useRef(staleOverrideCount)

  // useLayoutEffect fires synchronously after DOM mutations, before the browser
  // paints. This guarantees that prevIntentRef/prevStaleRef are updated before
  // any external observer (e.g. Playwright) can read `visible: true` from the
  // painted DOM. If useEffect were used instead, there is a window between
  // "banner renders visible" (paint) and "effect runs" (next microtask) where
  // a test could dismiss the banner before prevIntentRef is updated — causing
  // the effect to fire later with stale prevIntentRef.current and incorrectly
  // call setDismissed(false), re-showing a banner the user just dismissed.
  useLayoutEffect(() => {
    if (intentDriftCount > prevIntentRef.current || staleOverrideCount > prevStaleRef.current) {
      setDismissed(false)
    }
    prevIntentRef.current = intentDriftCount
    prevStaleRef.current = staleOverrideCount
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
          <div class="cortex-drift-banner__row" data-row="intent" data-count={intentDriftCount}>
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
          <div
            class={`cortex-drift-banner__row${hasIntent ? ' cortex-drift-banner__row--bordered' : ''}`}
            data-row="stale"
            data-count={staleOverrideCount}
          >
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
        <X size={14} />
      </button>
    </div>
  )
}
