import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { ActivityLog } from '../../src/browser/components/ActivityLog.js'
import type { ActivityEntry } from '../../src/adapters/types.js'

const entries: ActivityEntry[] = [
  { id: 'e1', type: 'edit', timestamp: Date.now() - 60000, description: 'Changed color to blue', elementSource: 'App.tsx:10:5' },
  { id: 'e2', type: 'comment', timestamp: Date.now(), description: 'Make this bigger' },
]

describe('ActivityLog', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders nothing when not visible', () => {
    render(<ActivityLog entries={entries} visible={false} onClose={vi.fn()} />, container)
    expect(container.querySelector('.cortex-activity-log')).toBeNull()
  })

  it('renders entries when visible', () => {
    render(<ActivityLog entries={entries} visible={true} onClose={vi.fn()} />, container)
    expect(container.querySelectorAll('.cortex-activity-log__entry')).toHaveLength(2)
    expect(container.textContent).toContain('Changed color to blue')
  })

  it('shows newest first', () => {
    render(<ActivityLog entries={entries} visible={true} onClose={vi.fn()} />, container)
    const items = container.querySelectorAll('.cortex-activity-log__desc')
    expect(items[0].textContent).toContain('Make this bigger')
    expect(items[1].textContent).toContain('Changed color')
  })

  it('shows empty state when no entries', () => {
    render(<ActivityLog entries={[]} visible={true} onClose={vi.fn()} />, container)
    expect(container.textContent).toContain('No activity yet')
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<ActivityLog entries={entries} visible={true} onClose={onClose} />, container)
    const btn = container.querySelector('.cortex-activity-log__close') as HTMLButtonElement
    btn.click()
    expect(onClose).toHaveBeenCalled()
  })
})
