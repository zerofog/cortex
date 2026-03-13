import type { JSX } from 'preact'
import { useState, useRef, useEffect, useCallback } from 'preact/hooks'

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

  const handleClick = useCallback((tabId: string) => {
    onTabClick(tabId)
  }, [onTabClick])

  return (
    <div class="cortex-tab-nav" ref={stripRef}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          class={`cortex-tab ${tab.id === activeTab ? 'cortex-tab--active' : ''}`}
          onClick={() => handleClick(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Hook to track which section is visible via IntersectionObserver.
 * Returns the ID of the most visible section.
 */
export function useActiveSection(
  scrollContainer: HTMLElement | null,
  sectionIds: string[],
): string {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? '')

  useEffect(() => {
    if (!scrollContainer || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        let bestEntry: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
              bestEntry = entry
            }
          }
        }
        if (bestEntry) {
          const id = (bestEntry.target as HTMLElement).dataset.sectionId
          if (id) setActiveSection(id)
        }
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )

    for (const id of sectionIds) {
      const el = scrollContainer.querySelector(`[data-section-id="${id}"]`)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [scrollContainer, sectionIds])

  return activeSection
}
