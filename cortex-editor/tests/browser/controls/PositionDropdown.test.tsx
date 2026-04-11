import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PositionDropdown } from '../../../src/browser/components/controls/PositionDropdown.js'
import { dispatchKeyboardEvent, dispatchMouseEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom has no real layout engine, so
// computePosition would otherwise return NaN. Matches the pattern used
// by the existing Dropdown.test.tsx.
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

// Unique path fragments copied from icons.tsx — these let us assert that
// the CORRECT icon was rendered, not just "an icon exists". If icons.tsx
// upstream changes, the snapshot test at tests/browser/components/icons.test.tsx
// breaks first and tells us which path moved; these fixtures stay
// in lockstep with a single file.
const ICON_FINGERPRINT = {
  // Square: <rect width="18" height="18" x="3" y="3" rx="2"/>
  static: 'rect',
  // MoveDiagonal: M11 19H5v-6
  relative: 'M11 19H5v-6',
  // Maximize: M8 3H5a2 2 0 0 0-2 2v3
  absolute: 'M8 3H5a2 2 0 0 0-2 2v3',
  // Pin: M12 17v5
  fixed: 'M12 17v5',
  // Paperclip: m16 6-8.414 8.586
  sticky: 'm16 6-8.414 8.586',
  // Check: M20 6 9 17l-5-5
  check: 'M20 6 9 17l-5-5',
} as const

const DESCRIPTIONS = {
  static: 'Static — default position; element follows document flow',
  relative: 'Relative — positioned relative to its normal position',
  absolute: 'Absolute — positioned relative to nearest positioned ancestor',
  fixed: 'Fixed — positioned relative to the viewport',
  sticky: 'Sticky — sticks to container edge when scrolling',
} as const

describe('PositionDropdown', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof PositionDropdown>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <PositionDropdown value="static" onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  function getTrigger(): HTMLButtonElement {
    return container.querySelector('.cortex-position-dropdown__trigger') as HTMLButtonElement
  }

  function getPopover(): HTMLElement | null {
    return container.querySelector('.cortex-position-dropdown__popover')
  }

  function getOptions(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll('.cortex-position-dropdown__option'),
    ) as HTMLElement[]
  }

  function getDescription(): HTMLElement | null {
    return container.querySelector('.cortex-position-dropdown__description')
  }

  async function openPopover() {
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
  }

  // 1. Trigger renders selected option label
  it('renders trigger with the selected option label', () => {
    setup({ value: 'relative' })
    const label = container.querySelector('.cortex-position-dropdown__trigger-label')
    expect(label).not.toBeNull()
    expect(label!.textContent).toBe('Relative')
  })

  // 2. Trigger renders the correct icon for the selected value
  it('renders the correct icon for the selected value', () => {
    setup({ value: 'fixed' })
    const triggerIcon = container.querySelector('.cortex-position-dropdown__trigger-icon')
    expect(triggerIcon).not.toBeNull()
    // Pin icon has the unique path fragment "M12 17v5"
    expect(triggerIcon!.innerHTML).toContain(ICON_FINGERPRINT.fixed)
    // And does NOT contain the Square rect or Paperclip path
    expect(triggerIcon!.innerHTML).not.toContain(ICON_FINGERPRINT.sticky)
    expect(triggerIcon!.innerHTML).not.toContain(ICON_FINGERPRINT.relative)
  })

  // 3. Click opens popover with listbox and all 5 options
  it('click trigger opens popover with role="listbox" and all 5 position options', async () => {
    setup()
    expect(getPopover()).toBeNull()
    await openPopover()
    const popover = getPopover()
    expect(popover).not.toBeNull()
    const listbox = popover!.querySelector('[role="listbox"]')
    expect(listbox).not.toBeNull()
    const options = getOptions()
    expect(options.length).toBe(5)
    const ids = options.map((o) => o.id)
    expect(ids).toEqual([
      'cortex-position-opt-static',
      'cortex-position-opt-relative',
      'cortex-position-opt-absolute',
      'cortex-position-opt-fixed',
      'cortex-position-opt-sticky',
    ])
  })

  // 4. Clicking an option fires onChange and closes the popover
  it('clicking an option calls onChange with the value and closes the popover', async () => {
    const { onChange } = setup({ value: 'static' })
    await openPopover()
    const options = getOptions()
    const absoluteRow = options.find((o) => o.id === 'cortex-position-opt-absolute')!
    absoluteRow.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('absolute')
    expect(getPopover()).toBeNull()
  })

  // 5. Escape closes without calling onChange
  it('Escape key closes popover without calling onChange', async () => {
    const { onChange } = setup()
    await openPopover()
    expect(getPopover()).not.toBeNull()
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 10))
    expect(getPopover()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 6. ArrowDown moves highlight from selected to the next option
  it('ArrowDown moves highlight from the selected option to the next option', async () => {
    setup({ value: 'static' })
    await openPopover()
    // On open, "static" is selected and highlighted (idx 0)
    const initialHighlighted = container.querySelector(
      '.cortex-position-dropdown__option--highlighted',
    )
    expect(initialHighlighted?.id).toBe('cortex-position-opt-static')
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'ArrowDown' })
    await new Promise((r) => setTimeout(r, 10))
    const nextHighlighted = container.querySelector(
      '.cortex-position-dropdown__option--highlighted',
    )
    expect(nextHighlighted?.id).toBe('cortex-position-opt-relative')
  })

  // 7. Enter on a highlighted option calls onChange with that value
  it('Enter key on the highlighted option calls onChange with that value', async () => {
    const { onChange } = setup({ value: 'static' })
    await openPopover()
    // Move highlight twice: static -> relative -> absolute
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'ArrowDown' })
    await new Promise((r) => setTimeout(r, 10))
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'ArrowDown' })
    await new Promise((r) => setTimeout(r, 10))
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('absolute')
    expect(getPopover()).toBeNull()
  })

  // 8. Checkmark appears ONLY on the currently-selected option
  it('shows checkmark only on the currently selected option', async () => {
    setup({ value: 'fixed' })
    await openPopover()
    const options = getOptions()
    // Exactly one check element
    const checks = container.querySelectorAll('.cortex-position-dropdown__option-check')
    expect(checks.length).toBe(1)
    // ...and it's inside the "fixed" row, not any other
    const fixedRow = options.find((o) => o.id === 'cortex-position-opt-fixed')!
    expect(fixedRow.querySelector('.cortex-position-dropdown__option-check')).not.toBeNull()
    // Negative control: the other four rows have no checkmark
    for (const row of options) {
      if (row.id === 'cortex-position-opt-fixed') continue
      expect(row.querySelector('.cortex-position-dropdown__option-check')).toBeNull()
    }
    // The check element contains the Check icon fingerprint, not some other SVG
    expect(checks[0].innerHTML).toContain(ICON_FINGERPRINT.check)
  })

  // 9. Description defaults to the selected option's description on open
  it('description bar defaults to the selected option description when opened', async () => {
    setup({ value: 'sticky' })
    await openPopover()
    const desc = getDescription()
    expect(desc).not.toBeNull()
    expect(desc!.textContent).toBe(DESCRIPTIONS.sticky)
  })

  // 10. Description updates on mouseenter / focus of a different option
  it('description bar updates on mouseenter of a non-selected option', async () => {
    setup({ value: 'static' })
    await openPopover()
    expect(getDescription()!.textContent).toBe(DESCRIPTIONS.static)
    const options = getOptions()
    const fixedRow = options.find((o) => o.id === 'cortex-position-opt-fixed')!
    dispatchMouseEvent(fixedRow, 'mouseenter')
    await new Promise((r) => setTimeout(r, 10))
    expect(getDescription()!.textContent).toBe(DESCRIPTIONS.fixed)
    // And on mouseleave it falls back to the highlighted (now "fixed")
    // option — not silently reverting to the selection, which would be
    // a UX regression. This asserts the priority: hover > highlight > selection.
    dispatchMouseEvent(fixedRow, 'mouseleave')
    await new Promise((r) => setTimeout(r, 10))
    expect(getDescription()!.textContent).toBe(DESCRIPTIONS.fixed)
  })

  // 11. Disabled state prevents opening
  it('disabled state prevents opening the popover', async () => {
    const { onChange } = setup({ disabled: true })
    expect(getTrigger().disabled).toBe(true)
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    expect(getPopover()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 12. ARIA attributes on trigger and options
  it('applies correct ARIA roles and states on trigger and options', async () => {
    setup({ value: 'relative' })
    const trigger = getTrigger()
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await openPopover()
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true')
    const options = getOptions()
    for (const opt of options) {
      expect(opt.getAttribute('role')).toBe('option')
      const expected = opt.id === 'cortex-position-opt-relative' ? 'true' : 'false'
      expect(opt.getAttribute('aria-selected')).toBe(expected)
    }
  })

  // 13. Focus returns to trigger after Escape
  it('trigger receives focus back after Escape closes the popover', async () => {
    setup()
    const trigger = getTrigger()
    trigger.focus()
    await openPopover()
    // Blur the trigger to verify the close handler restores focus
    trigger.blur()
    expect(document.activeElement).not.toBe(trigger)
    dispatchKeyboardEvent(trigger, 'keydown', { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(getTrigger())
  })

  // Bonus: Arrow-key wrap-around (documented behavior — ArrowUp from first
  // wraps to last, ArrowDown from last wraps to first). Locking this with
  // a test prevents a future "fix" from quietly flipping the convention.
  it('ArrowUp from the first option wraps to the last option', async () => {
    setup({ value: 'static' })
    await openPopover()
    dispatchKeyboardEvent(getTrigger(), 'keydown', { key: 'ArrowUp' })
    await new Promise((r) => setTimeout(r, 10))
    const highlighted = container.querySelector(
      '.cortex-position-dropdown__option--highlighted',
    )
    expect(highlighted?.id).toBe('cortex-position-opt-sticky')
  })
})
