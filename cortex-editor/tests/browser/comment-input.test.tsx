import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentInput } from '../../src/browser/components/CommentInput.js'

describe('CommentInput', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders input field', () => {
    render(<CommentInput onSubmit={vi.fn()} agentConnected={true} />, container)
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('calls onSubmit with text on Enter', async () => {
    const onSubmit = vi.fn()
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    // Simulate typing: set value directly then dispatch input event, then await Preact flush
    input.value = 'Make this blue'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).toHaveBeenCalledWith('Make this blue')
  })

  it('shows disabled state when agent not connected', () => {
    render(<CommentInput onSubmit={vi.fn()} agentConnected={false} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toContain('No agent')
  })

  it('does not submit empty text', () => {
    const onSubmit = vi.fn()
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
