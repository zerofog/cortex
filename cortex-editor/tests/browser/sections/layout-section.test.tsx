import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { LayoutSection, parseLayoutValues } from '../../../src/browser/components/sections/LayoutSection.js'
import type { LayoutValues } from '../../../src/browser/components/sections/LayoutSection.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('LayoutSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: LayoutValues = {
    display: 'block',
    visibility: 'visible',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    width: '320',
    height: '48',
    minWidth: '0px',
    maxWidth: 'none',
    minHeight: '0px',
    maxHeight: 'none',
  }

  function setup(overrides?: Partial<Parameters<typeof LayoutSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <LayoutSection
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="layout"', () => {
    setup()
    const root = container.querySelector('[data-section-id="layout"]')
    expect(root).not.toBeNull()
  })

  it('renders display segmented control with block active', () => {
    setup()
    const displayGroup = container.querySelector('[role="radiogroup"]')
    expect(displayGroup).not.toBeNull()
    const active = container.querySelector('[aria-checked="true"]')
    expect(active).not.toBeNull()
  })

  it('renders visibility row when display is not none', () => {
    setup()
    expect(container.textContent).toContain('Visibility')
  })

  it('hides visibility row when display is none', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'none' } })
    const visSection = container.querySelector('[data-group="visibility"]')
    expect(visSection === null || visSection.getAttribute('data-hidden') === 'true').toBe(true)
  })

  it('shows flex direction only for flex display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.textContent).toContain('Direction')
  })

  it('hides flex direction for block display', () => {
    setup()
    expect(container.textContent).not.toContain('Direction')
  })

  it('shows justify/align for flex display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.textContent).toContain('Justify')
    expect(container.textContent).toContain('Align')
  })

  it('shows justify/align for grid display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'grid' } })
    expect(container.textContent).toContain('Justify')
    expect(container.textContent).toContain('Align')
  })

  it('hides justify/align for block display', () => {
    setup()
    expect(container.textContent).not.toContain('Justify')
    expect(container.textContent).not.toContain('Align')
  })

  it('renders W and H sizing inputs', () => {
    setup()
    expect(container.textContent).toContain('W')
    expect(container.textContent).toContain('H')
  })

  it('emits display change on segmented control click', () => {
    const { onChange } = setup()
    const flexBtn = container.querySelector('[data-value="flex"]') as HTMLElement
    flexBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'display', value: 'flex' })
  })

  it('emits visibility change', () => {
    const { onChange } = setup()
    const groups = container.querySelectorAll('[role="radiogroup"]')
    // Visibility is the second radiogroup — assert it exists before clicking
    expect(groups.length).toBeGreaterThanOrEqual(2)
    const hiddenBtn = groups[1].querySelector('[data-value="hidden"]') as HTMLElement
    hiddenBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'visibility', value: 'hidden' })
  })

  // Review finding 3b: use expect().toBeDefined() instead of if guard
  it('emits width change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const widthInput = inputs[0] as HTMLInputElement
    expect(widthInput).toBeDefined()
    widthInput.focus()
    widthInput.value = '400'
    widthInput.dispatchEvent(new Event('input', { bubbles: true }))
    widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const widthCall = calls.find((c: any) => c[0]?.property === 'width')
    expect(widthCall).toBeDefined()
    expect(widthCall![0].value).toBe('400px')
  })

  it('handles auto width gracefully', () => {
    setup({ values: { ...DEFAULT_VALUES, width: 'auto' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('renders sizing dropdown triggers for W and H', () => {
    setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    expect(triggers.length).toBe(2)
  })

  it('emits fit-content when width mode changed to fit', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const fitOption = container.querySelector('[data-value="fit"]') as HTMLElement
    expect(fitOption).not.toBeNull()
    fitOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: 'fit-content' })
  })

  it('emits 100% when width mode changed to fill', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const fillOption = container.querySelector('[data-value="fill"]') as HTMLElement
    expect(fillOption).not.toBeNull()
    fillOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: '100%' })
  })

  it('shows min-width input when toggled on', async () => {
    setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const minToggle = container.querySelector('[data-action="toggle-min"]') as HTMLElement
    expect(minToggle).not.toBeNull()
    minToggle.click()
    await new Promise((r) => setTimeout(r, 10))
    // Re-render should show Min label
    expect(container.textContent).toContain('Min')
  })

  it('parseLayoutValues includes min/max fields', () => {
    const cs = {
      display: 'block',
      visibility: 'visible',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      width: '320px',
      height: '48px',
      minWidth: '100px',
      maxWidth: '500px',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    expect(result.minWidth).toBe('100px')
    expect(result.maxWidth).toBe('500px')
  })
})
