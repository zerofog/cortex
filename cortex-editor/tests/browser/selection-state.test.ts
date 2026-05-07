/**
 * Unit tests for `applySelectionUpdate` — the pure selection-update helper
 * that drives CortexApp.tsx's `setSelection` setter (ZF0-1195).
 *
 * Selection state lives in the component (`useState`) — not the reducer.
 * The helper is exported from cortex-app-reducer.ts for module conventions
 * (named exports, framework-agnostic), but the tests here exercise it
 * directly rather than through `cortexAppReducer` (no shadow copies).
 */

import { describe, it, expect } from 'vitest'
import { applySelectionUpdate } from '../../src/browser/cortex-app-reducer.js'

describe('applySelectionUpdate (ZF0-1195)', () => {
  it('replace returns the input elements array', () => {
    const el1 = document.createElement('div')
    expect(applySelectionUpdate([], [el1], 'replace')).toEqual([el1])
  })

  it('add appends new elements (deduped by reference)', () => {
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const s1 = applySelectionUpdate([], [el1], 'replace')
    const s2 = applySelectionUpdate(s1, [el2], 'add')
    expect(s2).toEqual([el1, el2])
    const s3 = applySelectionUpdate(s2, [el1], 'add')
    expect(s3).toEqual([el1, el2])
  })

  it('add returns identity-stable state when all elements already present (no-op)', () => {
    const el1 = document.createElement('div')
    const s1 = applySelectionUpdate([], [el1], 'replace')
    const s2 = applySelectionUpdate(s1, [el1], 'add')
    expect(s2).toBe(s1) // reference equality
  })

  it('replace returns identity-stable state when elements match prev (M2 fix)', () => {
    // Falsifiability fix from quality review M2: replace should be identity-stable
    // when the new array contains the same elements (in the same order) as prev.
    // This gives Preact a no-rerender opportunity for replace-with-same-selection
    // events (e.g. clicking the already-selected element with no modifier).
    const el1 = document.createElement('div')
    const s1 = applySelectionUpdate([], [el1], 'replace')
    const s2 = applySelectionUpdate(s1, [el1], 'replace')
    expect(s2).toBe(s1)
  })

  it('toggle removes if present, appends if absent', () => {
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const s1 = applySelectionUpdate([], [el1, el2], 'replace')
    const s2 = applySelectionUpdate(s1, [el1], 'toggle')
    expect(s2).toEqual([el2])
    const s3 = applySelectionUpdate(s2, [el1], 'toggle')
    expect(s3).toEqual([el2, el1])
  })
})
