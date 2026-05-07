import type { JSX } from 'preact'
import { useState, useRef, useLayoutEffect, useEffect } from 'preact/hooks'
import { SegmentedControl } from './controls/SegmentedControl.js'
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme.js'
import { encodeFilePath } from '../label.js'
import { ChevronDown, ChevronUp, Eye, EyeOff, Monitor, Moon, Sun, X } from './icons.js'

const THEME_OPTIONS = [
  {
    value: 'light',
    title: 'Light theme',
    icon: <Sun size={12} />,
  },
  {
    value: 'dark',
    title: 'Dark theme',
    icon: <Moon size={12} />,
  },
  {
    value: 'system',
    title: 'Match system theme',
    icon: <Monitor size={12} />,
  },
]

export interface PanelHeaderProps {
  tagName: string
  componentName: string | null
  sourceFile: string | null
  sourceLine: string | null
  filePath: string | null
  hasParent: boolean
  hasChildren: boolean
  onClose: () => void
  onSelectParent: () => void
  onSelectChild: () => void
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
  hoverEnabled?: boolean
  onToggleHover?: () => void
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
  hasParent,
  hasChildren,
  onClose,
  onSelectParent,
  onSelectChild,
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
  hoverEnabled = true,
  onToggleHover,
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
        <SegmentedControl
          options={THEME_OPTIONS}
          value={themePref}
          onChange={(v) => handleThemeChange(v as ThemePreference)}
          size="sm"
        />
        <button
          class="cortex-panel-header__btn"
          data-action="parent"
          disabled={!hasParent}
          data-tooltip="Select parent element"
          aria-label="Select parent element"
          onClick={onSelectParent}
        >
          <ChevronUp size={14} />
        </button>
        <button
          class="cortex-panel-header__btn"
          data-action="child"
          disabled={!hasChildren}
          data-tooltip="Select child element"
          aria-label="Select child element"
          onClick={onSelectChild}
        >
          <ChevronDown size={14} />
        </button>
        <button
          class={`cortex-panel-header__btn${hoverEnabled ? '' : ' cortex-panel-header__btn--toggled-off'}`}
          data-action="toggle-hover"
          data-tooltip={hoverEnabled ? 'Hide hover overlay' : 'Show hover overlay'}
          aria-label={hoverEnabled ? 'Hide hover overlay' : 'Show hover overlay'}
          onClick={onToggleHover}
        >
          {hoverEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
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
