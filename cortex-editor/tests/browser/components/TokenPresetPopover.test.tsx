import { describe, it, expect, afterEach, vi } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import { createRef } from 'preact'
import {
  TokenPresetPopover,
  type TokenPresetPopoverProps,
} from '../../../src/browser/components/controls/TokenPresetPopover.js'
import type { SpacingToken } from '../../../src/core/tailwind-resolver.js'
import {
  hasOpenPopover,
  _resetPopoverStackForTesting,
} from '../../../src/browser/popover-stack.js'

const PROJECT_TOKENS: readonly SpacingToken[] = [
  { name: '--spacing-sm', valuePx: 8, source: 'css-variable' },
  { name: '--spacing-md', valuePx: 16, source: 'css-variable' },
  { name: '--gap-loose', valuePx: 32, source: 'css-variable' },
]

let container: HTMLDivElement
let anchor: HTMLButtonElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
  // Clean up the test anchor too — mountPopover() appends a fresh button to
  // document.body that wasn't unmounted by the container teardown above.
  // Without this, anchors accumulate across tests and document-level
  // interaction assertions become flaky.
  if (anchor && anchor.parentNode) {
    anchor.parentNode.removeChild(anchor)
  }
  _resetPopoverStackForTesting()
})

function mount(vnode: VNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(vnode, container)
  return container
}

function mountPopover(props: Partial<TokenPresetPopoverProps> = {}): HTMLDivElement {
  anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const anchorRef = createRef<Element>()
  ;(anchorRef as { current: Element }).current = anchor

  return mount(
    <TokenPresetPopover
      anchorRef={anchorRef}
      tokens={PROJECT_TOKENS}
      onPick={() => {}}
      onDismiss={() => {}}
      {...props}
    />,
  )
}

describe('TokenPresetPopover — token rows', () => {
  it('renders one row per token when tokens is non-empty', () => {
    const root = mountPopover()
    const rows = root.querySelectorAll('button.cortex-token-preset-popover__list-row')
    expect(rows).toHaveLength(PROJECT_TOKENS.length)
  })

  it('each row shows token name and px value', () => {
    const root = mountPopover()
    const rows = root.querySelectorAll('button.cortex-token-preset-popover__list-row')
    const first = rows[0]
    expect(first?.querySelector('.cortex-token-preset-popover__list-name')?.textContent).toBe('--spacing-sm')
    expect(first?.querySelector('.cortex-token-preset-popover__list-value')?.textContent).toBe('8px')
    // Swatch icon was removed in Step 9.5 cleanup — the diagonal-stripe pattern
    // communicated "this has a visual property" to designers familiar with color
    // swatches but added noise for dimension tokens (Step 4 design review M3).
    expect(first?.querySelector('.cortex-token-preset-popover__list-swatch')).toBeNull()
  })

  it('rows are sorted by valuePx ascending regardless of input order', () => {
    // Regression: the resolver returns tokens in source-priority + insertion
    // order, which puts Tailwind v4 fractional multipliers (0.5, 1.5, 2.5, 3.5)
    // AFTER the integer scale (0..96) because of the parser's emission order.
    // Display-time sort guarantees the user always scans smallest → largest.
    const unsorted: readonly SpacingToken[] = [
      { name: '--spacing-large', valuePx: 96, source: 'tailwind-v4' },
      { name: '--spacing-tiny', valuePx: 2, source: 'tailwind-v4' },
      { name: '--spacing-medium', valuePx: 16, source: 'css-variable' },
      { name: '--spacing-half', valuePx: 6, source: 'tailwind-v4' },
    ]
    const root = mountPopover({ tokens: unsorted })
    const valueEls = root.querySelectorAll('.cortex-token-preset-popover__list-value')
    const renderedPx = Array.from(valueEls).map((el) => Number(el.textContent?.replace('px', '')))
    expect(renderedPx).toEqual([2, 6, 16, 96])
  })
})

describe('TokenPresetPopover — empty state', () => {
  it('renders empty-state title + hint when tokens is empty', () => {
    const root = mountPopover({ tokens: [] })
    const empty = root.querySelector('.cortex-token-preset-popover__empty-state')
    expect(empty).not.toBeNull()
    expect(root.querySelector('.cortex-token-preset-popover__empty-state-title')?.textContent).toBe(
      'No design tokens detected',
    )
    expect(root.querySelector('.cortex-token-preset-popover__empty-state-hint')?.textContent ?? '').toMatch(
      /Add\s+--spacing-\*\s+to your CSS/,
    )
  })

  it('does NOT render the list zone when tokens is empty', () => {
    const root = mountPopover({ tokens: [] })
    expect(root.querySelector('.cortex-token-preset-popover__list')).toBeNull()
    expect(root.querySelectorAll('button.cortex-token-preset-popover__list-row')).toHaveLength(0)
  })

  it('does NOT render the empty-state when tokens is non-empty', () => {
    const root = mountPopover()
    expect(root.querySelector('.cortex-token-preset-popover__empty-state')).toBeNull()
  })
})

