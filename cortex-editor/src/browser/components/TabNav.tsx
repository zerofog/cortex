import type { JSX } from 'preact'
import { useRef, useEffect } from 'preact/hooks'

export interface Tab {
  id: string
  label: string
}

export const TABS: Tab[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'type', label: 'Type' },
  { id: 'fill', label: 'Fill' },
  { id: 'border', label: 'Border' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'effects', label: 'Effects' },
]

export interface TabNavProps {
  activeTab: string
  onTabClick: (tabId: string) => void
}

export function TabNav({ activeTab, onTabClick }: TabNavProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!stripRef.current) return
    const activeEl = stripRef.current.querySelector('.cortex-tab--active') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTab])

  return (
    <div class="cortex-tab-nav" ref={stripRef}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          class={`cortex-tab ${tab.id === activeTab ? 'cortex-tab--active' : ''}`}
          onClick={() => onTabClick(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
