import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { NumericInput } from '../../../src/browser/components/controls/NumericInput.js'
import { dispatchKeyboardEvent, createShadowHost } from '../helpers.js'

describe('NumericInput', () => {
  let container: HTMLDivElement
  let shadowCleanup: (() => void) | null = null

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
    shadowCleanup?.()
    shadowCleanup = null
  })

  function setup(props?: Partial<Parameters<typeof NumericInput>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <NumericInput
        value={16}
        unit="px"
        onChange={onChange}
        {...props}
      />,
      container,
    )
    return { onChange, input: container.querySelector('input') as HTMLInputElement }
  }

  function setupInShadow(props?: Partial<Parameters<typeof NumericInput>[0]>) {
    const { host, shadow, root, cleanup } = createShadowHost()
    shadowCleanup = cleanup
    container = root
    const onChange = vi.fn()
    render(
      <NumericInput
        value={16}
        unit="px"
        onChange={onChange}
        {...props}
      />,
      root,
    )
    return { onChange, input: root.querySelector('input') as HTMLInputElement, shadow }
  }

  it('renders with value and unit', () => {
    setup()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('16')
    expect(container.textContent).toContain('px')
  })

  it('arrow up increments by 1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(17)
  })

  it('arrow down decrements by 1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(15)
  })

  it('shift+arrow increments by 10', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledWith(26)
  })

  it('alt+arrow increments by 0.1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp', altKey: true })
    expect(onChange).toHaveBeenCalledWith(16.1)
  })

  it('commits text input on Enter', () => {
    const { onChange, input } = setup()
    // Simulate typing by setting value and dispatching input event
    input.value = '24'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    dispatchKeyboardEvent(input, 'keydown', { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it('reverts invalid text on blur', async () => {
    const { onChange, input } = setup()
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    // Flush Preact's async re-render after setLocalValue in handleBlur
    await new Promise(r => setTimeout(r, 10))
    expect(input.value).toBe('16')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selects all text on focus', () => {
    const { input } = setup()
    const selectSpy = vi.spyOn(input, 'select')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    expect(selectSpy).toHaveBeenCalled()
  })

  it('wheel changes value when input is focused inside Shadow DOM', () => {
    const { onChange, input } = setupInShadow()
    // Focus the input so getRootNode().activeElement matches
    input.focus()
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    })
    input.dispatchEvent(wheelEvent)
    expect(onChange).toHaveBeenCalledWith(17)
  })

  it('wheel is ignored when input is not focused inside Shadow DOM', () => {
    const { onChange, input } = setupInShadow()
    // Don't focus the input
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    })
    input.dispatchEvent(wheelEvent)
    expect(onChange).not.toHaveBeenCalled()
  })
})
