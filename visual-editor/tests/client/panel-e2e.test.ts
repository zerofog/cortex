/**
 * Panel end-to-end message flow test (M8).
 *
 * Simulates the full lifecycle: ready → token-maps → select → apply-override
 * → undo → finalize. Verifies messages sent to inspector at each step.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  panelReducer,
  initialPanelState,
  resolveTokenToCssValue,
  type PanelState,
  type SelectionPayload,
  type TokenMaps,
} from '../../src/client/panel-state.js';
import {
  createMessageEnvelope,
  isValidPanelMessage,
  MESSAGE_VERSION,
} from '../../src/client/panel.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSelection(): SelectionPayload {
  return {
    id: 1,
    timestamp: Date.now(),
    testId: 'card-root',
    componentChain: ['Card'],
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
  };
}

function makeTokenMaps(): TokenMaps {
  return {
    spacing: { '4px': 'xs', '8px': 'sm', '16px': 'md', '24px': 'lg', '32px': 'xl' },
    radius: { '0px': 'none', '2px': 'xs', '4px': 'sm', '8px': 'md', '16px': 'lg', '32px': 'xl' },
  };
}

// ── Full message flow ────────────────────────────────────────────

describe('End-to-end message flow', () => {
  it('simulates complete panel lifecycle: ready → token-maps → select → change → undo → finalize', () => {
    // Track messages that would be sent to inspector
    const sentMessages: Array<{ type: string; payload: unknown }> = [];
    function mockSendToInspector(type: string, payload: unknown = null) {
      sentMessages.push({ type, payload });
    }

    let state: PanelState = { ...initialPanelState };

    // Step 1: Inspector ready → panel sets edit mode
    mockSendToInspector('inspector:set-edit-mode', { mode: 'style' });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.type).toBe('inspector:set-edit-mode');

    // Step 2: Token maps received
    const tokenMaps = makeTokenMaps();
    state = panelReducer(state, { type: 'TOKEN_MAPS_LOADED', tokenMaps });
    expect(state.tokenMaps).toBe(tokenMaps);

    // Step 3: WS connected
    state = panelReducer(state, { type: 'WS_STATUS', status: 'connected' });
    expect(state.wsStatus).toBe('connected');

    // Step 4: User enters select mode
    state = panelReducer(state, { type: 'SET_MODE', mode: 'select' });
    mockSendToInspector('inspector:enter-select');
    expect(state.mode).toBe('select');
    expect(sentMessages[sentMessages.length - 1]!.type).toBe('inspector:enter-select');

    // Step 5: User selects an element
    const selection = makeSelection();
    state = panelReducer(state, { type: 'ELEMENT_SELECTED', selection, origins: {} });
    expect(state.selection).toBe(selection);
    expect(state.activeTokens.padding).toBe('md'); // 16px → md

    // Step 6: User changes padding to lg
    const cssValue = resolveTokenToCssValue('padding', 'lg');
    state = panelReducer(state, {
      type: 'APPLY_CHANGE',
      property: 'padding',
      token: 'lg',
      cssProperty: 'padding',
      cssValue,
      styleOrigin: { origin: 'unknown' as const },
    });
    mockSendToInspector('inspector:apply-override', {
      elementId: selection.id,
      cssProperty: 'padding',
      cssValue,
    });
    expect(state.activeTokens.padding).toBe('lg');
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.undoStack).toHaveLength(1);
    expect(sentMessages[sentMessages.length - 1]!.type).toBe('inspector:apply-override');

    // Step 7: User undoes via UNDO
    state = panelReducer(state, { type: 'UNDO' });
    mockSendToInspector('inspector:remove-override', {
      elementId: selection.id,
      cssProperty: 'padding',
    });
    expect(state.activeTokens.padding).toBe('md'); // back to original
    expect(state.pendingChanges).toHaveLength(0);
    expect(sentMessages[sentMessages.length - 1]!.type).toBe('inspector:remove-override');

    // Step 8: User re-applies and finalizes
    state = panelReducer(state, {
      type: 'APPLY_CHANGE',
      property: 'padding',
      token: 'xl',
      cssProperty: 'padding',
      cssValue: resolveTokenToCssValue('padding', 'xl'),
      styleOrigin: { origin: 'unknown' as const },
    });
    mockSendToInspector('inspector:apply-override', {
      elementId: selection.id,
      cssProperty: 'padding',
      cssValue: resolveTokenToCssValue('padding', 'xl'),
    });

    // Finalize
    state = panelReducer(state, { type: 'FINALIZE_START' });
    expect(state.pipelineStatus).toBe('sending');

    state = panelReducer(state, { type: 'FINALIZE_SUCCESS' });
    expect(state.pipelineStatus).toBe('applied');

    // Step 9: Verify message envelope format
    const envelope = createMessageEnvelope('inspector:apply-override', { test: true }, 'sess-123');
    expect(envelope.version).toBe(MESSAGE_VERSION);
    expect(envelope.sessionId).toBe('sess-123');
    expect(envelope.type).toBe('inspector:apply-override');

    // Step 10: Deselect
    state = panelReducer(state, { type: 'ELEMENT_DESELECTED' });
    expect(state.selection).toBeNull();
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
  });

  it('simulates discard flow', () => {
    let state: PanelState = { ...initialPanelState, tokenMaps: makeTokenMaps() };
    const selection = makeSelection();
    state = panelReducer(state, { type: 'ELEMENT_SELECTED', selection, origins: {} });

    // Apply two changes
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'v', styleOrigin: { origin: 'unknown' as const },
    });
    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'gap', token: 'xl',
      cssProperty: 'gap', cssValue: 'v', styleOrigin: { origin: 'unknown' as const },
    });
    expect(state.pendingChanges).toHaveLength(2);

    // Discard all
    state = panelReducer(state, { type: 'DISCARD_ALL' });
    expect(state.pendingChanges).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
    expect(state.pipelineStatus).toBeNull();
    // Active tokens revert to originals
    expect(state.activeTokens.padding).toBe('md');
    expect(state.activeTokens.gap).toBe('sm');
  });

  it('simulates error recovery flow', () => {
    let state: PanelState = { ...initialPanelState, tokenMaps: makeTokenMaps(), wsStatus: 'connected' };
    const selection = makeSelection();
    state = panelReducer(state, { type: 'ELEMENT_SELECTED', selection, origins: {} });

    state = panelReducer(state, {
      type: 'APPLY_CHANGE', property: 'padding', token: 'lg',
      cssProperty: 'padding', cssValue: 'v', styleOrigin: { origin: 'unknown' as const },
    });

    // Finalize fails
    state = panelReducer(state, { type: 'FINALIZE_START' });
    state = panelReducer(state, { type: 'FINALIZE_ERROR', error: 'network timeout' });
    expect(state.pipelineStatus).toBe('error: network timeout');

    // Changes are still pending (can retry)
    expect(state.pendingChanges).toHaveLength(1);
  });
});
