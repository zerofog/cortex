import type { JSX } from 'preact'
import { useState, useMemo, useRef, useCallback } from 'preact/hooks'
import type { FixMeta } from '../../adapters/types.js'
import type { OverrideDivergenceDiagnostics } from '../override-bus.js'

export interface EditError extends FixMeta {
  source: string
  /** ZF0-1293: optional diagnostic payload attached when the error came from
   *  a divergence event. Only surfaced to the user via the Debug disclosure,
   *  which is gated by `window.__CORTEX_DEBUG_OVERRIDES__`. */
  diagnostics?: OverrideDivergenceDiagnostics
}

/** Whether debug diagnostics should be rendered on error cards. Evaluated
 *  per-render rather than captured once — devs commonly flip the flag in
 *  devtools during a live investigation without reloading. Strict `=== true`
 *  check (not truthy coercion) so stringy values ("false", "0") can't
 *  accidentally expose the Debug panel to end users — the documented
 *  contract on the flag is "only when set to boolean true". */
function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__ === true
}

interface EditErrorCardProps {
  errors: Map<string, EditError>
  elementSource: string
  agentConnected: boolean
  onDismiss: (key: string) => void
  onAskAI: (error: EditError) => void
}

export function EditErrorCard({ errors, elementSource, agentConnected, onDismiss, onAskAI }: EditErrorCardProps): JSX.Element | null {
  const [askingAI, setAskingAI] = useState<Set<string>>(new Set())

  // Reset individual askingAI entries after 15s — prevents permanent disable if channel.send fails
  const askingAITimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const markAsking = useCallback((key: string) => {
    setAskingAI(prev => new Set(prev).add(key))
    const existing = askingAITimeouts.current.get(key)
    if (existing) clearTimeout(existing)
    askingAITimeouts.current.set(key, setTimeout(() => {
      setAskingAI(prev => { const next = new Set(prev); next.delete(key); return next })
      askingAITimeouts.current.delete(key)
    }, 15_000))
  }, [])

  // Filter errors for the currently selected element (memoized to avoid re-scan on unrelated renders)
  const elementErrors = useMemo(
    () => Array.from(errors.entries()).filter(([, err]) => err.source === elementSource),
    [errors, elementSource],
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
          {isDebugEnabled() && err.diagnostics && (
            <DebugDisclosure diagnostics={err.diagnostics} />
          )}
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
              disabled={!agentConnected || askingAI.has(key)}
              title={!agentConnected ? 'Connect Claude Code to auto-fix' : undefined}
              onClick={() => {
                markAsking(key)
                onAskAI(err)
              }}
            >
              {askingAI.has(key) ? 'Requesting fix...' : 'Ask AI'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** ZF0-1293: collapsible diagnostic panel for divergence investigation. Only
 *  rendered when `window.__CORTEX_DEBUG_OVERRIDES__ === true` (strict, not
 *  truthy — see `isDebugEnabled()` above). Plain <details> keeps the
 *  interaction keyboard-accessible without extra state management. */
function DebugDisclosure({ diagnostics }: { diagnostics: OverrideDivergenceDiagnostics }): JSX.Element {
  const { actualReadFrom, kindUsed, priorValues, retryDurationMs, errorMessage } = diagnostics
  return (
    <details class="cortex-error-card__debug">
      <summary class="cortex-error-card__debug-summary">Debug</summary>
      <dl class="cortex-error-card__debug-grid">
        <dt>actual read from</dt>
        <dd>{actualReadFrom}</dd>
        <dt>kind</dt>
        <dd>{kindUsed ?? '(none)'}</dd>
        <dt>prior values</dt>
        <dd>{priorValues.length === 0 ? '(none)' : priorValues.join(' → ')}</dd>
        <dt>retry duration</dt>
        <dd>{retryDurationMs === undefined ? '(n/a)' : `${retryDurationMs.toFixed(0)}ms`}</dd>
        {errorMessage !== undefined && (
          <>
            <dt>read error</dt>
            <dd>{errorMessage}</dd>
          </>
        )}
      </dl>
    </details>
  )
}
