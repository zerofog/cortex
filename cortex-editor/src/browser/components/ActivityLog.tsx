import type { JSX } from 'preact'
import type { ActivityEntry } from '../../adapters/types.js'

export interface ActivityLogProps {
  entries: ActivityEntry[]
  visible: boolean
  onClose: () => void
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function entryIcon(type: ActivityEntry['type']): string {
  switch (type) {
    case 'edit': return '✎'
    case 'comment': return '💬'
    case 'status-change': return '→'
    default: return '•'
  }
}

export function ActivityLog({ entries, visible, onClose }: ActivityLogProps): JSX.Element | null {
  if (!visible) return null

  const display = entries.slice(-100).reverse()

  return (
    <div class="cortex-activity-log">
      <div class="cortex-activity-log__header">
        <span>Activity</span>
        <button class="cortex-activity-log__close" onClick={onClose}>✕</button>
      </div>
      <div class="cortex-activity-log__list">
        {display.length === 0 && (
          <div class="cortex-activity-log__empty">No activity yet</div>
        )}
        {display.map(entry => (
          <div key={entry.id} class="cortex-activity-log__entry">
            <span class="cortex-activity-log__icon">{entryIcon(entry.type)}</span>
            <span class="cortex-activity-log__desc">{entry.description}</span>
            <span class="cortex-activity-log__time">{formatTime(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
