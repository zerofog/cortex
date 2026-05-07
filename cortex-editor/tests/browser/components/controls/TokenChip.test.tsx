import { describe, it, expect, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { render } from 'preact'
import { TokenChip, isColorLike } from '../../../../src/browser/components/controls/TokenChip.js'
import { TextComponentPill } from '../../../../src/browser/components/controls/TextComponentPill.js'
import { ColorChipPill } from '../../../../src/browser/components/controls/ColorChipPill.js'

/**
 * ZF0-1215 Task 7 regression lock for the TokenChip refactor.
 *
 * The refactor splits the old flat `.cortex-token-chip` into a body
 * (swatch + name, swappable between span/button) and a trailing unlink.
 * Callers (BackgroundSection, BorderSection, TypographySection) changed
 * their prop shape from `resolvedValue` to `swatch`. These tests lock the
 * new structural invariants so a future edit can't silently regress them.
 */

let container: HTMLDivElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
})

function mount(vnode: VNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(vnode, container)
  return container
}

describe('TokenChip', () => {
  it('renders body as <span> (not button) when onBodyClick is absent', () => {
    const root = mount(<TokenChip tokenName="token" swatch={{ kind: 'color', value: '#fff' }} />)
    expect(root.querySelector('button.cortex-token-chip__body')).toBeNull()
    expect(root.querySelector('span.cortex-token-chip__body')).not.toBeNull()
  })

  it('renders body as <button> when onBodyClick is provided', () => {
    const root = mount(<TokenChip tokenName="body-md" onBodyClick={() => {}} />)
    const body = root.querySelector('.cortex-token-chip__body')
    expect(body?.tagName).toBe('BUTTON')
    expect(body?.getAttribute('type')).toBe('button')
  })

  it('renders color swatch with the provided value as backgroundColor', () => {
    const root = mount(<TokenChip tokenName="t" swatch={{ kind: 'color', value: '#abc123' }} />)
    const swatch = root.querySelector('.cortex-token-chip__swatch') as HTMLElement | null
    expect(swatch).not.toBeNull()
    // happy-dom preserves inline hex without normalizing to rgb()
    expect(swatch?.style.backgroundColor).toBe('#abc123')
  })

  it('renders a pattern swatch without inline color styles for pattern kind', () => {
    // Pattern rendering is CSS-owned so DESIGN.md source lint can guard it
    // without allowing inline decorative gradients.
    const root = mount(<TokenChip tokenName="t" swatch={{ kind: 'pattern' }} />)
    const swatch = root.querySelector('.cortex-token-chip__swatch') as HTMLElement | null
    expect(swatch).not.toBeNull()
    expect(swatch?.classList.contains('cortex-token-chip__swatch--pattern')).toBe(true)
    expect(swatch?.style.backgroundColor).toBe('')
    expect(swatch?.style.background).toBe('')
  })

  it('distinguishes color and pattern swatches by inline color vs CSS class', () => {
    // Falsifiability: if the component accidentally sets inline color for the
    // pattern branch (or drops it for the color branch), this test fails.
    const colorRoot = mount(<TokenChip tokenName="c" swatch={{ kind: 'color', value: '#abc123' }} />)
    const colorSwatch = colorRoot.querySelector('.cortex-token-chip__swatch') as HTMLElement
    expect(colorSwatch.style.backgroundColor).toBe('#abc123')
    expect(colorSwatch.classList.contains('cortex-token-chip__swatch--pattern')).toBe(false)
    render(null, colorRoot)
    colorRoot.remove()

    const patternRoot = mount(<TokenChip tokenName="p" swatch={{ kind: 'pattern' }} />)
    const patternSwatch = patternRoot.querySelector(
      '.cortex-token-chip__swatch',
    ) as HTMLElement
    expect(patternSwatch.style.backgroundColor).toBe('')
    expect(patternSwatch.classList.contains('cortex-token-chip__swatch--pattern')).toBe(true)
  })

  it('omits the swatch element entirely when swatch prop is undefined', () => {
    const root = mount(<TokenChip tokenName="body-md" onBodyClick={() => {}} />)
    expect(root.querySelector('.cortex-token-chip__swatch')).toBeNull()
  })

  it('renders unlink button only when onUnlink is provided', () => {
    const noUnlink = mount(<TokenChip tokenName="t" />)
    expect(noUnlink.querySelector('.cortex-token-chip__unlink')).toBeNull()
    render(null, noUnlink)
    noUnlink.remove()

    const withUnlink = mount(<TokenChip tokenName="t" onUnlink={() => {}} />)
    const unlinkBtn = withUnlink.querySelector('button.cortex-token-chip__unlink')
    expect(unlinkBtn).not.toBeNull()
    expect(unlinkBtn?.getAttribute('aria-label')).toBe('Detach token')
  })

  it('invokes onBodyClick when the body button is clicked', () => {
    let called = 0
    const root = mount(<TokenChip tokenName="t" onBodyClick={() => { called++ }} />)
    const body = root.querySelector('button.cortex-token-chip__body') as HTMLButtonElement
    body.click()
    expect(called).toBe(1)
  })

  it('invokes onUnlink when the chain button is clicked', () => {
    let called = 0
    const root = mount(<TokenChip tokenName="t" onUnlink={() => { called++ }} />)
    const unlink = root.querySelector('button.cortex-token-chip__unlink') as HTMLButtonElement
    unlink.click()
    expect(called).toBe(1)
  })

  it('uses ariaLabel override for the body button when provided', () => {
    const root = mount(
      <TokenChip tokenName="t" onBodyClick={() => {}} ariaLabel="swap to another" />,
    )
    const body = root.querySelector('button.cortex-token-chip__body')
    expect(body?.getAttribute('aria-label')).toBe('swap to another')
  })

  it('defaults body button aria-label to the tokenName', () => {
    const root = mount(<TokenChip tokenName="heading-1" onBodyClick={() => {}} />)
    const body = root.querySelector('button.cortex-token-chip__body')
    expect(body?.getAttribute('aria-label')).toBe('heading-1')
  })
})

