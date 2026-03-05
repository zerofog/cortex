import { describe, it, expect } from 'vitest';
import {
  panelReducer,
  initialPanelState,
  ELEMENT_TYPE_CATEGORIES,
  PER_SIDE_MAP,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  resolveTokenToCssValue,
  getOriginForProperty,
} from '../../src/client/panel-state.js';
import type { StyleOrigin } from '../../src/client/panel-state.js';
import { makeSelection, makeTokenMaps, stateWithTokenMaps } from './helpers.js';

// ── Constants ────────────────────────────────────────────────────

describe('Constants', () => {
  it('ELEMENT_TYPE_CATEGORIES covers all known element types', () => {
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('container');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('text');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('interactive');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('icon');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('input');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('feedback');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('layout');
    expect(ELEMENT_TYPE_CATEGORIES).toHaveProperty('unknown');
    // container gets all sections
    expect(ELEMENT_TYPE_CATEGORIES.container).toContain('padding');
    expect(ELEMENT_TYPE_CATEGORIES.container).toContain('margin');
    expect(ELEMENT_TYPE_CATEGORIES.container).toContain('gap');
    expect(ELEMENT_TYPE_CATEGORIES.container).toContain('borderRadius');
    // icon gets nothing
    expect(ELEMENT_TYPE_CATEGORIES.icon).toHaveLength(0);
  });

  it('PER_SIDE_MAP has correct entries for padding and margin', () => {
    expect(PER_SIDE_MAP.padding).toEqual(['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']);
    expect(PER_SIDE_MAP.margin).toEqual(['marginTop', 'marginRight', 'marginBottom', 'marginLeft']);
  });

  it('SPACING_TOKENS and RADIUS_TOKENS are correct', () => {
    expect(SPACING_TOKENS).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
    expect(RADIUS_TOKENS).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
  });
});

// ── resolveTokenToCssValue ───────────────────────────────────────

describe('resolveTokenToCssValue', () => {
  it('resolves spacing token to var()', () => {
    expect(resolveTokenToCssValue('padding', 'md')).toBe('var(--mantine-spacing-md)');
    expect(resolveTokenToCssValue('paddingTop', 'xs')).toBe('var(--mantine-spacing-xs)');
    expect(resolveTokenToCssValue('marginLeft', 'lg')).toBe('var(--mantine-spacing-lg)');
    expect(resolveTokenToCssValue('gap', 'sm')).toBe('var(--mantine-spacing-sm)');
  });

  it('resolves radius token to var()', () => {
    expect(resolveTokenToCssValue('borderRadius', 'md')).toBe('var(--mantine-radius-md)');
    expect(resolveTokenToCssValue('borderRadius', 'none')).toBe('var(--mantine-radius-none)');
  });

  it('passes through already-resolved var() values', () => {
    expect(resolveTokenToCssValue('padding', 'var(--mantine-spacing-md)')).toBe('var(--mantine-spacing-md)');
  });

  it('accepts optional StyleOrigin without changing v1 behavior', () => {
    // All origins resolve to var() in v1 — origin param is forward-compatible
    expect(resolveTokenToCssValue('padding', 'md', { origin: 'mantine-prop', prop: 'p', value: 'md', component: 'Card' }))
      .toBe('var(--mantine-spacing-md)');
    expect(resolveTokenToCssValue('padding', 'lg', { origin: 'tailwind', className: 'p-6' }))
      .toBe('var(--mantine-spacing-lg)');
    expect(resolveTokenToCssValue('borderRadius', 'sm', { origin: 'css-module' }))
      .toBe('var(--mantine-radius-sm)');
    expect(resolveTokenToCssValue('gap', 'xl', { origin: 'unknown' }))
      .toBe('var(--mantine-spacing-xl)');
  });
});

// ── Reducer ──────────────────────────────────────────────────────