describe('TokenPresetPopover — onPick', () => {
  it('clicking a list row fires onPick with the resolver source preserved', () => {
    let picked: { name: string; valuePx: number; source: SpacingToken['source'] } | null = null
    const root = mountPopover({ onPick: (c) => { picked = c } })
    const rows = root.querySelectorAll('button.cortex-token-preset-popover__list-row')
    ;(rows[0] as HTMLButtonElement).click()
    expect(picked).not.toBeNull()
    expect(picked!.source).toBe('css-variable')
    expect(picked!.name).toBe('--spacing-sm')
    expect(picked!.valuePx).toBe(8)
  })

  it('row mousedown is preventDefault — keeps focus on input so click commits before blur', () => {
    const root = mountPopover()
    const row = root.querySelector('button.cortex-token-preset-popover__list-row') as HTMLButtonElement
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    row.dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)
  })
})

describe('TokenPresetPopover — dismiss', () => {
  it('fires onDismiss on Escape keydown', async () => {
    let dismissed = 0
    mountPopover({ onDismiss: () => { dismissed++ } })
    // Wait for useOutsideDismiss to register with the popover-stack. Under
    // full-suite serial-singleFork load, the useEffect that attaches the
    // Escape listener can be queued behind a macrotask backlog past any
    // fixed wall-clock yield (ZF0-1568). Polling the popover-stack readiness
    // signal is the deterministic primitive — same signal the popover-stack
    // registration test asserts on.
    await vi.waitFor(() => {
      expect(hasOpenPopover()).toBe(true)
    }, { timeout: 500 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(1)
  })

  it('fires onDismiss on outside mousedown, not on inside mousedown', async () => {
    let dismissed = 0
    const root = mountPopover({ onDismiss: () => { dismissed++ } })
    // Same readiness wait as the Escape test above. Without this, the
    // negative "inside mousedown must not dismiss" assertion below is
    // vacuous: if the useEffect hasn't fired yet, NO listener exists, so
    // dismissed=0 trivially — masking a regression where the listener
    // wrongly dismisses on inside clicks (Copilot review, PR #132).
    await vi.waitFor(() => {
      expect(hasOpenPopover()).toBe(true)
    }, { timeout: 500 })

    // Inside click — listener IS attached now, must correctly identify
    // the target as inside the popover and skip onDismiss.
    ;(root.querySelector('button.cortex-token-preset-popover__list-row') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(dismissed).toBe(0)

    // Outside click — listener fires exactly once.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dismissed).toBe(1)
  })
})

describe('TokenPresetPopover — popover-stack registration', () => {
  it('registers with popover-stack on mount and unregisters on unmount', async () => {
    expect(hasOpenPopover()).toBe(false)
    mountPopover()
    // useOutsideDismiss calls registerPopoverDismiss inside a useEffect. Under
    // full-suite serial load, the local 10ms `flushEffects()` helper is not
    // always enough — the Preact effect can still be queued behind a busy
    // macrotask backlog when the 10ms timer fires, leaving the popover-stack
    // empty (ZF0-1568 reproduction: run 3 of 5 full-suite runs). vi.waitFor
    // polls the assertion until it passes — a deterministic primitive rather
    // than a hand-tuned wall-clock delay. Acceptance per ZF0-1568: no timeout
    // widening, no retries; this is the "act-based flushing" alternative.
    await vi.waitFor(() => {
      expect(hasOpenPopover()).toBe(true)
    }, { timeout: 500 })
    render(null, container)
    await vi.waitFor(() => {
      expect(hasOpenPopover()).toBe(false)
    }, { timeout: 500 })
  })
})

describe('TokenPresetPopover — positioning (skip: requires real CSSOM)', () => {
  it.skip('TODO: requires real CSSOM — flip() and shift() integration tests are covered in Playwright E2E (sub-issue E)', () => {
    // floating-ui computePosition relies on getBoundingClientRect which
    // happy-dom returns as zeroed-out DOMRect — position tests are deferred
    // to Playwright (sub-issue E) where a real layout engine is available.
  })
})
