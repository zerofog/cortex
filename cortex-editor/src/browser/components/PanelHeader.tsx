import type { JSX } from 'preact'
import { encodeFilePath } from '../label.js'

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
}: PanelHeaderProps): JSX.Element {
  const sourceText = sourceFile
    ? sourceLine ? `${sourceFile}:${sourceLine}` : sourceFile
    : null

  const sourceHref = filePath
    ? `vscode://file/${encodeFilePath(filePath)}${sourceLine ? `:${sourceLine}` : ''}`
    : null

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
          {componentName ?? `<${tagName}>`}
        </span>
        {sourceText && sourceHref && (
          <a
            class="cortex-panel-header__source"
            href={sourceHref}
            title={`Open in editor: ${sourceText}`}
          >
            {sourceText}
          </a>
        )}
      </div>
      <div class="cortex-panel-header__actions">
        <button
          class="cortex-panel-header__btn"
          data-action="parent"
          disabled={!hasParent}
          title="Select parent element"
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
          title="Select child element"
          onClick={onSelectChild}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3.5,5.5 7,9 10.5,5.5" />
          </svg>
        </button>
        <button
          class="cortex-panel-header__btn cortex-panel-header__btn--close"
          data-action="close"
          title="Close panel"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
            <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
