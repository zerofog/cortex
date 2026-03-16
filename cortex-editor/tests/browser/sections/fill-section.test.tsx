import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { FillSection, parseFillValues } from '../../../src/browser/components/sections/FillSection.js'
import type { FillValues } from '../../../src/browser/components/sections/FillSection.js'

// Mock @floating-ui/dom for ColorPicker (transitively used by ColorInput)
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('FillSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: FillValues = {
    backgroundColor: 'rgb(59, 130, 246)',
    opacity: 100,
  }

  function setup(overrides?: Partial<Parameters<typeof FillSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <FillSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="fill"', () => {
    setup()
    const root = container.querySelector('[data-section-id="fill"]')
    expect(root).not.toBeNull()
  })

  it('renders a color swatch with the background color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBeTruthy()
  })

  it('renders opacity input showing 100', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const opacityInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('%')
    }) as HTMLInputElement | undefined
    expect(opacityInput).toBeDefined()
    expect(opacityInput!.value).toBe('100')
  })

  it('emits background-color change from color input', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput).not.toBeNull()
    hexInput.dispatchEvent(new Event('focus', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    hexInput.value = '#ff0000'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const calls = onChange.mock.calls
    const bgCall = calls.find((c: any) => c[0]?.property === 'background-color')
    expect(bgCall).toBeDefined()
    expect(bgCall![0].value).toBe('#ff0000')
  })

  it('emits opacity change as decimal string', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, opacity: 100 } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const opacityInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('%')
    }) as HTMLInputElement | undefined
    expect(opacityInput).toBeDefined()
    opacityInput!.focus()
    opacityInput!.value = '50'
    opacityInput!.dispatchEvent(new Event('input', { bubbles: true }))
    opacityInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const opacityCall = calls.find((c: any) => c[0]?.property === 'opacity')
    expect(opacityCall).toBeDefined()
    expect(opacityCall![0].value).toBe('0.5')
  })
})

describe('parseFillValues', () => {
  it('parses background color and opacity', () => {
    const cs = {
      backgroundColor: 'rgb(59, 130, 246)',
      opacity: '0.5',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgb(59, 130, 246)')
    expect(result.opacity).toBe(50)
  })

  it('defaults opacity to 100 when missing', () => {
    const cs = {
      backgroundColor: 'rgb(0, 0, 0)',
      opacity: '',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.opacity).toBe(100)
  })

  it('handles rgba background colors', () => {
    const cs = {
      backgroundColor: 'rgba(255, 0, 0, 0.5)',
      opacity: '1',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgba(255, 0, 0, 0.5)')
    expect(result.opacity).toBe(100)
  })
})
