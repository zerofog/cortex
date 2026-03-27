import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PositionSection, parsePositionValues } from '../../../src/browser/components/sections/PositionSection.js'
import type { PositionValues } from '../../../src/browser/components/sections/PositionSection.js'

describe('PositionSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: PositionValues = {
    position: 'static',
    left: 'auto',
    top: 'auto',
    zIndex: 'auto',
    rotate: 'none',
    scaleX: '1',
    scaleY: '1',
  }

  function setup(overrides?: Partial<Parameters<typeof PositionSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <PositionSection
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="position"', () => {
    setup()
    const root = container.querySelector('[data-section-id="position"]')
    expect(root).not.toBeNull()
  })

  it('parsePositionValues parses basic computed styles', () => {
    const cs = {
      position: 'relative',
      left: '8px',
      top: '16px',
      zIndex: '5',
      rotate: '45deg',
      scale: '-1 1',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'relative',
      left: '8px',
      top: '16px',
      zIndex: '5',
      rotate: '45deg',
      scaleX: '-1',
      scaleY: '1',
    })
  })

  it('parsePositionValues handles defaults when properties are missing', () => {
    const cs = {} as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'static',
      left: 'auto',
      top: 'auto',
      zIndex: 'auto',
      rotate: 'none',
      scaleX: '1',
      scaleY: '1',
    })
  })

  it('parsePositionValues handles single-value scale (uniform)', () => {
    const cs = {
      position: 'static',
      left: 'auto',
      top: 'auto',
      zIndex: 'auto',
      rotate: 'none',
      scale: '2',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result.scaleX).toBe('2')
    expect(result.scaleY).toBe('2')
  })
})
