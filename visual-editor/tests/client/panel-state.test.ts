import { describe, it, expect } from 'vitest';
import {
  panelReducer,
  initialPanelState,
  ELEMENT_TYPE_CATEGORIES,
  PER_SIDE_MAP,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  MAX_UNDO_STACK,
  resolveTokenToCssValue,
  toKebabCase,
  type PanelState,
  type PanelAction,
  type SelectionPayload,
  type PendingChange,
} from '../../src/client/panel-state.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSelection(overrides: Partial<SelectionPayload> = {}): SelectionPayload {
  return {
    id: 1,
    timestamp: Date.now(),
    testId: 'card-root',
    componentChain: ['Card', 'Paper'],
    hasClientFiber: true,
    elementType: 'container',
    element: { tag: 'DIV', classes: [], text: '', bounds: { top: 0, left: 0, width: 100, height: 50 } },
    styles: {
      color: 'rgb(0,0,0)', background: 'rgb(255,255,255)', fontSize: '16px',
      padding: '16px', margin: '0px', display: 'flex', gap: '8px',
      borderRadius: '4px', fontWeight: '400', fontFamily: 'sans-serif',
      paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px',
      marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
    },
    origins: {},
    ...overrides,
  };
}

function makeTokenMaps() {
  return {
    spacing: { '4px': 'xs', '8px': 'sm', '16px': 'md', '24px': 'lg', '32px': 'xl' },
    radius: { '0px': 'none', '2px': 'xs', '4px': 'sm', '8px': 'md', '16px': 'lg', '32px': 'xl' },
  };
}

function stateWithTokenMaps(extra: Partial<PanelState> = {}): PanelState {
  return { ...initialPanelState, tokenMaps: makeTokenMaps(), ...extra };
}

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

  it('MAX_UNDO_STACK is 50', () => {
    expect(MAX_UNDO_STACK).toBe(50);
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
    expect(resolveTokenToCssValue('borderRadius', 'sm', { origin: 'css-module' }))
      .toBe('var(--mantine-radius-sm)');
    expect(resolveTokenToCssValue('gap', 'xl', { origin: 'unknown' }))
      .toBe('var(--mantine-spacing-xl)');
  });

  it('warns for tailwind origin (H5)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveTokenToCssValue('padding', 'lg', { origin: 'tailwind', className: 'p-6' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Tailwind'));
    warnSpy.mockRestore();
  });
});

// ── toKebabCase ─────────────────────────────────────────────────

describe('toKebabCase', () => {
  it('converts camelCase CSS properties to kebab-case', () => {
    expect(toKebabCase('paddingTop')).toBe('padding-top');
    expect(toKebabCase('marginLeft')).toBe('margin-left');
    expect(toKebabCase('borderRadius')).toBe('border-radius');
    expect(toKebabCase('paddingBottom')).toBe('padding-bottom');
  });

  it('passes through already-kebab or single-word properties', () => {
    expect(toKebabCase('padding')).toBe('padding');
    expect(toKebabCase('margin')).toBe('margin');
    expect(toKebabCase('gap')).toBe('gap');
  });
});

import { vi } from 'vitest';

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
    const state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    expect(state.selection).toBe(sel);
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
    const state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
  });

  // ── ELEMENT_DESELECTED (C2) ──────────────────────────────────────

  it('ELEMENT_DESELECTED resets all selection state', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, { type: 'ELEMENT_DESELECTED' });
    expect(state.selection).toBeNull();
    expect(state.activeTokens).toEqual({});
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
  });

  it('APPLY_CHANGE pushes undo and upserts pendingChanges', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    const withSelection = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
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
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
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

  it('APPLY_CHANGE records previousCssValue from current override, not original', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    // First change: padding md → lg
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    // Second change: padding lg → xl (undo should record lg's cssValue, not original 16px)
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'xl',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-xl)', styleOrigin: { origin: 'unknown' },
    });
    // The second undo entry should have the previous override's cssValue
    expect(state.undoStack[1]!.previousCssValue).toBe('var(--mantine-spacing-lg)');
  });

  it('per-side spacing: APPLY_CHANGE for paddingTop does not affect paddingBottom', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'paddingTop', token: 'xs',
      cssProperty: 'paddingTop', cssValue: 'var(--mantine-spacing-xs)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.activeTokens.paddingTop).toBe('xs');
    // paddingBottom should remain derived from original (16px → md)
    expect(state.activeTokens.paddingBottom).toBe('md');
  });

  // ── Undo stack cap (H6) ──────────────────────────────────────────

  it('APPLY_CHANGE caps undo stack at MAX_UNDO_STACK', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    // Push 60 entries
    for (let i = 0; i < 60; i++) {
      state = panelReducer(state, {
        type: 'APPLY_CHANGE', property: `prop-${i}`, token: 'lg',
        cssProperty: `prop-${i}`, cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
      });
    }
    expect(state.undoStack.length).toBe(MAX_UNDO_STACK);
  });

  it('UNDO pops stack and reverts change', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
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

  // ── UNDO_PROPERTY (H2) ───────────────────────────────────────────

  it('UNDO_PROPERTY reverts specific property and leaves others intact', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps();
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    // Apply changes to two different properties
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'gap', token: 'xl',
      cssProperty: 'gap', cssValue: 'var(--mantine-spacing-xl)', styleOrigin: { origin: 'unknown' },
    });
    expect(state.pendingChanges).toHaveLength(2);
    expect(state.undoStack).toHaveLength(2);

    // Undo only padding
    state = panelReducer(state, { type: 'UNDO_PROPERTY', property: 'padding' });
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.pendingChanges[0]!.property).toBe('gap');
    expect(state.activeTokens.padding).toBe('md'); // reverted to original
    expect(state.activeTokens.gap).toBe('xl'); // still changed
    expect(state.undoStack.every(e => e.property !== 'padding')).toBe(true);
  });

  it('DISCARD_ALL clears pendingChanges, undoStack, and pipelineStatus (M5)', () => {
    const sel = makeSelection();
    const base = stateWithTokenMaps({ pipelineStatus: 'sending' });
    let state = panelReducer(base, { type: 'ELEMENT_SELECTED', selection: sel });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' },
    });
    state = panelReducer(state, { type: 'DISCARD_ALL' });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
    // activeTokens should revert to selection-derived values
    expect(state.activeTokens.padding).toBe('md');
    // pipelineStatus should be reset (M5)
    expect(state.pipelineStatus).toBeNull();
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

  it('FINALIZE_START/SUCCESS/ERROR updates pipelineStatus', () => {
    let state = panelReducer(initialPanelState, { type: 'FINALIZE_START' });
    expect(state.pipelineStatus).toBe('sending');
    state = panelReducer(state, { type: 'FINALIZE_SUCCESS' });
    expect(state.pipelineStatus).toBe('applied');
    state = panelReducer(initialPanelState, { type: 'FINALIZE_ERROR', error: 'timeout' });
    expect(state.pipelineStatus).toBe('error: timeout');
  });
});
