import { describe, it, expect, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
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
    await new Promise((r) => setTimeout(r, 10))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(1)
  })

  it('fires onDismiss on outside mousedown', async () => {
    let dismissed = 0
    const root = mount(
      <TextComponentPicker
        components={BUNDLES}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => { dismissed++ }}
      />,
    )
    await new Promise((r) => setTimeout(r, 10))

    // Click inside — should NOT dismiss
    ;(root.querySelector('button.cortex-text-component-picker__option') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(dismissed).toBe(0)

    // Click outside — should dismiss
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
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
    await new Promise((r) => setTimeout(r, 10))
    // Unmount
    render(null, container)
    await new Promise((r) => setTimeout(r, 10))
    // Now an Escape after unmount must NOT call the stale onDismiss
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dismissed).toBe(0)
  })
})
