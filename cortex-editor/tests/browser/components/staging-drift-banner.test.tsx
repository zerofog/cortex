/**
 * ZF0-1468 (T2 of ZF0-1453): StagingDriftBanner component tests
 *
 * Covers acceptance criteria #6, #8, #9, #10, #12, #13, #14, #15 from the
 * parent ticket, plus optional dismissed-state and re-trigger-reset tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { StagingDriftBanner } from '../../../src/browser/components/StagingDriftBanner.js'

describe('StagingDriftBanner', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  // #6: both counts zero → no DOM
  it('renders null when both intentDriftCount and staleOverrideCount are 0', () => {
    render(
      <StagingDriftBanner
        intentDriftCount={0}
        staleOverrideCount={0}
        onIntentRefresh={() => {}}
        onStaleRefresh={() => {}}
        onDismiss={() => {}}
      />,
      container,
    )
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  // #8: intentDriftCount > 0, staleOverrideCount = 0 → intent banner visible with correct copy
  it('renders intent banner with count and copy when only intentDriftCount > 0', () => {
    render(
      <StagingDriftBanner
        intentDriftCount={2}
        staleOverrideCount={0}
        onIntentRefresh={() => {}}
        onStaleRefresh={() => {}}
        onDismiss={() => {}}
      />,
      container,
    )
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('2 staged edit(s) may be affected by external changes')
    expect(banner!.textContent).toContain('Source code in some files has changed since you staged these edits')
  })

  // #9: clicking intent Refresh calls onIntentRefresh exactly once
  it('calls onIntentRefresh exactly once when intent Refresh button is clicked', () => {
    const onIntentRefresh = vi.fn()
    render(
      <StagingDriftBanner
        intentDriftCount={2}
        staleOverrideCount={0}
        onIntentRefresh={onIntentRefresh}
        onStaleRefresh={() => {}}
        onDismiss={() => {}}
      />,
      container,
    )
    const btn = container.querySelector('[data-action="intent-refresh"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(onIntentRefresh).toHaveBeenCalledTimes(1)
  })

  // #10: click X → onDismiss called + banner hidden; intentDriftCount change → banner reappears
  it('hides banner on X click, then reappears when intentDriftCount changes to a new value', async () => {
    const onDismiss = vi.fn()
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={2}
          staleOverrideCount={0}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={onDismiss}
        />,
        container,
      )
    })

    // Banner is visible before dismiss
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    const dismissBtn = container.querySelector('[data-action="dismiss"]') as HTMLButtonElement
    expect(dismissBtn).not.toBeNull()

    // Wrap click in act() so the setState + useEffect commits flush synchronously
    await act(() => { dismissBtn.click() })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // After dismiss, banner should be hidden
    expect(container.querySelector('[role="status"]')).toBeNull()

    // Re-render with new count (2 → 3) — dismissed state must reset
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={3}
          staleOverrideCount={0}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={onDismiss}
        />,
        container,
      )
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  // #12: staleOverrideCount > 0, intentDriftCount = 0 → stale banner with correct copy
  it('renders stale banner with count and copy when only staleOverrideCount > 0', () => {
    render(
      <StagingDriftBanner
        intentDriftCount={0}
        staleOverrideCount={2}
        onIntentRefresh={() => {}}
        onStaleRefresh={() => {}}
        onDismiss={() => {}}
      />,
      container,
    )
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('2 edit(s) saved but HMR didn\'t apply')
    expect(banner!.textContent).toContain('Try refreshing the page to see the actual file state')
  })

  // #13: clicking stale Refresh calls onStaleRefresh exactly once
  it('calls onStaleRefresh exactly once when stale Refresh button is clicked', () => {
    const onStaleRefresh = vi.fn()
    render(
      <StagingDriftBanner
        intentDriftCount={0}
        staleOverrideCount={2}
        onIntentRefresh={() => {}}
        onStaleRefresh={onStaleRefresh}
        onDismiss={() => {}}
      />,
      container,
    )
    const btn = container.querySelector('[data-action="stale-refresh"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(onStaleRefresh).toHaveBeenCalledTimes(1)
  })

  // #14: staleOverrideCount=5 → correct aggregate count in title
  it('renders correct aggregate count (5) in stale banner title', () => {
    render(
      <StagingDriftBanner
        intentDriftCount={0}
        staleOverrideCount={5}
        onIntentRefresh={() => {}}
        onStaleRefresh={() => {}}
        onDismiss={() => {}}
      />,
      container,
    )
    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('5 edit(s) saved but HMR didn\'t apply')
  })

  // #15: both counts > 0 → single merged banner with both titles + both bodies + two Refresh buttons
  it('renders a single merged banner with both title/body rows and two independent Refresh buttons when both counts are non-zero', () => {
    const onIntentRefresh = vi.fn()
    const onStaleRefresh = vi.fn()
    render(
      <StagingDriftBanner
        intentDriftCount={3}
        staleOverrideCount={4}
        onIntentRefresh={onIntentRefresh}
        onStaleRefresh={onStaleRefresh}
        onDismiss={() => {}}
      />,
      container,
    )

    const banner = container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()

    // Exactly one banner element in the DOM — not two side-by-side banners
    expect(container.querySelectorAll('[role="status"]').length).toBe(1)

    // Both titles present
    expect(banner!.textContent).toContain('3 staged edit(s) may be affected by external changes')
    expect(banner!.textContent).toContain('4 edit(s) saved but HMR didn\'t apply')

    // Both bodies present
    expect(banner!.textContent).toContain('Source code in some files has changed since you staged these edits')
    expect(banner!.textContent).toContain('Try refreshing the page to see the actual file state')

    // Two distinct Refresh buttons — each calls its own handler exclusively
    const intentBtn = container.querySelector('[data-action="intent-refresh"]') as HTMLButtonElement
    const staleBtn = container.querySelector('[data-action="stale-refresh"]') as HTMLButtonElement
    expect(intentBtn).not.toBeNull()
    expect(staleBtn).not.toBeNull()

    intentBtn.click()
    expect(onIntentRefresh).toHaveBeenCalledTimes(1)
    expect(onStaleRefresh).toHaveBeenCalledTimes(0)

    staleBtn.click()
    expect(onStaleRefresh).toHaveBeenCalledTimes(1)
    expect(onIntentRefresh).toHaveBeenCalledTimes(1) // still 1, not 2
  })

  // Optional: dismissed state persists while count unchanged
  it('keeps banner hidden when count is unchanged after dismiss', async () => {
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={2}
          staleOverrideCount={0}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={() => {}}
        />,
        container,
      )
    })
    const dismissBtn = container.querySelector('[data-action="dismiss"]') as HTMLButtonElement
    await act(() => { dismissBtn.click() })
    expect(container.querySelector('[role="status"]')).toBeNull()

    // Re-render with the same count — dismissed state must NOT reset
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={2}
          staleOverrideCount={0}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={() => {}}
        />,
        container,
      )
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  // Optional: re-trigger reset on staleOverrideCount change after dismiss
  it('re-shows banner when staleOverrideCount changes after dismiss', async () => {
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={2}
          staleOverrideCount={0}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={() => {}}
        />,
        container,
      )
    })
    const dismissBtn = container.querySelector('[data-action="dismiss"]') as HTMLButtonElement
    await act(() => { dismissBtn.click() })
    expect(container.querySelector('[role="status"]')).toBeNull()

    // Now staleOverrideCount goes from 0 → 1 — this is a new divergence event
    await act(() => {
      render(
        <StagingDriftBanner
          intentDriftCount={2}
          staleOverrideCount={1}
          onIntentRefresh={() => {}}
          onStaleRefresh={() => {}}
          onDismiss={() => {}}
        />,
        container,
      )
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })
})
