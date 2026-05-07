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
    vi.restoreAllMocks()
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

  it('falls back to the default placement when data-tooltip-placement is invalid', async () => {
    const shadowRoot = setup()
    const numeric = document.createElement('div')
    numeric.dataset['tooltip'] = 'Width'
    numeric.dataset['tooltipPlacement'] = 'sideways'
    shadowRoot.appendChild(numeric)

    await showTooltip(numeric)

    const call = floatingMocks.computePosition.mock.calls[0]
    expect(call?.[2]).toMatchObject({ placement: 'top' })
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

  it('continues climbing to an enabled ancestor when a disabled child has data-tooltip', async () => {
    const shadowRoot = setup()
    const parent = document.createElement('div')
    parent.dataset['tooltip'] = 'Set position mode to enable'
    const button = document.createElement('button')
    button.dataset['tooltip'] = 'Unavailable'
    button.disabled = true
    parent.appendChild(button)
    shadowRoot.appendChild(parent)

    const tooltip = await showTooltip(button)

    expect(tooltip.textContent).toBe('Set position mode to enable')
    expect(parent.getAttribute('aria-describedby')?.split(/\s+/)).toContain('cortex-tooltip')
    expect(button.getAttribute('aria-describedby')).toBeNull()
    expect(floatingMocks.computePosition.mock.calls[0]?.[0]).toBe(parent)
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

  it('keeps focus-opened tooltip visible when pointer moves over non-tooltip UI', async () => {
    const shadowRoot = setup()
    const wrapper = document.createElement('div')
    wrapper.dataset['tooltip'] = 'Width'
    const input = document.createElement('input')
    wrapper.appendChild(input)
    const plain = document.createElement('div')
    shadowRoot.appendChild(wrapper)
    shadowRoot.appendChild(plain)

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }))
      await vi.advanceTimersByTimeAsync(200)
    })

    await act(async () => {
      dispatchPointerEvent(plain, 'pointerover')
    })

    expect(root?.querySelector('#cortex-tooltip')?.textContent).toBe('Width')
    expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toContain('cortex-tooltip')
  })

  it('centers the fallback position using the tooltip size when Floating UI fails', async () => {
    const shadowRoot = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    floatingMocks.computePosition.mockRejectedValueOnce(new Error('layout unavailable'))
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidth() {
      return this.id === 'cortex-tooltip' ? 80 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function offsetHeight() {
      return this.id === 'cortex-tooltip' ? 20 : 0
    })

    const button = document.createElement('button')
    button.dataset['tooltip'] = 'Centered'
    button.getBoundingClientRect = () => ({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 140,
      bottom: 70,
      width: 40,
      height: 20,
      toJSON: () => ({}),
    })
    shadowRoot.appendChild(button)

    const tooltip = await showTooltip(button)
    await act(async () => {
      await Promise.resolve()
    })

    expect(tooltip.style.left).toBe('80px')
    expect(tooltip.style.top).toBe('24px')
    expect(warn).toHaveBeenCalledWith('[cortex] Tooltip positioning failed:', 'layout unavailable')
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
