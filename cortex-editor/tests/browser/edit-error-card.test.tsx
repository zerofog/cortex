import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { EditErrorCard } from '../../src/browser/components/EditErrorCard.js'

describe('EditErrorCard', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders nothing when errors is empty', () => {
    const errors = new Map<string, { source: string; property: string; value: string; reason: string }>()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    expect(container.querySelector('.cortex-error-card')).toBeNull()
  })

  it('renders nothing when no errors match the elementSource', () => {
    const errors = new Map([
      ['other.tsx:5:3\0color', { source: 'other.tsx:5:3', property: 'color', value: 'red', reason: 'No match' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    expect(container.querySelector('.cortex-error-card')).toBeNull()
  })

  it('renders error card with property and reason', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'No matching Tailwind class for 17px' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const card = container.querySelector('.cortex-error-card')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('font-size')
    expect(card!.textContent).toContain('No matching Tailwind class for 17px')
  })

  it('disables Ask AI when agentConnected is false', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('enables Ask AI when agentConnected is true', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={true} onDismiss={() => {}} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('calls onDismiss with the error key when Dismiss clicked', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    const onDismiss = vi.fn()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={false} onDismiss={onDismiss} onAskAI={() => {}} />,
      container,
    )
    const btn = container.querySelector('[data-action="dismiss"]') as HTMLButtonElement
    btn.click()
    expect(onDismiss).toHaveBeenCalledWith('file.tsx:10:5\0font-size')
  })

  it('calls onAskAI with error details when Ask AI clicked', () => {
    const errors = new Map([
      ['file.tsx:10:5\0font-size', { source: 'file.tsx:10:5', property: 'font-size', value: '17px', reason: 'fail' }],
    ])
    const onAskAI = vi.fn()
    render(
      <EditErrorCard errors={errors} elementSource="file.tsx:10:5" agentConnected={true} onDismiss={() => {}} onAskAI={onAskAI} />,
      container,
    )
    const btn = container.querySelector('[data-action="ask-ai"]') as HTMLButtonElement
    btn.click()
    expect(onAskAI).toHaveBeenCalledWith({
      source: 'file.tsx:10:5',
      property: 'font-size',
      value: '17px',
      reason: 'fail',
    })
  })
})
