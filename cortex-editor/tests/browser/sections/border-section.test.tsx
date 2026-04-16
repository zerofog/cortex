import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { BorderSection, parseBorderValues, summarizeBorder } from '../../../src/browser/components/sections/BorderSection.js'
import type { BorderValues } from '../../../src/browser/components/sections/BorderSection.js'

// Mock @floating-ui/dom
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('BorderSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: BorderValues = {
    borderWidth: 1,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgb(0, 0, 0)',
    borderOpacity: 100,
    visible: true,
  }

  function setup(overrides?: Partial<Parameters<typeof BorderSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <BorderSection
        values={DEFAULT_VALUES}
        borderToken={null}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="border"', () => {
    setup()
    const root = container.querySelector('[data-section-id="border"]')
    expect(root).not.toBeNull()
  })

  it('renders border width input with SquareDashed prefix', () => {
    setup()
    // The width row has a NumericInput with a prefix (SVG icon)
    // With per-side collapsed: 2 prefixes — SquareDashed on the width row
    // + Eclipse on the opacity NumericInput inside ColorInput's color row.
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    expect(prefixes.length).toBe(2)
    // The prefix should contain an SVG (SquareDashed icon)
    const svg = prefixes[0]?.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders border color swatch when no token', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch')
    expect(swatch).not.toBeNull()
  })

  it('renders TokenChip when borderToken is provided', () => {
    setup({ borderToken: 'border-blue-500' })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    // No color swatch when token is present
    const swatch = container.querySelector('.cortex-color-input__swatch')
    expect(swatch).toBeNull()
  })

  it('eye toggle snapshots widths and fires border-style hidden when visible', () => {
    // CSS spec §8.5.3 zeroes getComputedStyle(el).borderWidth whenever
    // border-style is 'none' or 'hidden'. That would make a user-hidden
    // border summarize as 'none' and unmount the whole section — "hide"
    // becomes indistinguishable from "delete". The handler's remedy is to
    // snapshot all 5 width properties into the override manager BEFORE
    // flipping style to 'hidden', so Panel's useMemo can recover them from
    // the override store regardless of the spec-mandated zeroing.
    // Regression guard: asserts the snapshot calls fire in addition to the
    // style call. One test covers both the contract (6 total calls, all
    // 5 widths + style) and the correct values.
    const { onChange } = setup({
      values: {
        ...DEFAULT_VALUES,
        borderWidth: 2,
        borderTopWidth: 2,
        borderRightWidth: 3,
        borderBottomWidth: 4,
        borderLeftWidth: 5,
        visible: true,
      },
    })
    const eyeBtn = container.querySelector('[aria-label="Hide border"]') as HTMLButtonElement
    expect(eyeBtn).not.toBeNull()
    eyeBtn.click()
    expect(onChange).toHaveBeenCalledTimes(6)
    expect(onChange).toHaveBeenCalledWith({ property: 'border-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-top-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-right-width', value: '3px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-bottom-width', value: '4px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-left-width', value: '5px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-style', value: 'hidden' })
  })

  it('eye toggle fires ONLY border-style solid when re-showing a hidden border', () => {
    // The snapshot was already written on the hide cycle; re-show only
    // needs to flip style back. Falsifiability: asserting `toHaveBeenCalledTimes(1)`
    // would fail if a future refactor accidentally re-snapshots on show.
    const { onChange } = setup({
      values: { ...DEFAULT_VALUES, visible: false, borderStyle: 'hidden' },
    })
    const eyeBtn = container.querySelector('[aria-label="Show border"]') as HTMLButtonElement
    expect(eyeBtn).not.toBeNull()
    eyeBtn.click()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ property: 'border-style', value: 'solid' })
  })

  it('uniform width onChange fires all 5 width properties (shorthand + 4 per-side)', () => {
    // The uniform handler writes all 5 so the shorthand doesn't lose the CSS
    // cascade to orphan per-side overrides in the override manager's Map.
    // Regression guard: a handler that only writes the shorthand would pass
    // toHaveBeenCalledWith for 'border-width' but fail toHaveBeenCalledTimes.
    const { onChange } = setup()
    const widthRow = container.querySelector('.cortex-border-section__width-row')
    expect(widthRow).not.toBeNull()
    const input = widthRow!.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.focus()
    input.value = '2'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(5)
    expect(onChange).toHaveBeenCalledWith({ property: 'border-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-top-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-right-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-bottom-width', value: '2px' })
    expect(onChange).toHaveBeenCalledWith({ property: 'border-left-width', value: '2px' })
  })

  it('per-side expand toggles individual width inputs', async () => {
    setup()
    // Initially no per-side grid
    expect(container.querySelector('.cortex-border-section__per-side')).toBeNull()

    // Click the expand button
    const expandBtn = container.querySelector('[aria-label="Expand per-side widths"]') as HTMLButtonElement
    expect(expandBtn).not.toBeNull()
    expandBtn.click()
    // Preact state flush is async via setTimeout(0) — give it a tick.
    await new Promise((r) => setTimeout(r, 10))

    // Now per-side grid should be visible with 4 inputs
    const perSide = container.querySelector('.cortex-border-section__per-side')
    expect(perSide).not.toBeNull()
    const inputs = perSide!.querySelectorAll('input')
    expect(inputs.length).toBe(4)
  })

  it('per-side T input fires border-top-width', async () => {
    const { onChange } = setup()
    // Open per-side
    const expandBtn = container.querySelector('[aria-label="Expand per-side widths"]') as HTMLButtonElement
    expandBtn.click()
    await new Promise((r) => setTimeout(r, 10))

    // The T/R/B/L text labels were replaced by prefix icons; locate the top
    // input via its data-tooltip (which NumericInput emits on the wrapper
    // verbatim from the `tooltip` prop) instead of textual label matching.
    const topWrapper = container.querySelector('[data-tooltip="Border Top Width"]')
    expect(topWrapper).not.toBeNull()
    const topInput = topWrapper!.querySelector('input') as HTMLInputElement
    topInput.focus()
    topInput.value = '3'
    topInput.dispatchEvent(new Event('input', { bubbles: true }))
    topInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ property: 'border-top-width', value: '3px' })
  })

  it('per-side inputs render hand-drawn side icons in the prefix slot', async () => {
    setup()
    const expandBtn = container.querySelector('[aria-label="Expand per-side widths"]') as HTMLButtonElement
    expandBtn.click()
    await new Promise((r) => setTimeout(r, 10))

    // Every per-side input has a prefix <svg> (SquareSideTop/Right/Bottom/Left),
    // and none of them carry a textual label any more. Falsifiability check:
    // if the icons were accidentally reverted to T/R/B/L text labels, the
    // label-node query below would find 4 and fail.
    const perSide = container.querySelector('.cortex-border-section__per-side')!
    const prefixes = perSide.querySelectorAll('.cortex-numeric-input__prefix svg')
    expect(prefixes.length).toBe(4)
    const labels = perSide.querySelectorAll('.cortex-numeric-input__label')
    expect(labels.length).toBe(0)
  })

  it('uniform width shows indeterminate when per-side widths diverge', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        borderWidth: 5,
        borderTopWidth: 5,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
      },
    })
    const widthRow = container.querySelector('.cortex-border-section__width-row')!
    const numericInput = widthRow.querySelector('.cortex-numeric-input')!
    expect(numericInput.classList.contains('cortex-numeric-input--mixed')).toBe(true)
    const input = widthRow.querySelector('input') as HTMLInputElement
    expect(input.placeholder).toBe('--')
  })

  it('uniform width does NOT show indeterminate when all sides match', () => {
    setup() // DEFAULT_VALUES: all 4 sides = 1
    const widthRow = container.querySelector('.cortex-border-section__width-row')!
    const numericInput = widthRow.querySelector('.cortex-numeric-input')!
    expect(numericInput.classList.contains('cortex-numeric-input--mixed')).toBe(false)
  })

  it('does not render the minus button when onRemove is omitted', () => {
    setup() // no onRemove
    const minusBtn = container.querySelector('[aria-label="Remove border"]')
    expect(minusBtn).toBeNull()
  })

  it('renders the minus button when onRemove is provided', () => {
    const onRemove = vi.fn()
    setup({ onRemove })
    const minusBtn = container.querySelector('[aria-label="Remove border"]')
    expect(minusBtn).not.toBeNull()
  })

  it('fires onRemove when the minus button is clicked', () => {
    const onRemove = vi.fn()
    setup({ onRemove })
    const minusBtn = container.querySelector('[aria-label="Remove border"]') as HTMLButtonElement
    minusBtn.click()
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('renders the minus button alongside the eye in TokenChip mode too', () => {
    const onRemove = vi.fn()
    setup({ borderToken: 'border-blue-500', onRemove })
    const eyeBtn = container.querySelector('[aria-label="Hide border"]')
    const minusBtn = container.querySelector('[aria-label="Remove border"]')
    expect(eyeBtn).not.toBeNull()
    expect(minusBtn).not.toBeNull()
  })

  describe('parseBorderValues', () => {
    it('parses border properties from computed style', () => {
      const cs = {
        borderWidth: '2px',
        borderTopWidth: '2px',
        borderRightWidth: '2px',
        borderBottomWidth: '2px',
        borderLeftWidth: '2px',
        borderStyle: 'dashed',
        borderColor: 'rgb(255, 0, 0)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(2)
      expect(result.borderTopWidth).toBe(2)
      expect(result.borderRightWidth).toBe(2)
      expect(result.borderBottomWidth).toBe(2)
      expect(result.borderLeftWidth).toBe(2)
      expect(result.borderStyle).toBe('dashed')
      expect(result.borderColor).toBe('rgb(255, 0, 0)')
      expect(result.borderOpacity).toBe(100)
      expect(result.visible).toBe(true)
    })

    it('defaults to none style and 0 width', () => {
      const cs = {} as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(0)
      expect(result.borderStyle).toBe('none')
      expect(result.visible).toBe(false)
    })

    it('returns visible=false when borderStyle is hidden (eye-toggled off)', () => {
      // `hidden` is the style the eye toggle writes when the user hides a
      // border that still exists. parseBorderValues must treat it as
      // non-visible just like `none`, so the eye icon flips to EyeClosed.
      const cs = {
        borderWidth: '2px',
        borderTopWidth: '2px',
        borderRightWidth: '2px',
        borderBottomWidth: '2px',
        borderLeftWidth: '2px',
        borderStyle: 'hidden',
        borderColor: 'rgb(0, 0, 0)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.visible).toBe(false)
      // Note: in production, CSS spec §8.5.3 zeroes computed width when style
      // is hidden. Panel.tsx's post-process recovers it from the override manager.
      // This unit test bypasses that zeroing because the mock supplies borderWidth
      // directly. The parser correctly reads whatever the mock provides.
      expect(result.borderWidth).toBe(2)
    })

    it('does not return borderRadius (moved to AppearanceSection)', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgb(0, 0, 0)',
        borderRadius: '8px',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result).not.toHaveProperty('borderRadius')
      expect(result).not.toHaveProperty('borderTopLeftRadius')
      expect(result).not.toHaveProperty('borderTopRightRadius')
      expect(result).not.toHaveProperty('borderBottomRightRadius')
      expect(result).not.toHaveProperty('borderBottomLeftRadius')
    })

    it('parses opacity from rgba border-color', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(0, 0, 0, 0.5)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderOpacity).toBe(50)
    })

    it('parses per-side widths individually', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '2px',
        borderBottomWidth: '3px',
        borderLeftWidth: '4px',
        borderStyle: 'solid',
        borderColor: 'rgb(0, 0, 0)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderTopWidth).toBe(1)
      expect(result.borderRightWidth).toBe(2)
      expect(result.borderBottomWidth).toBe(3)
      expect(result.borderLeftWidth).toBe(4)
    })
  })
})

