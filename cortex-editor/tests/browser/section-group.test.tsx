import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { SectionGroup } from '../../src/browser/components/SectionGroup.js'

describe('SectionGroup', () => {
  let container: HTMLDivElement

  function setup(props: { label: string; groupId: string; children?: preact.ComponentChildren }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <SectionGroup label={props.label} groupId={props.groupId}>
        {props.children ?? <div data-testid="child" />}
      </SectionGroup>,
      container,
    )
  }

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('renders root element with cortex-section-group class', () => {
    setup({ label: 'Layout', groupId: 'layout' })
    const root = container.querySelector('.cortex-section-group')
    expect(root).not.toBeNull()
  })

  it('sets data-group attribute on root element', () => {
    setup({ label: 'Typography', groupId: 'typography' })
    const root = container.querySelector('[data-group="typography"]')
    expect(root).not.toBeNull()
  })

  it('renders header with group title text', () => {
    setup({ label: 'Style', groupId: 'style' })
    const title = container.querySelector('.cortex-section-group__title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toBe('Style')
  })

  it('renders children inside content container', () => {
    setup({
      label: 'Layout',
      groupId: 'layout',
      children: <span data-testid="test-child">hello</span>,
    })
    const content = container.querySelector('.cortex-section-group__content')
    expect(content).not.toBeNull()
    const child = content!.querySelector('[data-testid="test-child"]')
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('hello')
  })

  it('uses correct BEM class names for all elements', () => {
    setup({ label: 'Layout', groupId: 'layout' })
    expect(container.querySelector('.cortex-section-group')).not.toBeNull()
    expect(container.querySelector('.cortex-section-group__header')).not.toBeNull()
    expect(container.querySelector('.cortex-section-group__title')).not.toBeNull()
    expect(container.querySelector('.cortex-section-group__content')).not.toBeNull()
  })
})
