import type { ComponentChildren, JSX } from 'preact'
import { useState, useRef, useCallback, useEffect, useContext, useMemo } from 'preact/hooks'
import { type TokenFamily, SPACING_PRESETS, matchesSpacingPattern } from '../../tokens/family.js'
import { SpacingTokensContext } from '../../tokens/TokenContext.js'
import { TokenPresetPopover } from './TokenPresetPopover.js'

export interface NumericInputProps {
  value: number
  unit?: string
  /**
   * Legacy short text label rendered inside the input box at left
   * (e.g. "T"/"R"/"B"/"L" in SpacingSection). Strings only — for icon
   * or composite-node prefixes use {@link NumericInputProps.prefix}
   * which renders into the same visual slot via a richer Preact child.
   */
  label?: string
  /**
   * Inline ghost-coloured prefix rendered INSIDE the input box, before
   * the value. Accepts any Preact children — used by PositionSection to
   * render the rotate icon (`<RotateCw size={12} />`) and short axis
   * tags ("X" / "Y" / "Z") into the same visual slot. When both
   * `prefix` and `label` are provided, `prefix` wins.
   */
  prefix?: ComponentChildren
  tooltip?: string
  min?: number
  disabled?: boolean
  onChange: (value: number) => void
  onScrub?: (value: number) => void
  onScrubEnd?: (value: number) => void
  overridden?: boolean
  /**
   * When true, the override was applied but HMR didn't verify it within the TTL.
   * Renders an orange/yellow tint variant of the overridden indicator with a tooltip
   * "Edit saved but HMR didn't apply — refresh to verify".
   * Uses the same --cx-warning token as the StagingDriftBanner accent.
   */
  stale?: boolean
  /** When true, shows '--' placeholder indicating shared elements have different values. */
  mixed?: boolean
  /**
   * Opt this input into a token family popover. When set to 'spacing', a
   * TokenPresetPopover appears on focus showing canonical scale chips and
   * any project-detected spacing tokens. Omitting this prop means no popover
   * is shown — existing behavior is fully preserved.
   */
  tokenFamily?: TokenFamily
}

function getStep(e: KeyboardEvent | WheelEvent): number {
  if (e.shiftKey) return 10
  if (e.altKey) return 0.1
  return 1
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10
}