describe('summarizeBorder', () => {
  it('returns "none" for no border', () => {
    expect(summarizeBorder({
      borderWidth: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderStyle: 'none', borderColor: '#000', borderOpacity: 100, visible: false,
    })).toBe('none')
  })

  it('returns width and style for visible border', () => {
    expect(summarizeBorder({
      borderWidth: 2, borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
      borderStyle: 'solid', borderColor: '#000', borderOpacity: 100, visible: true,
    })).toBe('2px solid')
  })

  it('returns "none" when width is 0 even if style is set', () => {
    expect(summarizeBorder({
      borderWidth: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderStyle: 'solid', borderColor: '#000', borderOpacity: 100, visible: true,
    })).toBe('none')
  })

  it('returns "hidden" (not "none") when border-style is hidden — even though CSS spec zeroes width', () => {
    // CSS spec §8.5.3 zeroes computed border-width when border-style is
    // 'hidden'. That means parseBorderValues sees borderWidth=0. Without
    // checking style first, summarizeBorder would return 'none' and the
    // section would collapse — making "hide" indistinguishable from
    // "delete". The fix: `border-style: hidden` is its own existence
    // signal, independent of width.
    expect(summarizeBorder({
      borderWidth: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderStyle: 'hidden', borderColor: '#000', borderOpacity: 100, visible: false,
    })).toBe('hidden')
  })
})
