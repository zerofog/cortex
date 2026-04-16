import type { JSX } from 'preact'
import { LayerTree } from '../LayerTree.js'

export interface ElementTreeProps {
  element: HTMLElement | null
  onSelectElement: (el: HTMLElement) => void
  height: number
}

export function ElementTree({ element, onSelectElement, height }: ElementTreeProps): JSX.Element {
  return (
    <div class="cortex-element-tree">
      <LayerTree element={element} onSelectElement={onSelectElement} height={height} />
    </div>
  )
}
