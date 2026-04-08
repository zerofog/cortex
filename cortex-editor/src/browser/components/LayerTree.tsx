import type { JSX } from 'preact'
import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { getLabel } from '../label.js'

export interface TreeNode {
  element: HTMLElement
  label: string
  depth: number
  selected: boolean
  expanded: boolean
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

  function buildNode(el: HTMLElement, depth: number, isOnPath: boolean): TreeNode {
    const isSelected = el === element
    // The ancestor at this depth in the chain (depth 0 = direct child of body)
    const pathChild: HTMLElement | undefined = ancestors[depth]

    let children: TreeNode[] = []
    if (isSelected) {
      // Selected element: show direct children as leaf nodes
      children = Array.from(el.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .map(c => ({
          element: c,
          label: getLabel(c),
          depth: depth + 1,
          selected: false,
          expanded: false,
          children: [],
        }))
    } else if (isOnPath && pathChild) {
      // Ancestor on the path: show all element children at this level,
      // recurse into the one that's on the ancestor path
      children = Array.from(el.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .map(c => {
          if (c === pathChild) {
            return buildNode(c, depth + 1, true)
          }
          return {
            element: c,
            label: getLabel(c),
            depth: depth + 1,
            selected: false,
            expanded: false,
            children: [],
          }
        })
    }

    return {
      element: el,
      label: getLabel(el),
      depth,
      selected: isSelected,
      expanded: isSelected || isOnPath,
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
  const hasChildren = node.children.length > 0
  const showChildren = hasChildren && node.expanded && !collapsed

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
              setCollapsed(c => !c)
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
      {showChildren && node.children.map(child => (
        <TreeNodeRow key={child.label + child.depth} node={child} onSelectElement={onSelectElement} />
      ))}
    </>
  )
}

const DEFAULT_HEIGHT = 160
const MIN_HEIGHT = 60

export function LayerTree({ element, onSelectElement }: LayerTreeProps): JSX.Element | null {
  const tree = useMemo(() => buildScopedTree(element), [element])
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const handleResizeDown = useCallback((e: PointerEvent) => {
    draggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = height
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [height])

  const handleResizeMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    const delta = e.clientY - startYRef.current
    const maxHeight = Math.floor(window.innerHeight * 0.5)
    const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeightRef.current + delta))
    setHeight(newHeight)
  }, [])

  const handleResizeUp = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }, [])

  if (!tree) return null

  return (
    <>
      <div class="cortex-layer-tree" style={{ height: `${height}px` }}>
        <div class="cortex-layer-tree__header">Layers</div>
        <div class="cortex-layer-tree__scroll">
          <TreeNodeRow node={tree} onSelectElement={onSelectElement} />
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
