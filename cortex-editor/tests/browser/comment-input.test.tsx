import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentInput } from '../../src/browser/components/CommentInput.js'

/** Create a promise with externally-controlled resolve/reject */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const flush = () => new Promise(r => setTimeout(r, 10))

async function typeAndSubmit(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
}

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
    render(<CommentInput onSubmit={vi.fn().mockResolvedValue(undefined)} agentConnected={true} />, container)
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('calls onSubmit with text on Enter', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    input.value = 'Make this blue'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).toHaveBeenCalledWith('Make this blue')
  })

  it('shows disabled state when agent not connected', () => {
    render(<CommentInput onSubmit={vi.fn().mockResolvedValue(undefined)} agentConnected={false} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toContain('Waiting for agent')
  })

  it('does not submit empty text', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears input text immediately on submit', async () => {
    const { promise } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    await typeAndSubmit(input, 'Make this blue')
    expect(input.value).toBe('')
  })

  it('shows spinner while promise is pending', async () => {
    const { promise } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    await typeAndSubmit(input, 'Make this blue')
    expect(container.querySelector('.cortex-comment-input__spinner')).toBeTruthy()
  })

  it('disables input while pending', async () => {
    const { promise } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    await typeAndSubmit(input, 'Make this blue')
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('Sending...')
  })

  it('clears spinner and re-enables input on resolve', async () => {
    const { promise, resolve } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    await typeAndSubmit(input, 'Make this blue')
    expect(container.querySelector('.cortex-comment-input__spinner')).toBeTruthy()
    resolve()
    await flush()
    expect(container.querySelector('.cortex-comment-input__spinner')).toBeFalsy()
    expect(input.disabled).toBe(false)
  })

  it('shows error state on reject', async () => {
    const { promise, reject } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    await typeAndSubmit(input, 'Make this blue')
    reject(new Error('timeout'))
    await flush()
    expect(container.querySelector('.cortex-comment-input__spinner')).toBeFalsy()
    const wrapper = container.querySelector('.cortex-comment-input')
    expect(wrapper?.classList.contains('cortex-comment-input--error')).toBe(true)
    expect(input.placeholder).toBe('No response')
  })

  it('error state auto-clears after 3 seconds', async () => {
    vi.useFakeTimers()
    const { promise, reject } = deferred()
    const onSubmit = vi.fn().mockReturnValue(promise)
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement

    input.value = 'Make this blue'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)

    reject(new Error('timeout'))
    await vi.advanceTimersByTimeAsync(10)

    const wrapper = container.querySelector('.cortex-comment-input')
    expect(wrapper?.classList.contains('cortex-comment-input--error')).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper?.classList.contains('cortex-comment-input--error')).toBe(false)
    expect(input.placeholder).toBe('Ask the AI agent...')

    vi.useRealTimers()
  })
})
