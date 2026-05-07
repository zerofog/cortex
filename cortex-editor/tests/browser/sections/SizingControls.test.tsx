import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SizingControls } from '../../../src/browser/components/sections/SizingControls.js'
import type { SizingControlsProps } from '../../../src/browser/components/sections/SizingControls.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('SizingControls', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: SizingControlsProps['values'] = {
    width: '320',
    height: '48',
    minWidth: '0px',
    maxWidth: 'none',
    minHeight: '0px',
    maxHeight: 'none',
    overflow: 'visible',
    boxSizing: 'content-box',
  }

  function setup(overrides?: Partial<SizingControlsProps>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SizingControls
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('renders W and H inputs', () => {
    setup()
    expect(container.textContent).toContain('W')
    expect(container.textContent).toContain('H')
  })

  it('renders two sizing dropdown triggers', () => {
    setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    expect(triggers.length).toBe(2)
  })

  it('emits width change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const widthInput = inputs[0] as HTMLInputElement
    expect(widthInput).toBeDefined()
    widthInput.focus()
    widthInput.value = '400'
    widthInput.dispatchEvent(new Event('input', { bubbles: true }))
    widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const widthCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'width')
    expect(widthCall).toBeDefined()
    expect(widthCall![0].value).toBe('400px')
  })

  it('emits fit-content when width mode changed to fit', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(container.querySelector('[data-value="fit"]')).not.toBeNull()
    }, { timeout: 500 })
    const fitOption = container.querySelector('[data-value="fit"]') as HTMLElement
    fitOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: 'fit-content' })
  })

  it('emits 100% when width mode changed to fill', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(container.querySelector('[data-value="fill"]')).not.toBeNull()
    }, { timeout: 500 })
    const fillOption = container.querySelector('[data-value="fill"]') as HTMLElement
    fillOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: '100%' })
  })

  it.each([
    ['width', 'fit-content', 0],
    ['width', '100%', 0],
    ['height', 'fit-content', 1],
    ['height', '100%', 1],
  ] as const)('disables %s input when sizing mode is non-fixed (%s)', (dimension, value, fieldIndex) => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        [dimension]: value,
      },
    })
    const fields = container.querySelectorAll('.cortex-layout-section__sizing-field')
    const field = fields[fieldIndex] as HTMLElement
    const input = field.querySelector('input') as HTMLInputElement
    const numeric = field.querySelector('.cortex-numeric-input') as HTMLElement
    expect(input.disabled).toBe(true)
    expect(numeric.getAttribute('aria-disabled')).toBe('true')
    expect(numeric.getAttribute('data-tooltip')).toBe('Switch to Fixed (px) to edit dimensions')
  })

  it('clip content toggle fires overflow:hidden / overflow:visible', () => {
    const { onChange } = setup()
    const clipBtn = container.querySelector('[data-tooltip="Clip content (overflow: hidden)"]') as HTMLElement
    expect(clipBtn).not.toBeNull()
    // Initially visible — click to clip
    clipBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'overflow', value: 'hidden' })

    // Now render with overflow: hidden and click again
    onChange.mockClear()
    render(null, container)
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, overflow: 'hidden' }}
        onChange={onChange}
      />,
      container,
    )
    const clipBtn2 = container.querySelector('[data-tooltip="Clip content (overflow: hidden)"]') as HTMLElement
    clipBtn2.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'overflow', value: 'visible' })
  })

  it('border box toggle fires box-sizing:border-box / box-sizing:content-box', () => {
    const { onChange } = setup()
    const boxBtn = container.querySelector('[data-tooltip="Border box sizing"]') as HTMLElement
    expect(boxBtn).not.toBeNull()
    // Initially content-box — click for border-box
    boxBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'box-sizing', value: 'border-box' })

    // Now render with border-box and click again
    onChange.mockClear()
    render(null, container)
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, boxSizing: 'border-box' }}
        onChange={onChange}
      />,
      container,
    )
    const boxBtn2 = container.querySelector('[data-tooltip="Border box sizing"]') as HTMLElement
    boxBtn2.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'box-sizing', value: 'content-box' })
  })

  it('aspect lock: changing W fires proportional H change', async () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, width: '200', height: '100' } })
    // Lock aspect
    const lockBtn = container.querySelector('.cortex-lock-btn') as HTMLElement
    expect(lockBtn).not.toBeNull()
    lockBtn.click()
    await vi.waitFor(() => {
      expect(lockBtn.getAttribute('aria-pressed')).toBe('true')
    }, { timeout: 500 })
    // Now change width — need to re-query since the component re-rendered
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const widthInput = inputs[0] as HTMLInputElement
    widthInput.focus()
    widthInput.value = '400'
    widthInput.dispatchEvent(new Event('input', { bubbles: true }))
    widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const widthCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'width' && c[0]?.value === '400px')
    expect(widthCall).toBeDefined()
    const heightCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'height' && c[0]?.value === '200px')
    expect(heightCall).toBeDefined()
  })

  it('aspect lock is disabled with an explanation when either dimension is non-fixed', async () => {
    setup({ values: { ...DEFAULT_VALUES, width: 'fit-content', height: '100px' } })
    let lockBtn = container.querySelector('.cortex-lock-btn') as HTMLButtonElement
    expect(lockBtn).not.toBeNull()
    expect(lockBtn.classList.contains('cortex-lock-btn--disabled')).toBe(true)
    expect(lockBtn.getAttribute('aria-disabled')).toBe('true')
    expect(lockBtn.getAttribute('aria-pressed')).toBe('false')
    expect(lockBtn.getAttribute('data-tooltip')).toBe('Aspect lock requires fixed dimensions')

    lockBtn.click()
    await vi.waitFor(() => {
      lockBtn = container.querySelector('.cortex-lock-btn') as HTMLButtonElement
      expect(lockBtn.getAttribute('aria-pressed')).toBe('false')
    }, { timeout: 500 })
  })

  it('aspect lock active styling drops immediately when dimensions become non-fixed', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, width: '200px', height: '100px' }}
        onChange={onChange}
      />,
      container,
    )

    let lockBtn = container.querySelector('.cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await vi.waitFor(() => {
      lockBtn = container.querySelector('.cortex-lock-btn') as HTMLButtonElement
      expect(lockBtn.getAttribute('aria-pressed')).toBe('true')
    }, { timeout: 500 })

    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, width: 'fit-content', height: '100px' }}
        onChange={onChange}
      />,
      container,
    )

    lockBtn = container.querySelector('.cortex-lock-btn') as HTMLButtonElement
    expect(lockBtn.classList.contains('cortex-lock-btn--active')).toBe(false)
    expect(lockBtn.classList.contains('cortex-lock-btn--disabled')).toBe(true)
    expect(lockBtn.getAttribute('aria-pressed')).toBe('false')
    expect(lockBtn.getAttribute('aria-disabled')).toBe('true')
    expect(lockBtn.getAttribute('data-tooltip')).toBe('Aspect lock requires fixed dimensions')
  })

  it('min-width toggle shows min input and fires property', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(container.querySelector('[data-action="toggle-min"]')).not.toBeNull()
    }, { timeout: 500 })
    const minToggle = container.querySelector('[data-action="toggle-min"]') as HTMLElement
    minToggle.click()
    // Should fire onChange to set min-width to a nonzero value
    expect(onChange).toHaveBeenCalledWith({ property: 'min-width', value: '1px' })
  })

  it('max-width toggle shows max input and fires property', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(container.querySelector('[data-action="toggle-max"]')).not.toBeNull()
    }, { timeout: 500 })
    const maxToggle = container.querySelector('[data-action="toggle-max"]') as HTMLElement
    maxToggle.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'max-width', value: '9999px' })
  })

  // ── REGRESSION TEST: stale widthMode/heightMode ─────────────────
  it('dropdown shows "fill" when values.width=100%, updates to "fixed" on re-render (stale-state fix)', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()

    // First render with width=100%
    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, width: '100%' }}
        onChange={onChange}
      />,
      container,
    )
    const triggers1 = container.querySelectorAll('.cortex-sizing-trigger__label')
    expect(triggers1[0].textContent).toBe('fill')

    // Re-render with width=320px — dropdown must update to "px" (fixed)
    render(
      <SizingControls
        values={{ ...DEFAULT_VALUES, width: '320px' }}
        onChange={onChange}
      />,
      container,
    )
    const triggers2 = container.querySelectorAll('.cortex-sizing-trigger__label')
    expect(triggers2[0].textContent).toBe('px')
  })

  // ── REGRESSION TEST: stale min/max ──────────────────────────────
  it('min-width input visible when values.minWidth is nonzero without toggling', () => {
    setup({ values: { ...DEFAULT_VALUES, minWidth: '100px' } })
    // The min-width input should be rendered because the value is > 0
    expect(container.textContent).toContain('Min')
    const minInput = container.querySelector('[data-tooltip="Min Width"]')
    expect(minInput).not.toBeNull()
  })

  it('max-width input visible when values.maxWidth is not "none" without toggling', () => {
    setup({ values: { ...DEFAULT_VALUES, maxWidth: '500px' } })
    expect(container.textContent).toContain('Max')
    const maxInput = container.querySelector('[data-tooltip="Max Width"]')
    expect(maxInput).not.toBeNull()
  })

  it('handles auto width gracefully — displays 0 and shows "fixed" mode', () => {
    setup({ values: { ...DEFAULT_VALUES, width: 'auto' } })
    const widthInput = container.querySelector('.cortex-numeric-input input') as HTMLInputElement
    expect(widthInput).not.toBeNull()
    // isAutoWidth → value falls back to 0
    expect(widthInput.value).toBe('0')
    // 'auto' is not fit-content or 100%, so mode is 'fixed'
    const modeLabels = container.querySelectorAll('.cortex-sizing-trigger__label')
    expect(modeLabels[0].textContent).toBe('px')
  })

  // ZF0-1478 #4: stale prop must reach ALL 6 NumericInputs (width, height, min-w, max-w, min-h, max-h)
  it('stale=true propagates to all 6 NumericInputs (width, height, min-width, max-width, min-height, max-height)', () => {
    // Render with all min/max constraints active so all 6 inputs are present
    setup({
      stale: true,
      values: {
        ...DEFAULT_VALUES,
        minWidth: '10px',
        maxWidth: '500px',
        minHeight: '10px',
        maxHeight: '500px',
      },
    })
    // All NumericInputs that receive stale=true render the class 'cortex-numeric-input--stale'
    const staleInputs = container.querySelectorAll('.cortex-numeric-input--stale')
    // Expect all 6 (width, height, min-width, max-width, min-height, max-height)
    // Under pre-fix code only 2 (width + height) receive stale, so this must fail.
    expect(staleInputs.length).toBe(6)
  })
})
