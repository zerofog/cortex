# Phase 5a: Layout + Typography Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SegmentedControl, Dropdown, LayoutSection, and TypographySection components for the Cortex visual editor panel.

**Architecture:** Four new Preact components following established patterns (BEM CSS, three-callback onChange/onScrub/onScrubEnd, Shadow DOM isolation). SegmentedControl and Dropdown are shared controls reused across sections. Sections read `getComputedStyle()` values and emit CSS override changes through Panel.tsx.

**Tech Stack:** Preact, @floating-ui/dom, vitest + happy-dom, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-14-phase-5a-layout-typography-design.md`

---

## File Map

### Create

| File | Responsibility |
|---|---|
| `src/browser/components/controls/SegmentedControl.tsx` | Generic radio-button row with sliding active indicator, ARIA |
| `src/browser/components/controls/Dropdown.tsx` | Select-like control with @floating-ui/dom positioned popover, type-to-filter |
| `src/browser/components/sections/LayoutSection.tsx` | Display, visibility, flex direction, justify/align, sizing |
| `src/browser/components/sections/TypographySection.tsx` | Font, size, weight, line-height, letter-spacing, align, color |
| `tests/browser/controls/segmented-control.test.tsx` | SegmentedControl behavior tests |
| `tests/browser/controls/dropdown.test.tsx` | Dropdown behavior tests |
| `tests/browser/sections/layout-section.test.tsx` | LayoutSection tests |
| `tests/browser/sections/typography-section.test.tsx` | TypographySection tests |

### Modify

| File | Changes |
|---|---|
| `package.json` | Add `@floating-ui/dom` dependency |
| `src/browser/override.ts` | Update VALID_VALUE regex to allow quotes |
| `tests/browser/helpers.ts` | Add `mockDocumentFonts()` helper |
| `src/browser/components/Panel.tsx` | Add computed style parsing, override handlers, section wiring, reorder sections |
| `src/browser/styles.css` | Add CSS for all new components |

---

## Chunk 1: Setup + SegmentedControl

### Task 1: Dependencies and Infrastructure

**Files:**
- Modify: `cortex-editor/package.json`
- Modify: `cortex-editor/src/browser/override.ts:5`
- Modify: `cortex-editor/tests/browser/helpers.ts`

- [ ] **Step 1: Install @floating-ui/dom**

```bash
cd cortex-editor && npm install @floating-ui/dom
```

- [ ] **Step 2: Update VALID_VALUE regex in override.ts**

In `src/browser/override.ts`, line 5, change:
```ts
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_%]+$/
```
to:
```ts
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%]+$/
```

This allows single/double quotes (for `font-family` values like `'Inter', sans-serif`) and `/` (for modern CSS `rgb(r g b / a)` syntax).

- [ ] **Step 3: Add test helper for document.fonts mock**

Append to `tests/browser/helpers.ts`:

```ts
/**
 * Mock document.fonts (FontFaceSet) for testing font detection.
 * happy-dom does not implement FontFaceSet as iterable.
 * Returns a cleanup function that restores the original.
 */
export function mockDocumentFonts(
  faces: Array<{ family: string; weight: string }>,
): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts')
  const mockFonts = {
    [Symbol.iterator]: function* () {
      for (const face of faces) yield face
    },
  }
  Object.defineProperty(document, 'fonts', {
    value: mockFonts,
    configurable: true,
  })
  return () => {
    if (original) {
      Object.defineProperty(document, 'fonts', original)
    } else {
      delete (document as any).fonts
    }
  }
}
```

- [ ] **Step 4: Verify override.ts test still passes**

```bash
cd cortex-editor && npx vitest run tests/browser --reporter=verbose 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/browser/override.ts tests/browser/helpers.ts
git commit -m "feat(5a): add @floating-ui/dom, update VALID_VALUE regex, add font mock helper"
```

---

### Task 2: SegmentedControl — Tests

**Files:**
- Create: `cortex-editor/tests/browser/controls/segmented-control.test.tsx`

- [ ] **Step 1: Write SegmentedControl test file**

Create `tests/browser/controls/segmented-control.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SegmentedControl } from '../../../src/browser/components/controls/SegmentedControl.js'
import { dispatchKeyboardEvent } from '../helpers.js'

