import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, h } from 'preact'
import {
  AppearanceSection,
  parseAppearanceValues,
  type AppearanceValues,
  type AppearanceChange,
} from '../../../src/browser/components/sections/AppearanceSection.js'

// ---------------------------------------------------------------------------
// parseAppearanceValues
//
// Pure-function coverage first: every branch the parser takes must be
// exercised before we ever mount the component. This is the extraction half
// of "move opacity out of EffectsSection" — the parse logic now lives here,
// not in EffectsSection. Re-implemented, not copy-pasted (no shadow copy).
// ---------------------------------------------------------------------------
describe('parseAppearanceValues', () => {
  it('rounds opacity 0.75 to 75% (integer percentage)', () => {
    const cs = {
      opacity: '0.75',
      visibility: 'visible',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    expect(parseAppearanceValues(cs).opacity).toBe(75)
  })

  it('defaults opacity to 100 when the computed style is empty', () => {
    const cs = {
      opacity: '',
      visibility: 'visible',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    expect(parseAppearanceValues(cs).opacity).toBe(100)
  })

  it('rounds fractional opacity cleanly — 0.333 -> 33', () => {
    const cs = {
      opacity: '0.333',
      visibility: 'visible',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    expect(parseAppearanceValues(cs).opacity).toBe(33)
  })

  it('reads visibility literally from the computed style', () => {
    const cs = {
      opacity: '1',
      visibility: 'hidden',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    expect(parseAppearanceValues(cs).visibility).toBe('hidden')
  })

  it('defaults visibility to "visible" when the computed style is empty', () => {
    const cs = {
      opacity: '1',
      visibility: '',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    expect(parseAppearanceValues(cs).visibility).toBe('visible')
  })

  it('parses uniform and per-corner border radii as numeric pixels', () => {
    const cs = {
      opacity: '1',
      visibility: 'visible',
      borderRadius: '8px',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '4px',
      borderBottomRightRadius: '2px',
      borderBottomLeftRadius: '0px',
    } as unknown as CSSStyleDeclaration
    const v = parseAppearanceValues(cs)
    expect(v.borderRadius).toBe(8)
    expect(v.borderTopLeftRadius).toBe(8)
    expect(v.borderTopRightRadius).toBe(4)
    expect(v.borderBottomRightRadius).toBe(2)
    expect(v.borderBottomLeftRadius).toBe(0)
  })

  it('defaults radii to 0 when the computed style returns non-numeric strings', () => {
    const cs = {
      opacity: '1',
      visibility: 'visible',
      borderRadius: 'auto',
      borderTopLeftRadius: '',
      borderTopRightRadius: 'auto',
      borderBottomRightRadius: '',
      borderBottomLeftRadius: '',
    } as unknown as CSSStyleDeclaration
    const v = parseAppearanceValues(cs)
    expect(v.borderRadius).toBe(0)
    expect(v.borderTopLeftRadius).toBe(0)
    expect(v.borderTopRightRadius).toBe(0)
    expect(v.borderBottomRightRadius).toBe(0)
    expect(v.borderBottomLeftRadius).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AppearanceSection rendering
// ---------------------------------------------------------------------------
describe('AppearanceSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: AppearanceValues = {
    opacity: 80,
    visibility: 'visible',
    borderRadius: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 4,
  }

  function setup(overrides: Partial<Parameters<typeof AppearanceSection>[0]> = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      h(AppearanceSection, {
        values: DEFAULT_VALUES,
        onChange,
        ...overrides,
      }),
      container,
    )
    return { onChange }
  }

  it('renders with data-section-id="appearance"', () => {
    setup()
    expect(container.querySelector('[data-section-id="appearance"]')).not.toBeNull()
  })

  it('renders an opacity NumericInput showing the current percentage', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const opacityInput = Array.from(inputs).find((el) =>
      el.textContent?.includes('%'),
    )
    expect(opacityInput).toBeDefined()
    const input = opacityInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('80')
  })

  it('emits opacity as a 0..1 CSS string on change (80 -> "0.8")', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const opacityInput = Array.from(inputs).find((el) =>
      el.textContent?.includes('%'),
    )!
    const input = opacityInput.querySelector('input') as HTMLInputElement
    input.focus()
    ;(input as HTMLInputElement & { dispatchEvent: (e: Event) => boolean }).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    )
    // 80 + 1 = 81 → "0.81"
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls.at(-1)![0] as AppearanceChange
    expect(lastCall.property).toBe('opacity')
    expect(lastCall.value).toBe('0.81')
  })

  it('shows an indeterminate uniform radius (-- placeholder) when per-corner radii disagree on the element', () => {
    // CSSOM emits `border-radius` as a shorthand when the 4 corners differ
    // (e.g. "12px 12px 12px 0px"). `parseFloat` would capture only the
    // leading `12`, silently misrepresenting state. The section detects
    // this intra-element divergence and flips the uniform input to the
    // same "mixed" state used for multi-selection variance: empty value
    // + "--" placeholder, so the user can type a target to unify.
    setup({
      values: {
        ...DEFAULT_VALUES,
        borderRadius: 12,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomRightRadius: 12,
        borderBottomLeftRadius: 0, // one corner differs → indeterminate
      },
    })
    const radiusInput = container.querySelector(
      '[data-tooltip="Corner Radius"]',
    ) as HTMLElement
    const input = radiusInput.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('--')
  })

  it('keeps the uniform radius concrete when all 4 per-corner radii agree', () => {
    // Falsifiability counterpart of the divergence test above — if the
    // uniform-mixed logic ever flips to "always mixed" by accident, this
    // test fails.
    setup({
      values: {
        ...DEFAULT_VALUES,
        borderRadius: 8,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        borderBottomLeftRadius: 8,
      },
    })
    const radiusInput = container.querySelector(
      '[data-tooltip="Corner Radius"]',
    ) as HTMLElement
    const input = radiusInput.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('8')
  })

  it('renders a uniform corner-radius NumericInput with a Square icon prefix by default', () => {
    setup()
    // Identify the radius input by its semantic tooltip (the Panel v2 redesign
    // replaced the legacy "R" text label with a Lucide `Square` prefix icon).
    const radiusInput = container.querySelector(
      '[data-tooltip="Corner Radius"]',
    ) as HTMLElement | null
    expect(radiusInput).not.toBeNull()
    const prefix = radiusInput!.querySelector('.cortex-numeric-input__prefix')
    expect(prefix).not.toBeNull()
    expect(prefix!.querySelector('svg')).not.toBeNull()
    expect((radiusInput!.querySelector('input') as HTMLInputElement).value).toBe('4')
  })

  it('has a per-corner toggle button that swaps to 4 corner-prefixed inputs when clicked', async () => {
    setup()
    const toggle = container.querySelector(
      '.cortex-appearance-section__corner-toggle',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    toggle.click()
    // Preact state flush is async via setTimeout(0) — give it a tick.
    await new Promise((r) => setTimeout(r, 10))
    const toggleAfter = container.querySelector(
      '.cortex-appearance-section__corner-toggle',
    ) as HTMLButtonElement
    expect(toggleAfter.getAttribute('aria-pressed')).toBe('true')
    // Each per-corner NumericInput is identified by its semantic tooltip
    // (the Panel v2 polish replaced the earlier TL/TR/BR/BL text labels
    // with Lucide-style corner-bracket prefix icons — see CornerTopLeft,
    // CornerTopRight, CornerBottomRight, CornerBottomLeft in icons.tsx).
    const tooltips = [
      'Top Left Radius',
      'Top Right Radius',
      'Bottom Right Radius',
      'Bottom Left Radius',
    ]
    for (const tooltip of tooltips) {
      const input = container.querySelector(`[data-tooltip="${tooltip}"]`)
      expect(input, `expected an input with tooltip "${tooltip}"`).not.toBeNull()
      // Prefix slot must contain an SVG (the corner indicator icon).
      const prefixSvg = input!.querySelector('.cortex-numeric-input__prefix svg')
      expect(prefixSvg, `expected "${tooltip}" to have a prefix SVG`).not.toBeNull()
    }
  })

  it('renders an eye-toggle button for visibility with Lucide Eye icon when visible', () => {
    setup()
    const toggle = container.querySelector(
      '.cortex-appearance-section__visibility-toggle',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    // When visible: should have Eye icon (path attribute containing the distinctive lens path)
    const svg = toggle.querySelector('svg')
    expect(svg).not.toBeNull()
    // Eye icon has a <circle cx="12" cy="12" r="3">; EyeOff does not.
    expect(svg!.querySelector('circle')).not.toBeNull()
  })

  it('renders the EyeClosed icon and aria-pressed=true when visibility=hidden', () => {
    setup({ values: { ...DEFAULT_VALUES, visibility: 'hidden' } })
    const toggle = container.querySelector(
      '.cortex-appearance-section__visibility-toggle',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Show element')
    // EyeClosed icon: 5 <path> elements, zero <circle> elements. Locks the
    // specific Lucide glyph (Eye would have 1 path + 1 circle; EyeOff would
    // have 4 paths). Any drift surfaces here with a precise count mismatch.
    const svg = toggle.querySelector('svg')!
    expect(svg.querySelectorAll('path').length).toBe(5)
    expect(svg.querySelector('circle')).toBeNull()
  })

  it('emits visibility=hidden when the eye button is clicked while visible', () => {
    const { onChange } = setup()
    const toggle = container.querySelector(
      '.cortex-appearance-section__visibility-toggle',
    ) as HTMLButtonElement
    toggle.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'visibility', value: 'hidden' })
  })

  it('emits visibility=visible when the eye button is clicked while hidden', () => {
    const onChange = vi.fn()
    setup({ values: { ...DEFAULT_VALUES, visibility: 'hidden' }, onChange })
    const toggle = container.querySelector(
      '.cortex-appearance-section__visibility-toggle',
    ) as HTMLButtonElement
    toggle.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'visibility', value: 'visible' })
  })

  // --- CTF3/CTF7: dimmedProperties -------------------------------------------
  // AppearanceSection was the first section to READ dimmedProperties and apply
  // a visual dim. CTF7 moved to the shared .cortex-control--dimmed class. The
  // Panel v2 single-row redesign (ZF0-1124) moved the dim class from per-row
  // wrappers onto per-item spans (for NumericInputs) and directly onto the
  // button class lists (corner-toggle, visibility-toggle). The data model has
  // always been per-property, so the DOM now mirrors it.
  describe('dimmedProperties (CTF3 pilot)', () => {
    const getOpacityItem = () =>
      container.querySelector(
        '.cortex-appearance-section__row > .cortex-appearance-section__item:first-child',
      )!
    const getRadiusCornerToggle = () =>
      container.querySelector(
        '.cortex-appearance-section__corner-toggle',
      )!
    const getVisibilityToggle = () =>
      container.querySelector(
        '.cortex-appearance-section__visibility-toggle',
      )!

    it('dims the opacity control when dimmedProperties contains "opacity"', () => {
      setup({ dimmedProperties: new Set(['opacity']) })
      expect(getOpacityItem().classList.contains('cortex-control--dimmed')).toBe(true)
    })

    it('does NOT dim the opacity control when dimmedProperties is absent or does not include opacity', () => {
      setup({ dimmedProperties: new Set(['visibility']) })
      expect(getOpacityItem().classList.contains('cortex-control--dimmed')).toBe(false)
    })

    it('dims the visibility toggle when dimmedProperties contains "visibility"', () => {
      setup({ dimmedProperties: new Set(['visibility']) })
      expect(getVisibilityToggle().classList.contains('cortex-control--dimmed')).toBe(true)
    })

    it('dims the radius controls when dimmedProperties contains "border-radius"', () => {
      setup({ dimmedProperties: new Set(['border-radius']) })
      // The uniform radius __item span AND the corner-toggle both carry the
      // dim class — the former because the input itself reflects the overridden
      // value, the latter because the per-corner affordance is the fallback
      // representation when the uniform input isn't rendered.
      const radiusItem = container.querySelector(
        '.cortex-appearance-section__row > .cortex-appearance-section__item:nth-of-type(2)',
      )!
      expect(radiusItem.classList.contains('cortex-control--dimmed')).toBe(true)
      expect(getRadiusCornerToggle().classList.contains('cortex-control--dimmed')).toBe(true)
    })

    it('also dims the radius controls when any per-corner radius is dimmed', () => {
      setup({ dimmedProperties: new Set(['border-top-left-radius']) })
      expect(getRadiusCornerToggle().classList.contains('cortex-control--dimmed')).toBe(true)
    })
  })

  // --- Per-corner state reset on element change ----------------------------
  // When the selected element changes, the per-corner UI MUST collapse so a
  // user's "expanded corners" state from a previous element doesn't leak into
  // the next. Implemented via a `resetKey` prop that Panel.tsx changes on
  // element identity, relying on React key-based remount.
  describe('per-corner expand state reset via resetKey', () => {
    it('resets the per-corner expansion when resetKey changes', async () => {
      container = document.createElement('div')
      document.body.appendChild(container)
      const onChange = vi.fn()
      // First render — expand corners
      render(
        h(AppearanceSection, {
          values: DEFAULT_VALUES,
          onChange,
          resetKey: 'div|first',
        }),
        container,
      )
      const firstToggle = container.querySelector(
        '.cortex-appearance-section__corner-toggle',
      ) as HTMLButtonElement
      firstToggle.click()
      await new Promise((r) => setTimeout(r, 10))
      expect(
        (container.querySelector(
          '.cortex-appearance-section__corner-toggle',
        ) as HTMLButtonElement).getAttribute('aria-pressed'),
      ).toBe('true')

      // Re-render with a new resetKey — per-corner UI must collapse again
      render(
        h(AppearanceSection, {
          values: DEFAULT_VALUES,
          onChange,
          resetKey: 'span|second',
        }),
        container,
      )
      await new Promise((r) => setTimeout(r, 10))
      const afterToggle = container.querySelector(
        '.cortex-appearance-section__corner-toggle',
      ) as HTMLButtonElement
      expect(afterToggle.getAttribute('aria-pressed')).toBe('false')
    })

    // Negative control: the invariant the above test does NOT prove is that a
    // re-render with the SAME resetKey (e.g. because an unrelated prop like
    // `values.opacity` changed) must NOT collapse the per-corner state. The
    // load-bearing piece of AppearanceSection for this is the `prevResetKeyRef`
    // mount-skip guard; a future simplifier replacing it with a naive effect
    // would silently wipe the user's expansion on every re-render. This test
    // locks that invariant — it fails the moment the guard is removed.
    it('does NOT reset the per-corner expansion when resetKey is unchanged across re-renders', async () => {
      container = document.createElement('div')
      document.body.appendChild(container)
      const onChange = vi.fn()
      // Initial render with stable resetKey.
      render(
        h(AppearanceSection, {
          values: DEFAULT_VALUES,
          onChange,
          resetKey: 'stable-key',
        }),
        container,
      )
      const firstToggle = container.querySelector(
        '.cortex-appearance-section__corner-toggle',
      ) as HTMLButtonElement
      firstToggle.click()
      await new Promise((r) => setTimeout(r, 10))
      expect(
        (container.querySelector(
          '.cortex-appearance-section__corner-toggle',
        ) as HTMLButtonElement).getAttribute('aria-pressed'),
      ).toBe('true')
      // Sanity check: corner inputs are visible.
      // Sanity: the per-corner Top-Left input renders with its tooltip.
      expect(
        container.querySelector('[data-tooltip="Top Left Radius"]'),
      ).not.toBeNull()

      // Re-render with the SAME resetKey but a different unrelated prop value
      // (opacity jumps 80 → 60). The mount-skip guard must suppress the reset.
      render(
        h(AppearanceSection, {
          values: { ...DEFAULT_VALUES, opacity: 60 },
          onChange,
          resetKey: 'stable-key',
        }),
        container,
      )
      await new Promise((r) => setTimeout(r, 10))
      const afterToggle = container.querySelector(
        '.cortex-appearance-section__corner-toggle',
      ) as HTMLButtonElement
      expect(afterToggle.getAttribute('aria-pressed')).toBe('true')
      // All 4 per-corner inputs must still be rendered, identified by tooltip.
      expect(container.querySelector('[data-tooltip="Top Left Radius"]')).not.toBeNull()
      expect(container.querySelector('[data-tooltip="Top Right Radius"]')).not.toBeNull()
      expect(container.querySelector('[data-tooltip="Bottom Right Radius"]')).not.toBeNull()
      expect(container.querySelector('[data-tooltip="Bottom Left Radius"]')).not.toBeNull()
    })
  })
})
