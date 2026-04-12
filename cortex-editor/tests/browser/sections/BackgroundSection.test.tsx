import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { BackgroundSection } from '../../../src/browser/components/sections/BackgroundSection.js'
import type { BackgroundSectionProps } from '../../../src/browser/components/sections/BackgroundSection.js'

// Mock @floating-ui/dom for ColorPicker (transitively used by ColorInput)
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('BackgroundSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<BackgroundSectionProps>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    const onScrub = vi.fn()
    const onScrubEnd = vi.fn()
    const defaults: BackgroundSectionProps = {
      backgroundColor: 'rgb(59, 130, 246)',
      backgroundToken: null,
      onChange,
      onScrub,
      onScrubEnd,
    }
    render(
      <BackgroundSection {...defaults} {...overrides} />,
      container,
    )
    return { onChange, onScrub, onScrubEnd }
  }

  // Test 1: Renders TokenChip when backgroundToken is provided
  it('renders TokenChip when backgroundToken is provided', () => {
    setup({ backgroundToken: 'bg-blue-500' })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain('bg-blue-500')
  })

  // Test 2: Renders ColorInput when backgroundToken is null
  it('renders ColorInput when backgroundToken is null', () => {
    setup({ backgroundToken: null })
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(59, 130, 246)')
    // TokenChip should NOT be present
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).toBeNull()
  })

  // Test 3: Unlink fires onChange with resolved value
  it('unlink fires onChange with resolved value', () => {
    const { onChange } = setup({
      backgroundColor: 'rgb(59, 130, 246)',
      backgroundToken: 'bg-blue-500',
    })
    const unlinkBtn = container.querySelector('.cortex-token-chip__unlink') as HTMLButtonElement
    expect(unlinkBtn).not.toBeNull()
    unlinkBtn.click()
    expect(onChange).toHaveBeenCalledWith({
      property: 'background-color',
      value: 'rgb(59, 130, 246)',
    })
  })

  // Test 4: ColorInput onChange fires correct property
  it('ColorInput onChange fires correct property', async () => {
    const { onChange } = setup({ backgroundToken: null })
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

  // Test 5: Degrades gracefully with gradient value (no crash, shows ColorInput)
  it('degrades gracefully with gradient background', () => {
    setup({
      backgroundColor: 'linear-gradient(180deg, #ff0000 0%, #0000ff 100%)',
      backgroundToken: null,
    })
    // Should not crash — renders ColorInput (even if gradient can't be fully represented)
    const root = container.querySelector('.cortex-background-section')
    expect(root).not.toBeNull()
    // No TokenChip
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).toBeNull()
  })
})
