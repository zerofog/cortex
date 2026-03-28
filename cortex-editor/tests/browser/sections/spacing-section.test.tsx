import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SpacingSection } from '../../../src/browser/components/sections/SpacingSection.js'

describe('SpacingSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof SpacingSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SpacingSection
        padding={{ top: 8, right: 16, bottom: 8, left: 16 }}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        gap={{ row: 12, column: 12 }}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('renders padding section with values', () => {
    setup()
    expect(container.textContent).toContain('Padding')
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('renders margin section', () => {
    setup()
    expect(container.textContent).toContain('Margin')
  })

  it('renders gap section', () => {
    setup()
    expect(container.textContent).toContain('Gap')
  })

  it('starts in 2-axis mode showing horizontal/vertical', () => {
    setup({ padding: { top: 8, right: 8, bottom: 8, left: 8 } })
    const paddingSection = container.querySelector('[data-section="padding"]')
    expect(paddingSection).not.toBeNull()
  })

  it('renders lock toggle in locked state by default', () => {
    setup({ padding: { top: 16, right: 16, bottom: 16, left: 16 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const lockBtn = paddingSection.querySelector('.cortex-lock-btn') as HTMLButtonElement
    expect(lockBtn).not.toBeNull()
    expect(lockBtn.getAttribute('aria-pressed')).toBe('true')
    expect(lockBtn.getAttribute('data-tooltip')).toBe('Unlock axes')
  })

  it('toggles to unlocked state on click', async () => {
    setup({ padding: { top: 16, right: 16, bottom: 16, left: 16 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const lockBtn = paddingSection.querySelector('.cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(lockBtn.getAttribute('aria-pressed')).toBe('false')
    expect(lockBtn.getAttribute('data-tooltip')).toBe('Lock axes')
    expect(lockBtn.classList.contains('cortex-lock-btn--active')).toBe(false)
  })

  it('syncs axes when locked — changing horizontal updates vertical', async () => {
    const { onChange } = setup({ padding: { top: 16, right: 16, bottom: 16, left: 16 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input') as NodeListOf<HTMLInputElement>
    // First input is horizontal (↔)
    inputs[0].focus()
    inputs[0].value = '24'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    // Should emit changes for all 4 sides
    const properties = onChange.mock.calls.map((call: any[]) => call[0].property)
    expect(properties).toContain('padding-left')
    expect(properties).toContain('padding-right')
    expect(properties).toContain('padding-top')
    expect(properties).toContain('padding-bottom')
  })

  it('does not sync axes when unlocked', async () => {
    const { onChange } = setup({ padding: { top: 16, right: 16, bottom: 16, left: 16 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const lockBtn = paddingSection.querySelector('.cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await new Promise(r => setTimeout(r, 10))
    onChange.mockClear()
    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input') as NodeListOf<HTMLInputElement>
    inputs[0].focus()
    inputs[0].value = '24'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const properties = onChange.mock.calls.map((call: any[]) => call[0].property)
    expect(properties).toContain('padding-left')
    expect(properties).toContain('padding-right')
    expect(properties).not.toContain('padding-top')
    expect(properties).not.toContain('padding-bottom')
  })

  it('toggles to 4-sided mode via expand button', async () => {
    setup()
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const expandBtn = paddingSection.querySelector('.cortex-spacing-group__toggle') as HTMLButtonElement
    expect(expandBtn).not.toBeNull()
    expandBtn.click()
    await new Promise(r => setTimeout(r, 10))
    const labels = paddingSection.querySelectorAll('.cortex-numeric-input__label')
    const labelTexts = Array.from(labels).map(l => l.textContent)
    expect(labelTexts).toEqual(['T', 'R', 'B', 'L'])
  })

  it('starts in 2-axis mode with expand toggle and lock toggle', () => {
    setup()
    const paddingSection = container.querySelector('[data-section="padding"]')!
    expect(paddingSection.querySelector('.cortex-spacing-group__toggle')).not.toBeNull()
    expect(paddingSection.querySelector('.cortex-lock-btn')).not.toBeNull()
    expect(paddingSection.querySelector('.cortex-spacing-group__grid')).toBeNull()
  })

  it('hides gap section when isFlexOrGrid is false', () => {
    setup({ isFlexOrGrid: false })
    expect(container.textContent).not.toContain('Gap')
  })

  it('gap lock button renders locked by default', () => {
    setup()
    const gapSection = container.querySelector('[data-section="gap"]')!
    const lockBtn = gapSection.querySelector('.cortex-lock-btn') as HTMLButtonElement
    expect(lockBtn).not.toBeNull()
    expect(lockBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('gap lock syncs column and row when locked', async () => {
    const { onChange } = setup()
    const gapSection = container.querySelector('[data-section="gap"]')!
    const inputs = gapSection.querySelectorAll('.cortex-numeric-input input') as NodeListOf<HTMLInputElement>
    inputs[0].focus()
    inputs[0].value = '20'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const properties = onChange.mock.calls.map((call: any[]) => call[0].property)
    expect(properties).toContain('column-gap')
    expect(properties).toContain('row-gap')
  })

  it('gap lock does not sync when unlocked', async () => {
    const { onChange } = setup()
    const gapSection = container.querySelector('[data-section="gap"]')!
    const lockBtn = gapSection.querySelector('.cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await new Promise(r => setTimeout(r, 10))
    onChange.mockClear()
    const inputs = gapSection.querySelectorAll('.cortex-numeric-input input') as NodeListOf<HTMLInputElement>
    inputs[0].focus()
    inputs[0].value = '20'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const properties = onChange.mock.calls.map((call: any[]) => call[0].property)
    expect(properties).toContain('column-gap')
    expect(properties).not.toContain('row-gap')
  })

  it('renders sizing segmented control when boxSizing prop provided', () => {
    setup({ boxSizing: 'content-box' })
    const sizingGroup = container.querySelector('[data-section="sizing"]')
    expect(sizingGroup).not.toBeNull()
  })

  it('emits box-sizing: border-box when border-box option selected', async () => {
    const { onChange } = setup({ boxSizing: 'content-box' })
    const sizingGroup = container.querySelector('[data-section="sizing"]')!
    const borderBoxBtn = sizingGroup.querySelector('[data-value="border-box"]') as HTMLButtonElement
    borderBoxBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledWith({ property: 'box-sizing', value: 'border-box' })
  })

  it('does not render sizing when boxSizing prop not provided', () => {
    setup()
    expect(container.querySelector('[data-section="sizing"]')).toBeNull()
  })

  it('emits SpacingChange with string value including unit', () => {
    const { onChange } = setup({ padding: { top: 8, right: 8, bottom: 8, left: 8 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const input = paddingSection.querySelector('.cortex-numeric-input input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.focus()
    input.value = '20'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const call = onChange.mock.calls.find(
      ([c]: [{ property: string; value: string }]) => c.property.startsWith('padding-')
    )
    expect(call).toBeDefined()
    expect(typeof call![0].value).toBe('string')
    expect(call![0].value).toMatch(/px$/)
  })
})
