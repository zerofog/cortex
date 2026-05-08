import { describe, expect, it } from 'vitest'
import { getElementEditTarget } from '../../src/browser/preview-source.js'
import { pendingEditSchema } from '../../src/schemas/pending-edit.js'
import { utf8Bytes } from '../../src/schemas/pending-edit.js'
import { MAX_SOURCE_HINT_FIELD_BYTES } from '../../src/shared/preview-source.js'

describe('preview-source edit targets', () => {
  it('byte-clamps source-resolution hint fields before staging', () => {
    const el = document.createElement('div')
    el.className = 'x'.repeat(700)
    el.textContent = '界'.repeat(300)

    const target = getElementEditTarget(el)
    expect(target.applyMode).toBe('agent-resolve')
    expect(target.sourceResolutionHint).toBeDefined()

    const hint = target.sourceResolutionHint!
    expect(utf8Bytes(hint.className ?? '')).toBeLessThanOrEqual(MAX_SOURCE_HINT_FIELD_BYTES)
    expect(utf8Bytes(hint.textPreview)).toBeLessThanOrEqual(MAX_SOURCE_HINT_FIELD_BYTES)
    expect(utf8Bytes(hint.domSelector)).toBeLessThanOrEqual(MAX_SOURCE_HINT_FIELD_BYTES)

    expect(() => pendingEditSchema.parse({
      intentId: 'preview-clamped',
      source: target.source,
      property: 'display',
      value: 'flex',
      previousValue: 'block',
      applyMode: target.applyMode,
      sourceResolutionHint: hint,
      timestamp: Date.now(),
    })).not.toThrow()
  })

  it('escapes selector-ish hint components', () => {
    const el = document.createElement('div')
    el.id = 'hero card"]'

    const target = getElementEditTarget(el)

    expect(target.sourceResolutionHint?.domSelector).toBe(`div#${CSS.escape(el.id)}`)
    expect(target.sourceResolutionHint?.domSelector).not.toContain('"]')
  })

  it('escapes data-testid and class selector hint fallbacks', () => {
    const testIdEl = document.createElement('button')
    testIdEl.setAttribute('data-testid', 'primary action"]')

    const classEl = document.createElement('section')
    classEl.className = 'feature"] card'

    expect(getElementEditTarget(testIdEl).sourceResolutionHint?.domSelector)
      .toBe(`button[data-testid=${CSS.escape('primary action"]')}]`)
    expect(getElementEditTarget(classEl).sourceResolutionHint?.domSelector)
      .toBe(`section.${CSS.escape('feature"]')}`)
  })
})
