# Phase 5b: Fill + Color Picker + Border + Shadow + Effects Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build four new panel sections (Fill, Border, Shadow, Effects) and two shared controls (ColorInput, ColorPicker) for the Cortex visual editor.

**Architecture:** Follows the established section pattern from Phase 5a — each section has a `*Values`/`*Change`/`*SectionProps` interface trio, a `parse*Values(cs)` static parser called by Panel, and three-callback wiring (onChange/onScrub/onScrubEnd). ColorPicker uses vanilla-colorful Web Component for the spectrum/hue area with hand-written alpha, hex/RGB/HSL inputs, and Tailwind swatches.

**Tech Stack:** Preact, vanilla-colorful (~2.7KB), @floating-ui/dom (existing), vitest + happy-dom

**Spec:** `docs/superpowers/specs/2026-03-15-phase-5b-fill-border-shadow-effects-design.md`

---

## File Structure

### New Files (Create)

| File | Responsibility |
|---|---|
| `src/browser/components/controls/ColorInput.tsx` | Reusable swatch + hex text input, opens ColorPicker |
| `src/browser/components/controls/ColorPicker.tsx` | Full color picker popover (vanilla-colorful + alpha + inputs + swatches) |
| `src/browser/components/sections/FillSection.tsx` | Background color + background opacity |
| `src/browser/components/sections/BorderSection.tsx` | Border width/style/color/radius with per-corner toggle |
| `src/browser/components/sections/ShadowSection.tsx` | Multi-shadow box-shadow parse/edit/add/remove |
| `src/browser/components/sections/EffectsSection.tsx` | Opacity, overflow, cursor, blur, backdrop-blur |
| `tests/browser/controls/color-input.test.tsx` | ColorInput tests |
| `tests/browser/controls/color-picker.test.tsx` | ColorPicker tests |
| `tests/browser/sections/fill-section.test.tsx` | FillSection tests |
| `tests/browser/sections/border-section.test.tsx` | BorderSection tests |
| `tests/browser/sections/shadow-section.test.tsx` | ShadowSection tests |
| `tests/browser/sections/effects-section.test.tsx` | EffectsSection tests |

### Modified Files

| File | Change |
|---|---|
| `src/browser/components/Panel.tsx` | Import new sections + parsers, add computed style parsing, wire change handlers, render sections |
| `src/browser/components/sections/TypographySection.tsx` | Replace inline color swatch/hex with shared ColorInput |
| `src/browser/styles.css` | Add CSS for ColorPicker popover, FillSection, BorderSection, ShadowSection, EffectsSection |
| `package.json` | Add `vanilla-colorful` dependency |

---

## Chunk 1: Foundation

### Task 1: Install vanilla-colorful

- [ ] **Step 1: Install the dependency**

```bash
cd cortex-editor && npm install vanilla-colorful
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require.resolve('vanilla-colorful')"
```
Expected: prints the resolved path, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vanilla-colorful dependency for color picker"
```

---

### Task 2: ColorInput control

Reusable swatch + hex text input. Extracts the pattern already in TypographySection into a shared component.

**Files:**
- Create: `cortex-editor/src/browser/components/controls/ColorInput.tsx`
- Create: `cortex-editor/tests/browser/controls/color-input.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css` (already has `.cortex-color-input*` classes)

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/controls/color-input.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ColorInput } from '../../../src/browser/components/controls/ColorInput.js'

describe('ColorInput', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof ColorInput>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <ColorInput value="rgb(59, 130, 246)" onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('renders a color swatch with the correct background', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('renders hex input showing converted hex value', () => {
    setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex).not.toBeNull()
    expect(hex.value).toBe('#3b82f6')
  })

  it('converts rgb to hex correctly', () => {
    setup({ value: 'rgb(0, 0, 0)' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#000000')
  })

  it('handles already-hex values', () => {
    setup({ value: '#ff0000' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#ff0000')
  })

  it('commits valid hex on blur', () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.focus()
    // Simulate typing a new hex value
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, '#ff0000')
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith('#ff0000')
  })

  it('does not commit invalid hex on blur', () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, 'notahex')
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('falls back to #000000 for unparseable colors', () => {
    setup({ value: 'transparent' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe('#000000')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/controls/color-input.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/controls/ColorInput.tsx
import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'

export interface ColorInputProps {
  value: string
  onChange: (hex: string) => void
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/** Convert any CSS color string to #RRGGBB. Returns #000000 if unparseable. */
export function rgbToHex(color: string): string {
  // Already hex
  if (HEX_REGEX.test(color)) return color.toLowerCase()
  const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return '#000000'
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function ColorInput({ value, onChange }: ColorInputProps): JSX.Element {
  const hexColor = rgbToHex(value)
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : hexColor

  const handleHexInput = useCallback((e: Event) => {
    setEditingHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setEditingHex(hexColor)
  }, [hexColor])

  const handleHexBlur = useCallback(() => {
    if (editingHex !== null && HEX_REGEX.test(editingHex)) {
      onChange(editingHex)
    }
    setEditingHex(null)
  }, [editingHex, onChange])

  return (
    <div class="cortex-color-input">
      <div
        class="cortex-color-input__swatch"
        style={{ backgroundColor: value }}
      />
      <input
        class="cortex-color-input__hex"
        type="text"
        value={displayedHex}
        onInput={handleHexInput}
        onFocus={handleHexFocus}
        onBlur={handleHexBlur}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/controls/color-input.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/controls/ColorInput.tsx tests/browser/controls/color-input.test.tsx
git commit -m "feat: add ColorInput control with swatch and hex input (ZF0-889)"
```

---

### Task 3: ColorPicker popover

Full color picker with vanilla-colorful Web Component, alpha slider, hex text input, and Tailwind color swatches. Positioned via @floating-ui/dom.

**Files:**
- Create: `cortex-editor/src/browser/components/controls/ColorPicker.tsx`
- Create: `cortex-editor/tests/browser/controls/color-picker.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css` (add `.cortex-color-picker*` classes)

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/controls/color-picker.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ColorPicker } from '../../../src/browser/components/controls/ColorPicker.js'

