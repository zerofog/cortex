/**
 * Panel entry point — Shadow DOM mount, postMessage bridge, WS connection.
 *
 * Bundled by tsup into a single IIFE. Template variables SESSION_ID and
 * SIDECAR_ORIGIN are replaced by the server at injection time.
 *
 * Exports pure functions for testing (createMessageEnvelope, isValidPanelMessage).
 * The IIFE self-invoking block at the bottom only runs in browser context.
 */

import { h, render } from 'preact';
import { useReducer, useEffect, useCallback, useRef } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { panelReducer, initialPanelState, resolveTokenToCssValue } from './panel-state.js';
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

const PanelRoot: FunctionComponent<PanelRootProps> = ({ sessionId, sidecarOrigin }) => {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const modeRef = useRef(state.mode);

  // Helper: send message to iframe inspector
  const sendToInspector = useCallback((type: string, payload: unknown = null) => {
    const iframe = iframeRef.current ?? document.querySelector<HTMLIFrameElement>('.shell-viewport');
    if (iframe?.contentWindow) {
      iframeRef.current = iframe;
      iframe.contentWindow.postMessage(
        createMessageEnvelope(type, payload, sessionId),
        sidecarOrigin,
      );
    } else {
      console.warn('[zerofog] No iframe found for:', type);
    }
  }, [sessionId, sidecarOrigin]);

  // Keep modeRef in sync (H4: avoids stale closure)
  useEffect(() => { modeRef.current = state.mode; }, [state.mode]);

  // ── postMessage listener for inspector messages ────────────────
  useEffect(() => {
    const messageDispatch: Record<string, (payload: Record<string, unknown>) => void> = {
      'zerofog:ready': () => {
        sendToInspector('inspector:set-edit-mode', { mode: 'style' });
        if (modeRef.current === 'select') {
          sendToInspector('inspector:enter-select');
        }
      },
      'zerofog:selected': (payload) => {
        const selection = payload as unknown as SelectionPayload;
        dispatch({ type: 'ELEMENT_SELECTED', selection });
      },
      'zerofog:deselected': () => {
        dispatch({ type: 'ELEMENT_DESELECTED' });
      },
      'zerofog:token-maps': (payload) => {
        const tokenMaps = payload as unknown as TokenMaps;
        dispatch({ type: 'TOKEN_MAPS_LOADED', tokenMaps });
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

  // ── WebSocket connection with reconnection (H1) ──────────────────
  useEffect(() => {
    const protocol = sidecarOrigin.startsWith('https') ? 'wss' : 'ws';
    const host = sidecarOrigin.replace(/^https?:\/\//, '');
    const url = `${protocol}://${host}/__zerofog`;
    const MAX_RETRIES = 10;
    const BASE_DELAY = 1000;
    const MAX_DELAY = 30000;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      dispatch({ type: 'WS_STATUS', status: 'connecting' });
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        ws.send(JSON.stringify({ type: 'auth', sessionId }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { type: string; [k: string]: unknown };
          if (msg.type === 'session') {
            dispatch({ type: 'WS_STATUS', status: 'connected' });
          } else if (msg.type === 'finalize-result') {
            if (msg.ok) {
              dispatch({ type: 'FINALIZE_SUCCESS' });
            } else {
              dispatch({ type: 'FINALIZE_ERROR', error: String(msg.error ?? 'unknown') });
            }
          }
        } catch (err) {
          console.warn('[zerofog] WS parse error:', err);
        }
      };

      ws.onclose = () => {
        dispatch({ type: 'WS_STATUS', status: 'disconnected' });
        wsRef.current = null;
        if (!cancelled && retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
          retryCount++;
          retryTimeout = setTimeout(connect, delay);
        }
      };

      // onerror fires before onclose — no separate handling needed
      ws.onerror = () => {};
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout !== null) clearTimeout(retryTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sidecarOrigin, sessionId]);

  // ── Refs for stable undo callback (avoids re-registering keydown on every state change) ──
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Shared undo logic (H3: deduplicated) ─────────────────────────
  const performUndo = useCallback(() => {
    const s = stateRef.current;
    if (s.undoStack.length === 0) return;
    const top = s.undoStack[s.undoStack.length - 1]!;
    const origin = s.pendingChanges.find(c => c.property === top.property)?.styleOrigin;
    const originalToken = s.originalTokens[top.property] ?? null;
    dispatch({ type: 'UNDO' });

    if (top.previousToken === null || top.previousToken === originalToken) {
      sendToInspector('inspector:remove-override', {
        elementId: s.selection?.id,
        cssProperty: top.property,
      });
    } else {
      sendToInspector('inspector:apply-override', {
        elementId: s.selection?.id,
        cssProperty: top.property,
        cssValue: resolveTokenToCssValue(top.property, top.previousToken, origin),
      });
    }
  }, [sendToInspector]);

  // ── Per-property undo (H2) ──────────────────────────────────────
  const handleUndoProperty = useCallback((property: string) => {
    dispatch({ type: 'UNDO_PROPERTY', property });
    // Side effect: tell inspector to remove the override for this property
    sendToInspector('inspector:remove-override', {
      elementId: state.selection?.id,
      cssProperty: property,
    });
  }, [state.selection, sendToInspector]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performUndo]);

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
    if (!state.selection) return;
    const origin = state.selection.origins?.[property] ?? { origin: 'unknown' as const };
    const cssValue = resolveTokenToCssValue(property, token, origin);

    dispatch({
      type: 'APPLY_CHANGE',
      property,
      token,
      cssProperty: property,
      cssValue,
      styleOrigin: origin,
    });

    sendToInspector('inspector:apply-override', {
      elementId: state.selection.id,
      cssProperty: property,
      cssValue,
    });
  }, [state.selection, sendToInspector]);

  const handleDiscard = useCallback(() => {
    dispatch({ type: 'DISCARD_ALL' });
    sendToInspector('inspector:discard-overrides');
  }, [sendToInspector]);

  const handleApply = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!state.selection || state.pendingChanges.length === 0) return;

    dispatch({ type: 'FINALIZE_START' });
    wsRef.current.send(JSON.stringify({
      id: crypto.randomUUID(),
      type: 'finalize',
      payload: {
        elementId: state.selection.id,
        testId: state.selection.testId,
        componentChain: state.selection.componentChain,
        elementType: state.selection.elementType,
        changes: state.pendingChanges,
      },
    }));
  }, [state.selection, state.pendingChanges]);

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
          tokenMaps={state.tokenMaps}
          onTokenSelect={handleTokenSelect}
        />
      )}
      <ChangeList changes={state.pendingChanges} onUndo={handleUndoProperty} />
      <ActionBar
        hasChanges={state.pendingChanges.length > 0}
        wsConnected={state.wsStatus === 'connected'}
        pipelineStatus={state.pipelineStatus}
        onDiscard={handleDiscard}
        onApply={handleApply}
      />
      <StatusBar wsStatus={state.wsStatus} pipelineStatus={state.pipelineStatus} />
    </div>
  );
};

// ── IIFE: Shadow DOM mount (browser-only) ────────────────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function () {
    const SESSION_ID = '__SESSION_ID__';
    const SIDECAR_ORIGIN = '__SIDECAR_ORIGIN__';

    const mount = document.getElementById('panel-mount');
    if (!mount) return;

    const shadow = mount.attachShadow({ mode: 'closed' });
    applyPanelStyles(shadow);

    const root = document.createElement('div');
    shadow.appendChild(root);

    render(
      h(PanelRoot, { sessionId: SESSION_ID, sidecarOrigin: SIDECAR_ORIGIN }),
      root,
    );
  })();
}
