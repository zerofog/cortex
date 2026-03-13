import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { SourceAttribution } from '../../../src/browser/components/sections/SourceAttribution.js'
import type { AttributionState } from '../../../src/browser/components/sections/SourceAttribution.js'

describe('SourceAttribution', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(attribution: AttributionState | null) {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<SourceAttribution attribution={attribution} />, container)
  }

  it('returns null for null attribution', () => {
    setup(null)
    expect(container.innerHTML).toBe('')
  })

  it('renders static-class with link when filePath provided', () => {
    setup({ type: 'static-class', className: 'pt-4', filePath: '/src/Hero.tsx' })
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe('pt-4')
    expect(link?.href).toContain('vscode://file/')
  })

  it('renders static-class as span without filePath', () => {
    setup({ type: 'static-class', className: 'pt-4' })
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toBe('pt-4')
  })

  it('renders css-module with file:line', () => {
    setup({ type: 'css-module', file: 'Hero.module.css', line: 4 })
    expect(container.textContent).toBe('Hero.module.css:4')
  })

  it('renders library italic', () => {
    setup({ type: 'library' })
    expect(container.textContent).toBe('(library)')
  })

  it('renders ai-processing spinner', () => {
    setup({ type: 'ai-processing' })
    expect(container.textContent).toContain('updating...')
  })

  it('renders error with tooltip', () => {
    setup({ type: 'error', message: 'Verification failed' })
    const el = container.querySelector('.cortex-attribution--error')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('title')).toBe('Verification failed')
  })
})
