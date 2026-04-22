import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { EditErrorCard } from '../../src/browser/components/EditErrorCard.js'

describe('EditErrorCard', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders nothing when errors is empty', () => {
    const errors = new Map<string, { source: string; property: string; value: string; reason: string }>()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    expect(container.querySelector('.cortex-error-card')).toBeNull()
  })

  it('renders nothing when no errors match the elementSource', () => {
    const errors = new Map([
      ['other.tsx:5:3\0color', { source: 'other.tsx:5:3', property: 'color', value: 'red', reason: 'No match' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    expect(container.querySelector('.cortex-error-card')).toBeNull()
  })

  it('renders error card with property and reason', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'No matching Tailwind class for 17px' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const card = container.querySelector('.cortex-error-card')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('font-size')
    expect(card!.textContent).toContain('No matching Tailwind class for 17px')
  })

  it('disables Ask AI when agentConnected is false', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('enables Ask AI when agentConnected is true', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={true} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('calls onDismiss with the error key when Dismiss clicked', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    const onDismiss = vi.fn()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={onDismiss} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="dismiss"]') as HTMLButtonElement
    btn.click()
    expect(onDismiss).toHaveBeenCalledWith('file.tsx:10:5\0font-size')
  })

  it('calls onAskAI with error details when Ask AI clicked', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    const onAskAI = vi.fn()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={true} onDismiss={() => {}} onAskAI={onAskAI} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    btn.click()
    expect(onAskAI).toHaveBeenCalledWith({
      source: 'file.tsx:10:5',
      property: 'font-size',
      value: '17px',
      reason: 'fail',
    })
  })

  // ── ZF0-1293: debug disclosure ─────────────────────────────────
  describe('debug disclosure (ZF0-1293)', () => {
    const diagnostics = {
      actualReadFrom: 'inline-style' as const,
      kindUsed: 'jsx-immediate',
      priorValues: ['24px', '30px', '16px'],
      retryDurationMs: 812,
    }
    const errorsWithDiag = () => new Map([
      ['file.tsx:10:5\0padding-bottom', {
        source: 'file.tsx:10:5', property: 'padding-bottom', value: '16px',
        reason: 'Preview shows "16px" but the saved file renders "30px". The edit may not have propagated.',
        diagnostics,
      }],
    ])

    afterEach(() => {
      delete (window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__
    })

    it('renders Debug disclosure only when __CORTEX_DEBUG_OVERRIDES__ is truthy', () => {
      // Flag off — no debug section. Guards against accidentally leaking internal
      // diagnostics to end users who haven't opted into the debug mode.
      render(
        <EditErrorCard errors={errorsWithDiag()} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
        container,
      )
      expect(container.querySelector('.cortex-error-card__debug')).toBeNull()

      // Flag on — debug section renders with all four fields.
      ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      render(null, container) // reset so the next render remounts with the flag visible
      render(
        <EditErrorCard errors={errorsWithDiag()} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
        container,
      )
      const debug = container.querySelector('.cortex-error-card__debug')
      expect(debug).not.toBeNull()
      expect(debug!.textContent).toContain('inline-style')
      expect(debug!.textContent).toContain('jsx-immediate')
      // Prior values rendered as arrow-joined sequence — preserves order info.
      expect(debug!.textContent).toContain('24px → 30px → 16px')
      // Retry duration formatted as ms integer.
      expect(debug!.textContent).toContain('812ms')
    })

    it('omits Debug section when diagnostics is undefined (backward-compat)', () => {
      // Errors without diagnostics (legacy emitters or non-divergence sources)
      // must still render — just without the debug panel.
      ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      const errors = new Map([
        ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
      ])
      render(
        <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
        container,
      )
      expect(container.querySelector('.cortex-error-card')).not.toBeNull()
      expect(container.querySelector('.cortex-error-card__debug')).toBeNull()
    })

    it('does not render Debug section when flag is a truthy non-true value ("false", 1, "yes")', () => {
      // The gate must be strict `=== true`. A dev setting the flag via
      // localStorage plumbing or a typo could end up with the string "false"
      // or the number 1 — neither should expose diagnostics.
      for (const fake of ['false', '1', 'yes', 1, {}, [] as unknown]) {
        ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: unknown }).__CORTEX_DEBUG_OVERRIDES__ = fake
        render(null, container)
        render(
          <EditErrorCard errors={errorsWithDiag()} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
          container,
        )
        expect(container.querySelector('.cortex-error-card__debug')).toBeNull()
      }
    })

    it('renders read error message in Debug disclosure when diagnostics carries errorMessage', () => {
      ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      const errors = new Map([
        ['file.tsx:10:5\0color', {
          source: 'file.tsx:10:5', property: 'color', value: 'red',
          reason: 'Preview shows "red" but the saved file renders "(empty)". The edit may not have propagated.',
          diagnostics: {
            actualReadFrom: 'computed-style' as const,
            kindUsed: 'immediate',
            priorValues: ['red'],
            retryDurationMs: 72,
            errorMessage: 'TypeError: simulated CSSOM failure',
          },
        }],
      ])
      render(
        <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
        container,
      )
      const debug = container.querySelector('.cortex-error-card__debug')
      expect(debug).not.toBeNull()
      // The errorMessage field must appear — without it, this card would be
      // indistinguishable from a "React Fast Refresh was slow" divergence.
      expect(debug!.textContent).toContain('TypeError: simulated CSSOM failure')
      expect(debug!.textContent).toContain('read error')
    })

    it('renders server-mismatch readFrom with n/a retry duration', () => {
      ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      const errors = new Map([
        ['file.tsx:10:5\0color', {
          source: 'file.tsx:10:5', property: 'color', value: 'red',
          reason: 'Server refused the edit.',
          diagnostics: {
            actualReadFrom: 'server-mismatch' as const,
            kindUsed: 'jsx-immediate',
            priorValues: ['red'],
            retryDurationMs: undefined,
          },
        }],
      ])
      render(
        <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
        container,
      )
      const debug = container.querySelector('.cortex-error-card__debug')
      expect(debug).not.toBeNull()
      expect(debug!.textContent).toContain('server-mismatch')
      // n/a placeholder proves the undefined branch renders — not a blank field.
      expect(debug!.textContent).toContain('(n/a)')
    })
  })
})
