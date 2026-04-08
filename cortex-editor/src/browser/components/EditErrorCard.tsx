import type { JSX } from 'preact'
import { useState } from 'preact/hooks'

export interface EditError {
  source: string
  property: string
  value: string
  reason: string
}

interface EditErrorCardProps {
  errors: Map<string, EditError>
  elementSource: string
  agentConnected: boolean
  onDismiss: (key: string) => void
  onAskAI: (error: EditError) => void
}

export function EditErrorCard({ errors, elementSource, agentConnected, onDismiss, onAskAI }: EditErrorCardProps): JSX.Element | null {
  const [askingAI, setAskingAI] = useState<string | null>(null)

  // Filter errors for the currently selected element
  const elementErrors = Array.from(errors.entries()).filter(
    ([, err]) => err.source === elementSource,
  )

  if (elementErrors.length === 0) return null

  return (
    <div class="cortex-error-cards">
      {elementErrors.map(([key, err]) => (
        <div key={key} class="cortex-error-card">
          <div class="cortex-error-card__header">
            <svg class="cortex-error-card__icon" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 1L11 10H1L6 1z" />
              <line x1="6" y1="4.5" x2="6" y2="6.5" />
              <circle cx="6" cy="8" r="0.5" fill="currentColor" />
            </svg>
            <span class="cortex-error-card__property">{err.property} edit failed</span>
          </div>
          <div class="cortex-error-card__reason">{err.reason}</div>
          <div class="cortex-error-card__actions">
            <button
              type="button"
              class="cortex-error-card__btn"
              data-action="dismiss"
              onClick={() => onDismiss(key)}
            >
              Dismiss
            </button>
            <button
              type="button"
              class="cortex-error-card__btn cortex-error-card__btn--primary"
              data-action="ask-ai"
              disabled={!agentConnected || askingAI === key}
              data-tooltip={!agentConnected ? 'Connect Claude Code to auto-fix' : undefined}
              onClick={() => {
                setAskingAI(key)
                onAskAI(err)
              }}
            >
              {askingAI === key ? 'Requesting fix...' : 'Ask AI'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
