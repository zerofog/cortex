/**
 * Panel entry point — Shadow DOM mount, postMessage bridge, WS connection.
 *
 * Bundled by tsup into a single IIFE. Template variables SESSION_ID and
 * SIDECAR_ORIGIN are replaced by the server at injection time.
 *
 * Exports pure functions for testing (createMessageEnvelope, isValidPanelMessage)
 * and PanelRoot for integration tests.
 * The IIFE self-invoking block at the bottom only runs in browser context.
 */

import { h, render } from 'preact';
import { useReducer, useEffect, useCallback, useRef } from 'preact/hooks';
import type { VNode } from 'preact';
import { panelReducer, initialPanelState, resolveTokenToCssValue, getOriginForProperty } from './panel-state.js';
import type { SelectionPayload, TokenMaps } from './panel-state.js';
import type { StyleOrigin } from './toolbar.js';
import { applyPanelStyles } from './panel-styles.js';
import {
  PanelHeader,
  ModeToggle,
  SelectionInfo,
  PropertySections,
  ChangeList,
  ActionBar,
  StatusBar,
} from './panel-components.js';

// ── Constants ────────────────────────────────────────────────────

export const MESSAGE_VERSION = 1;

// ── Exported helpers (tested directly) ───────────────────────────

export function createMessageEnvelope(
  type: string,
  payload: unknown,
  sessionId: string,
): { type: string; sessionId: string; version: number; payload: unknown } {
  return { type, sessionId, version: MESSAGE_VERSION, payload };
}

export function isValidPanelMessage(
  event: MessageEvent,
  expectedOrigin: string,
  expectedSessionId: string,
): boolean {
  if (event.origin !== expectedOrigin) return false;
  const d = event.data;
  if (!d || typeof d !== 'object') return false;
  if (typeof d.type !== 'string') return false;
  if (d.version !== MESSAGE_VERSION) return false;
  if (d.sessionId !== expectedSessionId) return false;
  return true;
}

// ── PanelRoot component ──────────────────────────────────────────

interface PanelRootProps {
  sessionId: string;
  sidecarOrigin: string;
}