describe('TextComponentPill', () => {
  it('renders as a clickable TokenChip without a swatch', () => {
    const root = mount(
      <TextComponentPill tokenName="heading-1" onSwap={() => {}} onUnlink={() => {}} />,
    )
    expect(root.querySelector('button.cortex-token-chip__body')).not.toBeNull()
    expect(root.querySelector('.cortex-token-chip__swatch')).toBeNull()
    expect(root.querySelector('button.cortex-token-chip__unlink')).not.toBeNull()
  })

  it('aria-labels the body with "Swap text component (currently <name>)"', () => {
    const root = mount(
      <TextComponentPill tokenName="heading-1" onSwap={() => {}} onUnlink={() => {}} />,
    )
    const body = root.querySelector('button.cortex-token-chip__body')
    expect(body?.getAttribute('aria-label')).toBe('Swap text component (currently heading-1)')
  })

  it('fires onSwap on body click, onUnlink on chain click', () => {
    const calls: string[] = []
    const root = mount(
      <TextComponentPill
        tokenName="heading-1"
        onSwap={() => calls.push('swap')}
        onUnlink={() => calls.push('unlink')}
      />,
    )
    ;(root.querySelector('button.cortex-token-chip__body') as HTMLButtonElement).click()
    ;(root.querySelector('button.cortex-token-chip__unlink') as HTMLButtonElement).click()
    expect(calls).toEqual(['swap', 'unlink'])
  })
})

describe('ColorChipPill', () => {
  it('renders as a clickable TokenChip with a color swatch', () => {
    const root = mount(
      <ColorChipPill
        tokenName="text-gray-900"
        hex="#111827"
        onSwap={() => {}}
        onUnlink={() => {}}
      />,
    )
    const swatch = root.querySelector('.cortex-token-chip__swatch') as HTMLElement | null
    expect(swatch).not.toBeNull()
    expect(swatch?.style.backgroundColor).toBe('#111827')
  })

  it('aria-labels the body with "Swap color chip (currently <name>)"', () => {
    const root = mount(
      <ColorChipPill
        tokenName="text-gray-900"
        hex="#111827"
        onSwap={() => {}}
        onUnlink={() => {}}
      />,
    )
    const body = root.querySelector('button.cortex-token-chip__body')
    expect(body?.getAttribute('aria-label')).toBe('Swap color chip (currently text-gray-900)')
  })
})

describe('isColorLike', () => {
  it.each([
    ['#abc', true],
    ['#aabbcc', true],
    ['#aabbccdd', true],
    ['rgb(0,0,0)', true],
    ['rgba(0, 0, 0, 0.5)', true],
    ['hsl(120, 50%, 50%)', true],
    ['transparent', true],
    ['currentColor', true],
    ['var(--cx-ink)', true],
    ['red', true],
    ['REBECCAPURPLE', true],
    ['16px', false],
    ['1rem', false],
    ['auto', false],
    ['', false],
    ['not-a-color', false],
  ])('isColorLike(%j) === %s', (input, expected) => {
    expect(isColorLike(input)).toBe(expected)
  })
})
