import { describe, it, expect, afterEach } from 'vitest'
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

const flushEffects = () => new Promise<void>(r => setTimeout(r, 10))

describe('TokenPresetPopover — token rows', () => {
  it('renders one row per token when tokens is non-empty', () => {
    const root = mountPopover()
    const rows = root.querySelectorAll('button.cortex-token-preset-popover__list-row')
    expect(rows).toHaveLength(PROJECT_TOKENS.length)
  })

  it('each row shows swatch, token name, and px value', () => {
    const root = mountPopover()
    const rows = root.querySelectorAll('button.cortex-token-preset-popover__list-row')
    const first = rows[0]
    expect(first?.querySelector('.cortex-token-preset-popover__list-swatch')).not.toBeNull()
    expect(first?.querySelector('.cortex-token-preset-popover__list-name')?.textContent).toBe('--spacing-sm')
    expect(first?.querySelector('.cortex-token-preset-popover__list-value')?.textContent).toBe('8px')
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
    await flushEffects()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(1)
  })

  it('fires onDismiss on outside mousedown, not on inside mousedown', async () => {
    let dismissed = 0
    const root = mountPopover({ onDismiss: () => { dismissed++ } })
    await flushEffects()

    ;(root.querySelector('button.cortex-token-preset-popover__list-row') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(dismissed).toBe(0)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dismissed).toBe(1)
  })
})

describe('TokenPresetPopover — popover-stack registration', () => {
  it('registers with popover-stack on mount and unregisters on unmount', async () => {
    expect(hasOpenPopover()).toBe(false)
    mountPopover()
    // useOutsideDismiss calls registerPopoverDismiss inside a useEffect;
    // flush one macrotask so Preact runs post-render effects before asserting.
    await flushEffects()
    expect(hasOpenPopover()).toBe(true)
    render(null, container)
    await flushEffects()
    expect(hasOpenPopover()).toBe(false)
  })
})

describe('TokenPresetPopover — positioning (skip: requires real CSSOM)', () => {
  it.skip('TODO: requires real CSSOM — flip() and shift() integration tests are covered in Playwright E2E (sub-issue E)', () => {
    // floating-ui computePosition relies on getBoundingClientRect which
    // happy-dom returns as zeroed-out DOMRect — position tests are deferred
    // to Playwright (sub-issue E) where a real layout engine is available.
  })
})
