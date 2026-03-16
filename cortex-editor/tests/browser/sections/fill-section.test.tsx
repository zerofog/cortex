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
})

describe('parseFillValues', () => {
  it('parses background color', () => {
    const cs = {
      backgroundColor: 'rgb(59, 130, 246)',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('handles rgba background colors', () => {
    const cs = {
      backgroundColor: 'rgba(255, 0, 0, 0.5)',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('defaults to transparent when missing', () => {
    const cs = {} as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })
})
