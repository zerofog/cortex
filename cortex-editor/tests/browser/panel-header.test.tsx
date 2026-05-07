import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { PanelHeader } from '../../src/browser/components/PanelHeader.js'
import { THEME_STORAGE_KEY } from '../../src/browser/theme.js'

describe('PanelHeader', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
    localStorage.removeItem(THEME_STORAGE_KEY)
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
      onClose: vi.fn(),
      bufferSize: 0,
      onApply: () => Promise.resolve(),
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

  it('keeps element navigation controls out of the global panel header', () => {
    setup()
    expect(container.querySelector('[data-action="parent"]')).toBeNull()
    expect(container.querySelector('[data-action="child"]')).toBeNull()
    expect(container.querySelector('[data-action="toggle-hover"]')).toBeNull()
  })

  it('renders a compact theme dropdown instead of the wide segmented selector', () => {
    setup()
    expect(container.querySelector('[data-action="theme"]')).not.toBeNull()
    expect(container.querySelector('.cortex-segmented')).toBeNull()
  })

  it('persists theme preference from the compact dropdown', () => {
    setup()
    const trigger = container.querySelector('[data-action="theme"]') as HTMLButtonElement
    act(() => { trigger.click() })
    const darkOption = container.querySelector('[data-theme-option="dark"]') as HTMLButtonElement
    expect(darkOption).not.toBeNull()
    act(() => { darkOption.click() })
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
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
