import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentPin } from '../../src/browser/components/CommentPin.js'
import type { Annotation, CortexChannel } from '../../src/adapters/types.js'

function mockChannel(): CortexChannel {
  return { send: vi.fn(), onMessage: vi.fn(() => () => {}), connected: true }
}

const pinAnnotation: Annotation = {
  id: 'pin-1', status: 'pending', elementSource: 'App.tsx:10:5',
  text: 'Fix this', pinPosition: { x: 0.5, y: 0.3 },
  createdAt: Date.now(), updatedAt: Date.now(), thread: [],
}

describe('CommentPin', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders nothing when no pinned annotations', () => {
    render(<CommentPin annotations={[]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-pin')).toBeNull()
  })

  it('renders crosshair overlay in comment mode', () => {
    render(<CommentPin annotations={[]} commentMode={true} channel={mockChannel()} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-pin--mode')).toBeTruthy()
  })

  it('does not render crosshair when not in comment mode', () => {
    render(<CommentPin annotations={[]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-pin--mode')).toBeNull()
  })
})
