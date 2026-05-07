import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { ColorInput, rgbToHex, parseColor, formatColor } from '../../../src/browser/components/controls/ColorInput.js'

/** Yield one macrotask so Preact state updates flush between events. */
const flush = () => new Promise<void>(r => setTimeout(r, 0))
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const stylesPath = resolve(__dirname, '../../../src/browser/styles.css')

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

  it('styles the editable color swatch at 20px with a visible token border', () => {
    const css = readFileSync(stylesPath, 'utf8')
    const swatchRule = css.match(/(?:^|\n)\.cortex-color-input__swatch\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(swatchRule).toContain('width: 20px')
    expect(swatchRule).toContain('height: 20px')
    expect(swatchRule).toContain('border: 1px solid var(--cx-rule)')
  })

  it('renders hex input showing converted hex value', () => {
    setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex).not.toBeNull()
    expect(hex.value).toBe('#3b82f6')
  })

  it('labels the text field for any editable color value', () => {
    setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.getAttribute('aria-label')).toBe('Color value')
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
    await flush()
    hex.value = '#ff0000'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    }, { timeout: 500 })
  })

  it('commits typed rgb() as a canonical hex color on blur', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'rgb(255, 0, 0)'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    }, { timeout: 500 })
  })

  it('commits typed rgba() without dropping alpha', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'rgba(255, 0, 0, 0.5)'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)')
    }, { timeout: 500 })
  })

  it.each([
    'rgba(255, 0, 0, .)',
    'rgba(255, 0, 0, 1..2)',
    'hsl(1..2, 50%, 50%)',
  ])('rejects malformed numeric CSS color tokens: %s', async (typedColor) => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = typedColor
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('notifies split alpha callers before committing typed embedded opacity', async () => {
    const onAlphaChange = vi.fn()
    const { onChange } = setup({ value: '#0000ff', alpha: 100, onAlphaChange })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'rgba(255, 0, 0, 0.5)'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onAlphaChange).toHaveBeenCalledWith(50)
      expect(onChange).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)')
    }, { timeout: 500 })
    expect(onAlphaChange.mock.invocationCallOrder[0]).toBeLessThan(onChange.mock.invocationCallOrder[0])
  })

  it('commits typed modern rgb() percentage alpha', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'rgb(255 0 0 / 50%)'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)')
    }, { timeout: 500 })
  })

  it('commits typed oklch() alpha', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'oklch(0% 0 0 / 50%)'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('rgba(0, 0, 0, 0.5)')
    }, { timeout: 500 })
  })

  it('preserves current alpha when typed color omits alpha', async () => {
    const { onChange } = setup({ value: 'rgba(0, 0, 255, 0.5)' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = '#ff0000'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)')
    }, { timeout: 500 })
  })

  it('commits typed named colors on blur', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'red'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    }, { timeout: 500 })
  })

  it('does not commit invalid hex on blur', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'notahex'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not convert context-dependent CSS keywords into a fixed color', async () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = 'currentColor'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows Mixed without revealing the selected color while idle', () => {
    setup({ mixed: true, value: '#ff0000' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('')
    expect(hex.placeholder).toBe('Mixed')
  })

  it('shows Mixed in opacity when the color value is mixed', () => {
    setup({
      mixed: true,
      value: 'rgba(255, 0, 0, 0.5)',
      alpha: 50,
      onAlphaChange: vi.fn(),
    })
    const opacity = container.querySelector('.cortex-color-input__opacity input') as HTMLInputElement
    expect(opacity.value).toBe('')
    expect(opacity.placeholder).toBe('Mixed')
  })

  it('commits a plain typed color as full opacity while mixed', async () => {
    const onAlphaChange = vi.fn()
    const { onChange } = setup({
      mixed: true,
      value: 'rgba(0, 0, 255, 0.5)',
      alpha: 50,
      onAlphaChange,
    })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = '#ff0000'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
      expect(onAlphaChange).toHaveBeenCalledWith(100)
    }, { timeout: 500 })
    expect(onAlphaChange.mock.invocationCallOrder[0]).toBeLessThan(onChange.mock.invocationCallOrder[0])
  })

  it('commits the typed representative color while mixed', async () => {
    const { onChange } = setup({ mixed: true, value: '#ff0000' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    hex.value = '#ff0000'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    }, { timeout: 500 })
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

  it('lowercases hex', () => {
    expect(rgbToHex('#FF0000')).toBe('#ff0000')
  })

  it('handles rgba', () => {
    expect(rgbToHex('rgba(59, 130, 246, 0.5)')).toBe('#3b82f6')
  })

  it('returns #000000 for unparseable', () => {
    expect(rgbToHex('transparent')).toBe('#000000')
    expect(rgbToHex('not-a-color')).toBe('#000000')
  })

  it('converts hsl() to hex', () => {
    expect(rgbToHex('hsl(200, 50%, 50%)')).toBe('#4095bf')
    expect(rgbToHex('hsl(0, 100%, 50%)')).toBe('#ff0000')
    expect(rgbToHex('hsl(0, 0%, 50%)')).toBe('#808080')
  })

  it('converts hsl edge cases', () => {
    expect(rgbToHex('hsl(360, 100%, 50%)')).toBe('#ff0000')  // h=360 wraps to h=0
    expect(rgbToHex('hsl(0, 0%, 0%)')).toBe('#000000')       // l=0 = black
    expect(rgbToHex('hsl(0, 0%, 100%)')).toBe('#ffffff')      // l=1 = white
    expect(rgbToHex('hsl(0, 100%, 0%)')).toBe('#000000')      // l=0 trumps saturation
    expect(rgbToHex('hsl(120, 100%, 50%)')).toBe('#00ff00')   // pure green
  })

  it('converts oklch() to hex', () => {
    expect(rgbToHex('oklch(0% 0 0)')).toBe('#000000')
    expect(rgbToHex('oklch(100% 0 0)')).toBe('#ffffff')
  })

  it('expands 3-digit hex', () => {
    expect(rgbToHex('#f00')).toBe('#ff0000')
    expect(rgbToHex('#abc')).toBe('#aabbcc')
  })

  it('handles space-separated rgb (modern syntax)', () => {
    expect(rgbToHex('rgb(59 130 246)')).toBe('#3b82f6')
  })

  it('handles decimal channel values with rounding', () => {
    expect(rgbToHex('rgb(59.4, 130.6, 246.1)')).toBe('#3b83f6')
  })

  it('clamps out-of-range values', () => {
    expect(rgbToHex('rgb(300, -10, 128)')).toBe('#ff0080')
  })
})

