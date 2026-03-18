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

  it('does not render source link when filePath is null', () => {
    setup({ sourceFile: 'Hero.tsx', sourceLine: '14', filePath: null })
    const link = container.querySelector('.cortex-panel-header__source')
    expect(link).toBeNull()
  })

  it('renders source link with encoded URI', () => {
    setup({ sourceFile: 'Hero.tsx', sourceLine: '14', filePath: '/src/My Component/Hero.tsx' })
    const link = container.querySelector('.cortex-panel-header__source') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.href).toContain('vscode://file/')
    expect(link.href).toContain('My%20Component')
  })

  describe('pseudo-element tabs', () => {
    it('does not render tabs when no pseudo-elements detected', () => {
      setup({ hasBefore: false, hasAfter: false })
      expect(container.querySelector('.cortex-pseudo-tabs')).toBe(null)
    })

    it('renders element + ::before tabs when hasBefore is true', () => {
      setup({ hasBefore: true, hasAfter: false })
      const tabs = container.querySelectorAll('.cortex-pseudo-tab')
      expect(tabs.length).toBe(2)
      expect(tabs[0].textContent).toBe('element')
      expect(tabs[1].textContent).toBe('::before')
    })

    it('renders all three tabs when both pseudo-elements detected', () => {
      setup({ hasBefore: true, hasAfter: true })
      const tabs = container.querySelectorAll('.cortex-pseudo-tab')
      expect(tabs.length).toBe(3)
    })

    it('calls onPseudoChange when a pseudo tab is clicked', () => {
      const onPseudoChange = vi.fn()
      setup({ hasBefore: true, hasAfter: false, onPseudoChange })
      const beforeTab = container.querySelectorAll('.cortex-pseudo-tab')[1] as HTMLElement
      beforeTab.click()
      expect(onPseudoChange).toHaveBeenCalledWith('::before')
    })

    it('highlights active pseudo tab', () => {
      setup({ hasBefore: true, hasAfter: false, activePseudo: '::before' })
      const tabs = container.querySelectorAll('.cortex-pseudo-tab')
      expect(tabs[1].classList.contains('cortex-pseudo-tab--active')).toBe(true)
    })
  })

  describe('library badge', () => {
    it('does not show badge for non-library elements', () => {
      setup({ isLibrary: false })
      expect(container.querySelector('.cortex-panel-header__library')).toBe(null)
    })

    it('shows (library) badge for library elements', () => {
      setup({ isLibrary: true })
      const badge = container.querySelector('.cortex-panel-header__library')
      expect(badge).not.toBe(null)
      expect(badge!.textContent).toBe('(library)')
    })

    it('shows ancestor source when library element has user ancestor', () => {
      setup({
        isLibrary: true,
        ancestorSource: 'LoginForm.tsx',
        ancestorLine: '42',
        tagName: 'button',
      })
      const infoText = container.querySelector('.cortex-panel-header__info')!.textContent
      expect(infoText).toContain('LoginForm.tsx:42')
      expect(infoText).toContain('<button>')
    })
  })
})
