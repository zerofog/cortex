import { describe, it, expect } from 'vitest'
import { computeCapabilities } from '../../src/core/capabilities.js'

describe('computeCapabilities', () => {
  it('reports CSS Modules as supported when detected', () => {
    const caps = computeCapabilities(
      { hasCSSModules: true, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: false },
    )
    const cm = caps.find(c => c.name === 'CSS Modules')
    expect(cm?.status).toBe('supported')
  })

  it('reports Tailwind as supported when resolver is available', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: true },
    )
    const tw = caps.find(c => c.name === 'Tailwind')
    expect(tw?.status).toBe('supported')
  })

  it('reports Tailwind as preview-only when detected but resolver unavailable', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: true, tailwindVersion: 4, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: false },
    )
    const tw = caps.find(c => c.name === 'Tailwind')
    expect(tw?.status).toBe('preview-only')
    expect(tw?.reason).toBeDefined()
  })

  it('reports CSS-in-JS as ai-required when detected', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: false, hasCSSInJS: true, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: false },
    )
    const cij = caps.find(c => c.name === 'CSS-in-JS')
    expect(cij?.status).toBe('ai-required')
  })

  it('returns empty array when only plain CSS detected', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: true, summary: '' },
      { resolverAvailable: false },
    )
    expect(caps).toEqual([])
  })

  it('reports Tailwind as supported when AI available but resolver unavailable', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: true, tailwindVersion: 4, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: false, aiAvailable: true },
    )
    const tw = caps.find(c => c.name === 'Tailwind')
    expect(tw?.status).toBe('supported')
    expect(tw?.reason).toContain('AI')
  })

  it('reports CSS-in-JS as supported when AI available', () => {
    const caps = computeCapabilities(
      { hasCSSModules: false, hasTailwind: false, hasCSSInJS: true, hasComponentLibrary: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: false, aiAvailable: true },
    )
    const cij = caps.find(c => c.name === 'CSS-in-JS')
    expect(cij?.status).toBe('supported')
  })

  it('handles mixed detection (Tailwind supported + CSS Modules supported)', () => {
    const caps = computeCapabilities(
      { hasCSSModules: true, hasTailwind: true, hasCSSInJS: false, hasPlainCSS: false, summary: '' },
      { resolverAvailable: true },
    )
    expect(caps).toHaveLength(2)
    expect(caps.every(c => c.status === 'supported')).toBe(true)
  })
})