describe('panelReducer', () => {
  it('SET_MODE toggles between browse and select', () => {
    const state = panelReducer(initialPanelState, { type: 'SET_MODE', mode: 'select' });
    expect(state.mode).toBe('select');
    const state2 = panelReducer(state, { type: 'SET_MODE', mode: 'browse' });
    expect(state2.mode).toBe('browse');
  });

  it('ELEMENT_SELECTED stores selection and derives activeTokens', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    const state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    expect(state.selection).toBe(sel);
    expect(state.origins).toEqual({});
    // padding is 16px → 'md' via token maps
    expect(state.activeTokens.padding).toBe('md');
    expect(state.activeTokens.gap).toBe('sm'); // 8px → sm
    expect(state.activeTokens.borderRadius).toBe('sm'); // 4px → sm in radius map
  });

  it('ELEMENT_SELECTED clears pendingChanges and undoStack', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps({
      pendingChanges: [{ property: 'padding', token: 'lg', previousToken: 'md', previousCssValue: '16px', cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' } }],
      undoStack: [{ property: 'padding', previousToken: 'md', previousCssValue: '16px' }],
    });
    const state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
  });

  it('APPLY_CHANGE pushes undo and upserts pendingChanges', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    const withSelection = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    const state = panelReducer(withSelection, {
      type: 'APPLY_CHANGE',
      property: 'padding',
      token: 'lg',
      cssProperty: 'padding',
      cssValue: 'var(--mantine-spacing-lg)',
      styleOrigin: { origin: 'unknown' },
    });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.pendingChanges[0]!.token).toBe('lg');
    expect(state.undoStack).toHaveLength(1);
    expect(state.undoStack[0]!.previousToken).toBe('md'); // was 16px → md
    expect(state.activeTokens.padding).toBe('lg');
  });

  it('APPLY_CHANGE upserts existing pending change for same property', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'xl',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-xl)', styleOrigin: { origin: 'unknown' },
    });
    // Still one pending change (upserted), but two undo entries
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.pendingChanges[0]!.token).toBe('xl');
    expect(state.undoStack).toHaveLength(2);
    expect(state.activeTokens.padding).toBe('xl');
  });

  it('per-side spacing: APPLY_CHANGE for paddingTop does not affect paddingBottom', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'paddingTop', token: 'xs',
      cssProperty: 'paddingTop', cssValue: 'var(--mantine-spacing-xs)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.activeTokens.paddingTop).toBe('xs');
    // paddingBottom should remain derived from original (16px → md)
    expect(state.activeTokens.paddingBottom).toBe('md');
  });

  it('UNDO pops stack and reverts change', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.activeTokens.padding).toBe('lg');
    state = panelReducer(state, { type: 'UNDO' });
    expect(state.undoStack).toHaveLength(0);
    expect(state.activeTokens.padding).toBe('md'); // reverted to original
    // pendingChanges should be empty (reverted to original = no change)
    expect(state.pendingChanges).toHaveLength(0);
  });

  it('UNDO on empty stack is no-op', () => {
    const state = panelReducer(initialPanelState, { type: 'UNDO' });
    expect(state).toBe(initialPanelState);
  });

  it('DISCARD_ALL clears pendingChanges and undoStack', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, { type: 'DISCARD_ALL' });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
    // activeTokens should revert to selection-derived values
    expect(state.activeTokens.padding).toBe('md');
  });

  it('TOKEN_MAPS_LOADED stores token maps', () => {
    const maps = makeTokenMaps();
    const state = panelReducer(initialPanelState, { type: 'TOKEN_MAPS_LOADED', tokenMaps: maps });
    expect(state.tokenMaps).toBe(maps);
  });

  it('WS_STATUS updates wsStatus', () => {
    const state = panelReducer(initialPanelState, { type: 'WS_STATUS', status: 'connected' });
    expect(state.wsStatus).toBe('connected');
  });

  it('FINALIZE_START/QUEUED/SUCCESS/TIMEOUT/ERROR updates pipelineStatus', () => {
    let state = panelReducer(initialPanelState, { type: 'FINALIZE_START' });
    expect(state.pipelineStatus).toBe('sending');
    state = panelReducer(state, { type: 'FINALIZE_QUEUED' });
    expect(state.pipelineStatus).toBe('processing');
    state = panelReducer(state, { type: 'FINALIZE_SUCCESS' });
    expect(state.pipelineStatus).toBe('applied');
    state = panelReducer(initialPanelState, { type: 'FINALIZE_TIMEOUT' });
    expect(state.pipelineStatus).toBe('timeout');
    state = panelReducer(initialPanelState, { type: 'FINALIZE_ERROR', error: 'timeout' });
    expect(state.pipelineStatus).toBe('error: timeout');
  });

  it('FINALIZE_QUEUED preserves pendingChanges and undoStack (C2)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
    state = panelReducer(state, { type: 'FINALIZE_QUEUED' });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
    expect(state.pipelineStatus).toBe('processing');
  });

  it('FINALIZE_TIMEOUT preserves pendingChanges for retry (C2)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, { type: 'FINALIZE_QUEUED' });
    state = panelReducer(state, { type: 'FINALIZE_TIMEOUT' });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
    expect(state.pipelineStatus).toBe('timeout');
  });

  it('FINALIZE_SUCCESS clears pendingChanges and undoStack (M1)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
    state = panelReducer(state, { type: 'FINALIZE_SUCCESS' });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
    expect(state.pipelineStatus).toBe('applied');
  });

  it('ELEMENT_DESELECTED clears selection/origins/activeTokens but preserves pendingChanges (C2)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, { type: 'ELEMENT_DESELECTED' });
    expect(state.selection).toBeNull();
    expect(state.origins).toBeNull();
    expect(state.activeTokens).toEqual({});
    // Preserves pending changes and undo stack across deselection
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
  });

  it('undo stack caps at 100 entries (H6)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel, origins: {} });
    for (let i = 0; i < 110; i++) {
      state = panelReducer(state, {
        type: 'APPLY_CHANGE', property: `paddingTop`, token: i % 2 === 0 ? 'lg' : 'xl',
        cssProperty: 'paddingTop', cssValue: `var(--mantine-spacing-${i % 2 === 0 ? 'lg' : 'xl'})`,
        styleOrigin: { origin: 'unknown' },
      });
    }
    expect(state.undoStack).toHaveLength(100);
  });
});

// ── getOriginForProperty ─────────────────────────────────────────

describe('getOriginForProperty', () => {
  const mantineOrigin: StyleOrigin = { origin: 'mantine-prop', prop: 'p', value: 'lg', component: 'Card' };

  it('returns direct match when property has own origin', () => {
    const origins = { padding: mantineOrigin };
    expect(getOriginForProperty('padding', origins)).toBe(mantineOrigin);
  });

  it('falls back paddingTop → padding category', () => {
    const origins = { padding: mantineOrigin };
    expect(getOriginForProperty('paddingTop', origins)).toBe(mantineOrigin);
  });

  it('falls back marginLeft → margin category', () => {
    const marginOrigin: StyleOrigin = { origin: 'mantine-prop', prop: 'm', value: 'sm', component: 'Box' };
    const origins = { margin: marginOrigin };
    expect(getOriginForProperty('marginLeft', origins)).toBe(marginOrigin);
  });

  it('returns unknown when property not in table and no direct match', () => {
    const origins = { padding: mantineOrigin };
    expect(getOriginForProperty('fontSize', origins)).toEqual({ origin: 'unknown' });
  });

  it('returns unknown when origins is null', () => {
    expect(getOriginForProperty('padding', null)).toEqual({ origin: 'unknown' });
  });
});
