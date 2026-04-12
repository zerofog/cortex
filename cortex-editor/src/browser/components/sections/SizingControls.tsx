/**
 * SizingControls — Panel v2 Task 10 (ZF0-1188)
 *
 * Extracted from LayoutSection's inline sizing block. Controls how a
 * selected element's width/height is determined: fixed px, fit-content,
 * or fill (100%). Also exposes min/max constraints, aspect-lock,
 * clip-content (overflow), and border-box toggles.
 *
 * Business logic: This component lets the user resize elements and set
 * sizing constraints. It fires CSS property changes (width, height,
 * min-width, max-width, min-height, max-height, overflow, box-sizing)
 * that get applied as CSS overrides to the selected element.
 *
 * CRITICAL BUG FIX (widthMode/heightMode stale state):
 * The old LayoutSection used useState for widthMode/heightMode
 * initialized from values but never re-synced when props changed.
 * Now widthMode/heightMode are DERIVED from values via a pure function
 * — no useState. Same for minWidthEnabled/maxWidthEnabled etc.
 */
import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { SectionChange } from './types.js'
import { NumericInput } from '../controls/NumericInput.js'
import { SizingDropdown } from '../controls/SizingDropdown.js'
import type { SizingMode } from '../controls/SizingDropdown.js'

export type SizingChange = SectionChange

export interface SizingControlsProps {
  values: {
    width: string
    height: string
    minWidth: string
    maxWidth: string
    minHeight: string
    maxHeight: string
    overflow: string
    boxSizing: string
  }
  onChange: (change: SizingChange) => void
  onScrub?: (change: SizingChange) => void
  onScrubEnd?: (change: SizingChange) => void
  mixedProperties?: Set<string>
}

/** Derive the SizingDropdown mode from the raw CSS value — pure, no state. */
function deriveSizingMode(value: string): SizingMode {
  if (value === 'fit-content') return 'fit'
  if (value === '100%') return 'fill'
  return 'fixed'
}

/** Derive whether a min/max constraint is active from the raw CSS value. */
function isMinEnabled(value: string): boolean {
  const num = parseFloat(value)
  return !isNaN(num) && num > 0
}

function isMaxEnabled(value: string): boolean {
  return value !== 'none' && value !== ''
}

