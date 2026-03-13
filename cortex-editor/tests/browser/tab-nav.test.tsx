import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { TabNav, TABS } from '../../src/browser/components/TabNav.js'


describe('TabNav', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof TabNav>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onTabClick = vi.fn()
    render(
      <TabNav activeTab="spacing" onTabClick={onTabClick} {...overrides} />,
      container,
    )
    return { onTabClick }
  }

  it('renders all tab labels', () => {
    setup()
    for (const tab of TABS) {
      expect(container.textContent).toContain(tab.label)
    }
  })

  it('marks active tab', () => {
    setup({ activeTab: 'spacing' })
    const active = container.querySelector('.cortex-tab--active')
    expect(active).not.toBeNull()
    expect(active?.textContent).toBe('Spacing')
  })

  it('calls onTabClick when tab is clicked', () => {
    const { onTabClick } = setup()
    const tabs = container.querySelectorAll('.cortex-tab')
    const layoutTab = Array.from(tabs).find(t => t.textContent === 'Layout')
    ;(layoutTab as HTMLElement)?.click()
    expect(onTabClick).toHaveBeenCalledWith('layout')
  })
})
