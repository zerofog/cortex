import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SegmentedControl } from '../../../src/browser/components/controls/SegmentedControl.js'
import { dispatchKeyboardEvent } from '../helpers.js'

describe('SegmentedControl', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const OPTIONS = [
    { value: 'block', label: 'Block' },
    { value: 'flex', label: 'Flex' },
    { value: 'grid', label: 'Grid' },
    { value: 'none', label: 'None' },
  ]

  function setup(overrides?: Partial<Parameters<typeof SegmentedControl>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={OPTIONS}
        value="block"
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('renders all options', () => {
    setup()
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons.length).toBe(4)
    expect(buttons[0].textContent).toContain('Block')
    expect(buttons[1].textContent).toContain('Flex')
  })

  it('marks active option with aria-checked', () => {
    setup({ value: 'flex' })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('aria-checked')).toBe('false')
    expect(buttons[1].getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange on click', () => {
    const { onChange } = setup()
    const buttons = container.querySelectorAll('[role="radio"]')
    ;(buttons[1] as HTMLElement).click()
    expect(onChange).toHaveBeenCalledWith('flex')
  })

  it('only one option is active at a time', () => {
    setup({ value: 'grid' })
    const checked = container.querySelectorAll('[aria-checked="true"]')
    expect(checked.length).toBe(1)
    expect(checked[0].textContent).toContain('Grid')
  })

  it('has radiogroup role on container', () => {
    setup()
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).not.toBeNull()
  })

  it('active option has tabindex 0, others have -1', () => {
    setup({ value: 'flex' })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('tabindex')).toBe('-1')
    expect(buttons[1].getAttribute('tabindex')).toBe('0')
    expect(buttons[2].getAttribute('tabindex')).toBe('-1')
  })

  it('arrow right moves selection', () => {
    const { onChange } = setup({ value: 'block' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('flex')
  })

  it('arrow left moves selection', () => {
    const { onChange } = setup({ value: 'flex' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('block')
  })

  it('arrow right wraps from last to first', () => {
    const { onChange } = setup({ value: 'none' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('block')
  })

  it('renders icon-only options with title tooltip', () => {
    setup({
      options: [
        { value: 'row', icon: '→', title: 'Row' },
        { value: 'col', icon: '↓', title: 'Column' },
      ],
      value: 'row',
      size: 'sm',
    })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('data-tooltip')).toBe('Row')
    expect(buttons[0].textContent).toContain('→')
  })

  it('renders sliding indicator element', () => {
    setup()
    const indicator = container.querySelector('.cortex-segmented__indicator')
    expect(indicator).not.toBeNull()
  })

  it('does not call onChange when clicking already active option', () => {
    const { onChange } = setup({ value: 'block' })
    const buttons = container.querySelectorAll('[role="radio"]')
    ;(buttons[0] as HTMLElement).click()
    expect(onChange).not.toHaveBeenCalled()
  })
})
