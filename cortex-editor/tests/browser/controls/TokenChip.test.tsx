import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { TokenChip } from '../../../src/browser/components/controls/TokenChip.js'

function mount(jsx: preact.JSX.Element): HTMLElement {
  const container = document.createElement('div')
  render(jsx, container)
  return container
}

describe('TokenChip', () => {
  let container: HTMLElement

  afterEach(() => {
    if (container) {
      render(null, container)
    }
  })

  it('renders token name text', () => {
    container = mount(
      <TokenChip tokenName="--bg-surface" resolvedValue="#ff0000" onUnlink={() => {}} />,
    )
    const nameEl = container.querySelector('.cortex-token-chip__name')
    expect(nameEl).not.toBeNull()
    expect(nameEl!.textContent).toBe('--bg-surface')
  })

  it('renders swatch with color background', () => {
    container = mount(
      <TokenChip tokenName="--bg-surface" resolvedValue="#ff0000" onUnlink={() => {}} />,
    )
    const swatch = container.querySelector('.cortex-token-chip__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('#ff0000')
  })

  it('clicking unlink calls onUnlink', () => {
    const onUnlink = vi.fn()
    container = mount(
      <TokenChip tokenName="--bg-surface" resolvedValue="#ff0000" onUnlink={onUnlink} />,
    )
    const unlinkBtn = container.querySelector('.cortex-token-chip__unlink') as HTMLButtonElement
    expect(unlinkBtn).not.toBeNull()
    unlinkBtn.click()
    expect(onUnlink).toHaveBeenCalledTimes(1)
  })

  it('unlink button has correct aria-label', () => {
    container = mount(
      <TokenChip tokenName="--bg-surface" resolvedValue="#ff0000" onUnlink={() => {}} />,
    )
    const unlinkBtn = container.querySelector('.cortex-token-chip__unlink') as HTMLElement
    expect(unlinkBtn).not.toBeNull()
    expect(unlinkBtn.getAttribute('aria-label')).toBe('Detach token')
  })

  it('non-color values do not set backgroundColor on swatch', () => {
    container = mount(<TokenChip tokenName="--space-4" resolvedValue="16px" />)
    const swatch = container.querySelector('.cortex-token-chip__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    // Non-color values take the stripe-pattern branch (background: repeating-linear-gradient)
    // instead of the color branch (backgroundColor: resolvedValue).
    // happy-dom drops complex gradient values, so we can only verify the negative:
    // backgroundColor must NOT be set. The gradient visual is CSS, not testable here.
    expect(swatch.style.backgroundColor).toBe('')
  })

  it('does not render unlink when onUnlink omitted', () => {
    container = mount(<TokenChip tokenName="--bg" resolvedValue="blue" />)
    const unlinkBtn = container.querySelector('.cortex-token-chip__unlink')
    expect(unlinkBtn).toBeNull()
    // Also verify no button element at all
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(0)
  })
})
