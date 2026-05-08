import { describe, it, expect, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import type { ColorChip } from '../../../../src/browser/token-detector.js'
import { ColorChipPicker } from '../../../../src/browser/components/controls/ColorChipPicker.js'

const CHIPS: readonly ColorChip[] = [
  { name: 'gray-900', hex: '#111827' },
  { name: 'brand-500', hex: '#3b82f6' },
]

const GROUPED_CHIPS: readonly ColorChip[] = [
  { name: 'blue-300', hex: '#91c5ff', source: 'page' },
  { name: 'emerald-300', hex: '#5ee9b5', source: 'page' },
  { name: 'amber-300', hex: '#ffd237', source: 'theme' },
  { name: 'rose-300', hex: '#ffa1ad', source: 'theme' },
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

describe('ColorChipPicker', () => {
  it('renders an option button per chip in registry order', () => {
    const root = mount(
      <ColorChipPicker chips={CHIPS} currentName={null} onPick={() => {}} onDismiss={() => {}} />,
    )
    const options = root.querySelectorAll('button.cortex-color-chip-picker__option')
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain('gray-900')
    expect(options[0]?.textContent).toContain('#111827')
    expect(options[1]?.textContent).toContain('brand-500')
    expect(options[1]?.textContent).toContain('#3b82f6')
  })

  it('renders a color-filled swatch for each chip', () => {
    const root = mount(
      <ColorChipPicker chips={CHIPS} currentName={null} onPick={() => {}} onDismiss={() => {}} />,
    )
    const swatches = root.querySelectorAll(
      '.cortex-color-chip-picker__swatch',
    ) as NodeListOf<HTMLElement>
    expect(swatches).toHaveLength(2)
    expect(swatches[0]?.style.backgroundColor).toBe('#111827')
    expect(swatches[1]?.style.backgroundColor).toBe('#3b82f6')
  })

  it('splits page chips from remaining theme chips with headers', () => {
    const root = mount(
      <ColorChipPicker chips={GROUPED_CHIPS} currentName={null} onPick={() => {}} onDismiss={() => {}} />,
    )

    expect(root.querySelectorAll('.cortex-color-chip-picker__group-label')).toHaveLength(2)
    expect(root.textContent).toContain('On this page')
    expect(root.textContent).toContain('Theme colors')
    expect(root.querySelector('.cortex-color-chip-picker__divider')).not.toBeNull()

    const options = [...root.querySelectorAll('button.cortex-color-chip-picker__option')]
    expect(options.map((option) => option.textContent)).toEqual([
      'blue-300#91c5ff',
      'emerald-300#5ee9b5',
      'amber-300#ffd237',
      'rose-300#ffa1ad',
    ])
  })

  it('marks the option matching currentName as active + aria-selected', () => {
    const root = mount(
      <ColorChipPicker
        chips={CHIPS}
        currentName="brand-500"
        onPick={() => {}}
        onDismiss={() => {}}
      />,
    )
    const active = root.querySelector('.cortex-color-chip-picker__option--active')
    expect(active?.textContent).toContain('brand-500')
    expect(active?.getAttribute('aria-selected')).toBe('true')
  })

  it('fires onPick with the clicked chip', () => {
    let picked: ColorChip | null = null
    const root = mount(
      <ColorChipPicker
        chips={CHIPS}
        currentName={null}
        onPick={(c) => { picked = c }}
        onDismiss={() => {}}
      />,
    )
    ;(root.querySelectorAll('button.cortex-color-chip-picker__option')[1] as HTMLButtonElement).click()
    expect(picked).not.toBeNull()
    expect(picked!.name).toBe('brand-500')
    expect(picked!.hex).toBe('#3b82f6')
  })

  it('renders the empty-state message when chips is empty', () => {
    const root = mount(
      <ColorChipPicker chips={[]} currentName={null} onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(root.querySelector('.cortex-color-chip-picker--empty')).not.toBeNull()
    expect(root.textContent).toContain('No color chips defined in @theme')
    expect(root.querySelector('button.cortex-color-chip-picker__option')).toBeNull()
  })

  it('fires onDismiss on Escape keydown', async () => {
    let dismissed = 0
    mount(
      <ColorChipPicker
        chips={CHIPS}
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

  it('fires onDismiss on outside mousedown, not on inside mousedown', async () => {
    let dismissed = 0
    const root = mount(
      <ColorChipPicker
        chips={CHIPS}
        currentName={null}
        onPick={() => {}}
        onDismiss={() => { dismissed++ }}
      />,
    )
    // Yield one macrotask so useEffect installs the document mousedown listener
    await flushEffects()

    ;(root.querySelector('button.cortex-color-chip-picker__option') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(dismissed).toBe(0)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dismissed).toBe(1)
  })
})