export function NumericInput({
  value,
  unit,
  label,
  prefix,
  tooltip,
  min,
  disabled,
  onChange,
  onScrub,
  onScrubEnd,
  overridden,
  stale,
  mixed,
  tokenFamily,
}: NumericInputProps): JSX.Element {
  const allSpacingTokens = useContext(SpacingTokensContext)
  const showPopover = tokenFamily === 'spacing'
  // Defense-in-depth: filter tokens through the spacing pattern even though
  // the server resolver already filters — cheap and eliminates edge cases.
  const filteredTokens = useMemo(
    () => (showPopover ? allSpacingTokens.filter(t => matchesSpacingPattern(t.name)) : []),
    [allSpacingTokens, showPopover],
  )

  const [localValue, setLocalValue] = useState(String(value))
  const [isEditing, setIsEditing] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const localValueRef = useRef(String(value))
  const scrubStartX = useRef(0)
  const scrubStartValue = useRef(0)
  const scrubCleanupRef = useRef<(() => void) | null>(null)
  // Track whether the user actually typed in the input — prevents HMR-triggered
  // blurs from dispatching phantom edits with stale values.
  const userTypedRef = useRef(false)

  // Clean up scrub listeners if component unmounts mid-scrub
  useEffect(() => {
    return () => { scrubCleanupRef.current?.() }
  }, [])

  // Keep ref in sync so event handlers always read the latest value
  localValueRef.current = localValue

  useEffect(() => {
    if (!isEditing) {
      setLocalValue(String(value))
    }
  }, [value, isEditing])

  const clampValue = useCallback((v: number) => {
    return min !== undefined ? Math.max(min, v) : v
  }, [min])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = getStep(e)
      const delta = e.key === 'ArrowUp' ? step : -step
      const next = clampValue(roundTenth(value + delta))
      onChange(next)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const parsed = parseFloat(localValueRef.current)
      if (!isNaN(parsed)) {
        onChange(clampValue(parsed))
      }
      userTypedRef.current = false
      setIsEditing(false)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setLocalValue(String(value))
      setIsEditing(false)
      inputRef.current?.blur()
    }
  }, [value, onChange, clampValue])

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    userTypedRef.current = false
    if (mixed) {
      // Don't reveal the selected element's value — user types the target value
      // from scratch, since there's no single "current" value in mixed state.
      localValueRef.current = ''
      setLocalValue('')
    }
    inputRef.current?.select()
    if (showPopover) {
      setPopoverOpen(true)
    }
  }, [mixed, showPopover])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const parsed = parseFloat(localValueRef.current)
    if (isNaN(parsed)) {
      // In mixed state, revert to empty (shows '--' placeholder) instead of
      // revealing the selected element's value for a single frame.
      const reverted = mixed ? '' : String(value)
      localValueRef.current = reverted
      setLocalValue(reverted)
      if (inputRef.current) inputRef.current.value = reverted
    } else {
      const clamped = clampValue(parsed)
      // Only commit if the user actually typed a new value — prevents HMR-triggered
      // blurs from dispatching phantom edits when React replaces DOM nodes.
      if (userTypedRef.current && clamped !== value) {
        onChange(clamped)
      }
      const str = String(clamped)
      localValueRef.current = str
      setLocalValue(str)
    }
    userTypedRef.current = false
  }, [value, onChange, clampValue, mixed])

  const handleInput = useCallback((e: Event) => {
    userTypedRef.current = true
    const v = (e.target as HTMLInputElement).value
    localValueRef.current = v
    setLocalValue(v)
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    const root = inputRef.current?.getRootNode() as Document | ShadowRoot
    if (root?.activeElement !== inputRef.current) return
    e.preventDefault()
    const step = getStep(e)
    const delta = e.deltaY < 0 ? step : -step
    const next = clampValue(roundTenth(value + delta))
    onChange(next)
  }, [value, onChange, clampValue])

  const handleScrubDown = useCallback((e: PointerEvent) => {
    if (isEditing) return
    scrubStartX.current = e.clientX
    scrubStartValue.current = value

    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch {}

    setIsScrubbing(true)
    let hasMoved = false

    const handleMove = (me: PointerEvent) => {
      const delta = me.clientX - scrubStartX.current
      if (!hasMoved && Math.abs(delta) < 2) return // deadzone — ignore sub-pixel trackpad jitter
      hasMoved = true
      const next = clampValue(roundTenth(scrubStartValue.current + delta))
      localValueRef.current = String(next)
      setLocalValue(String(next))
      onScrub?.(next)
    }

    const cleanup = () => {
      scrubCleanupRef.current = null
      setIsScrubbing(false)
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      target.removeEventListener('pointercancel', handleCancel)
    }

    const handleUp = (ue: PointerEvent) => {
      try { target.releasePointerCapture(ue.pointerId) } catch {}
      if (!hasMoved) {
        // Click without drag — just focus the input, don't commit
        inputRef.current?.focus()
        cleanup()
        return
      }
      const delta = ue.clientX - scrubStartX.current
      const next = clampValue(roundTenth(scrubStartValue.current + delta))
      if (onScrubEnd) {
        onScrubEnd(next)
      } else {
        onChange(next)
      }
      cleanup()
    }

    const handleCancel = () => {
      cleanup()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
    target.addEventListener('pointercancel', handleCancel)
    scrubCleanupRef.current = cleanup
  }, [isEditing, value, onChange, onScrub, onScrubEnd, clampValue])

  const handlePopoverPick = useCallback((chosen: { name: string; valuePx: number; source: 'canonical' | 'project' }) => {
    // `name` and `source` are part of the contract for ZF0-1210 (staging-buffer flow
    // surfaces token identity at Apply time) but not consumed by the v1 onChange path.
    //
    // The chip's onMouseDown preventDefault (TokenPresetPopover) keeps focus on the
    // input — necessary to prevent the typed-then-pick double-onChange (Step 3f fix).
    // But that means isEditing stays true after the pick, and the [value, isEditing]
    // useEffect that normally syncs localValue from value prop is gated. Sync here
    // explicitly so the input reflects the picked value immediately.
    onChange(chosen.valuePx)
    const next = String(chosen.valuePx)
    localValueRef.current = next
    setLocalValue(next)
    setIsEditing(false)
    setPopoverOpen(false)
  }, [onChange])

  const handlePopoverDismiss = useCallback(() => {
    setPopoverOpen(false)
  }, [])

  // Stale tooltip takes priority over the regular tooltip — it carries the recovery hint.
  const effectiveTooltip = stale
    ? 'Edit saved but HMR didn\'t apply — refresh to verify'
    : tooltip

  return (
    <div
      ref={hostRef}
      class={[
        'cortex-numeric-input',
        isScrubbing && 'cortex-numeric-input--scrubbing',
        stale && 'cortex-numeric-input--stale',
        overridden && !stale && 'cortex-numeric-input--overridden',
        mixed && 'cortex-numeric-input--mixed',
      ].filter(Boolean).join(' ')}
      onPointerDown={disabled ? undefined : handleScrubDown}
      data-tooltip={effectiveTooltip}
      aria-disabled={disabled ? 'true' : undefined}
    >
      {prefix !== undefined
        ? <span class="cortex-numeric-input__prefix">{prefix}</span>
        : (label && <span class="cortex-numeric-input__label">{label}</span>)}
      <input
        ref={inputRef}
        class="cortex-numeric-input__value"
        type="text"
        inputMode="numeric"
        // HTML `size` attribute governs the input's intrinsic minimum width
        // (falls back to 20 chars by default, ≈140px). Setting it to 4 keeps
        // the intrinsic small (≈28px) so a NumericInput can size to its
        // content when its flex parent isn't constrained (e.g. the opacity
        // slot inside ColorInput) without forcing row overflow. In constrained
        // parents, the CSS `width: 100%` on __value still stretches the input
        // to fill allocated space, so other consumers (spacing, position,
        // grid/flex gap, etc.) are unaffected.
        size={4}
        aria-label={effectiveTooltip ?? label ?? (typeof prefix === 'string' ? prefix : undefined)}
        value={mixed && !isEditing ? '' : localValue}
        placeholder={mixed ? '--' : undefined}
        disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onWheel={handleWheel}
      />
      {unit && <span class="cortex-numeric-input__unit">{unit}</span>}
      {popoverOpen && (
        <TokenPresetPopover
          anchorRef={hostRef}
          presets={SPACING_PRESETS}
          tokens={filteredTokens}
          onPick={handlePopoverPick}
          onDismiss={handlePopoverDismiss}
        />
      )}
    </div>
  )
}
