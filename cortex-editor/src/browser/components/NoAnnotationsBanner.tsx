import type { JSX } from 'preact'
import { useState } from 'preact/hooks'

const SETUP_DOCS_URL = 'https://github.com/zerofog/cortex#setup'

export function NoAnnotationsBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)

  const annotationCount = document.querySelectorAll('[data-cortex-source]').length

  if (annotationCount > 0 || dismissed) return null

  return (
    <div
      data-banner-id="no-annotations"
      class="cortex-no-annotations-banner"
      role="status"
      aria-live="polite"
    >
      <div class="cortex-no-annotations-banner__body">
        <span class="cortex-no-annotations-banner__title">
          No editable elements detected
        </span>
        <span class="cortex-no-annotations-banner__desc">
          Cortex needs the Vite plugin to add source annotations to your components.{' '}
          <a
            href={SETUP_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="cortex-no-annotations-banner__link"
          >
            Setup guide
          </a>
        </span>
      </div>
      <button
        type="button"
        class="cortex-no-annotations-banner__dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
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
