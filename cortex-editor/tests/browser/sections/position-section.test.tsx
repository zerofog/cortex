import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PositionSection, parsePositionValues } from '../../../src/browser/components/sections/PositionSection.js'
import type { PositionValues } from '../../../src/browser/components/sections/PositionSection.js'

// Mock @floating-ui/dom — PositionSection now hosts a PositionDropdown
// whose popover opens via computePosition. happy-dom has no layout
// engine, so we stub the positioning API the same way Dropdown-family
// tests do. The popover DOM is gated on isOpen state, not on position
// resolution, so the mock only prevents spurious warn() logs.
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('PositionSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: PositionValues = {
    position: 'static',
    left: 'auto',
    top: 'auto',
    zIndex: 'auto',
    rotate: 'none',
    scaleX: '1',
    scaleY: '1',
  }

  function setup(overrides?: Partial<Parameters<typeof PositionSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <PositionSection
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('parsePositionValues parses basic computed styles', () => {
    const cs = {
      position: 'relative',
      left: '8px',
      top: '16px',
      zIndex: '5',
      rotate: '45deg',
      scale: '-1 1',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'relative',
      left: '8px',
      top: '16px',
      zIndex: '5',
      rotate: '45deg',
      scaleX: '-1',
      scaleY: '1',
    })
  })

  it('parsePositionValues handles defaults when properties are missing', () => {
    const cs = {} as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'static',
      left: 'auto',
      top: 'auto',
      zIndex: 'auto',
      rotate: 'none',
      scaleX: '1',
      scaleY: '1',
    })
  })

  it('parsePositionValues handles single-value scale (uniform)', () => {
    const cs = {
      position: 'static',
      left: 'auto',
      top: 'auto',
      zIndex: 'auto',
      rotate: 'none',
      scale: '2',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result.scaleX).toBe('2')
    expect(result.scaleY).toBe('2')
  })

  it('shows absolute as the selected option label for position:absolute', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'absolute' } })
    const triggerLabel = container.querySelector(
      '.cortex-position-dropdown__trigger-label',
    )
    expect(triggerLabel).not.toBeNull()
    expect(triggerLabel!.textContent).toBe('Absolute')
  })

  it('emits position change when selecting a new mode from the dropdown', async () => {
    const { onChange } = setup()
    const trigger = container.querySelector(
      '.cortex-position-dropdown__trigger',
    ) as HTMLButtonElement
    expect(trigger).not.toBeNull()
    trigger.click()
    await new Promise((r) => setTimeout(r, 10))
    const absOption = container.querySelector(
      '#cortex-position-opt-absolute',
    ) as HTMLElement
    expect(absOption).not.toBeNull()
    absOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'position', value: 'absolute' })
  })

  it('emits left change on X input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', left: '8px', top: '0px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const xInput = inputs[0] as HTMLInputElement
    expect(xInput).toBeDefined()
    xInput.focus()
    xInput.value = '20'
    xInput.dispatchEvent(new Event('input', { bubbles: true }))
    xInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'left')
    expect(leftCall).toBeDefined()
    expect(leftCall![0].value).toBe('20px')
  })

  it('emits z-index change (no px suffix)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', zIndex: '5' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Z is the 3rd numeric input (after X and Y)
    const zInput = inputs[2] as HTMLInputElement
    expect(zInput).toBeDefined()
    zInput.focus()
    zInput.value = '10'
    zInput.dispatchEvent(new Event('input', { bubbles: true }))
    zInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const zCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'z-index')
    expect(zCall).toBeDefined()
    expect(zCall![0].value).toBe('10')
  })

  it('dims X/Y when position is static', () => {
    setup()
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow).not.toBeNull()
    expect(xyRow!.classList.contains('cortex-position-section__xy-row--disabled')).toBe(true)
  })

  it('emits rotate change', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', rotate: '0deg' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Rotation is the 4th numeric input (after X, Y, Z)
    const rotInput = inputs[3] as HTMLInputElement
    expect(rotInput).toBeDefined()
    rotInput.focus()
    rotInput.value = '90'
    rotInput.dispatchEvent(new Event('input', { bubbles: true }))
    rotInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const rotCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'rotate')
    expect(rotCall).toBeDefined()
    expect(rotCall![0].value).toBe('90deg')
  })

  it('rotate 90 button increments by 90', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, rotate: '45deg' } })
    const rotateBtn = container.querySelector('[data-tooltip="Rotate 90°"]') as HTMLElement
    expect(rotateBtn).not.toBeNull()
    rotateBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'rotate', value: '135deg' })
  })

  it('rotate 90 wraps at 360', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, rotate: '315deg' } })
    const rotateBtn = container.querySelector('[data-tooltip="Rotate 90°"]') as HTMLElement
    rotateBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'rotate', value: '45deg' })
  })

  it('flip H toggle emits scale: -1 1', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '1', scaleY: '1' } })
    const flipH = container.querySelector('[data-tooltip="Flip horizontal"]') as HTMLElement
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '-1 1' })
  })

  it('flip H toggle off emits scale: 1 1', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipH = container.querySelector('[data-tooltip="Flip horizontal"]') as HTMLElement
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '1 1' })
  })

  it('flip V preserves existing flip H state', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipV = container.querySelector('[data-tooltip="Flip vertical"]') as HTMLElement
    flipV.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '-1 -1' })
  })

  it('flip H shows active style when scaleX is -1', () => {
    setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipH = container.querySelector('[data-tooltip="Flip horizontal"]') as HTMLElement
    expect(flipH.classList.contains('cortex-position-section__toggle--active')).toBe(true)
  })

  it('flip buttons have aria-pressed', () => {
    setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipH = container.querySelector('[data-tooltip="Flip horizontal"]') as HTMLElement
    const flipV = container.querySelector('[data-tooltip="Flip vertical"]') as HTMLElement
    expect(flipH.getAttribute('aria-pressed')).toBe('true')
    expect(flipV.getAttribute('aria-pressed')).toBe('false')
  })
})