export function PanelRoot({ sessionId, sidecarOrigin }: PanelRootProps): VNode {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Helper: send message to iframe inspector
  const sendToInspector = useCallback((type: string, payload: unknown = null) => {
    const iframe = iframeRef.current ?? document.querySelector<HTMLIFrameElement>('.shell-viewport');
    if (iframe?.contentWindow) {
      iframeRef.current = iframe;
      iframe.contentWindow.postMessage(
        createMessageEnvelope(type, payload, sessionId),
        sidecarOrigin,
      );
    }
  }, [sessionId]);

  // ── Runtime payload validation ──────────────────────────────────

  function isSelectionPayload(data: unknown): data is SelectionPayload {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return typeof d.id === 'number' && typeof d.elementType === 'string'
      && d.element !== null && typeof d.element === 'object'
      && d.styles !== null && typeof d.styles === 'object';
  }

  function isTokenMaps(data: unknown): data is TokenMaps {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (!d.spacing || typeof d.spacing !== 'object') return false;
    if (!d.radius || typeof d.radius !== 'object') return false;
    // M7: Validate value types — all values must be strings (token names)
    const spacing = d.spacing as Record<string, unknown>;
    const radius = d.radius as Record<string, unknown>;
    for (const v of Object.values(spacing)) { if (typeof v !== 'string') return false; }
    for (const v of Object.values(radius)) { if (typeof v !== 'string') return false; }
    return true;
  }

  // ── postMessage listener for inspector messages ────────────────
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const messageDispatch: Record<string, (payload: Record<string, unknown>) => void> = {
      'zerofog:ready': () => {
        if (stateRef.current.mode === 'select') {
          sendToInspector('inspector:enter-select');
        }
      },
      'zerofog:selected': (payload) => {
        if (!isSelectionPayload(payload)) {
          console.warn('[cortex] Invalid selection payload, ignoring');
          return;
        }
        // Remove live preview overrides from previous element before switching.
        // Uses per-property remove (not discard-overrides) to preserve elementMap.
        const { pendingChanges, selection: prevSelection } = stateRef.current;
        if (pendingChanges.length > 0 && prevSelection) {
          for (const change of pendingChanges) {
            sendToInspector('inspector:remove-override', {
              elementId: prevSelection.id,
              cssProperty: change.property,
            });
          }
        }
        const origins = (payload.origins ?? {}) as Record<string, StyleOrigin>;
        dispatch({ type: 'ELEMENT_SELECTED', selection: payload, origins });
        sendToInspector('nav-blocker-enable');
      },
      'zerofog:deselected': () => {
        dispatch({ type: 'ELEMENT_DESELECTED' });
        sendToInspector('nav-blocker-disable');
      },
      'zerofog:token-maps': (payload) => {
        if (!isTokenMaps(payload)) {
          console.warn('[cortex] Invalid token maps payload, ignoring');
          return;
        }
        dispatch({ type: 'TOKEN_MAPS_LOADED', tokenMaps: payload });
      },
      'zerofog:apply-override-result': () => {
        // Acknowledgement — no action needed for v1
      },
    };

    function handleMessage(e: MessageEvent) {
      if (!isValidPanelMessage(e, sidecarOrigin, sessionId)) return;
      const handler = messageDispatch[e.data.type as string];
      if (handler) handler(e.data.payload);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sessionId, sidecarOrigin, sendToInspector]);

  // ── WebSocket connection with reconnection ─────────────────────
  useEffect(() => {
    const protocol = sidecarOrigin.startsWith('https') ? 'wss' : 'ws';
    const host = sidecarOrigin.replace(/^https?:\/\//, '');
    const url = `${protocol}://${host}/__zerofog`;
    let retryCount = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      dispatch({ type: 'WS_STATUS', status: 'connecting' });
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { type: string; [k: string]: unknown };
          if (msg.type === 'hello') {
            ws.send(JSON.stringify({ type: 'auth', sessionId }));
          } else if (msg.type === 'session') {
            dispatch({ type: 'WS_STATUS', status: 'connected' });
          } else if (msg.type === 'finalize-result') {
            if (msg.ok) {
              // Server accepted diff — now in processing queue. Don't clear changes yet.
              dispatch({ type: 'FINALIZE_QUEUED' });
            } else {
              dispatch({ type: 'FINALIZE_ERROR', error: String(msg.error ?? 'unknown') });
            }
          } else if (msg.type === 'edit-complete') {
            // Downstream processing succeeded — source code changed. Safe to clear.
            dispatch({ type: 'FINALIZE_SUCCESS' });
            sendToInspector('nav-blocker-disable');
          } else if (msg.type === 'processing-timeout') {
            // Processing timed out — preserve changes for retry.
            dispatch({ type: 'FINALIZE_TIMEOUT' });
          } else if (msg.type === 'error') {
            dispatch({ type: 'FINALIZE_ERROR', error: String(msg.message ?? 'unknown') });
          } else if (msg.type === 'ack') {
            // Message acknowledged — no action needed
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        dispatch({ type: 'WS_STATUS', status: 'disconnected' });
        wsRef.current = null;
        if (!disposed && retryCount < 5) {
          const delay = Math.min(1000 * 2 ** retryCount, 30000);
          reconnectTimer = setTimeout(connect, delay);
          retryCount++;
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sidecarOrigin, sessionId]);

  // ── Event handlers ─────────────────────────────────────────────

  const handleModeChange = useCallback((mode: 'browse' | 'select') => {
    dispatch({ type: 'SET_MODE', mode });
    if (mode === 'select') {
      sendToInspector('inspector:enter-select');
    } else {
      sendToInspector('inspector:exit-select');
    }
  }, [sendToInspector]);

  const handleTokenSelect = useCallback((property: string, token: string) => {
    if (!stateRef.current.selection) return;
    const origin = getOriginForProperty(property, stateRef.current.origins);
    const cssValue = resolveTokenToCssValue(property, token, origin);

    dispatch({
      type: 'APPLY_CHANGE',
      property,
      token,
      cssProperty: property,
      cssValue,
      styleOrigin: origin,
    });

    // Side effect: live preview via inspector
    sendToInspector('inspector:apply-override', {
      elementId: stateRef.current.selection.id,
      cssProperty: property,
      cssValue,
    });
  }, [sendToInspector]);

  const handleUndo = useCallback(() => {
    const { undoStack, pendingChanges, selection } = stateRef.current;
    if (undoStack.length === 0) return;
    const top = undoStack[undoStack.length - 1]!;
    const origin = pendingChanges.find(c => c.property === top.property)?.styleOrigin;
    dispatch({ type: 'UNDO' });

    if (top.previousToken === null) {
      sendToInspector('inspector:remove-override', {
        elementId: selection?.id,
        cssProperty: top.property,
      });
    } else {
      sendToInspector('inspector:apply-override', {
        elementId: selection?.id,
        cssProperty: top.property,
        cssValue: resolveTokenToCssValue(top.property, top.previousToken, origin),
      });
    }
  }, [sendToInspector]);

  // ── Keyboard shortcuts (H2: delegates to handleUndo) ──────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  const handleDiscard = useCallback(() => {
    dispatch({ type: 'DISCARD_ALL' });
    sendToInspector('inspector:discard-overrides');
    sendToInspector('nav-blocker-disable');
  }, [sendToInspector]);

  const handleApply = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const { selection, pendingChanges } = stateRef.current;
    if (!selection || pendingChanges.length === 0) return;

    dispatch({ type: 'FINALIZE_START' });
    wsRef.current.send(JSON.stringify({
      type: 'finalize',
      id: crypto.randomUUID(),
      payload: {
        elementId: selection.id,
        testId: selection.testId,
        componentChain: selection.componentChain,
        elementType: selection.elementType,
        changes: pendingChanges,
      },
    }));
  }, []);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div>
      <PanelHeader wsStatus={state.wsStatus} />
      <ModeToggle mode={state.mode} onModeChange={handleModeChange} />
      <SelectionInfo selection={state.selection} />
      {state.selection && (
        <PropertySections
          elementType={state.selection.elementType}
          activeTokens={state.activeTokens}
          pendingChanges={state.pendingChanges}
          onTokenSelect={handleTokenSelect}
        />
      )}
      <ChangeList changes={state.pendingChanges} onUndo={handleUndo} />
      <ActionBar
        hasChanges={state.pendingChanges.length > 0}
        wsConnected={state.wsStatus === 'connected'}
        onDiscard={handleDiscard}
        onApply={handleApply}
      />
      <StatusBar wsStatus={state.wsStatus} pipelineStatus={state.pipelineStatus} />
    </div>
  );
}

// ── IIFE: Shadow DOM mount (browser-only) ────────────────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function () {
    var SESSION_ID = '__SESSION_ID__';
    // H8: Derive origin at runtime — handles localhost/127.0.0.1/::1 variations
    var SIDECAR_ORIGIN = window.location.origin;

    const mount = document.getElementById('panel-mount');
    if (!mount) return;

    // TODO: Switch to 'closed' for production builds
    const shadow = mount.attachShadow({ mode: 'open' });
    applyPanelStyles(shadow);

    const root = document.createElement('div');
    shadow.appendChild(root);

    render(
      h(PanelRoot, { sessionId: SESSION_ID, sidecarOrigin: SIDECAR_ORIGIN }),
      root,
    );
  })();
}
