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
