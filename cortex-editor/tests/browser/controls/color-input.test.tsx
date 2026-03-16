import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ColorInput, rgbToHex } from '../../../src/browser/components/controls/ColorInput.js'

describe('ColorInput', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof ColorInput>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <ColorInput value="rgb(59, 130, 246)" onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('renders a color swatch with the correct background', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('renders hex input showing converted hex value', () => {
    setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex).not.toBeNull()
    expect(hex.value).toBe('#3b82f6')
  })

  it('converts rgb to hex correctly', () => {
    setup({ value: 'rgb(0, 0, 0)' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#000000')
  })

  it('handles already-hex values', () => {
    setup({ value: '#ff0000' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#ff0000')
  })

  it('commits valid hex on blur', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    hex.value = '#ff0000'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledWith('#ff0000')
  })

  it('does not commit invalid hex on blur', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    hex.value = 'notahex'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('falls back to #000000 for unparseable colors', () => {
    setup({ value: 'transparent' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#000000')
  })
})

describe('rgbToHex', () => {
  it('converts rgb(0, 0, 0) to #000000', () => {
    expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000')
  })

  it('converts rgb(255, 255, 255) to #ffffff', () => {
    expect(rgbToHex('rgb(255, 255, 255)')).toBe('#ffffff')
  })

  it('passes through valid hex', () => {
    expect(rgbToHex('#3b82f6')).toBe('#3b82f6')
  })

  it('lowercases hex', () => {
    expect(rgbToHex('#FF0000')).toBe('#ff0000')
  })

  it('handles rgba', () => {
    expect(rgbToHex('rgba(59, 130, 246, 0.5)')).toBe('#3b82f6')
  })

  it('returns #000000 for unparseable', () => {
    expect(rgbToHex('transparent')).toBe('#000000')
    expect(rgbToHex('hsl(200, 50%, 50%)')).toBe('#000000')
  })
})