// Mock @floating-ui/dom
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('ColorPicker', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof ColorPicker>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    // Create an anchor element for positioning
    const anchor = document.createElement('div')
    container.appendChild(anchor)
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(
      <ColorPicker color="#3b82f6" onChange={onChange} onClose={onClose} anchor={anchor} {...overrides} />,
      container,
    )
    return { onChange, onClose }
  }

  it('renders a backdrop', () => {
    setup()
    const backdrop = container.querySelector('.cortex-color-picker__backdrop')
    expect(backdrop).not.toBeNull()
  })

  it('renders the popover container', () => {
    setup()
    const popover = container.querySelector('.cortex-color-picker__popover')
    expect(popover).not.toBeNull()
  })

  it('renders a hex-color-picker element', () => {
    setup()
    const picker = container.querySelector('hex-color-picker')
    expect(picker).not.toBeNull()
  })

  it('renders hex input with current color', () => {
    setup()
    const hexInput = container.querySelector('.cortex-color-picker__hex-input') as HTMLInputElement
    expect(hexInput).not.toBeNull()
    expect(hexInput.value).toBe('#3b82f6')
  })

  it('renders alpha slider', () => {
    setup()
    expect(container.textContent).toContain('%')
  })

  it('renders color swatches', () => {
    setup()
    const swatches = container.querySelectorAll('.cortex-color-picker__swatch')
    expect(swatches.length).toBeGreaterThan(0)
  })

  it('calls onClose when backdrop is clicked', () => {
    const { onClose } = setup()
    const backdrop = container.querySelector('.cortex-color-picker__backdrop') as HTMLElement
    backdrop.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onChange when hex input is committed', () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-picker__hex-input') as HTMLInputElement
    hexInput.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hexInput, '#ff0000')
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith('#ff0000')
  })

  it('calls onChange when a swatch is clicked', () => {
    const { onChange } = setup()
    const swatch = container.querySelector('.cortex-color-picker__swatch') as HTMLElement
    swatch.click()
    expect(onChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/controls/color-picker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/controls/ColorPicker.tsx
import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'

export interface ColorPickerProps {
  color: string
  onChange: (hex: string) => void
  onClose: () => void
  anchor: HTMLElement
  alpha?: number
  onAlphaChange?: (alpha: number) => void
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

// Tailwind default color swatches — subset of the palette for quick selection
const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db',
  '#e5e7eb', '#f3f4f6', '#f9fafb', '#ffffff',
]

export function ColorPicker({
  color,
  onChange,
  onClose,
  anchor,
  alpha = 100,
  onAlphaChange,
}: ColorPickerProps): JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const [editingAlpha, setEditingAlpha] = useState<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : color
  const displayedAlpha = editingAlpha !== null ? editingAlpha : String(alpha)

  // Position popover via floating-ui
  useEffect(() => {
    if (!popoverRef.current) return
    let cancelled = false
    computePosition(anchor, popoverRef.current, {
      placement: 'bottom-start',
      middleware: [flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!cancelled && popoverRef.current) {
        popoverRef.current.style.left = `${x}px`
        popoverRef.current.style.top = `${y}px`
      }
    }).catch(() => {
      // Fallback: position below anchor
      if (!cancelled && popoverRef.current) {
        const rect = anchor.getBoundingClientRect()
        popoverRef.current.style.left = `${rect.left}px`
        popoverRef.current.style.top = `${rect.bottom + 4}px`
      }
    })
    return () => { cancelled = true }
  }, [anchor])

  // Attach vanilla-colorful event listener
  useEffect(() => {
    const picker = popoverRef.current?.querySelector('hex-color-picker')
    if (!picker) return
    const handleChange = (e: Event) => {
      const hex = (e as CustomEvent).detail.value
      if (typeof hex === 'string' && HEX_REGEX.test(hex)) {
        onChange(hex)
      }
    }
    picker.addEventListener('color-changed', handleChange)
    return () => picker.removeEventListener('color-changed', handleChange)
  }, [onChange])

  // Set initial color on the Web Component
  useEffect(() => {
    const picker = popoverRef.current?.querySelector('hex-color-picker')
    if (picker) {
      (picker as any).color = color
    }
  }, [color])

  const handleHexInput = useCallback((e: Event) => {
    setEditingHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setEditingHex(color)
  }, [color])

  const handleHexBlur = useCallback(() => {
    if (editingHex !== null && HEX_REGEX.test(editingHex)) {
      onChange(editingHex)
    }
    setEditingHex(null)
  }, [editingHex, onChange])

  const handleAlphaInput = useCallback((e: Event) => {
    setEditingAlpha((e.target as HTMLInputElement).value)
  }, [])

  const handleAlphaFocus = useCallback(() => {
    setEditingAlpha(String(alpha))
  }, [alpha])

  const handleAlphaBlur = useCallback(() => {
    if (editingAlpha !== null) {
      const parsed = parseInt(editingAlpha, 10)
      if (!isNaN(parsed) && onAlphaChange) {
        onAlphaChange(Math.max(0, Math.min(100, parsed)))
      }
    }
    setEditingAlpha(null)
  }, [editingAlpha, onAlphaChange])

  const handleSwatchClick = useCallback((hex: string) => {
    onChange(hex)
  }, [onChange])

  return (
    <>
      <div class="cortex-color-picker__backdrop" onClick={onClose} />
      <div class="cortex-color-picker__popover" ref={popoverRef} style="position:fixed">
        <hex-color-picker color={color} />

        <div class="cortex-color-picker__inputs">
          <div class="cortex-color-picker__hex-row">
            <span class="cortex-color-picker__label">Hex</span>
            <input
              class="cortex-color-picker__hex-input"
              type="text"
              value={displayedHex}
              onInput={handleHexInput}
              onFocus={handleHexFocus}
              onBlur={handleHexBlur}
            />
          </div>
          {onAlphaChange && (
            <div class="cortex-color-picker__alpha-row">
              <span class="cortex-color-picker__label">Alpha</span>
              <input
                class="cortex-color-picker__alpha-input"
                type="text"
                inputMode="numeric"
                value={displayedAlpha}
                onInput={handleAlphaInput}
                onFocus={handleAlphaFocus}
                onBlur={handleAlphaBlur}
              />
              <span class="cortex-color-picker__unit">%</span>
            </div>
          )}
        </div>

        <div class="cortex-color-picker__swatches">
          {SWATCHES.map((hex) => (
            <div
              key={hex}
              class={`cortex-color-picker__swatch${hex === color ? ' cortex-color-picker__swatch--active' : ''}`}
              style={{ backgroundColor: hex }}
              onClick={() => handleSwatchClick(hex)}
            />
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Add CSS for ColorPicker**

Append to `cortex-editor/src/browser/styles.css`:

```css
/* ── Color picker popover ──────────────────── */

.cortex-color-picker__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.cortex-color-picker__popover {
  z-index: 11;
  width: 220px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-color-picker__popover hex-color-picker {
  width: 100%;
  height: 150px;
}

.cortex-color-picker__popover hex-color-picker::part(saturation) {
  border-radius: 6px 6px 0 0;
}

.cortex-color-picker__popover hex-color-picker::part(hue) {
  height: 12px;
  border-radius: 6px;
}

.cortex-color-picker__popover hex-color-picker::part(saturation-pointer) {
  width: 16px;
  height: 16px;
  border: 2px solid white;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
}

.cortex-color-picker__popover hex-color-picker::part(hue-pointer) {
  width: 14px;
  height: inherit;
  border-radius: 3px;
  border: 2px solid white;
}

.cortex-color-picker__inputs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cortex-color-picker__hex-row,
.cortex-color-picker__alpha-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cortex-color-picker__label {
  font-size: 11px;
  color: #6b7280;
  width: 32px;
  flex-shrink: 0;
}

.cortex-color-picker__hex-input,
.cortex-color-picker__alpha-input {
  flex: 1;
  height: 26px;
  padding: 0 6px;
  background: #f3f4f6;
  border: none;
  border-radius: 4px;
  font: 12px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #111827;
  outline: none;
}

.cortex-color-picker__hex-input:focus,
.cortex-color-picker__alpha-input:focus {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.cortex-color-picker__unit {
  font-size: 11px;
  color: #9ca3af;
}

.cortex-color-picker__swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
}

.cortex-color-picker__swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  cursor: pointer;
}

.cortex-color-picker__swatch:hover {
  border-color: rgba(0, 0, 0, 0.2);
  transform: scale(1.15);
}

.cortex-color-picker__swatch--active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/controls/color-picker.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/browser/components/controls/ColorPicker.tsx tests/browser/controls/color-picker.test.tsx src/browser/styles.css
git commit -m "feat: add ColorPicker popover with vanilla-colorful and swatches (ZF0-889)"
```

---

## Chunk 2: Sections

### Task 4: FillSection

Background color (via ColorInput + ColorPicker) and background opacity (alpha channel).

**Files:**
- Create: `cortex-editor/src/browser/components/sections/FillSection.tsx`
- Create: `cortex-editor/tests/browser/sections/fill-section.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/sections/fill-section.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { FillSection, parseFillValues } from '../../../src/browser/components/sections/FillSection.js'
import type { FillValues } from '../../../src/browser/components/sections/FillSection.js'

// Mock @floating-ui/dom for ColorPicker
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('FillSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: FillValues = {
    backgroundColor: 'rgb(59, 130, 246)',
    opacity: 100,
  }

  function setup(overrides?: Partial<Parameters<typeof FillSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <FillSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="fill"', () => {
    setup()
    const root = container.querySelector('[data-section-id="fill"]')
    expect(root).not.toBeNull()
  })

  it('renders a color swatch with the background color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('renders opacity input showing 100', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const opacityInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('%')
    }) as HTMLInputElement | undefined
    expect(opacityInput).toBeDefined()
    expect(opacityInput!.value).toBe('100')
  })

  it('emits background-color change from color input', () => {
    const { onChange } = setup()
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hex.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, '#ff0000')
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    hex.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ property: 'background-color', value: '#ff0000' })
  })
})

describe('parseFillValues', () => {
  it('parses background color and opacity', () => {
    const cs = {
      backgroundColor: 'rgb(255, 0, 0)',
      opacity: '0.5',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(result.opacity).toBe(50)
  })

  it('defaults opacity to 100 when missing', () => {
    const cs = {
      backgroundColor: 'rgba(0, 0, 0, 0)',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.opacity).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/fill-section.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/sections/FillSection.tsx
import type { JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'
import { ColorPicker } from '../controls/ColorPicker.js'

export interface FillChange {
  property: string
  value: string
}

export interface FillValues {
  backgroundColor: string
  opacity: number  // 0-100
}

export interface FillSectionProps {
  values: FillValues
  onChange: (change: FillChange) => void
  onScrub?: (change: FillChange) => void
  onScrubEnd?: (change: FillChange) => void
}

export function parseFillValues(cs: CSSStyleDeclaration): FillValues {
  return {
    backgroundColor: cs.backgroundColor ?? 'rgba(0, 0, 0, 0)',
    opacity: Math.round((parseFloat(cs.opacity) || 1) * 100),
  }
}

export function FillSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: FillSectionProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const swatchRef = useRef<HTMLDivElement>(null)

  const handleColorChange = useCallback(
    (hex: string) => onChange({ property: 'background-color', value: hex }),
    [onChange],
  )

  const handleOpacityChange = useCallback(
    (v: number) => onChange({ property: 'opacity', value: String(v / 100) }),
    [onChange],
  )
  const handleOpacityScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'opacity', value: String(v / 100) }) },
    [onScrub],
  )
  const handleOpacityScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'opacity', value: String(v / 100) }) },
    [onScrubEnd],
  )

  const handleSwatchClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  return (
    <div class="cortex-fill-section" data-section-id="fill">
      <div class="cortex-fill-section__group">
        <span class="cortex-section-label">Fill</span>
        <div class="cortex-fill-section__color-row" ref={swatchRef}>
          <div onClick={handleSwatchClick}>
            <ColorInput value={values.backgroundColor} onChange={handleColorChange} />
          </div>
          {pickerOpen && swatchRef.current && (
            <ColorPicker
              color={
                (() => {
                  const m = values.backgroundColor.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
                  if (!m) return '#000000'
                  const r = Number(m[1])
                  const g = Number(m[2])
                  const b = Number(m[3])
                  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
                })()
              }
              onChange={handleColorChange}
              onClose={handlePickerClose}
              anchor={swatchRef.current}
            />
          )}
        </div>
      </div>

      <div class="cortex-fill-section__group">
        <span class="cortex-section-label">Opacity</span>
        <NumericInput
          value={values.opacity}
          unit="%"
          min={0}
          onChange={handleOpacityChange}
          onScrub={handleOpacityScrub}
          onScrubEnd={handleOpacityScrubEnd}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for FillSection**

Append to `cortex-editor/src/browser/styles.css`:

```css
/* ── Fill section ──────────────────────────── */

.cortex-fill-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-fill-section__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cortex-fill-section__color-row {
  position: relative;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/fill-section.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/browser/components/sections/FillSection.tsx tests/browser/sections/fill-section.test.tsx src/browser/styles.css
git commit -m "feat: add FillSection with background color and opacity (ZF0-889)"
```

---

### Task 5: BorderSection

Border width, style, color, and radius with per-corner toggle.

**Files:**
- Create: `cortex-editor/src/browser/components/sections/BorderSection.tsx`
- Create: `cortex-editor/tests/browser/sections/border-section.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/sections/border-section.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { BorderSection, parseBorderValues } from '../../../src/browser/components/sections/BorderSection.js'
import type { BorderValues } from '../../../src/browser/components/sections/BorderSection.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('BorderSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: BorderValues = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgb(0, 0, 0)',
    borderRadius: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 4,
  }

  function setup(overrides?: Partial<Parameters<typeof BorderSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <BorderSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="border"', () => {
    setup()
    expect(container.querySelector('[data-section-id="border"]')).not.toBeNull()
  })

  it('renders border width input', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const widthInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('W')
    }) as HTMLInputElement | undefined
    expect(widthInput).toBeDefined()
    expect(widthInput!.value).toBe('1')
  })

  it('renders border style segmented control', () => {
    setup()
    expect(container.textContent).toContain('Style')
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
  })

  it('renders border radius input', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const radiusInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('R')
    }) as HTMLInputElement | undefined
    expect(radiusInput).toBeDefined()
  })

  it('renders per-corner toggle button', () => {
    setup()
    const toggleBtn = container.querySelector('.cortex-border-section__corner-toggle')
    expect(toggleBtn).not.toBeNull()
  })

  it('shows 4 corner inputs when per-corner is toggled', () => {
    setup()
    const toggleBtn = container.querySelector('.cortex-border-section__corner-toggle') as HTMLElement
    toggleBtn.click()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    // Should have: width + 4 corner radii = 5 (plus any others)
    expect(inputs.length).toBeGreaterThanOrEqual(5)
  })
})