describe('SegmentedControl', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const OPTIONS = [
    { value: 'block', label: 'Block' },
    { value: 'flex', label: 'Flex' },
    { value: 'grid', label: 'Grid' },
    { value: 'none', label: 'None' },
  ]

  function setup(overrides?: Partial<Parameters<typeof SegmentedControl>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={OPTIONS}
        value="block"
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('renders all options', () => {
    setup()
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons.length).toBe(4)
    expect(buttons[0].textContent).toContain('Block')
    expect(buttons[1].textContent).toContain('Flex')
  })

  it('marks active option with aria-checked', () => {
    setup({ value: 'flex' })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('aria-checked')).toBe('false')
    expect(buttons[1].getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange on click', () => {
    const { onChange } = setup()
    const buttons = container.querySelectorAll('[role="radio"]')
    ;(buttons[1] as HTMLElement).click()
    expect(onChange).toHaveBeenCalledWith('flex')
  })

  it('only one option is active at a time', () => {
    setup({ value: 'grid' })
    const checked = container.querySelectorAll('[aria-checked="true"]')
    expect(checked.length).toBe(1)
    expect(checked[0].textContent).toContain('Grid')
  })

  it('has radiogroup role on container', () => {
    setup()
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).not.toBeNull()
  })

  it('active option has tabindex 0, others have -1', () => {
    setup({ value: 'flex' })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('tabindex')).toBe('-1')
    expect(buttons[1].getAttribute('tabindex')).toBe('0')
    expect(buttons[2].getAttribute('tabindex')).toBe('-1')
  })

  it('arrow right moves selection', () => {
    const { onChange } = setup({ value: 'block' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('flex')
  })

  it('arrow left moves selection', () => {
    const { onChange } = setup({ value: 'flex' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('block')
  })

  it('arrow right wraps from last to first', () => {
    const { onChange } = setup({ value: 'none' })
    const group = container.querySelector('[role="radiogroup"]')!
    dispatchKeyboardEvent(group, 'keydown', { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('block')
  })

  it('renders icon-only options with title tooltip', () => {
    setup({
      options: [
        { value: 'row', icon: '→', title: 'Row' },
        { value: 'col', icon: '↓', title: 'Column' },
      ],
      value: 'row',
      size: 'sm',
    })
    const buttons = container.querySelectorAll('[role="radio"]')
    expect(buttons[0].getAttribute('title')).toBe('Row')
    expect(buttons[0].textContent).toContain('→')
  })

  it('renders sliding indicator element', () => {
    setup()
    const indicator = container.querySelector('.cortex-segmented__indicator')
    expect(indicator).not.toBeNull()
  })

  it('does not call onChange when clicking already active option', () => {
    const { onChange } = setup({ value: 'block' })
    const buttons = container.querySelectorAll('[role="radio"]')
    ;(buttons[0] as HTMLElement).click()
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cortex-editor && npx vitest run tests/browser/controls/segmented-control.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

---

### Task 3: SegmentedControl — Implementation

**Files:**
- Create: `cortex-editor/src/browser/components/controls/SegmentedControl.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Create SegmentedControl component**

Create `src/browser/components/controls/SegmentedControl.tsx`:

```tsx
import type { JSX } from 'preact'
import { useRef, useEffect, useCallback } from 'preact/hooks'

export interface SegmentedOption {
  value: string
  label?: string
  icon?: string
  title?: string
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // Update sliding indicator position when value changes
  useEffect(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return

    const activeBtn = track.querySelector(`[data-value="${value}"]`) as HTMLElement | null
    if (activeBtn) {
      indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`
      indicator.style.width = `${activeBtn.offsetWidth}px`
    }
  }, [value])

  const handleClick = useCallback(
    (optValue: string) => {
      if (optValue !== value) onChange(optValue)
    },
    [value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const idx = options.findIndex((o) => o.value === value)
      let next = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        next = (idx + 1) % options.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        next = (idx - 1 + options.length) % options.length
      }
      if (next >= 0) onChange(options[next].value)
    },
    [options, value, onChange],
  )

  const sizeClass = size === 'sm' ? ' cortex-segmented--sm' : ''

  return (
    <div
      ref={trackRef}
      class={`cortex-segmented${sizeClass}`}
      role="radiogroup"
      onKeyDown={handleKeyDown}
    >
      <div ref={indicatorRef} class="cortex-segmented__indicator" />
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            class={`cortex-segmented__option${isActive ? ' cortex-segmented__option--active' : ''}`}
            role="radio"
            aria-checked={isActive ? 'true' : 'false'}
            tabindex={isActive ? 0 : -1}
            title={opt.title}
            data-value={opt.value}
            onClick={() => handleClick(opt.value)}
          >
            {opt.icon && <span class="cortex-segmented__icon">{opt.icon}</span>}
            {opt.label && <span class="cortex-segmented__label">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add SegmentedControl CSS to styles.css**

Append to `src/browser/styles.css`:

```css
/* ── Segmented control ──────────────────────── */

.cortex-segmented {
  display: flex;
  align-items: center;
  position: relative;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
  gap: 0;
}

.cortex-segmented__indicator {
  position: absolute;
  top: 2px;
  left: 0;
  height: calc(100% - 4px);
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: transform 150ms ease-out, width 150ms ease-out;
  pointer-events: none;
}

.cortex-segmented__option {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 4px;
  flex: 1;
}

.cortex-segmented__option:hover:not(.cortex-segmented__option--active) {
  color: #374151;
}

.cortex-segmented__option--active {
  color: #111827;
  font-weight: 500;
}

.cortex-segmented--sm .cortex-segmented__option {
  padding: 0 6px;
  min-width: 28px;
  flex: 0;
}

.cortex-segmented__icon {
  font-size: 14px;
  line-height: 1;
}
```

- [ ] **Step 3: Run SegmentedControl tests**

```bash
cd cortex-editor && npx vitest run tests/browser/controls/segmented-control.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Run full browser test suite to check no regressions**

```bash
cd cortex-editor && npx vitest run tests/browser --reporter=verbose 2>&1 | tail -20
```

Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/controls/SegmentedControl.tsx tests/browser/controls/segmented-control.test.tsx src/browser/styles.css
git commit -m "feat(5a): SegmentedControl with sliding indicator, ARIA, keyboard nav"
```

---

## Chunk 2: Dropdown

### Task 4: Dropdown — Tests

**Files:**
- Create: `cortex-editor/tests/browser/controls/dropdown.test.tsx`

- [ ] **Step 1: Write Dropdown test file**

Create `tests/browser/controls/dropdown.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import { Dropdown } from '../../../src/browser/components/controls/Dropdown.js'
import { dispatchKeyboardEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom doesn't have real layout
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('Dropdown', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const OPTIONS = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Montserrat', label: 'Montserrat' },
  ]

  function setup(overrides?: Partial<Parameters<typeof Dropdown>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <Dropdown
        options={OPTIONS}
        value="Inter"
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  function getTrigger(): HTMLButtonElement {
    return container.querySelector('.cortex-dropdown__trigger') as HTMLButtonElement
  }

  function getPopover(): HTMLElement | null {
    return container.querySelector('.cortex-dropdown__popover')
  }

  function getOptions(): NodeListOf<Element> {
    return container.querySelectorAll('.cortex-dropdown__option')
  }

  function getFilter(): HTMLInputElement | null {
    return container.querySelector('.cortex-dropdown__filter')
  }

  it('renders trigger with selected value', () => {
    setup()
    expect(getTrigger().textContent).toContain('Inter')
  })

  it('renders placeholder when no value', () => {
    setup({ value: '', placeholder: 'Select font...' })
    expect(getTrigger().textContent).toContain('Select font...')
  })

  it('popover is hidden by default', () => {
    setup()
    const popover = getPopover()
    // Popover should not be visible (either not rendered or hidden)
    expect(popover === null || popover.style.display === 'none').toBe(true)
  })

  it('click trigger opens popover', async () => {
    setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const popover = getPopover()
    expect(popover).not.toBeNull()
    expect(popover!.style.display).not.toBe('none')
  })

  it('shows all options when open', async () => {
    setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    expect(getOptions().length).toBe(4)
  })

  it('filters options on type', async () => {
    setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const filter = getFilter()!
    // Simulate typing "rob"
    filter.value = 'rob'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const visibleOptions = getOptions()
    expect(visibleOptions.length).toBe(1)
    expect(visibleOptions[0].textContent).toContain('Roboto')
  })

  it('shows no matches message when filter has zero results', async () => {
    setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const filter = getFilter()!
    filter.value = 'zzzzz'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const empty = container.querySelector('.cortex-dropdown__empty')
    expect(empty).not.toBeNull()
    expect(empty!.textContent).toContain('No matches')
  })

  it('click option selects and closes', async () => {
    const { onChange } = setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const options = getOptions()
    ;(options[1] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledWith('Roboto')
    // Popover should close
    const popover = getPopover()
    expect(popover === null || popover.style.display === 'none').toBe(true)
  })

  it('escape closes popover', async () => {
    setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    dispatchKeyboardEvent(getFilter()!, 'keydown', { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 10))
    const popover = getPopover()
    expect(popover === null || popover.style.display === 'none').toBe(true)
  })

  it('marks currently selected option', async () => {
    setup({ value: 'Roboto' })
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const selected = container.querySelector('.cortex-dropdown__option--selected')
    expect(selected).not.toBeNull()
    expect(selected!.textContent).toContain('Roboto')
  })

  it('arrow keys navigate options', async () => {
    const { onChange } = setup()
    getTrigger().click()
    await new Promise((r) => setTimeout(r, 10))
    const filter = getFilter()!
    dispatchKeyboardEvent(filter, 'keydown', { key: 'ArrowDown' })
    dispatchKeyboardEvent(filter, 'keydown', { key: 'ArrowDown' })
    dispatchKeyboardEvent(filter, 'keydown', { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Roboto')
  })

  it('renders chevron icon', () => {
    setup()
    const chevron = container.querySelector('.cortex-dropdown__chevron')
    expect(chevron).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cortex-editor && npx vitest run tests/browser/controls/dropdown.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

---

### Task 5: Dropdown — Implementation

**Files:**
- Create: `cortex-editor/src/browser/components/controls/Dropdown.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Create Dropdown component**

Create `src/browser/components/controls/Dropdown.tsx`:

```tsx
import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'

export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
}: DropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  const filtered = filter
    ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options

  // Position popover when opened
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return
    computePosition(triggerRef.current, popoverRef.current, {
      placement: 'bottom-start',
      middleware: [flip(), shift()],
    }).then(({ x, y }) => {
      if (popoverRef.current) {
        popoverRef.current.style.left = `${x}px`
        popoverRef.current.style.top = `${y}px`
      }
    })
  }, [isOpen, filter])

  // Focus filter input when opened
  useEffect(() => {
    if (isOpen) {
      filterRef.current?.focus()
      setHighlightIdx(0)
    }
  }, [isOpen])

  const open = useCallback(() => {
    setFilter('')
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setFilter('')
  }, [])

  const select = useCallback(
    (optValue: string) => {
      onChange(optValue)
      close()
    },
    [onChange, close],
  )

  const handleFilterInput = useCallback((e: Event) => {
    setFilter((e.target as HTMLInputElement).value)
    setHighlightIdx(0)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[highlightIdx]) {
          select(filtered[highlightIdx].value)
        }
      }
    },
    [close, select, filtered, highlightIdx],
  )

  return (
    <div class="cortex-dropdown">
      <button
        ref={triggerRef}
        class="cortex-dropdown__trigger"
        onClick={isOpen ? close : open}
      >
        <span class="cortex-dropdown__value">
          {selectedLabel || placeholder}
        </span>
        <span class={`cortex-dropdown__chevron${isOpen ? ' cortex-dropdown__chevron--open' : ''}`}>
          &#9662;
        </span>
      </button>
      {isOpen && (
        <>
          <div class="cortex-dropdown__backdrop" onClick={close} />
          <div
            ref={popoverRef}
            class="cortex-dropdown__popover"
            style={{ position: 'fixed' }}
          >
            <input
              ref={filterRef}
              class="cortex-dropdown__filter"
              type="text"
              value={filter}
              onInput={handleFilterInput}
              onKeyDown={handleKeyDown}
              placeholder="Filter..."
            />
            <div class="cortex-dropdown__list">
              {filtered.length === 0 ? (
                <div class="cortex-dropdown__empty">No matches</div>
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={opt.value}
                    class={[
                      'cortex-dropdown__option',
                      i === highlightIdx && 'cortex-dropdown__option--active',
                      opt.value === value && 'cortex-dropdown__option--selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => select(opt.value)}
                  >
                    {opt.label}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Dropdown CSS to styles.css**

Append to `src/browser/styles.css`:

```css
/* ── Dropdown ───────────────────────────────── */

.cortex-dropdown {
  position: relative;
  width: 100%;
}

.cortex-dropdown__trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #111827;
  text-align: left;
}

.cortex-dropdown__trigger:hover {
  background: #e5e7eb;
}

.cortex-dropdown__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-dropdown__chevron {
  flex-shrink: 0;
  font-size: 10px;
  color: #9ca3af;
  margin-left: 4px;
  transition: transform 150ms ease-out;
}

.cortex-dropdown__chevron--open {
  transform: rotate(180deg);
}

.cortex-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1;
}

.cortex-dropdown__popover {
  z-index: 2;
  width: 100%;
  min-width: 120px;
  max-height: 200px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cortex-dropdown__filter {
  padding: 6px 8px;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
  color: #111827;
  background: transparent;
  outline: none;
}

.cortex-dropdown__filter::placeholder {
  color: #9ca3af;
}

.cortex-dropdown__list {
  overflow-y: auto;
  max-height: 160px;
  padding: 4px 0;
}

.cortex-dropdown__option {
  padding: 6px 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.cortex-dropdown__option:hover,
.cortex-dropdown__option--active {
  background: #f3f4f6;
  color: #111827;
}

.cortex-dropdown__option--selected {
  font-weight: 500;
  color: #3b82f6;
}

.cortex-dropdown__empty {
  padding: 8px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}
```

- [ ] **Step 3: Run Dropdown tests**

```bash
cd cortex-editor && npx vitest run tests/browser/controls/dropdown.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Run full browser test suite**

```bash
cd cortex-editor && npx vitest run tests/browser --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/controls/Dropdown.tsx tests/browser/controls/dropdown.test.tsx src/browser/styles.css
git commit -m "feat(5a): Dropdown with floating-ui positioning, filter, backdrop dismiss"
```

---

## Chunk 3: LayoutSection + TypographySection

### Task 6: LayoutSection — Tests

**Files:**
- Create: `cortex-editor/tests/browser/sections/layout-section.test.tsx`

- [ ] **Step 1: Write LayoutSection test file**

Create `tests/browser/sections/layout-section.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { LayoutSection } from '../../../src/browser/components/sections/LayoutSection.js'
import type { LayoutValues } from '../../../src/browser/components/sections/LayoutSection.js'

describe('LayoutSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: LayoutValues = {
    display: 'block',
    visibility: 'visible',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    width: '320',
    height: '48',
  }

  function setup(overrides?: Partial<Parameters<typeof LayoutSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <LayoutSection
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="layout"', () => {
    setup()
    const root = container.querySelector('[data-section-id="layout"]')
    expect(root).not.toBeNull()
  })

  it('renders display segmented control with block active', () => {
    setup()
    const displayGroup = container.querySelector('[role="radiogroup"]')
    expect(displayGroup).not.toBeNull()
    const active = container.querySelector('[aria-checked="true"]')
    expect(active).not.toBeNull()
  })

  it('renders visibility row when display is not none', () => {
    setup()
    expect(container.textContent).toContain('Visibility')
  })

  it('hides visibility row when display is none', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'none' } })
    // Visibility section should not be in the DOM or should be collapsed
    const visSection = container.querySelector('[data-group="visibility"]')
    expect(visSection === null || visSection.getAttribute('data-hidden') === 'true').toBe(true)
  })

  it('shows flex direction only for flex display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.textContent).toContain('Direction')
  })

  it('hides flex direction for block display', () => {
    setup()
    expect(container.textContent).not.toContain('Direction')
  })

  it('shows justify/align for flex display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.textContent).toContain('Justify')
    expect(container.textContent).toContain('Align')
  })

  it('shows justify/align for grid display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'grid' } })
    expect(container.textContent).toContain('Justify')
    expect(container.textContent).toContain('Align')
  })

  it('hides justify/align for block display', () => {
    setup()
    expect(container.textContent).not.toContain('Justify')
    expect(container.textContent).not.toContain('Align')
  })

  it('renders W and H sizing inputs', () => {
    setup()
    expect(container.textContent).toContain('W')
    expect(container.textContent).toContain('H')
  })

  it('emits display change on segmented control click', () => {
    const { onChange } = setup()
    // Find the flex option and click it
    const buttons = container.querySelectorAll('[role="radio"]')
    const flexBtn = Array.from(buttons).find((b) => b.textContent?.includes('flex'))
    ;(flexBtn as HTMLElement)?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'display', value: 'flex' })
  })

  it('emits visibility change', () => {
    const { onChange } = setup()
    // Find visibility radio group (second radiogroup) and click hidden
    const groups = container.querySelectorAll('[role="radiogroup"]')
    // Visibility is the second group
    if (groups.length >= 2) {
      const hiddenBtn = groups[1].querySelector('[data-value="hidden"]') as HTMLElement
      hiddenBtn?.click()
      expect(onChange).toHaveBeenCalledWith({ property: 'visibility', value: 'hidden' })
    }
  })

  it('emits width change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Width is the first numeric input in the sizing row
    const widthInput = inputs[0] as HTMLInputElement
    if (widthInput) {
      widthInput.focus()
      widthInput.value = '400'
      widthInput.dispatchEvent(new Event('input', { bubbles: true }))
      widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
    // onChange should be called with formatted px value
    const calls = onChange.mock.calls
    const widthCall = calls.find((c: any) => c[0]?.property === 'width')
    if (widthCall) {
      expect(widthCall[0].value).toBe('400px')
    }
  })

  it('handles auto width gracefully', () => {
    setup({ values: { ...DEFAULT_VALUES, width: 'auto' } })
    // Should not crash, should render the input
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    expect(inputs.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cortex-editor && npx vitest run tests/browser/sections/layout-section.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

---

### Task 7: LayoutSection — Implementation

**Files:**
- Create: `cortex-editor/src/browser/components/sections/LayoutSection.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Create LayoutSection component**

Create `src/browser/components/sections/LayoutSection.tsx`:

```tsx
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'

export interface LayoutChange {
  property: string
  value: string
}

export interface LayoutValues {
  display: string
  visibility: string
  flexDirection: string
  justifyContent: string
  alignItems: string
  width: string
  height: string
}

export interface LayoutSectionProps {
  values: LayoutValues
  onChange: (change: LayoutChange) => void
  onScrub?: (change: LayoutChange) => void
  onScrubEnd?: (change: LayoutChange) => void
}

const DISPLAY_OPTIONS = [
  { value: 'block', label: 'block' },
  { value: 'flex', label: 'flex' },
  { value: 'grid', label: 'grid' },
  { value: 'inline', label: 'inline' },
  { value: 'none', label: 'none' },
]

const VISIBILITY_OPTIONS = [
  { value: 'visible', label: 'visible' },
  { value: 'hidden', label: 'hidden' },
]

const FLEX_DIRECTION_OPTIONS = [
  { value: 'row', icon: '→', title: 'Row' },
  { value: 'row-reverse', icon: '←', title: 'Row Reverse' },
  { value: 'column', icon: '↓', title: 'Column' },
  { value: 'column-reverse', icon: '↑', title: 'Column Reverse' },
]

const JUSTIFY_OPTIONS = [
  { value: 'flex-start', icon: '⊣', title: 'Start' },
  { value: 'center', icon: '⊡', title: 'Center' },
  { value: 'flex-end', icon: '⊢', title: 'End' },
  { value: 'space-between', icon: '⊞', title: 'Space Between' },
  { value: 'space-around', icon: '⊟', title: 'Space Around' },
]

const ALIGN_OPTIONS = [
  { value: 'flex-start', icon: '⊣', title: 'Start' },
  { value: 'center', icon: '⊡', title: 'Center' },
  { value: 'flex-end', icon: '⊢', title: 'End' },
  { value: 'stretch', icon: '⊟', title: 'Stretch' },
  { value: 'baseline', icon: '⊥', title: 'Baseline' },
]

export function LayoutSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: LayoutSectionProps): JSX.Element {
  const isFlex = values.display === 'flex' || values.display === 'inline-flex'
  const isGrid = values.display === 'grid' || values.display === 'inline-grid'
  const isFlexOrGrid = isFlex || isGrid
  const isNone = values.display === 'none'

  const handleDisplayChange = useCallback(
    (v: string) => onChange({ property: 'display', value: v }),
    [onChange],
  )
  const handleVisibilityChange = useCallback(
    (v: string) => onChange({ property: 'visibility', value: v }),
    [onChange],
  )
  const handleFlexDirChange = useCallback(
    (v: string) => onChange({ property: 'flex-direction', value: v }),
    [onChange],
  )
  const handleJustifyChange = useCallback(
    (v: string) => onChange({ property: 'justify-content', value: v }),
    [onChange],
  )
  const handleAlignChange = useCallback(
    (v: string) => onChange({ property: 'align-items', value: v }),
    [onChange],
  )

  const widthNum = parseFloat(values.width)
  const heightNum = parseFloat(values.height)
  const isAutoWidth = isNaN(widthNum)
  const isAutoHeight = isNaN(heightNum)

  const makeSizeHandler = useCallback(
    (property: string, cb?: (change: LayoutChange) => void) =>
      (v: number) => {
        if (cb) cb({ property, value: `${v}px` })
      },
    [],
  )

  return (
    <div class="cortex-layout-section" data-section-id="layout">
      <div class="cortex-layout-section__group">
        <span class="cortex-section-label">Display</span>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={values.display}
          onChange={handleDisplayChange}
        />
      </div>

      {!isNone && (
        <div class="cortex-layout-section__group" data-group="visibility">
          <span class="cortex-section-label">Visibility</span>
          <SegmentedControl
            options={VISIBILITY_OPTIONS}
            value={values.visibility}
            onChange={handleVisibilityChange}
          />
        </div>
      )}

      {isNone && <div data-group="visibility" data-hidden="true" />}

      {isFlex && (
        <div class="cortex-layout-section__group">
          <span class="cortex-section-label">Direction</span>
          <SegmentedControl
            options={FLEX_DIRECTION_OPTIONS}
            value={values.flexDirection}
            onChange={handleFlexDirChange}
            size="sm"
          />
        </div>
      )}

      {isFlexOrGrid && (
        <>
          <div class="cortex-layout-section__group">
            <span class="cortex-section-label">Justify</span>
            <SegmentedControl
              options={JUSTIFY_OPTIONS}
              value={values.justifyContent}
              onChange={handleJustifyChange}
              size="sm"
            />
          </div>
          <div class="cortex-layout-section__group">
            <span class="cortex-section-label">Align</span>
            <SegmentedControl
              options={ALIGN_OPTIONS}
              value={values.alignItems}
              onChange={handleAlignChange}
              size="sm"
            />
          </div>
        </>
      )}

      <div class="cortex-layout-section__group">
        <span class="cortex-section-label">Sizing</span>
        <div class="cortex-layout-section__sizing">
          <NumericInput
            value={isAutoWidth ? 0 : widthNum}
            unit={isAutoWidth ? 'auto' : 'px'}
            label="W"
            min={0}
            onChange={makeSizeHandler('width', onChange)}
            onScrub={makeSizeHandler('width', onScrub)}
            onScrubEnd={makeSizeHandler('width', onScrubEnd)}
          />
          <NumericInput
            value={isAutoHeight ? 0 : heightNum}
            unit={isAutoHeight ? 'auto' : 'px'}
            label="H"
            min={0}
            onChange={makeSizeHandler('height', onChange)}
            onScrub={makeSizeHandler('height', onScrub)}
            onScrubEnd={makeSizeHandler('height', onScrubEnd)}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add LayoutSection CSS to styles.css**

Append to `src/browser/styles.css`:

```css
/* ── Layout section ─────────────────────────── */

.cortex-layout-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-layout-section__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cortex-layout-section__sizing {
  display: flex;
  gap: 6px;
}
```

- [ ] **Step 3: Run LayoutSection tests**

```bash
cd cortex-editor && npx vitest run tests/browser/sections/layout-section.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/browser/components/sections/LayoutSection.tsx tests/browser/sections/layout-section.test.tsx src/browser/styles.css
git commit -m "feat(5a): LayoutSection with display, visibility, flex/grid controls, sizing"
```

---

### Task 8: TypographySection — Tests

**Files:**
- Create: `cortex-editor/tests/browser/sections/typography-section.test.tsx`

- [ ] **Step 1: Write TypographySection test file**

Create `tests/browser/sections/typography-section.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { TypographySection } from '../../../src/browser/components/sections/TypographySection.js'
import type { TypographyValues } from '../../../src/browser/components/sections/TypographySection.js'

// Mock @floating-ui/dom for Dropdown
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('TypographySection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: TypographyValues = {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: 'left',
    color: 'rgb(107, 114, 128)',
  }

  function setup(overrides?: Partial<Parameters<typeof TypographySection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <TypographySection
        values={DEFAULT_VALUES}
        availableFonts={['Inter', 'Roboto', 'Open Sans']}
        availableWeights={['400', '500', '700']}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="type"', () => {
    setup()
    const root = container.querySelector('[data-section-id="type"]')
    expect(root).not.toBeNull()
  })

  it('renders font dropdown with current font', () => {
    setup()
    const trigger = container.querySelector('.cortex-dropdown__trigger')
    expect(trigger?.textContent).toContain('Inter')
  })

  it('renders SZ label with font-size value', () => {
    setup()
    expect(container.textContent).toContain('SZ')
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('SZ')
    }) as HTMLInputElement | undefined
    expect(szInput?.value).toBe('16')
  })

  it('renders LH and LS inputs', () => {
    setup()
    expect(container.textContent).toContain('LH')
    expect(container.textContent).toContain('LS')
  })

  it('renders text align segmented control', () => {
    setup()
    expect(container.textContent).toContain('Align')
  })

  it('renders COL swatch and hex input', () => {
    setup()
    expect(container.textContent).toContain('COL')
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput).not.toBeNull()
    // rgb(107, 114, 128) → #6b7280
    expect(hexInput.value).toBe('#6b7280')
  })

  it('parses rgba color format', () => {
    setup({ values: { ...DEFAULT_VALUES, color: 'rgba(59, 130, 246, 0.5)' } })
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput.value).toBe('#3b82f6')
  })

  it('parses modern rgb space syntax', () => {
    setup({ values: { ...DEFAULT_VALUES, color: 'rgb(59 130 246)' } })
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput.value).toBe('#3b82f6')
  })

  it('emits font-size change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Find the SZ input (first numeric input after the dropdowns)
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('SZ')
    }) as HTMLInputElement | undefined
    if (szInput) {
      szInput.focus()
      szInput.value = '20'
      szInput.dispatchEvent(new Event('input', { bubbles: true }))
      szInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
    const calls = onChange.mock.calls
    const sizeCall = calls.find((c: any) => c[0]?.property === 'font-size')
    if (sizeCall) {
      expect(sizeCall[0].value).toBe('20px')
    }
  })

  it('emits line-height as unitless value', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const lhInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('LH')
    }) as HTMLInputElement | undefined
    if (lhInput) {
      lhInput.focus()
      lhInput.value = '1.8'
      lhInput.dispatchEvent(new Event('input', { bubbles: true }))
      lhInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
    const calls = onChange.mock.calls
    const lhCall = calls.find((c: any) => c[0]?.property === 'line-height')
    if (lhCall) {
      expect(lhCall[0].value).toBe('1.8')
    }
  })

  it('emits text-align change', () => {
    const { onChange } = setup()
    // Find the align segmented control (last radiogroup)
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    const centerBtn = alignGroup?.querySelector('[data-value="center"]') as HTMLElement
    centerBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'text-align', value: 'center' })
  })

  it('validates hex input — accepts valid hex', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hexInput.focus()
    hexInput.value = '#ff0000'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const calls = onChange.mock.calls
    const colorCall = calls.find((c: any) => c[0]?.property === 'color')
    if (colorCall) {
      expect(colorCall[0].value).toBe('#ff0000')
    }
  })

  it('validates hex input — rejects invalid, reverts', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hexInput.focus()
    hexInput.value = 'notahex'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    // Should revert to original
    expect(hexInput.value).toBe('#6b7280')
    // Should NOT call onChange with invalid value
    const calls = onChange.mock.calls
    const colorCall = calls.find((c: any) => c[0]?.property === 'color')
    expect(colorCall).toBeUndefined()
  })

  it('renders weight dropdown with named label', () => {
    setup()
    // The weight dropdown trigger should show "Regular" for weight 400
    const triggers = container.querySelectorAll('.cortex-dropdown__trigger')
    const weightTrigger = triggers[1] // Second dropdown is weight
    expect(weightTrigger?.textContent).toContain('Regular')
  })

  it('color swatch shows computed color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBeTruthy()
  })

  it('handles empty availableFonts gracefully', () => {
    setup({ availableFonts: [] })
    // Should render without crash, dropdown should still show current font
    const trigger = container.querySelector('.cortex-dropdown__trigger')
    expect(trigger?.textContent).toContain('Inter')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cortex-editor && npx vitest run tests/browser/sections/typography-section.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

---

### Task 9: TypographySection — Implementation

**Files:**
- Create: `cortex-editor/src/browser/components/sections/TypographySection.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Create TypographySection component**

Create `src/browser/components/sections/TypographySection.tsx`:

```tsx
import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { Dropdown } from '../controls/Dropdown.js'

export interface TypographyChange {
  property: string
  value: string
}

export interface TypographyValues {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
  textAlign: string
  color: string
}

export interface TypographySectionProps {
  values: TypographyValues
  availableFonts: string[]
  availableWeights: string[]
  onChange: (change: TypographyChange) => void
  onScrub?: (change: TypographyChange) => void
  onScrubEnd?: (change: TypographyChange) => void
}

const WEIGHT_LABELS: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semibold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
}

const ALIGN_OPTIONS = [
  { value: 'left', icon: '≡←', title: 'Left' },
  { value: 'center', icon: '≡', title: 'Center' },
  { value: 'right', icon: '≡→', title: 'Right' },
  { value: 'justify', icon: '≡↔', title: 'Justify' },
]

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/** Parse any CSS color format to #RRGGBB. Returns null if unparseable. */
function rgbToHex(color: string): string | null {
  const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return null
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function TypographySection({
  values,
  availableFonts,
  availableWeights,
  onChange,
  onScrub,
  onScrubEnd,
}: TypographySectionProps): JSX.Element {
  const hexColor = rgbToHex(values.color) ?? values.color
  const [localHex, setLocalHex] = useState(hexColor)
  const [isEditingHex, setIsEditingHex] = useState(false)

  // Sync localHex from computed value when not editing
  if (!isEditingHex && localHex !== hexColor) {
    setLocalHex(hexColor)
  }

  // Build font options — always include current font even if not in availableFonts
  const fontOptions = (() => {
    const fonts = new Set(availableFonts)
    const current = values.fontFamily.replace(/^["']|["']$/g, '').split(',')[0].trim()
    fonts.add(current)
    return [...fonts].sort().map((f) => ({ value: f, label: f }))
  })()

  const weightOptions = availableWeights.map((w) => ({
    value: w,
    label: WEIGHT_LABELS[w] ?? w,
  }))

  // Always include current weight
  if (!availableWeights.includes(values.fontWeight)) {
    weightOptions.push({
      value: values.fontWeight,
      label: WEIGHT_LABELS[values.fontWeight] ?? values.fontWeight,
    })
  }

  const handleFontChange = useCallback(
    (v: string) => onChange({ property: 'font-family', value: v }),
    [onChange],
  )
  const handleWeightChange = useCallback(
    (v: string) => onChange({ property: 'font-weight', value: v }),
    [onChange],
  )
  const handleAlignChange = useCallback(
    (v: string) => onChange({ property: 'text-align', value: v }),
    [onChange],
  )

  const makeSizeHandler = useCallback(
    (property: string, format: (v: number) => string, cb?: (change: TypographyChange) => void) =>
      (v: number) => {
        if (cb) cb({ property, value: format(v) })
      },
    [],
  )

  const pxFormat = (v: number) => `${v}px`
  const unitlessFormat = (v: number) => String(v)

  const handleHexInput = useCallback((e: Event) => {
    setLocalHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setIsEditingHex(true)
  }, [])

  const handleHexBlur = useCallback(() => {
    setIsEditingHex(false)
    if (HEX_REGEX.test(localHex)) {
      onChange({ property: 'color', value: localHex })
    } else {
      setLocalHex(hexColor)
    }
  }, [localHex, hexColor, onChange])

  const currentFontClean = values.fontFamily.replace(/^["']|["']$/g, '').split(',')[0].trim()

  return (
    <div class="cortex-typography-section" data-section-id="type">
      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">Font</span>
        <Dropdown
          options={fontOptions}
          value={currentFontClean}
          onChange={handleFontChange}
          placeholder="Select font..."
        />
      </div>

      <div class="cortex-typography-section__row">
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.fontSize}
            unit="px"
            label="SZ"
            min={1}
            onChange={makeSizeHandler('font-size', pxFormat, onChange)}
            onScrub={makeSizeHandler('font-size', pxFormat, onScrub)}
            onScrubEnd={makeSizeHandler('font-size', pxFormat, onScrubEnd)}
          />
        </div>
        <div class="cortex-typography-section__field">
          <span class="cortex-typography-section__inline-label">WT</span>
          <Dropdown
            options={weightOptions}
            value={values.fontWeight}
            onChange={handleWeightChange}
          />
        </div>
      </div>

      <div class="cortex-typography-section__row">
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.lineHeight}
            label="LH"
            onChange={makeSizeHandler('line-height', unitlessFormat, onChange)}
            onScrub={makeSizeHandler('line-height', unitlessFormat, onScrub)}
            onScrubEnd={makeSizeHandler('line-height', unitlessFormat, onScrubEnd)}
          />
        </div>
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.letterSpacing}
            unit="px"
            label="LS"
            onChange={makeSizeHandler('letter-spacing', pxFormat, onChange)}
            onScrub={makeSizeHandler('letter-spacing', pxFormat, onScrub)}
            onScrubEnd={makeSizeHandler('letter-spacing', pxFormat, onScrubEnd)}
          />
        </div>
      </div>

      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">Align</span>
        <SegmentedControl
          options={ALIGN_OPTIONS}
          value={values.textAlign}
          onChange={handleAlignChange}
          size="sm"
        />
      </div>

      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">COL</span>
        <div class="cortex-color-input">
          <div
            class="cortex-color-input__swatch"
            style={{ backgroundColor: values.color }}
          />
          <input
            class="cortex-color-input__hex"
            type="text"
            value={localHex}
            onInput={handleHexInput}
            onFocus={handleHexFocus}
            onBlur={handleHexBlur}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add TypographySection CSS to styles.css**

Append to `src/browser/styles.css`:

```css
/* ── Typography section ─────────────────────── */

.cortex-typography-section {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-typography-section__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cortex-typography-section__row {
  display: flex;
  gap: 6px;
}

.cortex-typography-section__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.cortex-typography-section__inline-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  flex-shrink: 0;
}

/* ── Color input ────────────────────────────── */

.cortex-color-input {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cortex-color-input__swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.cortex-color-input__hex {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  font: 13px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #111827;
  outline: none;
}

.cortex-color-input__hex:focus {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}
```

- [ ] **Step 3: Run TypographySection tests**

```bash
cd cortex-editor && npx vitest run tests/browser/sections/typography-section.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Run full browser test suite**

```bash
cd cortex-editor && npx vitest run tests/browser --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/browser/components/sections/LayoutSection.tsx src/browser/components/sections/TypographySection.tsx tests/browser/sections/layout-section.test.tsx tests/browser/sections/typography-section.test.tsx src/browser/styles.css
git commit -m "feat(5a): LayoutSection + TypographySection with full property controls"
```

---

## Chunk 4: Panel Integration + Verification

### Task 10: Panel.tsx Integration

**Files:**
- Modify: `cortex-editor/src/browser/components/Panel.tsx`

- [ ] **Step 1: Add imports and parsing helpers to Panel.tsx**

Add imports after existing imports:

```tsx
import { LayoutSection } from './sections/LayoutSection.js'
import type { LayoutChange } from './sections/LayoutSection.js'
import { TypographySection } from './sections/TypographySection.js'
import type { TypographyChange, TypographyValues } from './sections/TypographySection.js'
```

Add parsing helpers after `parseSpacingValues`:

```tsx
function parseLayoutValues(cs: CSSStyleDeclaration) {
  return {
    display: cs.display,
    visibility: cs.visibility,
    flexDirection: cs.flexDirection,
    justifyContent: cs.justifyContent,
    alignItems: cs.alignItems,
    width: cs.width,
    height: cs.height,
  }
}

function parseTypographyValues(cs: CSSStyleDeclaration): TypographyValues {
  const fontSize = parseFloat(cs.fontSize) || 16
  return {
    fontFamily: cs.fontFamily,
    fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight === 'normal' ? 1.5 : parseFloat(cs.lineHeight) / fontSize,
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
    textAlign: cs.textAlign,
    color: cs.color,
  }
}

function getAvailableFonts(): string[] {
  if (!document.fonts?.[Symbol.iterator]) return []
  const families = new Set<string>()
  for (const face of document.fonts) {
    families.add((face as FontFace).family.replace(/^["']|["']$/g, ''))
  }
  return [...families].sort()
}

function getWeightsForFamily(family: string): string[] {
  if (!document.fonts?.[Symbol.iterator]) return ['400']
  const weights = new Set<string>()
  for (const face of document.fonts) {
    const f = face as FontFace
    const faceName = f.family.replace(/^["']|["']$/g, '')
    if (faceName === family) {
      const w = f.weight
      if (w.includes(' ')) {
        const [min, max] = w.split(' ').map(Number)
        for (const std of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
          if (std >= min && std <= max) weights.add(String(std))
        }
      } else {
        weights.add(w)
      }
    }
  }
  return weights.size > 0
    ? [...weights].sort((a, b) => Number(a) - Number(b))
    : ['400']
}
```

- [ ] **Step 2: Extend computedStyles useMemo**

Replace the existing `computedStyles` useMemo with:

```tsx
const computedStyles = useMemo(() => {
  if (!element) {
    return {
      spacing: parseSpacingValues({} as CSSStyleDeclaration),
      isFlexOrGrid: false,
      layout: parseLayoutValues({} as CSSStyleDeclaration),
      typography: parseTypographyValues({} as CSSStyleDeclaration),
    }
  }
  const cs = getComputedStyle(element)
  const d = cs.display
  return {
    spacing: parseSpacingValues(cs),
    isFlexOrGrid: d === 'flex' || d === 'inline-flex' || d === 'grid' || d === 'inline-grid',
    layout: parseLayoutValues(cs),
    typography: parseTypographyValues(cs),
  }
}, [element, styleVersion])
```

- [ ] **Step 3: Add font detection memos**

After the `computedStyles` useMemo, add:

```tsx
const availableFonts = useMemo(() => getAvailableFonts(), [element])

const currentFontFamily = computedStyles.typography.fontFamily
  .replace(/^["']|["']$/g, '')
  .split(',')[0]
  .trim()
const availableWeights = useMemo(
  () => getWeightsForFamily(currentFontFamily),
  [currentFontFamily],
)
```

- [ ] **Step 4: Add override handlers for layout and typography**

After the spacing override handlers, add:

```tsx
const applyLayoutOverride = useCallback((change: LayoutChange, commitRender: boolean) => {
  if (!element) return
  const source = element.getAttribute('data-cortex-source')
  if (source) {
    overrideManager.set(source, change.property, change.value)
    if (commitRender) {
      overrideManager.flush()
      setStyleVersion(v => v + 1)
    }
  }
}, [element, overrideManager])

const handleLayoutCommit = useCallback((c: LayoutChange) => applyLayoutOverride(c, true), [applyLayoutOverride])
const handleLayoutScrub = useCallback((c: LayoutChange) => applyLayoutOverride(c, false), [applyLayoutOverride])

const applyTypographyOverride = useCallback((change: TypographyChange, commitRender: boolean) => {
  if (!element) return
  const source = element.getAttribute('data-cortex-source')
  if (source) {
    overrideManager.set(source, change.property, change.value)
    if (commitRender) {
      overrideManager.flush()
      setStyleVersion(v => v + 1)
    }
  }
}, [element, overrideManager])

const handleTypographyCommit = useCallback((c: TypographyChange) => applyTypographyOverride(c, true), [applyTypographyOverride])
const handleTypographyScrub = useCallback((c: TypographyChange) => applyTypographyOverride(c, false), [applyTypographyOverride])
```

- [ ] **Step 5: Replace placeholder sections in JSX**

Replace the panel body section (the `<div class="cortex-panel__body">` contents) to reorder sections matching tab order (Layout → Spacing → Type):

```tsx
<div class="cortex-panel__body" ref={bodyRef} key={contentKey}>
  <LayoutSection
    values={computedStyles.layout}
    onChange={handleLayoutCommit}
    onScrub={handleLayoutScrub}
    onScrubEnd={handleLayoutCommit}
  />
  <SpacingSection
    padding={computedStyles.spacing.padding}
    margin={computedStyles.spacing.margin}
    gap={computedStyles.spacing.gap}
    isFlexOrGrid={computedStyles.isFlexOrGrid}
    onChange={handleSpacingCommit}
    onScrub={handleScrub}
    onScrubEnd={handleSpacingCommit}
  />
  <TypographySection
    values={computedStyles.typography}
    availableFonts={availableFonts}
    availableWeights={availableWeights}
    onChange={handleTypographyCommit}
    onScrub={handleTypographyScrub}
    onScrubEnd={handleTypographyCommit}
  />
  <div data-section-id="fill" />
  <div data-section-id="border" />
  <div data-section-id="shadow" />
  <div data-section-id="effects" />
</div>
```

- [ ] **Step 6: Run all tests**

```bash
cd cortex-editor && npx vitest run tests/browser --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass. Panel integration tests may need minor adjustments if they assert specific section counts.

- [ ] **Step 7: Run typecheck**

```bash
cd cortex-editor && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/browser/components/Panel.tsx
git commit -m "feat(5a): wire LayoutSection + TypographySection into Panel with override handlers"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd cortex-editor && npx vitest run --reporter=verbose 2>&1 | tail -40
```

Expected: All tests pass (server + browser + integration).

- [ ] **Step 2: Run typecheck**

```bash
cd cortex-editor && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run build**

```bash
cd cortex-editor && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 4: Verify file count**

```bash
find cortex-editor/src/browser/components -name '*.tsx' | sort
find cortex-editor/tests/browser -name '*.test.tsx' | sort
```

Expected new files:
- `controls/Dropdown.tsx`, `controls/SegmentedControl.tsx`
- `sections/LayoutSection.tsx`, `sections/TypographySection.tsx`
- Tests for each

---

## Dependency Graph

```
Task 1 (deps + infra) → Task 2 (SegCtrl tests) → Task 3 (SegCtrl impl)
                                                        ↓
Task 4 (Dropdown tests) → Task 5 (Dropdown impl) ──────┤
                                                        ↓
Task 6 (Layout tests) → Task 7 (Layout impl) ──────────┤
                                                        ↓
Task 8 (Typo tests) → Task 9 (Typo impl) ──────────────┤
                                                        ↓
                                              Task 10 (Panel integration)
                                                        ↓
                                              Task 11 (Verification)
```

**Parallelizable after Task 3:** Tasks 4-5 (Dropdown) can run in parallel with Tasks 6-7 (LayoutSection) since they don't depend on each other. TypographySection (Tasks 8-9) depends on both Dropdown and SegmentedControl.
