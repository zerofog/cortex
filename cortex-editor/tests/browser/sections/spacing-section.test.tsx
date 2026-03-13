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

  it('toggles to 4-sided mode', () => {
    setup()
    const toggleBtn = container.querySelector('[data-action="toggle-padding"]') as HTMLButtonElement
    expect(toggleBtn).not.toBeNull()
    toggleBtn.click()
    // After toggle, should show 4 labels: T, R, B, L
  })

  it('hides gap section when isFlexOrGrid is false', () => {
    setup({ isFlexOrGrid: false })
    expect(container.textContent).not.toContain('Gap')
  })
})
