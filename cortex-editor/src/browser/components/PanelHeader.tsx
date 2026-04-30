import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { SegmentedControl } from './controls/SegmentedControl.js'
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme.js'
import { encodeFilePath } from '../label.js'

const THEME_OPTIONS = [
  {
    value: 'light',
    title: 'Light theme',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="6" r="2.5" />
        <path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.7.7M8.8 8.8l.7.7M9.5 2.5l-.7.7M3.2 8.8l-.7.7" />
      </svg>
    ),
  },
  {
    value: 'dark',
    title: 'Dark theme',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 7.5A4.5 4.5 0 014.5 2c0-.3 0-.6.1-.9A5 5 0 006 11a5 5 0 004.9-4.4c-.3.1-.6.1-.9-.1z" />
      </svg>
    ),
  },
  {
    value: 'system',
    title: 'Match system theme',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1.5" y="2.5" width="9" height="6" rx="1" />
        <line x1="4" y1="10" x2="8" y2="10" />
      </svg>
    ),
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
   *  after the server applies the edits (T4 wiring). */
  onApply: () => Promise<void>
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
}: PanelHeaderProps): JSX.Element {
  const [delivering, setDelivering] = useState(false)

  const handleApply = (): void => {
    if (delivering) return
    setDelivering(true)
    onApply().then(
      () => { setDelivering(false) },
      () => { setDelivering(false) },
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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3.5,8.5 7,5 10.5,8.5" />
          </svg>
        </button>
        <button
          class="cortex-panel-header__btn"
          data-action="child"
          disabled={!hasChildren}
          data-tooltip="Select child element"
          aria-label="Select child element"
          onClick={onSelectChild}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3.5,5.5 7,9 10.5,5.5" />
          </svg>
        </button>
        <button
          class={`cortex-panel-header__btn${hoverEnabled ? '' : ' cortex-panel-header__btn--toggled-off'}`}
          data-action="toggle-hover"
          data-tooltip={hoverEnabled ? 'Hide hover overlay' : 'Show hover overlay'}
          aria-label={hoverEnabled ? 'Hide hover overlay' : 'Show hover overlay'}
          onClick={onToggleHover}
        >
          {hoverEnabled ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
              <circle cx="7" cy="7" r="1.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
              <line x1="2" y1="2" x2="12" y2="12" />
            </svg>
          )}
        </button>
        {bufferSize > 0 && (
          <button
            class="cortex-panel-header__btn cortex-panel-header__btn--apply"
            data-action="apply"
            data-tooltip={delivering ? 'Sending staged edits to Claude…' : `Apply ${bufferSize} staged edit${bufferSize === 1 ? '' : 's'}`}
            aria-label={delivering ? 'Delivering staged edits' : `Apply ${bufferSize} staged edit${bufferSize === 1 ? '' : 's'}`}
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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
            <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
          </svg>
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
