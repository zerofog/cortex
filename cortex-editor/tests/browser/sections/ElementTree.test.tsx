import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { ElementTree } from '../../../src/browser/components/sections/ElementTree.js'

// TODO: multi-select tests deferred to follow-up task

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
      <ElementTree element={target} onSelectElement={() => {}} />,
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
      <ElementTree element={target} onSelectElement={() => {}} />,
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
      <ElementTree element={child} onSelectElement={() => {}} />,
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
      <ElementTree element={null} onSelectElement={() => {}} />,
      container,
    )

    const wrapper = container.querySelector('.cortex-element-tree')
    expect(wrapper).not.toBeNull()
    // LayerTree returns null when element is null, so no layer tree content
    const layerTree = wrapper!.querySelector('.cortex-layer-tree')
    expect(layerTree).toBeNull()
  })
})
