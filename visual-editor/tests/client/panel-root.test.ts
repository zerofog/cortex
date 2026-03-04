/**
 * PanelRoot integration tests — component orchestration
 * with mocked WebSocket and postMessage.
 *
 * Covers: WS handshake (C3), postMessage security (C1),
 * finalize ID (C4), deselection (C2), keyboard undo (H2),
 * payload validation (M7), and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import { h } from 'preact';
import { PanelRoot, MESSAGE_VERSION } from '../../src/client/panel.js';
import { makeSelection, makeTokenMaps } from './helpers.js';

// ── MockWebSocket ───────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  sent: string[] = [];
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }

  /** Simulate server opening the connection. */
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** Simulate server sending a JSON message. */
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  static reset() { MockWebSocket.instances = []; }
}

// ── Helpers ─────────────────────────────────────────────────────

const SESSION = 'test-sess-42';
const ORIGIN = 'http://localhost:3000';

let iframePostMessage: ReturnType<typeof vi.fn>;

/** Add a mock iframe that sendToInspector can find. */
function mountIframe() {
  iframePostMessage = vi.fn();
  const el = document.createElement('iframe');
  el.className = 'shell-viewport';
  Object.defineProperty(el, 'contentWindow', {
    value: { postMessage: iframePostMessage },
    configurable: true,
  });
  document.body.appendChild(el);
}

/** Dispatch a message event as if sent from the inspector iframe. */
function inspectorMsg(type: string, payload: unknown = {}) {
  window.dispatchEvent(new MessageEvent('message', {
    data: { type, sessionId: SESSION, version: MESSAGE_VERSION, payload },
    origin: ORIGIN,
  }));
}

/** Complete the hello → auth → session WS handshake. */
function wsHandshake(): MockWebSocket {
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
  act(() => ws.open());
  act(() => ws.receive({ type: 'hello' }));
  act(() => ws.receive({ type: 'session' }));
  return ws;
}

function renderPanel() {
  return render(h(PanelRoot, { sessionId: SESSION, sidecarOrigin: ORIGIN }));
}

/** Send token-maps + selection so PropertySections renders with token buttons. */
function selectElement() {
  act(() => inspectorMsg('zerofog:token-maps', makeTokenMaps()));
  act(() => inspectorMsg('zerofog:selected', makeSelection()));
}

// ── Tests ───────────────────────────────────────────────────────

describe('PanelRoot', () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket);
    mountIframe();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('.shell-viewport').forEach(el => el.remove());
  });

  it('renders without crash', () => {
    const { container } = renderPanel();
    expect(container.querySelector('h2')?.textContent).toBe('Cortex');
  });

  it('zerofog:selected renders element info', () => {
    const { container } = renderPanel();
    selectElement();
    expect(container.querySelector('.selection-tag')?.textContent).toContain('div');
    expect(container.querySelector('.selection-component')?.textContent).toContain('Card');
  });

  it('zerofog:deselected clears selection (C2)', () => {
    const { container } = renderPanel();
    selectElement();
    expect(container.querySelector('.selection-tag')).toBeTruthy();
    act(() => inspectorMsg('zerofog:deselected'));
    expect(container.querySelector('.selection-tag')).toBeNull();
    expect(container.querySelector('.selection-empty')).toBeTruthy();
  });

  it('token click sends postMessage with sidecarOrigin (C1)', () => {
    const { container } = renderPanel();
    selectElement();
    act(() => { fireEvent.click(container.querySelector('.token-btn')!); });
    const call = iframePostMessage.mock.calls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'inspector:apply-override',
    );
    expect(call).toBeTruthy();
    expect(call![1]).toBe(ORIGIN); // sidecarOrigin — NOT '*'
  });

  it('WS sends auth with sessionId after hello (C3)', () => {
    renderPanel();
    const ws = MockWebSocket.instances[0]!;
    act(() => ws.open());
    act(() => ws.receive({ type: 'hello' }));
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'auth', sessionId: SESSION });
  });

  it('finalize message includes id field (C4)', () => {
    renderPanel();
    const ws = wsHandshake();
    selectElement();
    act(() => { fireEvent.click(document.querySelector('.token-btn')!); });
    act(() => { fireEvent.click(document.querySelector('.action-btn-primary')!); });
    const msg = JSON.parse(ws.sent[ws.sent.length - 1]!);
    expect(msg.type).toBe('finalize');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
    expect(msg.payload.changes).toHaveLength(1);
  });

  it('WS error dispatches FINALIZE_ERROR', () => {
    const { container } = renderPanel();
    const ws = wsHandshake();
    act(() => ws.receive({ type: 'error', message: 'timeout' }));
    expect(container.textContent).toContain('error: timeout');
  });

  it('Cmd+Z undoes change via postMessage (H2)', () => {
    renderPanel();
    selectElement();
    act(() => { fireEvent.click(document.querySelector('.token-btn')!); });
    iframePostMessage.mockClear();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'z', metaKey: true, shiftKey: false, bubbles: true,
      }));
    });
    const revert = iframePostMessage.mock.calls.find(
      (c: unknown[]) => {
        const t = (c[0] as Record<string, unknown>).type;
        return t === 'inspector:apply-override' || t === 'inspector:remove-override';
      },
    );
    expect(revert).toBeTruthy();
  });

  it('selecting new element removes overrides from previous element', () => {
    renderPanel();
    selectElement();
    act(() => { fireEvent.click(document.querySelector('.token-btn')!); });
    iframePostMessage.mockClear();
    // Select a different element while previous has pending changes
    act(() => inspectorMsg('zerofog:selected', {
      ...makeSelection(),
      id: 999,
      timestamp: Date.now(),
    }));
    // Should send per-property remove-override (not discard-overrides, which nukes elementMap)
    const removeCall = iframePostMessage.mock.calls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'inspector:remove-override',
    );
    expect(removeCall).toBeTruthy();
    const discardCall = iframePostMessage.mock.calls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'inspector:discard-overrides',
    );
    expect(discardCall).toBeFalsy();
  });

  it('ignores postMessage from wrong origin', () => {
    const { container } = renderPanel();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'zerofog:selected', sessionId: SESSION, version: MESSAGE_VERSION, payload: makeSelection() },
        origin: 'http://evil.com',
      }));
    });
    expect(container.querySelector('.selection-tag')).toBeNull();
  });

  it('warns on malformed selection payload (M7)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPanel();
    act(() => inspectorMsg('zerofog:selected', { bad: 'data' }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid selection payload'));
  });
});