describe('parseBorderValues', () => {
  it('parses border properties from computed style', () => {
    const cs = {
      borderWidth: '2px',
      borderStyle: 'dashed',
      borderColor: 'rgb(255, 0, 0)',
      borderRadius: '8px',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      borderBottomRightRadius: '8px',
      borderBottomLeftRadius: '8px',
    } as unknown as CSSStyleDeclaration
    const result = parseBorderValues(cs)
    expect(result.borderWidth).toBe(2)
    expect(result.borderStyle).toBe('dashed')
    expect(result.borderColor).toBe('rgb(255, 0, 0)')
    expect(result.borderRadius).toBe(8)
  })

  it('defaults to none style and 0 width', () => {
    const cs = {} as unknown as CSSStyleDeclaration
    const result = parseBorderValues(cs)
    expect(result.borderWidth).toBe(0)
    expect(result.borderStyle).toBe('none')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/border-section.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/sections/BorderSection.tsx
import type { JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { ColorInput } from '../controls/ColorInput.js'
import { ColorPicker } from '../controls/ColorPicker.js'
import { rgbToHex } from '../controls/ColorInput.js'

export interface BorderChange {
  property: string
  value: string
}

export interface BorderValues {
  borderWidth: number
  borderStyle: string
  borderColor: string
  borderRadius: number
  borderTopLeftRadius: number
  borderTopRightRadius: number
  borderBottomRightRadius: number
  borderBottomLeftRadius: number
}

export interface BorderSectionProps {
  values: BorderValues
  onChange: (change: BorderChange) => void
  onScrub?: (change: BorderChange) => void
  onScrubEnd?: (change: BorderChange) => void
}

export function parseBorderValues(cs: CSSStyleDeclaration): BorderValues {
  return {
    borderWidth: parseFloat(cs.borderWidth) || 0,
    borderStyle: cs.borderStyle ?? 'none',
    borderColor: cs.borderColor ?? 'rgb(0, 0, 0)',
    borderRadius: parseFloat(cs.borderRadius) || 0,
    borderTopLeftRadius: parseFloat(cs.borderTopLeftRadius) || 0,
    borderTopRightRadius: parseFloat(cs.borderTopRightRadius) || 0,
    borderBottomRightRadius: parseFloat(cs.borderBottomRightRadius) || 0,
    borderBottomLeftRadius: parseFloat(cs.borderBottomLeftRadius) || 0,
  }
}

const STYLE_OPTIONS = [
  { value: 'solid', label: '—', title: 'Solid' },
  { value: 'dashed', label: '--', title: 'Dashed' },
  { value: 'dotted', label: '··', title: 'Dotted' },
  { value: 'none', label: '⊘', title: 'None' },
]

export function BorderSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: BorderSectionProps): JSX.Element {
  const [perCorner, setPerCorner] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  const handleWidthChange = useCallback(
    (v: number) => onChange({ property: 'border-width', value: `${v}px` }),
    [onChange],
  )
  const handleWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-width', value: `${v}px` }) },
    [onScrubEnd],
  )

  const handleStyleChange = useCallback(
    (v: string) => onChange({ property: 'border-style', value: v }),
    [onChange],
  )

  const handleColorChange = useCallback(
    (hex: string) => onChange({ property: 'border-color', value: hex }),
    [onChange],
  )

  const handleRadiusChange = useCallback(
    (v: number) => onChange({ property: 'border-radius', value: `${v}px` }),
    [onChange],
  )
  const handleRadiusScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-radius', value: `${v}px` }) },
    [onScrub],
  )
  const handleRadiusScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-radius', value: `${v}px` }) },
    [onScrubEnd],
  )

  const cornerHandlers = useCallback((prop: string) => ({
    onChange: (v: number) => onChange({ property: prop, value: `${v}px` }),
    onScrub: (v: number) => { if (onScrub) onScrub({ property: prop, value: `${v}px` }) },
    onScrubEnd: (v: number) => { if (onScrubEnd) onScrubEnd({ property: prop, value: `${v}px` }) },
  }), [onChange, onScrub, onScrubEnd])

  const tl = cornerHandlers('border-top-left-radius')
  const tr = cornerHandlers('border-top-right-radius')
  const br = cornerHandlers('border-bottom-right-radius')
  const bl = cornerHandlers('border-bottom-left-radius')

  return (
    <div class="cortex-border-section" data-section-id="border">
      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Border</span>
        <div class="cortex-border-section__row">
          <NumericInput value={values.borderWidth} unit="px" label="W" tooltip="Border Width" min={0} onChange={handleWidthChange} onScrub={handleWidthScrub} onScrubEnd={handleWidthScrubEnd} />
        </div>
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Style</span>
        <SegmentedControl options={STYLE_OPTIONS} value={values.borderStyle} onChange={handleStyleChange} size="sm" />
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Color</span>
        <div class="cortex-border-section__color-row" ref={colorRef}>
          <div onClick={() => setPickerOpen(true)}>
            <ColorInput value={values.borderColor} onChange={handleColorChange} />
          </div>
          {pickerOpen && colorRef.current && (
            <ColorPicker color={rgbToHex(values.borderColor)} onChange={handleColorChange} onClose={() => setPickerOpen(false)} anchor={colorRef.current} />
          )}
        </div>
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Radius</span>
        <div class="cortex-border-section__radius-row">
          {!perCorner && (
            <NumericInput value={values.borderRadius} unit="px" label="R" tooltip="Border Radius" min={0} onChange={handleRadiusChange} onScrub={handleRadiusScrub} onScrubEnd={handleRadiusScrubEnd} />
          )}
          <button class="cortex-border-section__corner-toggle" data-tooltip={perCorner ? 'Uniform radius' : 'Per-corner radius'} onClick={() => setPerCorner(p => !p)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 14H2v-3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        {perCorner && (
          <div class="cortex-border-section__corners">
            <NumericInput value={values.borderTopLeftRadius} unit="px" label="TL" tooltip="Top Left" min={0} onChange={tl.onChange} onScrub={tl.onScrub} onScrubEnd={tl.onScrubEnd} />
            <NumericInput value={values.borderTopRightRadius} unit="px" label="TR" tooltip="Top Right" min={0} onChange={tr.onChange} onScrub={tr.onScrub} onScrubEnd={tr.onScrubEnd} />
            <NumericInput value={values.borderBottomRightRadius} unit="px" label="BR" tooltip="Bottom Right" min={0} onChange={br.onChange} onScrub={br.onScrub} onScrubEnd={br.onScrubEnd} />
            <NumericInput value={values.borderBottomLeftRadius} unit="px" label="BL" tooltip="Bottom Left" min={0} onChange={bl.onChange} onScrub={bl.onScrub} onScrubEnd={bl.onScrubEnd} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for BorderSection**

Append to `cortex-editor/src/browser/styles.css`:

```css
/* ── Border section ────────────────────────── */

.cortex-border-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-border-section__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cortex-border-section__row {
  display: flex;
  gap: 6px;
}

.cortex-border-section__color-row {
  position: relative;
}

.cortex-border-section__radius-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.cortex-border-section__corner-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  padding: 0;
}

.cortex-border-section__corner-toggle:hover {
  background: #f3f4f6;
  color: #6b7280;
}

.cortex-border-section__corners {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
```

- [ ] **Step 5: Run tests**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/border-section.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/browser/components/sections/BorderSection.tsx tests/browser/sections/border-section.test.tsx src/browser/styles.css
git commit -m "feat: add BorderSection with width/style/color/radius and per-corner toggle (ZF0-889)"
```

---

### Task 6: ShadowSection

Multi-shadow parsing, per-shadow row editing, add/remove.

**Files:**
- Create: `cortex-editor/src/browser/components/sections/ShadowSection.tsx`
- Create: `cortex-editor/tests/browser/sections/shadow-section.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/sections/shadow-section.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ShadowSection, parseShadowValues, parseBoxShadow, serializeBoxShadow } from '../../../src/browser/components/sections/ShadowSection.js'
import type { ShadowValues } from '../../../src/browser/components/sections/ShadowSection.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('parseBoxShadow', () => {
  it('returns empty array for none', () => {
    expect(parseBoxShadow('none')).toEqual([])
  })

  it('parses a single shadow', () => {
    const result = parseBoxShadow('2px 4px 8px rgba(0, 0, 0, 0.1)')
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(2)
    expect(result[0].y).toBe(4)
    expect(result[0].blur).toBe(8)
    expect(result[0].spread).toBe(0)
    expect(result[0].color).toBe('rgba(0, 0, 0, 0.1)')
    expect(result[0].inset).toBe(false)
  })

  it('parses shadow with spread', () => {
    const result = parseBoxShadow('2px 4px 8px 2px #000')
    expect(result[0].spread).toBe(2)
  })

  it('parses inset shadow', () => {
    const result = parseBoxShadow('inset 0px 2px 4px rgba(0, 0, 0, 0.06)')
    expect(result[0].inset).toBe(true)
    expect(result[0].x).toBe(0)
    expect(result[0].y).toBe(2)
    expect(result[0].blur).toBe(4)
  })

  it('parses multiple shadows', () => {
    const result = parseBoxShadow('2px 4px 8px rgba(0, 0, 0, 0.1), inset 0px 2px 4px rgba(0, 0, 0, 0.06)')
    expect(result).toHaveLength(2)
    expect(result[0].inset).toBe(false)
    expect(result[1].inset).toBe(true)
  })
})

describe('serializeBoxShadow', () => {
  it('serializes empty array to none', () => {
    expect(serializeBoxShadow([])).toBe('none')
  })

  it('serializes a single shadow', () => {
    const result = serializeBoxShadow([{ x: 2, y: 4, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.1)', inset: false }])
    expect(result).toBe('2px 4px 8px 0px rgba(0, 0, 0, 0.1)')
  })

  it('serializes inset shadow', () => {
    const result = serializeBoxShadow([{ x: 0, y: 2, blur: 4, spread: 0, color: '#000', inset: true }])
    expect(result).toBe('inset 0px 2px 4px 0px #000')
  })
})

describe('ShadowSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: ShadowValues = {
    boxShadow: '2px 4px 8px rgba(0, 0, 0, 0.1)',
  }

  function setup(overrides?: Partial<Parameters<typeof ShadowSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <ShadowSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="shadow"', () => {
    setup()
    expect(container.querySelector('[data-section-id="shadow"]')).not.toBeNull()
  })

  it('renders shadow rows for each parsed shadow', () => {
    setup()
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows.length).toBe(1)
  })

  it('renders add shadow button', () => {
    setup()
    const addBtn = container.querySelector('.cortex-shadow-section__add')
    expect(addBtn).not.toBeNull()
  })

  it('shows no shadow rows when box-shadow is none', () => {
    setup({ values: { boxShadow: 'none' } })
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows.length).toBe(0)
  })

  it('renders multiple shadow rows', () => {
    setup({ values: { boxShadow: '2px 4px 8px #000, 0px 1px 3px #333' } })
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/shadow-section.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/sections/ShadowSection.tsx
import type { JSX } from 'preact'
import { useMemo, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'
import { rgbToHex } from '../controls/ColorInput.js'

export interface ShadowChange {
  property: string
  value: string
}

export interface ShadowValues {
  boxShadow: string
}

export interface ShadowSectionProps {
  values: ShadowValues
  onChange: (change: ShadowChange) => void
  onScrub?: (change: ShadowChange) => void
  onScrubEnd?: (change: ShadowChange) => void
}

export interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

export function parseShadowValues(cs: CSSStyleDeclaration): ShadowValues {
  return {
    boxShadow: cs.boxShadow ?? 'none',
  }
}

/** Split a box-shadow string by commas, respecting parentheses in rgba(). */
function splitShadows(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function parseSingleShadow(s: string): Shadow {
  const inset = s.includes('inset')
  const withoutInset = s.replace(/inset\s*/i, '').trim()

  // Extract color — anything that's not a length value
  // Colors can be: #hex, rgb(...), rgba(...), named colors
  let color = 'rgba(0, 0, 0, 0.1)'
  const colorMatch = withoutInset.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i)
  if (colorMatch) {
    color = colorMatch[1]
  }

  // Extract numeric values (before the color)
  const numericPart = colorMatch
    ? withoutInset.slice(0, colorMatch.index).trim()
    : withoutInset
  const nums = numericPart.match(/-?[\d.]+/g)?.map(Number) ?? []

  return {
    inset,
    x: nums[0] ?? 0,
    y: nums[1] ?? 0,
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    color,
  }
}

export function parseBoxShadow(value: string): Shadow[] {
  if (!value || value === 'none') return []
  return splitShadows(value).map(parseSingleShadow)
}

export function serializeBoxShadow(shadows: Shadow[]): string {
  if (shadows.length === 0) return 'none'
  return shadows.map((s) => {
    const parts: string[] = []
    if (s.inset) parts.push('inset')
    parts.push(`${s.x}px`, `${s.y}px`, `${s.blur}px`, `${s.spread}px`, s.color)
    return parts.join(' ')
  }).join(', ')
}

export function ShadowSection({
  values,
  onChange,
}: ShadowSectionProps): JSX.Element {
  const shadows = useMemo(() => parseBoxShadow(values.boxShadow), [values.boxShadow])

  const emitShadows = useCallback((updated: Shadow[]) => {
    onChange({ property: 'box-shadow', value: serializeBoxShadow(updated) })
  }, [onChange])

  const handleShadowField = useCallback((index: number, field: keyof Shadow, val: number | string | boolean) => {
    const updated = shadows.map((s, i) => i === index ? { ...s, [field]: val } : s)
    emitShadows(updated)
  }, [shadows, emitShadows])

  const handleAddShadow = useCallback(() => {
    const newShadow: Shadow = { inset: false, x: 0, y: 2, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.1)' }
    emitShadows([...shadows, newShadow])
  }, [shadows, emitShadows])

  const handleRemoveShadow = useCallback((index: number) => {
    emitShadows(shadows.filter((_, i) => i !== index))
  }, [shadows, emitShadows])

  return (
    <div class="cortex-shadow-section" data-section-id="shadow">
      <div class="cortex-shadow-section__header">
        <span class="cortex-section-label">Shadow</span>
        <button class="cortex-shadow-section__add" data-tooltip="Add shadow" onClick={handleAddShadow}>+</button>
      </div>

      {shadows.map((s, i) => (
        <div class="cortex-shadow-section__row" key={i}>
          <div class="cortex-shadow-section__fields">
            <NumericInput value={s.x} unit="px" label="X" tooltip="X Offset" onChange={(v) => handleShadowField(i, 'x', v)} />
            <NumericInput value={s.y} unit="px" label="Y" tooltip="Y Offset" onChange={(v) => handleShadowField(i, 'y', v)} />
            <NumericInput value={s.blur} unit="px" label="B" tooltip="Blur" min={0} onChange={(v) => handleShadowField(i, 'blur', v)} />
            <NumericInput value={s.spread} unit="px" label="S" tooltip="Spread" onChange={(v) => handleShadowField(i, 'spread', v)} />
          </div>
          <div class="cortex-shadow-section__row-actions">
            <ColorInput value={s.color} onChange={(hex) => handleShadowField(i, 'color', hex)} />
            <button class="cortex-shadow-section__remove" data-tooltip="Remove shadow" onClick={() => handleRemoveShadow(i)}>×</button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for ShadowSection**

Append to `cortex-editor/src/browser/styles.css`:

```css
/* ── Shadow section ────────────────────────── */

.cortex-shadow-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-shadow-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cortex-shadow-section__add,
.cortex-shadow-section__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.cortex-shadow-section__add:hover,
.cortex-shadow-section__remove:hover {
  background: #f3f4f6;
  color: #6b7280;
}

.cortex-shadow-section__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.cortex-shadow-section__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.cortex-shadow-section__row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
```

- [ ] **Step 5: Run tests**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/shadow-section.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/browser/components/sections/ShadowSection.tsx tests/browser/sections/shadow-section.test.tsx src/browser/styles.css
git commit -m "feat: add ShadowSection with multi-shadow parsing and add/remove (ZF0-889)"
```

---

### Task 7: EffectsSection

Opacity, overflow, cursor, blur, and backdrop-blur.

**Files:**
- Create: `cortex-editor/src/browser/components/sections/EffectsSection.tsx`
- Create: `cortex-editor/tests/browser/sections/effects-section.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/browser/sections/effects-section.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { EffectsSection, parseEffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'
import type { EffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('EffectsSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: EffectsValues = {
    opacity: 100,
    overflow: 'visible',
    cursor: 'auto',
    blur: 0,
    backdropBlur: 0,
  }

  function setup(overrides?: Partial<Parameters<typeof EffectsSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <EffectsSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="effects"', () => {
    setup()
    expect(container.querySelector('[data-section-id="effects"]')).not.toBeNull()
  })

  it('renders opacity input', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const opacityInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('OP')
    }) as HTMLInputElement | undefined
    expect(opacityInput).toBeDefined()
    expect(opacityInput!.value).toBe('100')
  })

  it('renders overflow segmented control', () => {
    setup()
    expect(container.textContent).toContain('Overflow')
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
  })

  it('renders blur input', () => {
    setup({ values: { ...DEFAULT_VALUES, blur: 4 } })
    expect(container.textContent).toContain('Blur')
  })

  it('renders backdrop blur input', () => {
    setup()
    expect(container.textContent).toContain('BG Blur')
  })
})

describe('parseEffectsValues', () => {
  it('parses opacity as percentage', () => {
    const cs = { opacity: '0.75', overflow: 'hidden', cursor: 'pointer', filter: '', backdropFilter: '' } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.opacity).toBe(75)
    expect(result.overflow).toBe('hidden')
    expect(result.cursor).toBe('pointer')
  })

  it('extracts blur from filter', () => {
    const cs = { opacity: '1', overflow: 'visible', cursor: 'auto', filter: 'blur(4px)', backdropFilter: '' } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(4)
  })

  it('extracts backdrop-blur from backdropFilter', () => {
    const cs = { opacity: '1', overflow: 'visible', cursor: 'auto', filter: '', backdropFilter: 'blur(8px)' } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.backdropBlur).toBe(8)
  })

  it('defaults blur to 0 when filter has no blur', () => {
    const cs = { opacity: '1', overflow: 'visible', cursor: 'auto', filter: 'grayscale(100%)', backdropFilter: '' } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/effects-section.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```tsx
// src/browser/components/sections/EffectsSection.tsx
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { Dropdown } from '../controls/Dropdown.js'

export interface EffectsChange {
  property: string
  value: string
}

export interface EffectsValues {
  opacity: number   // 0-100
  overflow: string
  cursor: string
  blur: number      // px
  backdropBlur: number // px
}

export interface EffectsSectionProps {
  values: EffectsValues
  onChange: (change: EffectsChange) => void
  onScrub?: (change: EffectsChange) => void
  onScrubEnd?: (change: EffectsChange) => void
}

function parseBlurValue(filter: string): number {
  const m = filter.match(/blur\(([\d.]+)px\)/)
  return m ? parseFloat(m[1]) : 0
}

export function parseEffectsValues(cs: CSSStyleDeclaration): EffectsValues {
  return {
    opacity: Math.round((parseFloat(cs.opacity) || 1) * 100),
    overflow: cs.overflow ?? 'visible',
    cursor: cs.cursor ?? 'auto',
    blur: parseBlurValue(cs.filter ?? ''),
    backdropBlur: parseBlurValue(
      cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
    ),
  }
}

const OVERFLOW_OPTIONS = [
  { value: 'visible', label: 'vis', title: 'Visible' },
  { value: 'hidden', label: 'hid', title: 'Hidden' },
  { value: 'scroll', label: 'scr', title: 'Scroll' },
  { value: 'auto', label: 'auto', title: 'Auto' },
]

const CURSOR_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Default' },
  { value: 'pointer', label: 'Pointer' },
  { value: 'text', label: 'Text' },
  { value: 'move', label: 'Move' },
  { value: 'grab', label: 'Grab' },
  { value: 'not-allowed', label: 'Not Allowed' },
  { value: 'crosshair', label: 'Crosshair' },
  { value: 'none', label: 'None' },
]

export function EffectsSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: EffectsSectionProps): JSX.Element {
  const handleOpacityChange = useCallback(
    (v: number) => onChange({ property: 'opacity', value: String(v / 100) }),
    [onChange],
  )
  const handleOpacityScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'opacity', value: String(v / 100) }) },
    [onScrub],
  )
  const handleOpacityScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'opacity', value: String(v / 100) }) },
    [onScrubEnd],
  )

  const handleOverflowChange = useCallback(
    (v: string) => onChange({ property: 'overflow', value: v }),
    [onChange],
  )

  const handleCursorChange = useCallback(
    (v: string) => onChange({ property: 'cursor', value: v }),
    [onChange],
  )

  const handleBlurChange = useCallback(
    (v: number) => onChange({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }),
    [onChange],
  )
  const handleBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrub],
  )
  const handleBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrubEnd],
  )

  const handleBackdropBlurChange = useCallback(
    (v: number) => onChange({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }),
    [onChange],
  )
  const handleBackdropBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrub],
  )
  const handleBackdropBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrubEnd],
  )

  return (
    <div class="cortex-effects-section" data-section-id="effects">
      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Opacity</span>
        <NumericInput value={values.opacity} unit="%" label="OP" tooltip="Opacity" min={0} onChange={handleOpacityChange} onScrub={handleOpacityScrub} onScrubEnd={handleOpacityScrubEnd} />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Overflow</span>
        <SegmentedControl options={OVERFLOW_OPTIONS} value={values.overflow} onChange={handleOverflowChange} size="sm" />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Cursor</span>
        <Dropdown options={CURSOR_OPTIONS} value={values.cursor} onChange={handleCursorChange} />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Blur</span>
        <NumericInput value={values.blur} unit="px" min={0} onChange={handleBlurChange} onScrub={handleBlurScrub} onScrubEnd={handleBlurScrubEnd} />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">BG Blur</span>
        <NumericInput value={values.backdropBlur} unit="px" label="" tooltip="Backdrop Blur" min={0} onChange={handleBackdropBlurChange} onScrub={handleBackdropBlurScrub} onScrubEnd={handleBackdropBlurScrubEnd} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for EffectsSection**

Append to `cortex-editor/src/browser/styles.css`:

```css
/* ── Effects section ───────────────────────── */

.cortex-effects-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-effects-section__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 5: Run tests**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/effects-section.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/browser/components/sections/EffectsSection.tsx tests/browser/sections/effects-section.test.tsx src/browser/styles.css
git commit -m "feat: add EffectsSection with opacity/overflow/cursor/blur/backdrop-blur (ZF0-889)"
```

---

## Chunk 3: Integration

### Task 8: Panel.tsx integration

Import all new sections, add computed style parsing, wire change handlers, render in body.

**Files:**
- Modify: `cortex-editor/src/browser/components/Panel.tsx`
- Modify: `cortex-editor/tests/browser/panel.test.tsx`

- [ ] **Step 1: Write integration test for new sections rendering**

Add to existing panel tests in `tests/browser/panel.test.tsx`:

```tsx
it('renders fill section with data-section-id', () => {
  setup()
  expect(container.querySelector('[data-section-id="fill"]')).not.toBeNull()
})

it('renders border section with data-section-id', () => {
  setup()
  expect(container.querySelector('[data-section-id="border"]')).not.toBeNull()
})

it('renders shadow section with data-section-id', () => {
  setup()
  expect(container.querySelector('[data-section-id="shadow"]')).not.toBeNull()
})

it('renders effects section with data-section-id', () => {
  setup()
  expect(container.querySelector('[data-section-id="effects"]')).not.toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/panel.test.tsx`
Expected: FAIL — new section data-section-ids not found

- [ ] **Step 3: Update Panel.tsx**

Add imports at top of `Panel.tsx`:

```tsx
import { FillSection, parseFillValues } from './sections/FillSection.js'
import type { FillChange } from './sections/FillSection.js'
import { BorderSection, parseBorderValues } from './sections/BorderSection.js'
import type { BorderChange } from './sections/BorderSection.js'
import { ShadowSection, parseShadowValues } from './sections/ShadowSection.js'
import type { ShadowChange } from './sections/ShadowSection.js'
import { EffectsSection, parseEffectsValues } from './sections/EffectsSection.js'
import type { EffectsChange } from './sections/EffectsSection.js'
```

Update `computedStyles` useMemo to include new parsers:

```tsx
const computedStyles = useMemo(() => {
  if (!element) {
    return {
      spacing: parseSpacingValues({} as CSSStyleDeclaration),
      layout: parseLayoutValues({} as CSSStyleDeclaration),
      typography: parseTypographyValues({} as CSSStyleDeclaration),
      fill: parseFillValues({} as CSSStyleDeclaration),
      border: parseBorderValues({} as CSSStyleDeclaration),
      shadow: parseShadowValues({} as CSSStyleDeclaration),
      effects: parseEffectsValues({} as CSSStyleDeclaration),
    }
  }
  const cs = getComputedStyle(element)
  return {
    spacing: parseSpacingValues(cs),
    layout: parseLayoutValues(cs),
    typography: parseTypographyValues(cs),
    fill: parseFillValues(cs),
    border: parseBorderValues(cs),
    shadow: parseShadowValues(cs),
    effects: parseEffectsValues(cs),
  }
}, [element, styleVersion])
```

Add change handlers (after existing handlers):

```tsx
const handleFillCommit = useCallback((c: FillChange) => applyOverride(c.property, c.value, true), [applyOverride])
const handleFillScrub = useCallback((c: FillChange) => applyOverride(c.property, c.value, false), [applyOverride])
const handleBorderCommit = useCallback((c: BorderChange) => applyOverride(c.property, c.value, true), [applyOverride])
const handleBorderScrub = useCallback((c: BorderChange) => applyOverride(c.property, c.value, false), [applyOverride])
const handleShadowCommit = useCallback((c: ShadowChange) => applyOverride(c.property, c.value, true), [applyOverride])
const handleEffectsCommit = useCallback((c: EffectsChange) => applyOverride(c.property, c.value, true), [applyOverride])
const handleEffectsScrub = useCallback((c: EffectsChange) => applyOverride(c.property, c.value, false), [applyOverride])
```

Add section rendering after `</TypographySection>`:

```tsx
<FillSection
  values={computedStyles.fill}
  onChange={handleFillCommit}
  onScrub={handleFillScrub}
  onScrubEnd={handleFillCommit}
/>
<BorderSection
  values={computedStyles.border}
  onChange={handleBorderCommit}
  onScrub={handleBorderScrub}
  onScrubEnd={handleBorderCommit}
/>
<ShadowSection
  values={computedStyles.shadow}
  onChange={handleShadowCommit}
/>
<EffectsSection
  values={computedStyles.effects}
  onChange={handleEffectsCommit}
  onScrub={handleEffectsScrub}
  onScrubEnd={handleEffectsCommit}
/>
```

- [ ] **Step 4: Run tests**

Run: `cd cortex-editor && npx vitest run tests/browser/panel.test.tsx`
Expected: All tests PASS (including new section assertions)

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/Panel.tsx tests/browser/panel.test.tsx
git commit -m "feat: integrate Fill/Border/Shadow/Effects sections into Panel (ZF0-889)"
```

---

### Task 9: Refactor TypographySection to use shared ColorInput

Replace inline color swatch/hex in TypographySection with the shared ColorInput component.

**Files:**
- Modify: `cortex-editor/src/browser/components/sections/TypographySection.tsx`

- [ ] **Step 1: Run existing typography tests to establish baseline**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/typography-section.test.tsx`
Expected: All existing tests PASS

- [ ] **Step 2: Refactor TypographySection**

Replace the inline color implementation with `ColorInput`:

1. Remove `rgbToHex`, `HEX_REGEX`, `editingHex`/`displayedHex` state, `handleSwatchClick`, `handleColorPick`, `handleHexInput`, `handleHexFocus`, `handleHexBlur`, and `colorInputRef` from TypographySection
2. Import `ColorInput` and `rgbToHex` from `'../controls/ColorInput.js'`
3. Replace the COL section JSX with:

```tsx
<div class="cortex-typography-section__group">
  <span class="cortex-section-label">COL</span>
  <ColorInput
    value={values.color}
    onChange={(hex) => onChange({ property: 'color', value: hex })}
  />
</div>
```

- [ ] **Step 3: Run typography tests to verify no regression**

Run: `cd cortex-editor && npx vitest run tests/browser/sections/typography-section.test.tsx`
Expected: All tests PASS

- [ ] **Step 4: Run full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/sections/TypographySection.tsx
git commit -m "refactor: use shared ColorInput in TypographySection (ZF0-889)"
```

---

## Verification

After all tasks complete:

- [ ] **Run full test suite**: `cd cortex-editor && npx vitest run`
- [ ] **Run type check**: `cd cortex-editor && npx tsc --noEmit`
- [ ] **Verify all data-section-ids match TabNav**: `fill`, `border`, `shadow`, `effects`
- [ ] **Review new CSS** for consistent BEM naming and visual alignment with existing sections
