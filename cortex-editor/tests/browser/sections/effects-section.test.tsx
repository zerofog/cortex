import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { EffectsSection, parseEffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'
import type { EffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'

// Mock @floating-ui/dom for Dropdown
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('parseEffectsValues', () => {
  it('parses opacity as percentage (0.75 -> 75)', () => {
    const cs = {
      opacity: '0.75',
      overflow: 'visible',
      cursor: 'auto',
      filter: '',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.opacity).toBe(75)
  })

  it('extracts blur from filter "blur(4px)" -> blur: 4', () => {
    const cs = {
      opacity: '1',
      overflow: 'visible',
      cursor: 'auto',
      filter: 'blur(4px)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(4)
  })

  it('extracts backdrop-blur from backdropFilter "blur(8px)" -> backdropBlur: 8', () => {
    const cs = {
      opacity: '1',
      overflow: 'visible',
      cursor: 'auto',
      filter: '',
      backdropFilter: 'blur(8px)',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.backdropBlur).toBe(8)
  })

  it('defaults blur to 0 when filter has no blur (e.g., "grayscale(100%)")', () => {
    const cs = {
      opacity: '1',
      overflow: 'visible',
      cursor: 'auto',
      filter: 'grayscale(100%)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(0)
  })

  it('defaults opacity to 100 when missing', () => {
    const cs = {
      opacity: '',
      overflow: 'visible',
      cursor: 'auto',
      filter: '',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.opacity).toBe(100)
  })

  it('handles combined filter values "blur(4px) grayscale(50%)" -> blur: 4', () => {
    const cs = {
      opacity: '1',
      overflow: 'visible',
      cursor: 'auto',
      filter: 'blur(4px) grayscale(50%)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(4)
  })
})

describe('EffectsSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: EffectsValues = {
    opacity: 75,
    overflow: 'visible',
    cursor: 'auto',
    blur: 4,
    backdropBlur: 0,
  }

  function setup(overrides?: Partial<Parameters<typeof EffectsSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <EffectsSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="effects"', () => {
    setup()
    const root = container.querySelector('[data-section-id="effects"]')
    expect(root).not.toBeNull()
  })

  it('renders opacity input (label "OP", unit "%")', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const opacityInput = Array.from(inputs).find((el) =>
      el.textContent?.includes('OP') && el.textContent?.includes('%'),
    )
    expect(opacityInput).toBeDefined()
    const input = opacityInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('75')
  })

  it('renders overflow segmented control (visible/hidden/scroll/auto)', () => {
    setup()
    expect(container.textContent).toContain('Overflow')
    const groups = container.querySelectorAll('[role="radiogroup"]')
    expect(groups.length).toBeGreaterThanOrEqual(1)
    // Check all four overflow options exist
    const overflowGroup = groups[0]
    expect(overflowGroup.querySelector('[data-value="visible"]')).not.toBeNull()
    expect(overflowGroup.querySelector('[data-value="hidden"]')).not.toBeNull()
    expect(overflowGroup.querySelector('[data-value="scroll"]')).not.toBeNull()
    expect(overflowGroup.querySelector('[data-value="auto"]')).not.toBeNull()
  })

  it('renders cursor dropdown', () => {
    setup()
    expect(container.textContent).toContain('Cursor')
    const trigger = container.querySelector('.cortex-dropdown__trigger')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('auto')
  })

  it('renders blur input (label for "Blur")', () => {
    setup()
    expect(container.textContent).toContain('Blur')
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const blurInput = Array.from(inputs).find((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent === 'BL'
    })
    expect(blurInput).toBeDefined()
    const input = blurInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('4')
  })

  it('renders backdrop blur input (label for "BG Blur")', () => {
    setup()
    expect(container.textContent).toContain('BG Blur')
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const bgBlurInput = Array.from(inputs).find((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent === 'BG'
    })
    expect(bgBlurInput).toBeDefined()
    const input = bgBlurInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('0')
  })
})
