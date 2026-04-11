import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { IconButton } from '../../../src/browser/components/controls/IconButton.js'
import { FlipHorizontal, RotateCw } from '../../../src/browser/components/icons.js'

// Anti-tautology icon fingerprints — exact path fragments lifted from
// icons.tsx. The icons.test.tsx snapshot guards icons.tsx upstream;
// this file uses the same fingerprints to prove that IconButton ACTUALLY
// rendered the icon we passed (not a default fallback or empty span).
const ICON_FINGERPRINT = {
  // FlipHorizontal: M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3
  flipH: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3',
  // RotateCw: M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8
  rotateCw: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8',
} as const

describe('IconButton', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(props?: Partial<Parameters<typeof IconButton>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onClick = vi.fn()
    render(
      <IconButton
        icon={<FlipHorizontal size={14} />}
        ariaLabel="Flip horizontal"
        onClick={onClick}
        {...props}
      />,
      container,
    )
    return {
      onClick,
      button: container.querySelector('.cortex-icon-button') as HTMLButtonElement,
    }
  }

  // ── render contract ────────────────────────────────────────────────

  it('renders a <button type="button"> with the cortex-icon-button class', () => {
    const { button } = setup()
    expect(button).not.toBeNull()
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('cortex-icon-button')).toBe(true)
  })

  it('renders the EXACT icon passed in (anti-tautology, fingerprinted)', () => {
    const { button } = setup({ icon: <FlipHorizontal size={14} /> })
    const svg = button.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.flipH)
    // And does NOT contain a different lucide icon's path
    expect(svg!.innerHTML).not.toContain(ICON_FINGERPRINT.rotateCw)
  })

  it('renders a different icon when a different one is passed', () => {
    const { button } = setup({ icon: <RotateCw size={14} /> })
    const svg = button.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.rotateCw)
    expect(svg!.innerHTML).not.toContain(ICON_FINGERPRINT.flipH)
  })

  // ── accessibility ──────────────────────────────────────────────────

  it('sets aria-label from the ariaLabel prop', () => {
    const { button } = setup({ ariaLabel: 'Justify self center' })
    expect(button.getAttribute('aria-label')).toBe('Justify self center')
  })

  it('emits aria-pressed="false" by default (toggle semantics)', () => {
    const { button } = setup()
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('emits aria-pressed="true" when active', () => {
    const { button } = setup({ active: true })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  // ── tooltip pass-through ───────────────────────────────────────────

  it('forwards tooltip via data-tooltip', () => {
    const { button } = setup({ tooltip: 'Flip horizontal' })
    expect(button.getAttribute('data-tooltip')).toBe('Flip horizontal')
  })

  it('omits data-tooltip when no tooltip is provided', () => {
    const { button } = setup()
    expect(button.getAttribute('data-tooltip')).toBeNull()
  })

  // ── click handling ─────────────────────────────────────────────────

  it('fires onClick when clicked', () => {
    const { button, onClick } = setup()
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fires onClick once per click (not per render or aria mutation)', () => {
    const { button, onClick } = setup({ active: true })
    button.click()
    button.click()
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  // ── disabled state ─────────────────────────────────────────────────

  it('sets the disabled attribute when disabled', () => {
    const { button } = setup({ disabled: true })
    expect(button.disabled).toBe(true)
  })

  it('does NOT fire onClick when disabled', () => {
    const { button, onClick } = setup({ disabled: true })
    button.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  // ── active state class ─────────────────────────────────────────────

  it('paints the cortex-icon-button--active class when active', () => {
    const { button } = setup({ active: true })
    expect(button.classList.contains('cortex-icon-button--active')).toBe(true)
  })

  it('omits the active class when inactive', () => {
    const { button } = setup({ active: false })
    expect(button.classList.contains('cortex-icon-button--active')).toBe(false)
  })

  it('omits the active class when active prop is undefined', () => {
    const { button } = setup()
    expect(button.classList.contains('cortex-icon-button--active')).toBe(false)
  })
})
