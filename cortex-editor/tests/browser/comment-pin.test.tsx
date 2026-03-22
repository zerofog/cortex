import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentPin } from '../../src/browser/components/CommentPin.js'
import type { Annotation, CortexChannel } from '../../src/adapters/types.js'

function mockChannel(): CortexChannel & { _lastSent: unknown[] } {
  const sent: unknown[] = []
  return {
    send: vi.fn((msg) => sent.push(msg)),
    onMessage: vi.fn(() => () => {}),
    connected: true,
    _lastSent: sent,
  }
}

const pinAnnotation: Annotation = {
  id: 'pin-1', status: 'pending', elementSource: 'App.tsx:10:5',
  text: 'Fix this', pinPosition: { x: 0.5, y: 0.3 },
  createdAt: Date.now(), updatedAt: Date.now(), thread: [],
}

const unpinnedAnnotation: Annotation = {
  id: 'unpin-1', status: 'pending', elementSource: 'App.tsx:20:1',
  text: 'No pin', createdAt: Date.now(), updatedAt: Date.now(), thread: [],
}

describe('CommentPin', () => {
  let container: HTMLDivElement
  let targetElement: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    // Create a DOM element with data-cortex-source that the pin can find
    targetElement = document.createElement('div')
    targetElement.setAttribute('data-cortex-source', 'App.tsx:10:5')
    document.body.appendChild(targetElement)
    // Mock getBoundingClientRect to return non-zero dimensions
    targetElement.getBoundingClientRect = () => ({
      x: 100, y: 200, width: 300, height: 100,
      top: 200, right: 400, bottom: 300, left: 100,
      toJSON() { return this },
    })
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    targetElement.remove()
  })

  it('renders nothing when no pinned annotations', () => {
    render(<CommentPin annotations={[]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-pin')).toBeNull()
  })

  it('does not render pin dots for annotations without pinPosition', () => {
    render(<CommentPin annotations={[unpinnedAnnotation]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    expect(container.querySelector('.cortex-pin')).toBeNull()
  })

  it('renders pin dot for annotation with pinPosition and matching DOM element', async () => {
    render(<CommentPin annotations={[pinAnnotation]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    await new Promise(r => setTimeout(r, 20)) // let useEffect + rAF flush

    const pin = container.querySelector('.cortex-pin') as HTMLDivElement
    expect(pin).toBeTruthy()
    // Position: left = rect.left + 0.5*rect.width - 6 = 100 + 150 - 6 = 244
    // Position: top = rect.top + 0.3*rect.height - 6 = 200 + 30 - 6 = 224
    expect(pin.style.left).toBe('244px')
    expect(pin.style.top).toBe('224px')
  })

  it('does not render pin when element has zero dimensions', async () => {
    targetElement.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON() { return this },
    })
    render(<CommentPin annotations={[pinAnnotation]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    await new Promise(r => setTimeout(r, 20))

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

  it('clicking pin dot opens thread card', async () => {
    render(<CommentPin annotations={[pinAnnotation]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    await new Promise(r => setTimeout(r, 20))

    const pin = container.querySelector('.cortex-pin') as HTMLDivElement
    expect(pin).toBeTruthy()
    pin.click()
    await new Promise(r => setTimeout(r, 10))

    const thread = container.querySelector('.cortex-pin__thread')
    expect(thread).toBeTruthy()
    // Thread should show the annotation text
    expect(thread?.textContent).toContain('Fix this')
  })

  it('clicking pin dot again closes thread card', async () => {
    render(<CommentPin annotations={[pinAnnotation]} commentMode={false} channel={mockChannel()} onReply={vi.fn()} />, container)
    await new Promise(r => setTimeout(r, 20))

    const pin = container.querySelector('.cortex-pin') as HTMLDivElement
    pin.click()
    await new Promise(r => setTimeout(r, 10))
    expect(container.querySelector('.cortex-pin__thread')).toBeTruthy()

    pin.click()
    await new Promise(r => setTimeout(r, 10))
    expect(container.querySelector('.cortex-pin__thread')).toBeNull()
  })
})
