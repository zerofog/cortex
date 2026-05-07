import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { ElementTree } from '../../../src/browser/components/sections/ElementTree.js'

describe('ElementTree multi-select modifiers (ZF0-1195)', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('plain click emits action=replace', () => {
    const onSelectElements = vi.fn()
    const root = document.createElement('div')
    root.setAttribute('data-cortex-source', 's1')
    document.body.appendChild(root)
    container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <ElementTree element={root} onSelectElements={onSelectElements} height={100} />,
      container,
    )

    const row = container.querySelector('.cortex-layer-node--selected') as HTMLElement
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelectElements).toHaveBeenCalledWith([root], 'replace')

    root.remove()
  })

  it('shift+click emits action=add', () => {
    const onSelectElements = vi.fn()
    const root = document.createElement('div')
    root.setAttribute('data-cortex-source', 's1')
    document.body.appendChild(root)
    container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <ElementTree element={root} onSelectElements={onSelectElements} height={100} />,
      container,
    )

    const row = container.querySelector('.cortex-layer-node--selected') as HTMLElement
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    expect(onSelectElements).toHaveBeenCalledWith([root], 'add')

    root.remove()
  })

  it('cmd+click emits action=toggle', () => {
    const onSelectElements = vi.fn()
    const root = document.createElement('div')
    root.setAttribute('data-cortex-source', 's1')
    document.body.appendChild(root)
    container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <ElementTree element={root} onSelectElements={onSelectElements} height={100} />,
      container,
    )

    const row = container.querySelector('.cortex-layer-node--selected') as HTMLElement
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
    expect(onSelectElements).toHaveBeenCalledWith([root], 'toggle')

    root.remove()
  })

  it('ctrl+click emits action=toggle', () => {
    const onSelectElements = vi.fn()
    const root = document.createElement('div')
    root.setAttribute('data-cortex-source', 's1')
    document.body.appendChild(root)
    container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <ElementTree element={root} onSelectElements={onSelectElements} height={100} />,
      container,
    )

    const row = container.querySelector('.cortex-layer-node--selected') as HTMLElement
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    expect(onSelectElements).toHaveBeenCalledWith([root], 'toggle')

    root.remove()
  })
})

describe('ElementTree', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('renders LayerTree inside .cortex-element-tree wrapper', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const target = document.createElement('div')
    target.setAttribute('data-testid', 'target')
    document.body.appendChild(target)

    render(
      <ElementTree element={target} onSelectElements={() => {}} height={200} />,
      container,
    )

    const wrapper = container.querySelector('.cortex-element-tree')
    expect(wrapper).not.toBeNull()
    // LayerTree renders a .cortex-layer-tree inside the wrapper
    const layerTree = wrapper!.querySelector('.cortex-layer-tree')
    expect(layerTree).not.toBeNull()

    target.remove()
  })

  it('has the cortex-element-tree CSS class on the wrapper div', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const target = document.createElement('span')
    document.body.appendChild(target)

    render(
      <ElementTree element={target} onSelectElements={() => {}} height={200} />,
      container,
    )

    const wrapper = container.querySelector('.cortex-element-tree')
    expect(wrapper).not.toBeNull()
    expect(wrapper!.classList.contains('cortex-element-tree')).toBe(true)

    target.remove()
  })

  it('passes element prop through to LayerTree', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const parent = document.createElement('div')
    const child = document.createElement('p')
    parent.appendChild(child)
    document.body.appendChild(parent)

    render(
      <ElementTree element={child} onSelectElements={() => {}} height={200} />,
      container,
    )

    // LayerTree renders tree nodes — the selected element's label should appear
    const selectedNode = container.querySelector('.cortex-layer-node--selected')
    expect(selectedNode).not.toBeNull()

    parent.remove()
  })

  it('renders wrapper but no tree content when element is null', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    render(
      <ElementTree element={null} onSelectElements={() => {}} height={200} />,
      container,
    )

    const wrapper = container.querySelector('.cortex-element-tree')
    expect(wrapper).not.toBeNull()
    // LayerTree returns null when element is null, so no layer tree content
    const layerTree = wrapper!.querySelector('.cortex-layer-tree')
    expect(layerTree).toBeNull()
  })
})
