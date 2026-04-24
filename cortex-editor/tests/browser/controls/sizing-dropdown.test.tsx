import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SizingDropdown } from '../../../src/browser/components/controls/SizingDropdown.js'
import { dispatchKeyboardEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom doesn't have real layout
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('SizingDropdown', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof SizingDropdown>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onModeChange = vi.fn()
    const onToggleMin = vi.fn()
    const onToggleMax = vi.fn()
    render(
      <SizingDropdown
        mode="fixed"
        minEnabled={false}
        maxEnabled={false}
        onModeChange={onModeChange}
        onToggleMin={onToggleMin}
        onToggleMax={onToggleMax}
        dimension="Width"
        {...overrides}
      />,
      container,
    )
    return { onModeChange, onToggleMin, onToggleMax }
  }

  function getTrigger(): HTMLButtonElement {
    return container.querySelector('.cortex-sizing-trigger') as HTMLButtonElement
  }

  function getMenu(): HTMLElement | null {
    return container.querySelector('.cortex-sizing-menu')
  }

  it('renders trigger label matching current mode', () => {
    setup({ mode: 'fixed' })
    expect(container.querySelector('.cortex-sizing-trigger__label')!.textContent).toBe('px')
  })

  it('opens menu on trigger click', async () => {
    setup()
    expect(getMenu()).toBeNull()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
  })

  it('mode selection emits onModeChange and closes menu', async () => {
    const { onModeChange } = setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const fitItem = container.querySelector('[data-value="fit"]') as HTMLElement
    expect(fitItem).not.toBeNull()
    fitItem.click()
    await vi.waitFor(() => {
      expect(onModeChange).toHaveBeenCalledWith('fit')
      expect(getMenu()).toBeNull()
    }, { timeout: 500 })
  })

  it('toggle selection emits onToggleMin without closing menu', async () => {
    const { onToggleMin } = setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const toggleMin = container.querySelector('[data-action="toggle-min"]') as HTMLElement
    expect(toggleMin).not.toBeNull()
    toggleMin.click()
    await vi.waitFor(() => {
      expect(onToggleMin).toHaveBeenCalled()
    }, { timeout: 500 })
    expect(getMenu()).not.toBeNull()
  })

  it('toggle selection emits onToggleMax without closing menu', async () => {
    const { onToggleMax } = setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const toggleMax = container.querySelector('[data-action="toggle-max"]') as HTMLElement
    expect(toggleMax).not.toBeNull()
    toggleMax.click()
    await vi.waitFor(() => {
      expect(onToggleMax).toHaveBeenCalled()
    }, { timeout: 500 })
    expect(getMenu()).not.toBeNull()
  })

  it('shows checkmark when min is enabled', async () => {
    setup({ minEnabled: true })
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const toggleMin = container.querySelector('[data-action="toggle-min"]') as HTMLElement
    expect(toggleMin).not.toBeNull()
    expect(toggleMin.getAttribute('aria-checked')).toBe('true')
  })

  it('closes on Escape', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const menu = getMenu()!
    dispatchKeyboardEvent(menu, 'keydown', { key: 'Escape' })
    // Load-bearing hold — NOT vi.waitFor; negative assertions would pass immediately at t=0.
    await new Promise<void>(r => setTimeout(r, 20))
    expect(getMenu()).toBeNull()
  })

  it('closes on backdrop click', async () => {
    setup()
    getTrigger().click()
    await vi.waitFor(() => {
      expect(getMenu()).not.toBeNull()
    }, { timeout: 500 })
    const backdrop = container.querySelector('.cortex-sizing-backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    backdrop.click()
    // Load-bearing hold — NOT vi.waitFor; negative assertions would pass immediately at t=0.
    await new Promise<void>(r => setTimeout(r, 20))
    expect(getMenu()).toBeNull()
  })
})