describe('parseColor', () => {
  it('parses 6-digit hex as full opacity', () => {
    expect(parseColor('#3b82f6')).toEqual({ hex: '#3b82f6', alpha: 100 })
  })

  it('parses 8-digit hex with alpha', () => {
    expect(parseColor('#3b82f680')).toEqual({ hex: '#3b82f6', alpha: 50 })
  })

  it('parses 8-digit hex fully opaque', () => {
    expect(parseColor('#3b82f6ff')).toEqual({ hex: '#3b82f6', alpha: 100 })
  })

  it('parses 8-digit hex fully transparent', () => {
    expect(parseColor('#3b82f600')).toEqual({ hex: '#3b82f6', alpha: 0 })
  })

  it('parses rgba with decimal alpha', () => {
    expect(parseColor('rgba(59, 130, 246, 0.5)')).toEqual({ hex: '#3b82f6', alpha: 50 })
  })

  it('parses rgba with alpha = 1', () => {
    expect(parseColor('rgba(59, 130, 246, 1)')).toEqual({ hex: '#3b82f6', alpha: 100 })
  })

  it('parses rgba with alpha = 0', () => {
    expect(parseColor('rgba(59, 130, 246, 0)')).toEqual({ hex: '#3b82f6', alpha: 0 })
  })

  it('parses rgba with space-separated syntax', () => {
    expect(parseColor('rgba(59 130 246 / 0.75)')).toEqual({ hex: '#3b82f6', alpha: 75 })
  })

  it('parses rgba with percentage alpha', () => {
    expect(parseColor('rgba(59 130 246 / 75%)')).toEqual({ hex: '#3b82f6', alpha: 75 })
  })

  it('parses transparent', () => {
    expect(parseColor('transparent')).toEqual({ hex: '#000000', alpha: 0 })
  })

  it('parses rgb (no alpha) as full opacity', () => {
    expect(parseColor('rgb(59, 130, 246)')).toEqual({ hex: '#3b82f6', alpha: 100 })
  })

  it('parses 3-digit hex as full opacity', () => {
    expect(parseColor('#f00')).toEqual({ hex: '#ff0000', alpha: 100 })
  })

  it('handles unparseable as black full opacity', () => {
    expect(parseColor('invalid')).toEqual({ hex: '#000000', alpha: 100 })
  })
})

describe('formatColor', () => {
  it.each([
    [50, '#3b82f6', 'rgba(59, 130, 246, 0.5)'],
    [0, '#3b82f6', 'rgba(59, 130, 246, 0)'],
    [75, '#ff0000', 'rgba(255, 0, 0, 0.75)'],
  ])('returns rgba when alpha=%i', (alpha, hex, expected) => {
    expect(formatColor(hex, alpha)).toBe(expected)
  })

  it('returns hex for alpha >= 100', () => {
    expect(formatColor('#3b82f6', 100)).toBe('#3b82f6')
    expect(formatColor('#3b82f6', 101)).toBe('#3b82f6')
  })
})
