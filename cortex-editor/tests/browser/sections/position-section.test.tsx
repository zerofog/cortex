import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PositionSection, parsePositionValues, alignSelfAxis } from '../../../src/browser/components/sections/PositionSection.js'
import type { PositionValues } from '../../../src/browser/components/sections/PositionSection.js'

// Mock @floating-ui/dom — PositionSection now hosts a PositionDropdown
// whose popover opens via computePosition. happy-dom has no layout
// engine, so we stub the positioning API the same way Dropdown-family
// tests do. The popover DOM is gated on isOpen state, not on position
// resolution, so the mock only prevents spurious warn() logs.
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

// Anti-tautology icon fingerprints — unique path fragments lifted from
// icons.tsx so a test can assert "the CORRECT lucide icon was rendered"
// instead of just "an icon exists". Mirrors the pattern used by
// PositionDropdown.test.tsx (Task 5). icons.tsx itself is snapshot-locked
// in tests/browser/components/icons.test.tsx, so any upstream drift
// breaks that snapshot first and tells us which icon moved.
const ICON_FINGERPRINT = {
  // RotateCw: M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8
  rotateCw: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8',
  // FlipHorizontal: M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3
  flipH: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3',
  // FlipVertical: M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3
  flipV: 'M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3',
  // v2 icons — inner box pushed to within 1 unit of cell edge so the
  // start↔end shift is large enough to perceive at 14px display size.
  // JustifySelfStart: inner box at x=3 (cell left edge is x=2, so 1-unit inset)
  justifyStart: 'x="3" y="6" width="6"',
  // JustifySelfCenter: inner box at x=9 (centered, since cell spans 2→22)
  justifyCenter: 'x="9" y="6" width="6"',
  // JustifySelfEnd: inner box at x=15 (right edge at x=21, 1-unit inset from x=22)
  justifyEnd: 'x="15" y="6" width="6"',
  // AlignSelfStart: inner box at y=4 (cell top is y=3, so 1-unit inset)
  alignStart: 'x="6" y="4" width="12"',
  // AlignSelfCenter: inner box at y=9 (centered, cell spans 3→21)
  alignCenter: 'x="6" y="9" width="12"',
  // AlignSelfEnd: inner box at y=14 (bottom at y=20, 1-unit inset from y=21)
  alignEnd: 'x="6" y="14" width="12"',
} as const

