import type { JSX } from 'preact'
import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { getTreeLabel } from '../label.js'

export interface TreeNode {
  element: HTMLElement
  label: string
  depth: number
  selected: boolean
  expanded: boolean
  hasChildren: boolean
  children: TreeNode[]
}

/** Build a scoped tree: ancestor chain from <body> to selected, siblings at each level,
 *  and direct children of selected. Returns null if element is null or detached.
 *
 *  Complexity: O(depth * max_siblings) — only visits nodes on the ancestor path
 *  and their siblings, never the full DOM tree. */
export function buildScopedTree(element: HTMLElement | null): TreeNode | null {
  if (!element) return null
  if (!element.isConnected || !document.body.contains(element)) return null

  // Walk from element up to body, collecting the ancestor chain (excluding body).
  // ancestors[0] is a direct child of body, ancestors[last] is the selected element.
  const ancestors: HTMLElement[] = []
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    ancestors.unshift(current)
    current = current.parentElement
  }

  function leafNode(c: HTMLElement, depth: number): TreeNode {
    const childCount = Array.from(c.children).filter(ch => ch instanceof HTMLElement).length
    return { element: c, label: getTreeLabel(c), depth, selected: false, expanded: false, hasChildren: childCount > 0, children: [] }
  }

  function buildNode(el: HTMLElement, depth: number, isOnPath: boolean): TreeNode {
    const isSelected = el === element
    // The ancestor at this depth in the chain (depth 0 = direct child of body)
    const pathChild: HTMLElement | undefined = ancestors[depth]

    let children: TreeNode[] = []
    if (isSelected) {
      // Selected element: show direct children as leaf nodes
      children = Array.from(el.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .map(c => leafNode(c, depth + 1))
    } else if (isOnPath && pathChild) {
      // Ancestor on the path: show all element children at this level,
      // recurse into the one that's on the ancestor path
      children = Array.from(el.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .map(c => c === pathChild ? buildNode(c, depth + 1, true) : leafNode(c, depth + 1))
    }

    const childCount = Array.from(el.children).filter(c => c instanceof HTMLElement).length
    return {
      element: el,
      label: getTreeLabel(el),
      depth,
      selected: isSelected,
      expanded: isSelected || isOnPath,
      hasChildren: childCount > 0,
      children,
    }
  }

  return buildNode(document.body, 0, true)
}

interface LayerTreeProps {
  element: HTMLElement | null
  onSelectElement: (el: HTMLElement) => void
}

function TreeNodeRow({ node, onSelectElement }: { node: TreeNode; onSelectElement: (el: HTMLElement) => void }): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.hasChildren
  const showChildren = node.children.length > 0 && node.expanded && !collapsed

  return (
    <>
      <div
        class={`cortex-layer-node${node.selected ? ' cortex-layer-node--selected' : ''}`}
        style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectElement(node.element)
        }}
      >
        {hasChildren ? (
          <span
            class={`cortex-layer-chevron${showChildren ? ' cortex-layer-chevron--expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              // Expanded nodes (on ancestor path): toggle collapse/expand
              // Non-expanded leaf nodes: navigate to element (rebuilds tree with its children)
              if (node.expanded) setCollapsed(c => !c)
              else onSelectElement(node.element)
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <path d="M2 1l4 3-4 3z" />
            </svg>
          </span>
        ) : (
          <span class="cortex-layer-chevron-spacer" />
        )}
        <span class="cortex-layer-label">{node.label}</span>
      </div>
      {showChildren && node.children.map((child, i) => (
        <TreeNodeRow key={`${child.depth}-${i}`} node={child} onSelectElement={onSelectElement} />
      ))}
    </>
  )
}

const DEFAULT_HEIGHT = 160
const MIN_HEIGHT = 60

// Module-scoped so height survives component remounts (Panel cross-fade, element change)
let persistedHeight = DEFAULT_HEIGHT

export function LayerTree({ element, onSelectElement }: LayerTreeProps): JSX.Element | null {
  const tree = useMemo(() => buildScopedTree(element), [element])
  const [height, setHeight] = useState(persistedHeight)
  const heightRef = useRef(height)
  heightRef.current = height
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const handleResizeDown = useCallback((e: PointerEvent) => {
    draggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = heightRef.current
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handleResizeMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    const delta = e.clientY - startYRef.current
    const maxHeight = Math.floor(window.innerHeight * 0.5)
    const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeightRef.current + delta))
    persistedHeight = newHeight
    setHeight(newHeight)
  }, [])

  const handleResizeUp = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Pointer capture already released (browser auto-releases on cancel/up race)
    }
  }, [])

  if (!tree) return null

  return (
    <>
      <div class="cortex-layer-tree" style={{ height: `${height}px` }}>
        <div class="cortex-layer-tree__header">Layers</div>
        <div class="cortex-layer-tree__scroll">
          <TreeNodeRow key={element} node={tree} onSelectElement={onSelectElement} />
        </div>
      </div>
      <div
        class="cortex-layer-resize"
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
      />
    </>
  )
}
