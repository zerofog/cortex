import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { TooltipLayer } from '../../../src/browser/components/TooltipLayer.js'
import { createShadowHost, dispatchPointerEvent } from '../helpers.js'

const floatingMocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  computePosition: vi.fn(),
  autoUpdate: vi.fn(),
  offset: vi.fn(),
  flip: vi.fn(),
  shift: vi.fn(),
}))

vi.mock('@floating-ui/dom', () => ({
  computePosition: floatingMocks.computePosition,
  autoUpdate: floatingMocks.autoUpdate,
  offset: floatingMocks.offset,
  flip: floatingMocks.flip,
  shift: floatingMocks.shift,
}))

describe('TooltipLayer', () => {
  let cleanup: (() => void) | null = null
  let root: HTMLDivElement | null = null

  afterEach(() => {
    if (root) render(null, root)
    cleanup?.()
    cleanup = null
    root = null
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function setup(): ShadowRoot {
    vi.useFakeTimers()
    floatingMocks.computePosition.mockResolvedValue({ x: 42, y: 24 })
    floatingMocks.offset.mockReturnValue({ name: 'offset' })
    floatingMocks.flip.mockReturnValue({ name: 'flip' })
    floatingMocks.shift.mockReturnValue({ name: 'shift' })
    floatingMocks.autoUpdate.mockImplementation((_anchor, _floating, update) => {
      update()
      return floatingMocks.cleanup
    })

    const host = createShadowHost()
    cleanup = host.cleanup
    root = host.root

    act(() => {
      render(<TooltipLayer shadowRoot={host.shadow} />, host.root)
    })
    return host.shadow
  }

  async function showTooltip(anchor: HTMLElement): Promise<HTMLDivElement> {
    await act(async () => {
      dispatchPointerEvent(anchor, 'pointerover')
      await vi.advanceTimersByTimeAsync(200)
    })

    const tooltip = root?.querySelector<HTMLDivElement>('#cortex-tooltip')
    expect(tooltip).not.toBeNull()
    return tooltip!
  }

  it('renders delegated data-tooltip text as real tooltip DOM and positions it with Floating UI', async () => {
    const shadowRoot = setup()
    const button = document.createElement('button')
    button.dataset['tooltip'] = 'Select parent element'
    shadowRoot.appendChild(button)

    const tooltip = await showTooltip(button)

    expect(tooltip.textContent).toBe('Select parent element')
    expect(tooltip.getAttribute('role')).toBe('tooltip')
    expect(tooltip.hasAttribute('popover')).toBe(false)
    expect(tooltip.style.left).toBe('42px')
    expect(tooltip.style.top).toBe('24px')
    expect(button.getAttribute('aria-describedby')?.split(/\s+/)).toContain('cortex-tooltip')

    const call = floatingMocks.computePosition.mock.calls[0]
    expect(call?.[0]).toBe(button)
    expect(call?.[1]).toBe(tooltip)
    expect(call?.[2]).toMatchObject({ strategy: 'fixed', placement: 'top' })
  })

  it('honors data-tooltip-placement for wide controls', async () => {
    const shadowRoot = setup()
    const numeric = document.createElement('div')
    numeric.dataset['tooltip'] = 'Width'
    numeric.dataset['tooltipPlacement'] = 'top-start'
    shadowRoot.appendChild(numeric)

    await showTooltip(numeric)

    const call = floatingMocks.computePosition.mock.calls[0]
    expect(call?.[2]).toMatchObject({ placement: 'top-start' })
  })

  it('does not show tooltips for disabled controls', async () => {
    const shadowRoot = setup()
    const button = document.createElement('button')
    button.dataset['tooltip'] = 'Unavailable'
    button.disabled = true
    shadowRoot.appendChild(button)

    await act(async () => {
      dispatchPointerEvent(button, 'pointerover')
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(root?.querySelector('#cortex-tooltip')).toBeNull()
    expect(floatingMocks.computePosition).not.toHaveBeenCalled()
  })

  it('describes the focused descendant when focus opens a wrapper tooltip', async () => {
    const shadowRoot = setup()
    const wrapper = document.createElement('div')
    wrapper.dataset['tooltip'] = 'Width'
    const input = document.createElement('input')
    wrapper.appendChild(input)
    shadowRoot.appendChild(wrapper)

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }))
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(root?.querySelector('#cortex-tooltip')?.textContent).toBe('Width')
    expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toContain('cortex-tooltip')
    expect(wrapper.getAttribute('aria-describedby')).toBeNull()
  })

  it('removes only its aria-describedby token when the pointer leaves', async () => {
    const shadowRoot = setup()
    const button = document.createElement('button')
    button.dataset['tooltip'] = 'Close panel'
    button.setAttribute('aria-describedby', 'existing-help')
    shadowRoot.appendChild(button)

    await showTooltip(button)

    await act(async () => {
      dispatchPointerEvent(button, 'pointerout')
    })

    expect(root?.querySelector('#cortex-tooltip')).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBe('existing-help')
  })
})