export function SizingControls({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: SizingControlsProps): JSX.Element {
  const [aspectLocked, setAspectLocked] = useState(false)

  // Derive modes from values — fixes stale-state bug (Task 2 flag).
  const widthMode = deriveSizingMode(values.width)
  const heightMode = deriveSizingMode(values.height)
  const minWidthEnabled = isMinEnabled(values.minWidth)
  const maxWidthEnabled = isMaxEnabled(values.maxWidth)
  const minHeightEnabled = isMinEnabled(values.minHeight)
  const maxHeightEnabled = isMaxEnabled(values.maxHeight)

  const widthNum = parseFloat(values.width)
  const heightNum = parseFloat(values.height)
  const isAutoWidth = isNaN(widthNum)
  const isAutoHeight = isNaN(heightNum)

  const canLockAspect = widthMode === 'fixed' && heightMode === 'fixed'
  const aspectRatio = (canLockAspect && !isAutoWidth && !isAutoHeight && heightNum > 0)
    ? widthNum / heightNum
    : 1

  // ── Width handlers ──────────────────────────────────────────────
  const handleWidthChange = useCallback(
    (v: number) => {
      onChange({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0) {
        onChange({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onChange, aspectLocked, aspectRatio],
  )
  const handleWidthScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrub) {
        onScrub({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onScrub, aspectLocked, aspectRatio],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrubEnd) {
        onScrubEnd({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onScrubEnd, aspectLocked, aspectRatio],
  )

  // ── Height handlers ─────────────────────────────────────────────
  const handleHeightChange = useCallback(
    (v: number) => {
      onChange({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0) {
        onChange({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onChange, aspectLocked, aspectRatio],
  )
  const handleHeightScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrub) {
        onScrub({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onScrub, aspectLocked, aspectRatio],
  )
  const handleHeightScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrubEnd) {
        onScrubEnd({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onScrubEnd, aspectLocked, aspectRatio],
  )

  const handleToggleLock = useCallback(() => setAspectLocked((v) => !v), [])

  // ── Mode change handlers ────────────────────────────────────────
  const handleWidthModeChange = useCallback((mode: SizingMode) => {
    if (mode === 'fit') onChange({ property: 'width', value: 'fit-content' })
    else if (mode === 'fill') onChange({ property: 'width', value: '100%' })
    else onChange({ property: 'width', value: `${isAutoWidth ? 0 : widthNum}px` })
  }, [onChange, isAutoWidth, widthNum])

  const handleHeightModeChange = useCallback((mode: SizingMode) => {
    if (mode === 'fit') onChange({ property: 'height', value: 'fit-content' })
    else if (mode === 'fill') onChange({ property: 'height', value: '100%' })
    else onChange({ property: 'height', value: `${isAutoHeight ? 0 : heightNum}px` })
  }, [onChange, isAutoHeight, heightNum])

  // ── Min/max handlers ────────────────────────────────────────────
  const handleMinWidthChange = useCallback(
    (v: number) => onChange({ property: 'min-width', value: `${v}px` }),
    [onChange],
  )
  const handleMaxWidthChange = useCallback(
    (v: number) => onChange({ property: 'max-width', value: `${v}px` }),
    [onChange],
  )
  const handleMinHeightChange = useCallback(
    (v: number) => onChange({ property: 'min-height', value: `${v}px` }),
    [onChange],
  )
  const handleMaxHeightChange = useCallback(
    (v: number) => onChange({ property: 'max-height', value: `${v}px` }),
    [onChange],
  )

  const handleToggleMinWidth = useCallback(() => {
    if (minWidthEnabled) onChange({ property: 'min-width', value: '0px' })
    else onChange({ property: 'min-width', value: '1px' })
  }, [onChange, minWidthEnabled])

  const handleToggleMaxWidth = useCallback(() => {
    if (maxWidthEnabled) onChange({ property: 'max-width', value: 'none' })
    else onChange({ property: 'max-width', value: '9999px' })
  }, [onChange, maxWidthEnabled])

  const handleToggleMinHeight = useCallback(() => {
    if (minHeightEnabled) onChange({ property: 'min-height', value: '0px' })
    else onChange({ property: 'min-height', value: '1px' })
  }, [onChange, minHeightEnabled])

  const handleToggleMaxHeight = useCallback(() => {
    if (maxHeightEnabled) onChange({ property: 'max-height', value: 'none' })
    else onChange({ property: 'max-height', value: '9999px' })
  }, [onChange, maxHeightEnabled])

  // ── Clip content (overflow) ─────────────────────────────────────
  const isClipped = values.overflow === 'hidden'
  const handleClipToggle = useCallback(() => {
    onChange({ property: 'overflow', value: isClipped ? 'visible' : 'hidden' })
  }, [onChange, isClipped])

  // ── Border box ──────────────────────────────────────────────────
  const isBorderBox = values.boxSizing === 'border-box'
  const handleBoxSizingToggle = useCallback(() => {
    onChange({ property: 'box-sizing', value: isBorderBox ? 'content-box' : 'border-box' })
  }, [onChange, isBorderBox])

  return (
    <div class="cortex-sizing-controls" data-testid="sizing-controls">
      <span class="cortex-section-label">Sizing</span>
      <div class="cortex-layout-section__sizing">
        <div class="cortex-layout-section__sizing-field">
          <NumericInput
            value={isAutoWidth ? 0 : widthNum}
            label="W"
            tooltip="Width"
            min={0}
            mixed={mixedProperties?.has('width')}
            onChange={handleWidthChange}
            onScrub={handleWidthScrub}
            onScrubEnd={handleWidthScrubEnd}
          />
          <SizingDropdown
            mode={widthMode}
            minEnabled={minWidthEnabled}
            maxEnabled={maxWidthEnabled}
            onModeChange={handleWidthModeChange}
            onToggleMin={handleToggleMinWidth}
            onToggleMax={handleToggleMaxWidth}
            dimension="Width"
          />
        </div>
        <div class="cortex-layout-section__sizing-field">
          <NumericInput
            value={isAutoHeight ? 0 : heightNum}
            label="H"
            tooltip="Height"
            min={0}
            mixed={mixedProperties?.has('height')}
            onChange={handleHeightChange}
            onScrub={handleHeightScrub}
            onScrubEnd={handleHeightScrubEnd}
          />
          <SizingDropdown
            mode={heightMode}
            minEnabled={minHeightEnabled}
            maxEnabled={maxHeightEnabled}
            onModeChange={handleHeightModeChange}
            onToggleMin={handleToggleMinHeight}
            onToggleMax={handleToggleMaxHeight}
            dimension="Height"
          />
        </div>
        <button
          type="button"
          class={`cortex-lock-btn${aspectLocked ? ' cortex-lock-btn--active' : ''}`}
          aria-pressed={aspectLocked ? 'true' : 'false'}
          aria-label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          data-tooltip={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          onClick={handleToggleLock}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            {aspectLocked ? (
              <>
                <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
                <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0 V6.5" />
              </>
            ) : (
              <>
                <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
                <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0" />
              </>
            )}
          </svg>
        </button>
      </div>
      {(minWidthEnabled || maxWidthEnabled || minHeightEnabled || maxHeightEnabled) && (
        <div class="cortex-layout-section__minmax">
          {minWidthEnabled && (
            <div class="cortex-layout-section__minmax-field">
              <NumericInput
                value={parseFloat(values.minWidth) || 0}
                unit="px"
                label="Min"
                tooltip="Min Width"
                min={0}
                mixed={mixedProperties?.has('min-width')}
                onChange={handleMinWidthChange}
              />
              <button
                class="cortex-layout-section__minmax-dismiss"
                type="button"
                data-tooltip="Remove Min Width"
                aria-label="Remove Min Width"
                onClick={handleToggleMinWidth}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
              </button>
            </div>
          )}
          {maxWidthEnabled && (
            <div class="cortex-layout-section__minmax-field">
              <NumericInput
                value={values.maxWidth === 'none' ? 0 : parseFloat(values.maxWidth) || 0}
                unit="px"
                label="Max"
                tooltip="Max Width"
                min={0}
                mixed={mixedProperties?.has('max-width')}
                onChange={handleMaxWidthChange}
              />
              <button
                class="cortex-layout-section__minmax-dismiss"
                type="button"
                data-tooltip="Remove Max Width"
                aria-label="Remove Max Width"
                onClick={handleToggleMaxWidth}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
              </button>
            </div>
          )}
          {minHeightEnabled && (
            <div class="cortex-layout-section__minmax-field">
              <NumericInput
                value={parseFloat(values.minHeight) || 0}
                unit="px"
                label="Min"
                tooltip="Min Height"
                min={0}
                mixed={mixedProperties?.has('min-height')}
                onChange={handleMinHeightChange}
              />
              <button
                class="cortex-layout-section__minmax-dismiss"
                type="button"
                data-tooltip="Remove Min Height"
                aria-label="Remove Min Height"
                onClick={handleToggleMinHeight}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
              </button>
            </div>
          )}
          {maxHeightEnabled && (
            <div class="cortex-layout-section__minmax-field">
              <NumericInput
                value={values.maxHeight === 'none' ? 0 : parseFloat(values.maxHeight) || 0}
                unit="px"
                label="Max"
                tooltip="Max Height"
                min={0}
                mixed={mixedProperties?.has('max-height')}
                onChange={handleMaxHeightChange}
              />
              <button
                class="cortex-layout-section__minmax-dismiss"
                type="button"
                data-tooltip="Remove Max Height"
                aria-label="Remove Max Height"
                onClick={handleToggleMaxHeight}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
              </button>
            </div>
          )}
        </div>
      )}
      <div class="cortex-sizing-controls__toggles">
        <button
          class={`cortex-toggle-btn${isClipped ? ' cortex-toggle-btn--active' : ''}`}
          type="button"
          aria-pressed={isClipped ? 'true' : 'false'}
          data-tooltip="Clip content (overflow: hidden)"
          onClick={handleClipToggle}
        >
          Clip content
        </button>
        <button
          class={`cortex-toggle-btn${isBorderBox ? ' cortex-toggle-btn--active' : ''}`}
          type="button"
          aria-pressed={isBorderBox ? 'true' : 'false'}
          data-tooltip="Border box sizing"
          onClick={handleBoxSizingToggle}
        >
          Border box
        </button>
      </div>
    </div>
  )
}
