import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { PositionSection, parsePositionValues } from '../../../src/browser/components/sections/PositionSection.js'
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
  // JustifySelfStart: inner solid box anchored to left of cell — <rect x="4" y="6" width="6" ...
  justifyStart: 'x="4" y="6" width="6"',
  // JustifySelfCenter: inner solid box centered horizontally — <rect x="9" y="6" width="6" ...
  justifyCenter: 'x="9" y="6" width="6"',
  // JustifySelfEnd: inner solid box anchored to right of cell — <rect x="14" y="6" width="6" ...
  justifyEnd: 'x="14" y="6" width="6"',
  // AlignSelfStart: inner solid box anchored to top of cell — <rect x="6" y="5" width="12" ...
  alignStart: 'x="6" y="5" width="12"',
  // AlignSelfCenter: inner solid box centered vertically — <rect x="6" y="9" width="12" ...
  alignCenter: 'x="6" y="9" width="12"',
  // AlignSelfEnd: inner solid box anchored to bottom of cell — <rect x="6" y="13" width="12" ...
  alignEnd: 'x="6" y="13" width="12"',
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
    zIndex: 'auto',
    rotate: 'none',
    scaleX: '1',
    scaleY: '1',
    justifySelf: 'auto',
    alignSelf: 'auto',
    parentDisplay: 'grid',
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
      zIndex: '5',
      rotate: '45deg',
      scaleX: '-1',
      scaleY: '1',
      justifySelf: 'center',
      alignSelf: 'end',
      // parentDisplay defaults to 'block' here; panel-style-snapshot
      // patches in the real parent's display where the element exists.
      parentDisplay: 'block',
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
      justifySelf: 'auto',
      alignSelf: 'auto',
      parentDisplay: 'block',
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

  // ── X / Y / Z numeric inputs (inline prefix slot) ──────────────────

  it('renders X/Y/Z inputs with inline prefix slots (not standalone labels)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    // X, Y, Z, plus the rotate icon prefix = 4 prefix slots
    expect(prefixes.length).toBe(4)
    expect(prefixes[0].textContent).toBe('X')
    expect(prefixes[1].textContent).toBe('Y')
    expect(prefixes[2].textContent).toBe('Z')
  })

  it('emits left change on X input', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', left: '8px', top: '0px' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const xInput = inputs[0] as HTMLInputElement
    expect(xInput).toBeDefined()
    xInput.focus()
    xInput.value = '20'
    xInput.dispatchEvent(new Event('input', { bubbles: true }))
    xInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'left')
    expect(leftCall).toBeDefined()
    expect(leftCall![0].value).toBe('20px')
  })

  it('emits z-index change (no px suffix)', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, position: 'relative', zIndex: '5' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Z is the 3rd numeric input (after X and Y)
    const zInput = inputs[2] as HTMLInputElement
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
    const zInput = inputs[2] as HTMLInputElement
    expect(zInput.value).toBe('0')
  })

  it('hides X and Y inputs entirely when position is static (Z stays visible)', () => {
    setup()
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow).not.toBeNull()
    // No disabled-row class — we hide rather than disable.
    expect(xyRow!.classList.contains('cortex-position-section__xy-row--disabled')).toBe(false)
    const prefixes = xyRow!.querySelectorAll('.cortex-numeric-input__prefix')
    // Only Z remains; X and Y are unmounted.
    expect(prefixes.length).toBe(1)
    expect(prefixes[0].textContent).toBe('Z')
  })

  it('shows X, Y, and Z when position is relative', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const xyRow = container.querySelector('.cortex-position-section__xy-row')
    expect(xyRow).not.toBeNull()
    const prefixes = xyRow!.querySelectorAll('.cortex-numeric-input__prefix')
    expect(prefixes.length).toBe(3)
    expect(prefixes[0].textContent).toBe('X')
    expect(prefixes[1].textContent).toBe('Y')
    expect(prefixes[2].textContent).toBe('Z')
  })

  // ── Rotate (icon prefix) ───────────────────────────────────────────

  it('renders the rotate input with a RotateCw icon prefix (not text)', () => {
    setup({ values: { ...DEFAULT_VALUES, position: 'relative' } })
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    // Rotate is the 4th NumericInput → 4th prefix slot (X, Y, Z, ∠)
    const rotatePrefix = prefixes[3]
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
    // Rotation is the 4th numeric input (after X, Y, Z)
    const rotInput = inputs[3] as HTMLInputElement
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
    expect(container.querySelector('[aria-label="Justify self"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Align self"]')).not.toBeNull()
  })

  it('shows ONLY align-self when parent is flex (justify-self is a no-op on flex items)', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'flex', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(1)
    expect(container.querySelector('[aria-label="Justify self"]')).toBeNull()
    expect(container.querySelector('[aria-label="Align self"]')).not.toBeNull()
  })

  it('shows ONLY align-self when parent is inline-flex', () => {
    setup({ values: { ...DEFAULT_VALUES, parentDisplay: 'inline-flex', position: 'static' } })
    const groups = container.querySelectorAll('.cortex-position-section__btn-group')
    expect(groups.length).toBe(1)
    expect(container.querySelector('[aria-label="Justify self"]')).toBeNull()
    expect(container.querySelector('[aria-label="Align self"]')).not.toBeNull()
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
    const start = container.querySelector('[aria-label="Justify self start"]') as HTMLElement
    const end = container.querySelector('[aria-label="Justify self end"]') as HTMLElement
    expect(start.classList.contains('cortex-icon-button--active')).toBe(false)
    expect(end.classList.contains('cortex-icon-button--active')).toBe(false)
  })

  it('marks the align-self button matching values.alignSelf as active', () => {
    setup({ values: { ...DEFAULT_VALUES, alignSelf: 'end' } })
    const btn = container.querySelector('[aria-label="Align self end"]') as HTMLElement
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
    const justifyActive = container.querySelector('[aria-label="Justify self start"]') as HTMLElement
    const alignActive = container.querySelector('[aria-label="Align self end"]') as HTMLElement
    expect(justifyActive.classList.contains('cortex-icon-button--active')).toBe(true)
    expect(alignActive.classList.contains('cortex-icon-button--active')).toBe(true)
  })

  it('justify-self start emits onChange with property:"justify-self" value:"start"', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Justify self start"]') as HTMLElement
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
    const btn = container.querySelector('[aria-label="Justify self end"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'justify-self', value: 'end' })
  })

  it('align-self start emits onChange with property:"align-self" value:"start"', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self start"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'start' })
  })

  it('align-self center emits the center value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self center"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'center' })
  })

  it('align-self end emits the end value', () => {
    const { onChange } = setup()
    const btn = container.querySelector('[aria-label="Align self end"]') as HTMLElement
    btn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'align-self', value: 'end' })
  })
})
