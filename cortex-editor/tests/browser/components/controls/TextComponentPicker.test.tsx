import { describe, it, expect, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import type { TextComponent } from '../../../../src/core/text-components.js'
import { TextComponentPicker } from '../../../../src/browser/components/controls/TextComponentPicker.js'

const BUNDLES: readonly TextComponent[] = [
  { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
  { name: 'heading-1', fontSize: '32px', lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '700' },
]

let container: HTMLDivElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
})

function mount(vnode: VNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(vnode, container)
  return container
}

/** Yield 10ms so Preact useEffect installs document-level listeners.
 *  0ms is insufficient when another test's cleanup may lag; 10ms matches
 *  the original contract for useOutsideDismiss-style effects. */
const flushEffects = () => new Promise<void>(r => setTimeout(r, 10))

describe('TextComponentPicker', () => {
  it('renders an option button per bundle in registry order', () => {
    const root = mount(
      <TextComponentPicker
        components={BUNDLES}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => {}}
      />,
    )
    const options = root.querySelectorAll('button.cortex-text-component-picker__option')
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain('body-md')
    expect(options[1]?.textContent).toContain('heading-1')
  })

  it('marks the option matching currentName as active + aria-selected', () => {
    const root = mount(
      <TextComponentPicker
        components={BUNDLES}
        currentName="heading-1"
        onPick={() => {}}
        onDismiss={() => {}}
      />,
    )
    const active = root.querySelector('.cortex-text-component-picker__option--active')
    expect(active?.textContent).toContain('heading-1')
    expect(active?.getAttribute('aria-selected')).toBe('true')

    const inactive = root.querySelector('.cortex-text-component-picker__option:not(.cortex-text-component-picker__option--active)')
    expect(inactive?.getAttribute('aria-selected')).toBe('false')
  })

  it('fires onPick with the clicked bundle', () => {
    let picked: TextComponent | null = null
    const root = mount(
      <TextComponentPicker
        components={BUNDLES}
        currentName={null}
        onPick={(c) => { picked = c }}
        onDismiss={() => {}}
      />,
    )
    ;(root.querySelectorAll('button.cortex-text-component-picker__option')[1] as HTMLButtonElement).click()
    expect(picked).not.toBeNull()
    expect(picked!.name).toBe('heading-1')
  })

  it('renders the empty-state message when components is empty', () => {
    const root = mount(
      <TextComponentPicker
        components={[]}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(root.querySelector('.cortex-text-component-picker--empty')).not.toBeNull()
    expect(root.textContent).toContain('No text components defined in @theme')
    expect(root.querySelector('button.cortex-text-component-picker__option')).toBeNull()
  })

  it('fires onDismiss on Escape keydown', async () => {
    let dismissed = 0
    mount(
      <TextComponentPicker
        components={BUNDLES}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => { dismissed++ }}
      />,
    )
    // Yield one macrotask so useEffect installs the document keydown listener
    await flushEffects()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(1)
  })

  it('fires onDismiss on outside mousedown', async () => {
    let dismissed = 0
    // Wrap mount in act() so the useEffect that installs the document-level
    // mousedown listener runs synchronously before we dispatch. Per ZF0-1361
    // cross-model review: act() on the dispatch alone leaves the
    // listener-installation race intact.
    let root!: HTMLDivElement
    await act(() => {
      root = mount(
        <TextComponentPicker
          components={BUNDLES}
          currentName={null}
          onPick={() => {}}
          onDismiss={() => { dismissed++ }}
        />,
      )
    })

    // Click inside — should NOT dismiss
    ;(root.querySelector('button.cortex-text-component-picker__option') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(dismissed).toBe(0)

    // Click outside — should dismiss
    // act() wraps the dispatch so handler → setState → effect commit drains
    // synchronously. Replaces flushEffects() polling race per ZF0-1387 / ZF0-1361.
    await act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(dismissed).toBe(1)
  })

  it('removes document listeners when unmounted (no leak after re-render)', async () => {
    let dismissed = 0
    const picker = (
      <TextComponentPicker
        components={BUNDLES}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => { dismissed++ }}
      />
    )
    mount(picker)
    // Yield so useEffect installs listeners
    await flushEffects()
    // Unmount
    render(null, container)
    // Yield so useEffect cleanup runs
    await flushEffects()
    // Now an Escape after unmount must NOT call the stale onDismiss
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(0)
  })
})
