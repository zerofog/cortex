/**
 * Shared test helpers for panel tests.
 * Provides factory functions for common test fixtures.
 */

import type { SelectionPayload, TokenMaps, PanelState } from '../../src/client/panel-state.js';
import { initialPanelState } from '../../src/client/panel-state.js';

export function makeSelection(overrides: Partial<SelectionPayload> = {}): SelectionPayload {
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

export function makeTokenMaps(): TokenMaps {
  return {
    spacing: { '4px': 'xs', '8px': 'sm', '16px': 'md', '24px': 'lg', '32px': 'xl' },
    radius: { '0px': 'none', '2px': 'xs', '4px': 'sm', '8px': 'md', '16px': 'lg', '32px': 'xl' },
  };
}

export function stateWithTokenMaps(extra: Partial<PanelState> = {}): PanelState {
  return { ...initialPanelState, tokenMaps: makeTokenMaps(), ...extra };
}
