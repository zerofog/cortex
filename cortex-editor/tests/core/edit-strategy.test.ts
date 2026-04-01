import { describe, it, expect } from 'vitest'
import { classifyEdit } from '../../src/core/edit-strategy.js'

describe('classifyEdit', () => {
  const base = { source: 'src/App.tsx:14:7', property: 'padding-top', value: '16px', elementSelector: 'section' }

  it('returns immediate when cssMapping is present (CSS Modules annotated)', () => {
    expect(classifyEdit({ ...base, cssMapping: 'src/Hero.module.css:.hero' }, { hasCSSModules: true, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }))
      .toBe('immediate')
  })

  it('returns immediate when Tailwind resolver is available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: true }))
      .toBe('immediate')
  })

  it('returns deferred when Tailwind detected but resolver unavailable and AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns deferred for component library with AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: true, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns unsupported when no strategy can handle the edit', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: false }))
      .toBe('unsupported')
  })

  it('returns deferred for CSS-in-JS with AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: false, hasCSSInJS: true, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns deferred for CSS Modules without annotation when AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: true, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns immediate when inlineStyleAvailable (pure JSX project)', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, inlineStyleAvailable: true }))
      .toBe('immediate')
  })

  it('returns immediate for CSS Modules without annotation when inlineStyleAvailable', () => {
    expect(classifyEdit(base, { hasCSSModules: true, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, inlineStyleAvailable: true }))
      .toBe('immediate')
  })

  it('returns immediate for component library when inlineStyleAvailable', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasComponentLibrary: true, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, inlineStyleAvailable: true }))
      .toBe('immediate')
  })

  it('returns deferred for Tailwind without resolver even when inlineStyle available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: false, aiAvailable: true, inlineStyleAvailable: true }))
      .toBe('deferred')
  })

  it('prefers Tailwind resolver over inlineStyle when both available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true, hasCSSInJS: false, hasComponentLibrary: false, hasPlainCSS: false, summary: '' }, { resolverAvailable: true, inlineStyleAvailable: true }))
      .toBe('immediate')
  })
})
