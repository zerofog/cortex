import { deepQuerySelectorAll } from './selection-metadata.js'

export interface SharedSourceInfo {
  /** The data-cortex-source value that is shared (e.g., 'src/Card.tsx:42') */
  source: string
  /** All elements in the DOM that share this source value */
  elements: HTMLElement[]
  /** Count of elements sharing this source value */
  count: number
}

/**
 * Detect if a selected element's source location is shared by multiple DOM elements.
 *
 * Business logic: When a user selects an element in the visual editor, this
 * function determines whether editing it would affect other elements rendered
 * from the same source location (e.g., list items from the same .map() call).
 * If so, the Panel can display a "Shared by N elements" warning, letting the
 * designer make an informed decision before applying changes.
 *
 * This parallels detectSharedClasses (for CSS-Module elements) but operates
 * on `data-cortex-source` instead — covering non-CSS-Module elements such as
 * Mantine (~80%) and Tailwind (~17%) stacks.
 *
 * Returns SharedSourceInfo when 2+ elements share the source value, or null
 * if no sharing is detected (element has no attribute, or count <= 1).
 */
export function detectSharedSource(el: HTMLElement): SharedSourceInfo | null {
  const source = el.getAttribute('data-cortex-source')
  if (!source) return null

  // Build the attribute selector, applying defensive CSS.escape for malformed
  // source strings. Pattern reused verbatim from selection-source-expand.ts:44-49.
  let escaped: string
  try {
    escaped = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(source) : source.replace(/(["\\])/g, '\\$1')
  } catch {
    escaped = source.replace(/(["\\])/g, '\\$1')
  }

  const selector = `[data-cortex-source="${escaped}"]`

  let flat: HTMLElement[]
  try {
    flat = Array.from(document.querySelectorAll<HTMLElement>(selector))
  } catch {
    // Malformed selector despite escape — treat as no matches.
    return null
  }

  // Shadow-DOM fallback: when the selected element lives in a shadow tree and
  // the flat document query returned nothing, walk all open shadow roots.
  if (el.getRootNode() instanceof ShadowRoot && flat.length === 0) {
    flat = deepQuerySelectorAll(selector)
  }

  if (flat.length <= 1) return null

  return {
    source,
    elements: flat,
    count: flat.length,
  }
}