describe('PositionSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  // Default to grid parent so existing self-alignment tests see BOTH rows
  // (grid items honor both justify-self and align-self). Per-axis gating
  // tests set parentDisplay explicitly per-case to exercise flex (align
  // only, no justify) and block (neither, abs/fixed override).
  const DEFAULT_VALUES: PositionValues = {
    position: 'static',
    left: 'auto',
    top: 'auto',
    right: 'auto',
    bottom: 'auto',
    zIndex: 'auto',
    rotate: 'none',
    scaleX: '1',
    scaleY: '1',
    justifySelf: 'auto',
    alignSelf: 'auto',
    parentDisplay: 'grid',
    // 'row' is the CSS default and the natural mental model for align-self
    // (cross axis = vertical = top/middle/bottom labels). Tests for the
    // column-flex code path set this explicitly per-case.
    parentFlexDirection: 'row',
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

  // ── parsePositionValues ─────────────────────────────────────────────

  it('parsePositionValues parses basic computed styles', () => {
    const cs = {
      position: 'relative',
      left: '8px',
      top: '16px',
      zIndex: '5',
      rotate: '45deg',
      scale: '-1 1',
      justifySelf: 'center',
      alignSelf: 'end',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'relative',
      left: '8px',
      top: '16px',
      right: 'auto',
      bottom: 'auto',
      zIndex: '5',
      rotate: '45deg',
      scaleX: '-1',
      scaleY: '1',
      justifySelf: 'center',
      alignSelf: 'end',
      // parentDisplay/parentFlexDirection default here; panel-style-
      // snapshot patches in the real parent's values where the element
      // exists. Defaults are 'block' (so self-alignment hides by default)
      // and 'row' (so align-self uses vertical axis by default).
      parentDisplay: 'block',
      parentFlexDirection: 'row',
    })
  })

  it('parsePositionValues handles defaults when properties are missing', () => {
    const cs = {} as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result).toEqual({
      position: 'static',
      left: 'auto',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
      zIndex: 'auto',
      rotate: 'none',
      scaleX: '1',
      scaleY: '1',
      justifySelf: 'auto',
      alignSelf: 'auto',
      parentDisplay: 'block',
      parentFlexDirection: 'row',
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

  it('parsePositionValues reads all four edge offsets', () => {
    const cs = {
      position: 'absolute',
      left: '4px',
      top: '8px',
      right: '12px',
      bottom: '16px',
    } as unknown as CSSStyleDeclaration

    const result = parsePositionValues(cs)
    expect(result.left).toBe('4px')
    expect(result.top).toBe('8px')
    expect(result.right).toBe('12px')
    expect(result.bottom).toBe('16px')
  })

  // ── PositionDropdown integration ───────────────────────────────────

  it('shows absolute as the selected option label for position:absolute', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'absolute' } })
    const triggerLabel = container.querySelector(
      '.cortex-position-dropdown__trigger-label',
    )
    expect(triggerLabel).not.toBeNull()
    expect(triggerLabel!.textContent).toBe('Absolute')
  })

  it('emits position change when selecting a new mode from the dropdown', async () => {
    const { onChange } = setup()
    const trigger = container.querySelector(
      '.cortex-position-dropdown__trigger',
    ) as HTMLButtonElement
    expect(trigger).not.toBeNull()
    trigger.click()
    await vi.waitFor(() => {
      expect(container.querySelector('#cortex-position-opt-absolute')).not.toBeNull()
    }, { timeout: 500 })
    const absOption = container.querySelector(
      '#cortex-position-opt-absolute',
    ) as HTMLElement
    absOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'position', value: 'absolute' })
  })

  // ── T / R / B / L / Z numeric inputs (inline prefix slot) ──────────

  it('renders T/R/B/L/Z inputs with inline prefix slots (not standalone labels)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    // T, R, B, L (edge row) + Z (z-index row) + rotate icon = 6 prefix slots
    expect(prefixes.length).toBe(6)
    expect(prefixes[0].textContent).toBe('T')
    expect(prefixes[1].textContent).toBe('R')
    expect(prefixes[2].textContent).toBe('B')
    expect(prefixes[3].textContent).toBe('L')
    expect(prefixes[4].textContent).toBe('Z')
  })

  it('emits top change on T input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', top: '8px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const tInput = inputs[0] as HTMLInputElement
    expect(tInput).toBeDefined()
    tInput.focus()
    tInput.value = '20'
    tInput.dispatchEvent(new Event('input', { bubbles: true }))
    tInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const topCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'top')
    expect(topCall).toBeDefined()
    expect(topCall![0].value).toBe('20px')
  })

  it('emits right change on R input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'absolute', right: '8px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const rInput = inputs[1] as HTMLInputElement
    rInput.focus()
    rInput.value = '24'
    rInput.dispatchEvent(new Event('input', { bubbles: true }))
    rInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const rightCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'right')
    expect(rightCall).toBeDefined()
    expect(rightCall![0].value).toBe('24px')
  })

  it('emits bottom change on B input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'absolute', bottom: '0px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const bInput = inputs[2] as HTMLInputElement
    bInput.focus()
    bInput.value = '12'
    bInput.dispatchEvent(new Event('input', { bubbles: true }))
    bInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const bottomCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'bottom')
    expect(bottomCall).toBeDefined()
    expect(bottomCall![0].value).toBe('12px')
  })

  it('emits left change on L input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', left: '8px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const lInput = inputs[3] as HTMLInputElement
    lInput.focus()
    lInput.value = '20'
    lInput.dispatchEvent(new Event('input', { bubbles: true }))
    lInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'left')
    expect(leftCall).toBeDefined()
    expect(leftCall![0].value).toBe('20px')
  })

  it('emits z-index change (no px suffix)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', zIndex: '5' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Z is the 5th numeric input (after T, R, B, L)
    const zInput = inputs[4] as HTMLInputElement
    expect(zInput).toBeDefined()
    zInput.focus()
    zInput.value = '10'
    zInput.dispatchEvent(new Event('input', { bubbles: true }))
    zInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const zCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'z-index')
    expect(zCall).toBeDefined()
    expect(zCall![0].value).toBe('10')
  })

  it('coerces z-index "auto" to 0 in the numeric input without sending "auto" back', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative', zIndex: 'auto' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const zInput = inputs[4] as HTMLInputElement
    expect(zInput.value).toBe('0')
  })

  it('shows T R B L disabled with explanatory tooltip when position is static', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'static' } })
    // Visual consistency: edge inputs stay mounted across mode switches.
    // Disabled state communicates "this control exists but doesn't apply now."
    for (const prefix of ['T', 'R', 'B', 'L'] as const) {
      const input = Array.from(
        container.querySelectorAll('.cortex-numeric-input'),
      ).find(el => el.querySelector('.cortex-numeric-input__prefix')?.textContent === prefix)
      expect(input).toBeDefined()
      const tooltip = input!.getAttribute('data-tooltip')
      expect(tooltip).toContain('Set position to relative, absolute, fixed, or sticky to use offsets')
    }
  })

  it('shows T R B L all enabled when position is non-static (absolute)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'absolute' } })
    const inputs = container.querySelectorAll('.cortex-position-section__xy-row .cortex-numeric-input input')
    // T R B L should all be enabled (no disabled attribute)
    for (let i = 0; i < 4; i++) {
      expect((inputs[i] as HTMLInputElement).disabled).toBe(false)
    }
  })

  it('always renders T/R/B/L/Z prefix labels regardless of position (visual consistency)', () => {
    for (const position of ['static', 'relative', 'absolute', 'fixed', 'sticky'] as const) {
      setup({ values: { ...DEFAULT_VALUES, position } })
      const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
      const labels = Array.from(prefixes).map(p => p.textContent)
      // T R B L Z + rotate icon (no text) — text-bearing prefixes are 5
      expect(labels.slice(0, 5)).toEqual(['T', 'R', 'B', 'L', 'Z'])
      // Tear down before next iteration
      render(null, container)
      container.remove()
    }
  })

  it('tooltip text adapts to position mode (sticky → "stick when scrolled past")', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'sticky' } })
    const tInput = Array.from(
      container.querySelectorAll('.cortex-numeric-input'),
    ).find(el => el.querySelector('.cortex-numeric-input__prefix')?.textContent === 'T')
    expect(tInput!.getAttribute('data-tooltip')).toContain('Stick when scrolled past')
  })

  it('tooltip text adapts to position mode (fixed → "viewport edge")', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'fixed' } })
    const tInput = Array.from(
      container.querySelectorAll('.cortex-numeric-input'),
    ).find(el => el.querySelector('.cortex-numeric-input__prefix')?.textContent === 'T')
    expect(tInput!.getAttribute('data-tooltip')).toContain('viewport edge')
  })

  it('tooltip text adapts to position mode (absolute → "containing block edge")', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'absolute' } })
    const tInput = Array.from(
      container.querySelectorAll('.cortex-numeric-input'),
    ).find(el => el.querySelector('.cortex-numeric-input__prefix')?.textContent === 'T')
    expect(tInput!.getAttribute('data-tooltip')).toContain('containing block edge')
  })

  // Regression: codex review (P2) on PR #158 caught that the old CSS
  // `.cortex-position-section__xy-row > .cortex-numeric-input:last-child
  // { flex: 0 0 56px }` rule narrowed whichever input happened to be last.
  // With T/R/B/L in xy-row, the L input got squashed to 56px; with Z in
  // the same row, Z got squashed too. The fix gives Z its own row class.
  it('Z input is in its own __z-row, not __xy-row (CSS layout invariant)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const zInput = Array.from(
      container.querySelectorAll('.cortex-numeric-input'),
    ).find(el => el.querySelector('.cortex-numeric-input__prefix')?.textContent === 'Z')
    expect(zInput).toBeDefined()
    // Z must NOT be inside an xy-row (where the 4-equal-width rule lives)
    expect(zInput!.closest('.cortex-position-section__xy-row')).toBeNull()
    // Z must be inside its own z-row (where the narrow-56px rule lives)
    expect(zInput!.closest('.cortex-position-section__z-row')).not.toBeNull()
  })

  it('TRBL inputs all sit inside __xy-row (not __z-row)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow).not.toBeNull()
    const prefixes = Array.from(
      xyRow!.querySelectorAll('.cortex-numeric-input__prefix'),
    ).map(p => p.textContent)
    expect(prefixes).toEqual(['T', 'R', 'B', 'L'])
  })

  // Regression: codex review (P3) on PR #158 caught that right/bottom
  // weren't in the dimming registry, so forced-state changes to those
  // properties wouldn't visually dim the controls.
  it('dims TRBL row when dimmedProperties includes right or bottom', () => {
    setup({
      values: { ...DEFAULT_VALUES, position: 'absolute' },
      dimmedProperties: new Set(['right']),
    })
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow!.classList.contains('cortex-control--dimmed')).toBe(true)
  })

  it('dims TRBL row when dimmedProperties includes bottom', () => {
    setup({
      values: { ...DEFAULT_VALUES, position: 'absolute' },
      dimmedProperties: new Set(['bottom']),
    })
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow!.classList.contains('cortex-control--dimmed')).toBe(true)
  })

  it('unit chip shows "auto" when the underlying value is auto (not "px")', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'absolute', top: '10px', right: 'auto', bottom: 'auto', left: '10px' } })
    const inputs = container.querySelectorAll('.cortex-position-section__xy-row .cortex-numeric-input')
    // Inputs[0] = T (10px), [1] = R (auto), [2] = B (auto), [3] = L (10px)
    const units = Array.from(inputs).map(el =>
      el.querySelector('.cortex-numeric-input__unit')?.textContent ?? '',
    )
    expect(units[0]).toBe('px')
    expect(units[1]).toBe('auto')
    expect(units[2]).toBe('auto')
    expect(units[3]).toBe('px')
  })

  // ── Rotate (icon prefix) ───────────────────────────────────────────

  it('renders the rotate input with a RotateCw icon prefix (not text)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    // Rotate is the 6th NumericInput → 6th prefix slot (T, R, B, L, Z, ∠)
    const rotatePrefix = prefixes[5]
    expect(rotatePrefix).toBeDefined()
    const svg = rotatePrefix.querySelector('svg')
    expect(svg).not.toBeNull()
    // Path-fingerprint guard so the assertion fails if the wrong icon
    // (or no icon) gets dropped in.
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.rotateCw)
  })

  it('emits rotate change', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', rotate: '0deg' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Rotation is the 6th numeric input (after T, R, B, L, Z)
    const rotInput = inputs[5] as HTMLInputElement
    expect(rotInput).toBeDefined()
    rotInput.focus()
    rotInput.value = '90'
    rotInput.dispatchEvent(new Event('input', { bubbles: true }))
    rotInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const rotCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'rotate')
    expect(rotCall).toBeDefined()
    expect(rotCall![0].value).toBe('90deg')
  })

  // ── Flip H / Flip V (IconButton pair) ──────────────────────────────

  it('flip H IconButton renders the FlipHorizontal lucide icon', () => {
    setup()
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    expect(flipH).not.toBeNull()
    expect(flipH.classList.contains('cortex-icon-button')).toBe(true)
    const svg = flipH.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.flipH)
  })

  it('flip V IconButton renders the FlipVertical lucide icon', () => {
    setup()
    const flipV = container.querySelector('[aria-label="Flip vertical"]') as HTMLElement
    expect(flipV).not.toBeNull()
    expect(flipV.classList.contains('cortex-icon-button')).toBe(true)
    const svg = flipV.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.flipV)
  })

  it('flip H toggle emits scale: -1 1', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '1', scaleY: '1' } })
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '-1 1' })
  })

  it('flip H toggle off emits scale: 1 1', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '1 1' })
  })

  it('flip V preserves existing flip H state', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipV = container.querySelector('[aria-label="Flip vertical"]') as HTMLElement
    flipV.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '-1 -1' })
  })

  it('flip H IconButton paints active state when scaleX is -1', () => {
    setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    expect(flipH.classList.contains('cortex-icon-button--active')).toBe(true)
    expect(flipH.getAttribute('aria-pressed')).toBe('true')
  })

  it('flip H preserves non-unit magnitude: scaleX -2 → 2 (unflip)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '-2', scaleY: '1' } })
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    // isFlippedH should be true (parseFloat('-2') < 0)
    expect(flipH.classList.contains('cortex-icon-button--active')).toBe(true)
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '2 1' })
  })

  it('flip H preserves non-unit magnitude: scaleX 2 → -2 (flip)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, scaleX: '2', scaleY: '1' } })
    const flipH = container.querySelector('[aria-label="Flip horizontal"]') as HTMLElement
    expect(flipH.classList.contains('cortex-icon-button--active')).toBe(false)
    flipH.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'scale', value: '-2 1' })
  })

  it('flip V IconButton stays inactive when scaleY is 1', () => {
    setup({ values: { ...DEFAULT_VALUES, scaleX: '-1', scaleY: '1' } })
    const flipV = container.querySelector('[aria-label="Flip vertical"]') as HTMLElement
    expect(flipV.classList.contains('cortex-icon-button--active')).toBe(false)
    expect(flipV.getAttribute('aria-pressed')).toBe('false')
  })

  // ── Self-alignment button groups (always visible, two connected groups) ──

  it('renders two button groups with 3 buttons each', () => {
    setup()
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(2)
    expect(groups[0].querySelectorAll('.cortex-icon-button').length).toBe(3)
    expect(groups[1].querySelectorAll('.cortex-icon-button').length).toBe(3)
  })

  // ── Self-alignment per-axis gating (Position QOL round 2) ──────────
  //
  // Per CSS Box Alignment Level 3 §10.2, justify-self is explicitly
  // ignored on flex items (the main axis is fully owned by the parent's
  // justify-content). Grid items honor both axes; abs/fixed elements
  // honor both via the absolute-positioning containing block.

  it('hides both rows when parent is a block container and element is static', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'block', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(0)
  })

  it('shows BOTH rows when parent is grid', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'grid', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(2)
    expect(container.querySelector('[aria-label^="Justify self "]')).not.toBeNull()
    expect(container.querySelector('[aria-label^="Align self "]')).not.toBeNull()
  })

  it('shows ONLY align-self when parent is flex (justify-self is a no-op on flex items)', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'flex', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(1)
    expect(container.querySelector('[aria-label^="Justify self "]')).toBeNull()
    expect(container.querySelector('[aria-label^="Align self "]')).not.toBeNull()
  })

  it('shows ONLY align-self when parent is inline-flex', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'inline-flex', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(1)
    expect(container.querySelector('[aria-label^="Justify self "]')).toBeNull()
    expect(container.querySelector('[aria-label^="Align self "]')).not.toBeNull()
  })

  it('shows BOTH rows for absolute element even with a block parent', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'block', position: 'absolute' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(2)
  })

  it('shows BOTH rows for fixed element even with a block parent', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'block', position: 'fixed' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(2)
  })

  it('hides both rows for relative element with a block parent', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'block', position: 'relative' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(0)
  })

  it('self-alignment buttons render the correct lucide icons (anti-tautology)', () => {
    setup()
    const buttons = container.querySelectorAll('.cortex-position-section__btn-group .cortex-icon-button')
    // Group 1: justify-self start / center / end
    expect(buttons[0].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.justifyStart)
    expect(buttons[1].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.justifyCenter)
    expect(buttons[2].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.justifyEnd)
    // Group 2: align-self start / center / end
    expect(buttons[3].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.alignStart)
    expect(buttons[4].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.alignCenter)
    expect(buttons[5].querySelector('svg')!.innerHTML).toContain(ICON_FINGERPRINT.alignEnd)
  })

  it('no buttons have active state by default', () => {
    setup()
    const active = container.querySelectorAll('.cortex-position-section__btn-group .cortex-icon-button--active')
    expect(active.length).toBe(0)
  })

  // ── Active state reflects current values.justifySelf / values.alignSelf ──

  it('marks the justify-self button matching values.justifySelf as active', () => {
    setup({ values: { ...DEFAULT_VALUES, justifySelf: 'center' } })
    const btn = container.querySelector('[aria-label="Justify self center"]') as HTMLElement
    expect(btn.classList.contains('cortex-icon-button--active')).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    // Siblings should NOT be active
    const start = container.querySelector('[aria-label="Justify self left"]') as HTMLElement
    const end = container.querySelector('[aria-label="Justify self right"]') as HTMLElement
    expect(start.classList.contains('cortex-icon-button--active')).toBe(false)
    expect(end.classList.contains('cortex-icon-button--active')).toBe(false)
  })

  it('marks the align-self button matching values.alignSelf as active', () => {
    setup({ values: { ...DEFAULT_VALUES, alignSelf: 'end' } })
    const btn = container.querySelector('[aria-label="Align self bottom"]') as HTMLElement
    expect(btn.classList.contains('cortex-icon-button--active')).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('justify-self "auto" leaves all buttons inactive (only start/center/end count)', () => {
    setup({ values: { ...DEFAULT_VALUES, justifySelf: 'auto', alignSelf: 'auto' } })
    const active = container.querySelectorAll('.cortex-position-section__btn-group .cortex-icon-button--active')
    expect(active.length).toBe(0)
  })

  it('marks active states across BOTH rows simultaneously when both are set', () => {
    setup({ values: { ...DEFAULT_VALUES, justifySelf: 'start', alignSelf: 'end' } })
    const justifyActive = container.querySelector('[aria-label="Justify self left"]') as HTMLElement
    const alignActive = container.querySelector('[aria-label="Align self bottom"]') as HTMLElement
    expect(justifyActive.classList.contains('cortex-icon-button--active')).toBe(true)
    expect(alignActive.classList.contains('cortex-icon-button--active')).toBe(true)
  })

  // ── Toggle-to-clear (Figma/Webflow convention) ─────────────────────
  //
  // Clicking an already-active self-alignment button emits 'auto' instead
  // of re-emitting the same value. The inverse gesture (same click) is
  // the reset, so the panel doesn't need a separate clear affordance.

  it('clicking the active justify-self button emits "auto" (toggle-to-clear)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, justifySelf: 'center' } })
    const btn = container.querySelector('[aria-label="Justify self center"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'auto' })
  })

  it('clicking the active align-self button emits "auto" (toggle-to-clear)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, alignSelf: 'end' } })
    const btn = container.querySelector('[aria-label="Align self bottom"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'auto' })
  })

  it('clicking a DIFFERENT justify-self button still emits the new value (not auto)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, justifySelf: 'start' } })
    const btn = container.querySelector('[aria-label="Justify self right"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'end' })
  })

  it('clicking an inactive button when value is "auto" emits the new value', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, justifySelf: 'auto' } })
    const btn = container.querySelector('[aria-label="Justify self center"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'center' })
  })

  // ── Parent-aware self-alignment (axis adaptation) ─────────────────
  //
  // align-self operates on the cross axis (flex) or block axis (grid).
  // For flex parents, cross axis depends on flex-direction. Icons and
  // labels now adapt so the panel always speaks designer-spatial
  // language (left/right/top/bottom) rather than CSS-axis language
  // (start/center/end) which lies in column-flex.

  it('alignSelfAxis: row-flex parent → vertical (top/middle/bottom)', () => {
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'flex', parentFlexDirection: 'row' })).toBe('vertical')
  })

  it('alignSelfAxis: row-reverse-flex parent → vertical', () => {
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'flex', parentFlexDirection: 'row-reverse' })).toBe('vertical')
  })

  it('alignSelfAxis: column-flex parent → horizontal (left/center/right)', () => {
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'flex', parentFlexDirection: 'column' })).toBe('horizontal')
  })

  it('alignSelfAxis: column-reverse-flex parent → horizontal', () => {
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'flex', parentFlexDirection: 'column-reverse' })).toBe('horizontal')
  })

  it('alignSelfAxis: grid parent → vertical (block axis in horizontal writing modes)', () => {
    // flex-direction is irrelevant for grid; should still be vertical
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'grid', parentFlexDirection: 'row' })).toBe('vertical')
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'grid', parentFlexDirection: 'column' })).toBe('vertical')
  })

  it('alignSelfAxis: block parent (no flex/grid) → vertical (default)', () => {
    expect(alignSelfAxis({ position: 'static', parentDisplay: 'block', parentFlexDirection: 'row' })).toBe('vertical')
  })

  // Regression: codex review (P2) on PR #161 caught that abs/fixed elements
  // inside column-flex parents were spuriously getting horizontal labels.
  // Abs/fixed escapes the flex layout — their align-self operates on the
  // abs-positioning containing block's block axis (always vertical), NOT
  // the parent's cross axis.
  it('alignSelfAxis: abs element in column-flex parent → vertical (escapes flex)', () => {
    expect(alignSelfAxis({ position: 'absolute', parentDisplay: 'flex', parentFlexDirection: 'column' })).toBe('vertical')
  })

  it('alignSelfAxis: fixed element in column-flex parent → vertical (escapes flex)', () => {
    expect(alignSelfAxis({ position: 'fixed', parentDisplay: 'flex', parentFlexDirection: 'column' })).toBe('vertical')
  })

  it('alignSelfAxis: relative element in column-flex parent → horizontal (relative is still a flex item)', () => {
    // Sanity check: relative does NOT escape flex, so column direction applies.
    expect(alignSelfAxis({ position: 'relative', parentDisplay: 'flex', parentFlexDirection: 'column' })).toBe('horizontal')
  })

  it('UI: absolute element in column-flex shows VERTICAL align-self labels', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        position: 'absolute',
        parentDisplay: 'flex',
        parentFlexDirection: 'column',
      },
    })
    // Must read top/middle/bottom (not left/center/right) because the
    // abs element doesn't participate in the column-flex cross axis.
    expect(container.querySelector('[aria-label="Align self top"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self middle"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self bottom"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self left"]')).toBeNull()
    expect(container.querySelector('[aria-label="Align self right"]')).toBeNull()
  })

  it('align-self labels are top/middle/bottom when parent is row-flex', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        parentDisplay: 'flex',
        parentFlexDirection: 'row',
      },
    })
    expect(container.querySelector('[aria-label="Align self top"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self middle"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self bottom"]')).not.toBeNull()
    // The spatial-mismatched labels (left/right/center) should NOT exist
    expect(container.querySelector('[aria-label="Align self left"]')).toBeNull()
    expect(container.querySelector('[aria-label="Align self right"]')).toBeNull()
  })

  it('align-self labels are left/center/right when parent is column-flex (KEY parent-aware case)', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        parentDisplay: 'flex',
        parentFlexDirection: 'column',
      },
    })
    expect(container.querySelector('[aria-label="Align self left"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self center"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self right"]')).not.toBeNull()
    // The vertical-axis labels should NOT exist
    expect(container.querySelector('[aria-label="Align self top"]')).toBeNull()
    expect(container.querySelector('[aria-label="Align self bottom"]')).toBeNull()
  })

  it('justify-self labels are ALWAYS left/center/right regardless of parent (justify is always horizontal axis)', () => {
    for (const parentFlexDirection of ['row', 'row-reverse', 'column', 'column-reverse'] as const) {
      setup({
        values: {
          ...DEFAULT_VALUES,
          parentDisplay: 'grid', // grid honors justify-self
          parentFlexDirection,
        },
      })
      expect(container.querySelector('[aria-label="Justify self left"]')).not.toBeNull()
      expect(container.querySelector('[aria-label="Justify self center"]')).not.toBeNull()
      expect(container.querySelector('[aria-label="Justify self right"]')).not.toBeNull()
      // Vertical labels must never appear on the justify row
      expect(container.querySelector('[aria-label="Justify self top"]')).toBeNull()
      expect(container.querySelector('[aria-label="Justify self bottom"]')).toBeNull()
      render(null, container)
      container.remove()
    }
  })

  it('tooltip text adapts to axis: align-self center is "Middle" when vertical, "Center" when horizontal', () => {
    // Vertical axis (default row-flex): center label is "Middle"
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'flex', parentFlexDirection: 'row' } })
    const verticalCenter = container.querySelector('[aria-label="Align self middle"]') as HTMLElement
    expect(verticalCenter.getAttribute('data-tooltip')).toBe('Align self · Middle')
    render(null, container)
    container.remove()

    // Horizontal axis (column-flex): center label is "Center"
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'flex', parentFlexDirection: 'column' } })
    const horizontalCenter = container.querySelector('[aria-label="Align self center"]') as HTMLElement
    expect(horizontalCenter.getAttribute('data-tooltip')).toBe('Align self · Center')
  })

  it('column-flex align-self uses horizontal-shift icons (JustifySelf icons reused for axis)', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        parentDisplay: 'flex',
        parentFlexDirection: 'column',
      },
    })
    const leftBtn = container.querySelector('[aria-label="Align self left"]') as HTMLElement
    const svg = leftBtn.querySelector('svg')
    expect(svg).not.toBeNull()
    // Horizontal-shift icon (the same icon used for justify-self start) has
    // the inner box at x=3 — its anti-tautology fingerprint.
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.justifyStart)
  })

  it('row-flex align-self uses vertical-shift icons (existing align fingerprint)', () => {
    setup({
      values: {
        ...DEFAULT_VALUES,
        parentDisplay: 'flex',
        parentFlexDirection: 'row',
      },
    })
    const topBtn = container.querySelector('[aria-label="Align self top"]') as HTMLElement
    const svg = topBtn.querySelector('svg')
    expect(svg!.innerHTML).toContain(ICON_FINGERPRINT.alignStart)
  })

  it('toggle-to-clear is independent across rows: clicking active justify does NOT affect align', () => {
    const { onChange } = setup({
      values: { ...DEFAULT_VALUES, justifySelf: 'center', alignSelf: 'end' },
    })
    const btn = container.querySelector('[aria-label="Justify self center"]') as HTMLElement
    btn.click()
    // Only justify-self should have been touched, set to auto
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'auto' })
    // No align-self emission should have occurred
    const alignCalls = onChange.mock.calls.filter((c: any) => c[0]?.property === 'align-self')
    expect(alignCalls.length).toBe(0)
  })

  it('justify-self start emits onChange with property:"justify-self" value:"start"', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Justify self left"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'start' })
  })

  it('justify-self center emits the center value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Justify self center"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'center' })
  })

  it('justify-self end emits the end value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Justify self right"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'end' })
  })

  it('align-self start emits onChange with property:"align-self" value:"start"', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self top"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'start' })
  })

  it('align-self center emits the center value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self middle"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'center' })
  })

  it('align-self end emits the end value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self bottom"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'end' })
  })
})
