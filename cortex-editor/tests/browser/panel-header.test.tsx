import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PanelHeader } from '../../src/browser/components/PanelHeader.js'

describe('PanelHeader', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof PanelHeader>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const props = {
      tagName: 'div',
      componentName: 'Hero',
      sourceFile: 'Hero.tsx',
      sourceLine: '14',
      filePath: '/src/Hero.tsx',
      hasParent: true,
      hasChildren: true,
      onClose: vi.fn(),
      onSelectParent: vi.fn(),
      onSelectChild: vi.fn(),
      ...overrides,
    }
    render(<PanelHeader {...props} />, container)
    return props
  }

  it('renders element tag name when no component name', () => {
    setup({ tagName: 'section', componentName: null })
    expect(container.textContent).toContain('<section>')
  })

  it('renders component name when available', () => {
    setup({ componentName: 'Hero' })
    expect(container.textContent).toContain('Hero')
  })

  it('renders source file link', () => {
    setup({ sourceFile: 'Hero.tsx', sourceLine: '14' })
    expect(container.textContent).toContain('Hero.tsx:14')
  })

  it('close button calls onClose', () => {
    const props = setup()
    const closeBtn = container.querySelector('[data-action="close"]') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    closeBtn.click()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('up button calls onSelectParent', () => {
    const props = setup()
    const upBtn = container.querySelector('[data-action="parent"]') as HTMLButtonElement
    upBtn.click()
    expect(props.onSelectParent).toHaveBeenCalled()
  })

  it('down button calls onSelectChild', () => {
    const props = setup()
    const downBtn = container.querySelector('[data-action="child"]') as HTMLButtonElement
    downBtn.click()
    expect(props.onSelectChild).toHaveBeenCalled()
  })

  it('disables parent button when hasParent is false', () => {
    setup({ hasParent: false })
    const upBtn = container.querySelector('[data-action="parent"]') as HTMLButtonElement
    expect(upBtn.disabled).toBe(true)
  })

  it('disables child button when hasChildren is false', () => {
    setup({ hasChildren: false })
    const downBtn = container.querySelector('[data-action="child"]') as HTMLButtonElement
    expect(downBtn.disabled).toBe(true)
  })
})
