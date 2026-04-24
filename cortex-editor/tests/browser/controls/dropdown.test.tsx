import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { Dropdown } from '../../../src/browser/components/controls/Dropdown.js'
import { dispatchKeyboardEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom doesn't have real layout
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('Dropdown', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const OPTIONS = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Montserrat', label: 'Montserrat' },
  ]

  function setup(overrides?: Partial<Parameters<typeof Dropdown>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <Dropdown
        options={OPTIONS}
        value="Inter"
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  function getTrigger(): HTMLButtonElement {
    return container.querySelector('.cortex-dropdown__trigger') as HTMLButtonElement
  }

  function getPopover(): HTMLElement | null {
    return container.querySelector('.cortex-dropdown__popover')
  }

  function getOptions(): NodeListOf<Element> {
    return container.querySelectorAll('.cortex-dropdown__option')
  }

  function getFilter(): HTMLInputElement | null {
    return container.querySelector('.cortex-dropdown__filter')
  }

  it('renders trigger with selected value', () => {
    setup()
    expect(getTrigger().textContent).toContain('Inter')
  })

  it('renders placeholder when no value', () => {
    setup({ value: '', placeholder: 'Select font...' })
    expect(getTrigger().textContent).toContain('Select font...')
  })

  it('popover is hidden by default', () => {
    setup()
    const popover = getPopover()
    expect(popover === null || popover.style.display === 'none').toBe(true)
  })

  it('click trigger opens popover', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      const popover = getPopover()
      expect(popover).not.toBeNull()
      expect(popover!.style.display).not.toBe('none')
    }, { timeout: 500 })
  })

  it('shows all options when open', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
  })

  it('filters options on type', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const filter = getFilter()!
    filter.value = 'rob'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => {
      const visibleOptions = getOptions()
      expect(visibleOptions.length).toBe(1)
      expect(visibleOptions[0].textContent).toContain('Roboto')
    }, { timeout: 500 })
  })

  it('shows no matches message when filter has zero results', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const filter = getFilter()!
    filter.value = 'zzzzz'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => {
      const empty = container.querySelector('.cortex-dropdown__empty')
      expect(empty).not.toBeNull()
      expect(empty!.textContent).toContain('No matches')
    }, { timeout: 500 })
  })

  it('click option selects and closes', async () => {
    const { onChange } = setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const options = getOptions()
    ;(options[1] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('Roboto')
      const popover = getPopover()
      expect(popover === null || popover.style.display === 'none').toBe(true)
    }, { timeout: 500 })
  })

  it('escape closes popover', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    dispatchKeyboardEvent(getFilter()!, 'keydown', { key: 'Escape' })
    // Load-bearing hold — NOT vi.waitFor; negative assertions would pass immediately at t=0.
    await new Promise<void>(r => setTimeout(r, 20))
    const popoverAfterEscape = getPopover()
    expect(popoverAfterEscape === null || popoverAfterEscape.style.display === 'none').toBe(true)
  })

  // Review finding 1b: backdrop click test
  it('backdrop click closes popover (light dismiss)', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const backdrop = container.querySelector('.cortex-dropdown__backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    backdrop.click()
    // Load-bearing hold — NOT vi.waitFor; negative assertions would pass immediately at t=0.
    await new Promise<void>(r => setTimeout(r, 20))
    const popoverAfterBackdrop = getPopover()
    expect(popoverAfterBackdrop === null || popoverAfterBackdrop.style.display === 'none').toBe(true)
  })

  it('marks currently selected option', async () => {
    setup({ value: 'Roboto' })
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const selected = container.querySelector('.cortex-dropdown__option--selected')
    expect(selected).not.toBeNull()
    expect(selected!.textContent).toContain('Roboto')
  })

  it('arrow keys navigate options', async () => {
    const { onChange } = setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getOptions().length).toBe(4)
    }, { timeout: 500 })
    const filter = getFilter()!
    dispatchKeyboardEvent(filter, 'keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => {
      // After first ArrowDown: Inter is index 0, Roboto is index 1 — highlight moves to Roboto
      const highlighted = container.querySelector('.cortex-dropdown__option--active')
      expect(highlighted?.textContent).toContain('Roboto')
    }, { timeout: 500 })
    dispatchKeyboardEvent(filter, 'keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => {
      // After second ArrowDown: highlight moves to Open Sans (index 2)
      const highlighted = container.querySelector('.cortex-dropdown__option--active')
      expect(highlighted?.textContent).toContain('Open Sans')
    }, { timeout: 500 })
    dispatchKeyboardEvent(filter, 'keydown', { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Open Sans')
  })

  it('renders chevron icon', () => {
    setup()
    const chevron = container.querySelector('.cortex-dropdown__chevron')
    expect(chevron).not.toBeNull()
  })
})
