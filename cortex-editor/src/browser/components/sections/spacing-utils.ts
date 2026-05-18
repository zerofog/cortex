/**
 * Spacing utilities shared between Panel.tsx and panel-style-snapshot.ts.
 *
 * Extracted in ZF0-1360 (quality review) to break the circular import that
 * existed when panel-style-snapshot.ts imported from Panel.tsx while Panel.tsx
 * imported from panel-style-snapshot.ts. Mirrors the fill-utils.ts pattern.
 */

/**
 * All CSS properties checked for dimming (default vs forced-state comparison).
 * Covers every section's managed properties.
 *
 * Panel v2 additions (ZF0-1180): self-alignment, flex-wrap, grid template +
 * auto-flow, per-side border widths, and per-corner border radii. `row-gap`,
 * `column-gap`, `visibility`, and `box-shadow` were already in the list and
 * are deliberately not duplicated.
 */
export const ALL_DIMMING_PROPERTIES = [
  'display', 'visibility', 'flex-direction', 'flex-wrap',
  'justify-content', 'align-items', 'align-content', 'justify-items',
  'justify-self', 'align-self',
  'width', 'height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align',
  'background-color', 'background-image',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow',
  'opacity', 'overflow', 'box-sizing', 'cursor', 'filter', 'backdrop-filter',
  'position', 'left', 'top', 'right', 'bottom', 'z-index', 'rotate', 'scale',
  'min-width', 'max-width', 'min-height', 'max-height',
] as const

/** Extract spacing-related values from a CSSStyleDeclaration. */
export function parseSpacingValues(cs: CSSStyleDeclaration) {
  return {
    padding: {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    },
    margin: {
      top: parseFloat(cs.marginTop) || 0,
      right: parseFloat(cs.marginRight) || 0,
      bottom: parseFloat(cs.marginBottom) || 0,
      left: parseFloat(cs.marginLeft) || 0,
    },
    gap: {
      row: parseFloat(cs.rowGap) || 0,
      column: parseFloat(cs.columnGap) || 0,
    },
    boxSizing: cs.boxSizing || 'content-box',
  }
}
