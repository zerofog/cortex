import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentThread } from '../../src/browser/components/CommentThread.js'
import type { Annotation } from '../../src/adapters/types.js'

const baseAnnotation: Annotation = {
  id: 'ann-1', status: 'pending', elementSource: 'App.tsx:10:5',
  text: 'Make this blue', createdAt: Date.now(), updatedAt: Date.now(), thread: [],
}

describe('CommentThread', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('shows annotation text', () => {
    render(<CommentThread annotation={baseAnnotation} onReply={vi.fn()} />, container)
    expect(container.textContent).toContain('Make this blue')
  })

  it('shows pending status', () => {
    render(<CommentThread annotation={baseAnnotation} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-thread__status--pending')).toBeTruthy()
  })

  it('shows acknowledged status', () => {
    const ann = { ...baseAnnotation, status: 'acknowledged' as const }
    render(<CommentThread annotation={ann} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-thread__status--acknowledged')).toBeTruthy()
    expect(container.textContent).toContain('Working...')
  })

  it('shows resolved status with summary', () => {
    const ann = { ...baseAnnotation, status: 'resolved' as const, resolution: { summary: 'Changed color' } }
    render(<CommentThread annotation={ann} onReply={vi.fn()} />, container)
    expect(container.textContent).toContain('Changed color')
    expect(container.querySelector('.cortex-thread__status--resolved')).toBeTruthy()
  })

  it('shows dismissed with reason', () => {
    const ann = { ...baseAnnotation, status: 'dismissed' as const, dismissReason: 'Not needed' }
    render(<CommentThread annotation={ann} onReply={vi.fn()} />, container)
    expect(container.textContent).toContain('Not needed')
  })

  it('renders thread messages', () => {
    const ann = {
      ...baseAnnotation,
      thread: [{ id: 'm1', from: 'agent' as const, text: 'What color?', timestamp: Date.now() }],
    }
    render(<CommentThread annotation={ann} onReply={vi.fn()} />, container)
    expect(container.textContent).toContain('What color?')
    expect(container.querySelector('.cortex-thread__message--agent')).toBeTruthy()
  })

  it('shows reply input for non-terminal states', () => {
    render(<CommentThread annotation={baseAnnotation} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-thread__reply')).toBeTruthy()
  })

  it('hides reply input for resolved state', () => {
    const ann = { ...baseAnnotation, status: 'resolved' as const, resolution: { summary: 'done' } }
    render(<CommentThread annotation={ann} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-thread__reply')).toBeNull()
  })

  it('calls onReply when user submits reply', async () => {
    const onReply = vi.fn()
    render(<CommentThread annotation={baseAnnotation} onReply={onReply} />, container)
    const input = container.querySelector('.cortex-thread__reply') as HTMLInputElement
    // Set value directly then dispatch input event, then await Preact flush
    input.value = 'Blue please'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise<void>(r => setTimeout(r, 0))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onReply).toHaveBeenCalledWith('ann-1', 'Blue please')
  })
})
