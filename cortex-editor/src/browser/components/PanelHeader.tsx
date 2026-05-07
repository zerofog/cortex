import type { JSX } from 'preact'
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'preact/hooks'
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme.js'
import { encodeFilePath } from '../label.js'
import { registerPopoverDismiss } from '../popover-stack.js'
import { Check, ChevronDown, Monitor, Moon, Sun, X } from './icons.js'

const THEME_OPTIONS = [
  {
    value: 'light',
    label: 'Light',
    title: 'Light theme',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    title: 'Dark theme',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    title: 'Match system theme',
    icon: Monitor,
  },
] satisfies Array<{
  value: ThemePreference
  label: string
  title: string
  icon: (props: { size?: number }) => JSX.Element
}>

/**
 * Compact theme selector for the panel chrome.
 *
 * Business logic: updates the persisted Cortex theme preference through the
 * same theme API as the old segmented control; only the presentation changes
 * from three always-visible choices to a compact menu.
 */
function ThemeDropdown({
  value,
  onChange,
}: {
  value: ThemePreference
  onChange: (value: ThemePreference) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef(new Map<ThemePreference, HTMLButtonElement>())
  const selected = THEME_OPTIONS.find((option) => option.value === value) ?? THEME_OPTIONS[2]!
  const SelectedIcon = selected.icon

  const close = useCallback(() => setOpen(false), [])
  const focusSelectedOption = useCallback(() => {
    const fallback = THEME_OPTIONS[0] ? optionRefs.current.get(THEME_OPTIONS[0].value) : null
    const selectedOption = optionRefs.current.get(selected.value) ?? fallback
    selectedOption?.focus()
  }, [selected.value])

  const handleSelect = useCallback(
    (next: ThemePreference) => {
      onChange(next)
      close()
      triggerRef.current?.focus()
    },
    [onChange, close],
  )

  useEffect(() => {
    if (!open) return undefined
    return registerPopoverDismiss(close)
  }, [open, close])

  useLayoutEffect(() => {
    if (!open) return
    focusSelectedOption()
  }, [open, focusSelectedOption])

  useEffect(() => {
    if (!open) return undefined
    const root = rootRef.current
    if (!root) return undefined

    const handleFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget
      if (next instanceof Node && root.contains(next)) return
      close()
    }

    root.addEventListener('focusout', handleFocusOut)
    return () => root.removeEventListener('focusout', handleFocusOut)
  }, [open, close])

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        if (open) {
          focusSelectedOption()
        } else {
          setOpen(true)
        }
      } else if (event.key === 'Escape' && open) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    },
    [open, close, focusSelectedOption],
  )

  const handleMenuKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        triggerRef.current?.focus()
        return
      }

      const currentIndex = THEME_OPTIONS.findIndex((option) => optionRefs.current.get(option.value) === document.activeElement)
      if (currentIndex < 0) return

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        event.stopPropagation()
        let nextIndex = currentIndex
        if (event.key === 'ArrowDown') nextIndex = Math.min(currentIndex + 1, THEME_OPTIONS.length - 1)
        if (event.key === 'ArrowUp') nextIndex = Math.max(currentIndex - 1, 0)
        if (event.key === 'Home') nextIndex = 0
        if (event.key === 'End') nextIndex = THEME_OPTIONS.length - 1
        optionRefs.current.get(THEME_OPTIONS[nextIndex]!.value)?.focus()
      }
    },
    [close],
  )

  return (
    <div ref={rootRef} class="cortex-theme-dropdown">
      <button
        ref={triggerRef}
        type="button"
        class="cortex-theme-dropdown__trigger"
        data-action="theme"
        data-tooltip={selected.title}
        aria-label={`Theme: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <SelectedIcon size={12} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div
            class="cortex-theme-dropdown__backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            class="cortex-theme-dropdown__menu"
            role="menu"
            aria-label="Theme"
            onKeyDown={handleMenuKeyDown}
          >
            {THEME_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  class={`cortex-theme-dropdown__option${option.value === value ? ' cortex-theme-dropdown__option--selected' : ''}`}
                  data-theme-option={option.value}
                  role="menuitemradio"
                  aria-checked={option.value === value ? 'true' : 'false'}
                  ref={(node) => {
                    if (node) {
                      optionRefs.current.set(option.value, node)
                    } else {
                      optionRefs.current.delete(option.value)
                    }
                  }}
                  onClick={() => handleSelect(option.value)}
                >
                  <span class="cortex-theme-dropdown__option-icon"><OptionIcon size={12} /></span>
                  <span class="cortex-theme-dropdown__option-label">{option.label}</span>
                  {option.value === value && <Check size={12} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export interface PanelHeaderProps {
  tagName: string
  componentName: string | null
  sourceFile: string | null
  sourceLine: string | null
  filePath: string | null
  onClose: () => void
  onPointerDown?: (e: PointerEvent) => void
  onPointerMove?: (e: PointerEvent) => void
  onPointerUp?: (e: PointerEvent) => void
  onPointerCancel?: (e: PointerEvent) => void
  hasBefore?: boolean
  hasAfter?: boolean
  activePseudo?: 'element' | '::before' | '::after'
  onPseudoChange?: (pseudo: 'element' | '::before' | '::after') => void
  isLibrary?: boolean
  ancestorSource?: string | null
  ancestorLine?: string | null
  /** Number of edits in the staging buffer. Apply button is hidden when 0. */
  bufferSize: number
  /** Called when the designer clicks Apply. Returns a Promise that resolves on
   *  successful delivery to the server, rejects on timeout or disconnect.
   *  PanelHeader manages its own "Delivering..." disabled state during the
   *  in-flight period; the parent is responsible for clearing bufferSize to 0
   *  after the server applies the edits (T4 wiring).
   *
   *  The ID for each request is generated via uuid.generateId() (preserves
   *  the polyfill for HTTP LAN dev, file://, and sandboxed iframes where
   *  crypto.randomUUID may be unavailable). */
  onApply: () => Promise<void>
  /** Optional error callback. Called with the rejection reason when sendAndAck
   *  rejects (timeout or disconnect). T4 wires this to ErrorToast for UI
   *  feedback. When omitted, the error is silently swallowed after setting the
   *  button back to idle — acceptable for T3 where ErrorToast wiring is
   *  out-of-scope. */
  onApplyError?: (err: unknown) => void
}

export function PanelHeader({
  tagName,
  componentName,
  sourceFile,
  sourceLine,
  filePath,
  onClose,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  hasBefore,
  hasAfter,
  activePseudo = 'element',
  onPseudoChange,
  isLibrary,
  ancestorSource,
  ancestorLine,
  bufferSize,
  onApply,
  onApplyError,
}: PanelHeaderProps): JSX.Element {
  const [delivering, setDelivering] = useState(false)
  // ZF0-1453 (post-Step-9.5): "Hidden after success" state per parent ticket.
  // After sendAndAck resolves, the button must stay HIDDEN until Claude drains
  // the buffer (bufferSize → 0). Otherwise the button reappears as Apply (N)
  // because bufferSize > 0, inviting double-clicks that re-send the same intents.
  // Reject path leaves pendingClaude false so the button reappears for retry.
  const [pendingClaude, setPendingClaude] = useState(false)

  // Mounted flag guards setDelivering(false) against unmount-during-onApply race.
  // useLayoutEffect cleanup runs synchronously on unmount, before any async
  // continuations that may still hold a reference to setDelivering.
  const mountedRef = useRef(true)
  useLayoutEffect(() => () => { mountedRef.current = false }, [])

  // Clear pendingClaude when the buffer drains. Claude's cortex_discard_edits
  // ultimately fires staged-edits-discard which Panel.tsx forwards to
  // buffer.remove(); when the last intent goes, bufferSize → 0 and the next
  // user-staged edit will correctly resurface the Apply button.
  useEffect(() => {
    if (bufferSize === 0 && pendingClaude) setPendingClaude(false)
  }, [bufferSize, pendingClaude])

  const handleApply = (): void => {
    if (delivering) return
    setDelivering(true)
    // Catch synchronous throws from onApply (rare but possible — e.g., an
    // unexpected runtime error before the async body returns a Promise) so
    // delivering state still clears and onApplyError still fires. Without
    // this guard, a sync throw would propagate up and leave delivering=true
    // stuck. Copilot caught this on PR #91 review. We use try/catch (not
    // Promise.resolve().then(onApply)) so the synchronous spy-call assertion
    // pattern continues to work — the microtask deferral broke 3 tests.
    let promise: Promise<void>
    try {
      promise = onApply()
    } catch (err: unknown) {
      if (mountedRef.current) setDelivering(false)
      onApplyError?.(err)
      return
    }
    promise.then(
      () => {
        if (mountedRef.current) {
          setDelivering(false)
          setPendingClaude(true)
        }
      },
      (err: unknown) => {
        if (mountedRef.current) setDelivering(false)
        // pendingClaude stays false — button reappears as Apply (N) for retry.
        onApplyError?.(err)
      },
    )
  }
  // When library with ancestor source, show ancestor source instead of element source
  const displaySource = isLibrary && ancestorSource ? ancestorSource : sourceFile
  const displayLine = isLibrary && ancestorSource ? (ancestorLine ?? null) : sourceLine

  const sourceText = displaySource
    ? displayLine ? `${displaySource}:${displayLine}` : displaySource
    : null

  const sourceHref = filePath
    ? `vscode://file/${encodeFilePath(filePath)}${sourceLine ? `:${sourceLine}` : ''}`
    : null

  // For library elements with ancestor source, show "<tagName>" instead of componentName
  const displayTag = isLibrary && ancestorSource ? `<${tagName}>` : (componentName ?? `<${tagName}>`)

  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference())
  const handleThemeChange = (pref: ThemePreference) => {
    setThemePref(pref)
    setThemePreference(pref)
  }

  const showPseudoTabs = hasBefore || hasAfter

  return (
    <div
      class="cortex-panel-header"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div class="cortex-panel-header__info">
        <span class="cortex-panel-header__tag">
          {displayTag}
        </span>
        {sourceText && sourceHref && (
          <a
            class="cortex-panel-header__source"
            href={sourceHref}
            data-tooltip={`Open in editor: ${sourceText}`}
          >
            {sourceText}
          </a>
        )}
        {isLibrary && (
          <span class="cortex-panel-header__library">(library)</span>
        )}
      </div>
      <div class="cortex-panel-header__actions">
        <ThemeDropdown value={themePref} onChange={handleThemeChange} />
        {bufferSize > 0 && !pendingClaude && (
          <button
            class="cortex-panel-header__btn cortex-panel-header__btn--apply"
            data-action="apply"
            data-tooltip={delivering ? 'Sending staged edits to Claude…' : `Apply ${bufferSize} staged edit${bufferSize === 1 ? '' : 's'}`}
            aria-label={delivering ? 'Delivering staged edits' : `Apply ${bufferSize} staged edit${bufferSize === 1 ? '' : 's'}`}
            aria-busy={delivering ? 'true' : undefined}
            disabled={delivering}
            onClick={handleApply}
          >
            {delivering ? 'Delivering…' : `Apply (${bufferSize})`}
          </button>
        )}
        <button
          class="cortex-panel-header__btn cortex-panel-header__btn--close"
          data-action="close"
          data-tooltip="Close panel"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {showPseudoTabs && (
        <div
          class="cortex-pseudo-tabs"
          role="tablist"
          aria-label="Element pseudo-elements"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const tabs: Array<'element' | '::before' | '::after'> = ['element']
            if (hasBefore) tabs.push('::before')
            if (hasAfter) tabs.push('::after')
            const idx = tabs.indexOf(activePseudo)
            const nextIdx = e.key === 'ArrowRight'
              ? (idx + 1) % tabs.length
              : (idx - 1 + tabs.length) % tabs.length
            const next = tabs[nextIdx]
            if (next) onPseudoChange?.(next)
            // Move focus to the newly active tab
            const container = e.currentTarget as HTMLElement
            const nextBtn = container.querySelector(`[data-pseudo="${next}"]`) as HTMLElement | null
            nextBtn?.focus()
          }}
        >
          <button
            class={`cortex-pseudo-tab${activePseudo === 'element' ? ' cortex-pseudo-tab--active' : ''}`}
            role="tab"
            aria-selected={activePseudo === 'element'}
            tabIndex={activePseudo === 'element' ? 0 : -1}
            data-action="pseudo-element"
            data-pseudo="element"
            onClick={() => onPseudoChange?.('element')}
          >
            element
          </button>
          {hasBefore && (
            <button
              class={`cortex-pseudo-tab${activePseudo === '::before' ? ' cortex-pseudo-tab--active' : ''}`}
              role="tab"
              aria-selected={activePseudo === '::before'}
              tabIndex={activePseudo === '::before' ? 0 : -1}
              data-action="pseudo-before"
              data-pseudo="::before"
              onClick={() => onPseudoChange?.('::before')}
            >
              ::before
            </button>
          )}
          {hasAfter && (
            <button
              class={`cortex-pseudo-tab${activePseudo === '::after' ? ' cortex-pseudo-tab--active' : ''}`}
              role="tab"
              aria-selected={activePseudo === '::after'}
              tabIndex={activePseudo === '::after' ? 0 : -1}
              data-action="pseudo-after"
              data-pseudo="::after"
              onClick={() => onPseudoChange?.('::after')}
            >
              ::after
            </button>
          )}
        </div>
      )}
    </div>
  )
}
