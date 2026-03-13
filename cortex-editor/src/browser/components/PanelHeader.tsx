import type { JSX } from 'preact'

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
    ? `vscode://file/${filePath}${sourceLine ? `:${sourceLine}` : ''}`
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
        {sourceText && (
          <a
            class="cortex-panel-header__source"
            href={sourceHref!}
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
          &#8963;
        </button>
        <button
          class="cortex-panel-header__btn"
          data-action="child"
          disabled={!hasChildren}
          title="Select child element"
          onClick={onSelectChild}
        >
          &#8964;
        </button>
        <button
          class="cortex-panel-header__btn cortex-panel-header__btn--close"
          data-action="close"
          title="Close panel"
          onClick={onClose}
        >
          &#10005;
        </button>
      </div>
    </div>
  )
}
