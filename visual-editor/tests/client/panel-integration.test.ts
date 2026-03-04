/**
 * Panel integration tests — postMessage flow between panel and inspector.
 *
 * These test the message envelope format, dispatch mapping, and
 * the panel's reaction to inspector messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMessageEnvelope,
  isValidPanelMessage,
  MESSAGE_VERSION,
} from '../../src/client/panel.js';

// ── Message envelope ─────────────────────────────────────────────

describe('createMessageEnvelope', () => {
  it('creates envelope with correct structure', () => {
    const envelope = createMessageEnvelope('inspector:enter-select', null, 'sess-123');
    expect(envelope).toEqual({
      type: 'inspector:enter-select',
      sessionId: 'sess-123',
      version: MESSAGE_VERSION,
      payload: null,
    });
  });

  it('includes payload when provided', () => {
    const payload = { elementId: 1, cssProperty: 'padding', cssValue: 'var(--mantine-spacing-md)' };
    const envelope = createMessageEnvelope('inspector:apply-override', payload, 'sess-123');
    expect(envelope.payload).toEqual(payload);
  });
});

// ── Message validation ───────────────────────────────────────────

describe('isValidPanelMessage', () => {
  const origin = 'http://localhost:3000';
  const sessionId = 'sess-123';

  it('accepts valid zerofog: messages', () => {
    const event = new MessageEvent('message', {
      data: { type: 'zerofog:selected', sessionId, version: MESSAGE_VERSION, payload: {} },
      origin,
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(true);
  });

  it('rejects wrong origin', () => {
    const event = new MessageEvent('message', {
      data: { type: 'zerofog:selected', sessionId, version: MESSAGE_VERSION, payload: {} },
      origin: 'http://evil.com',
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(false);
  });

  it('rejects wrong session ID', () => {
    const event = new MessageEvent('message', {
      data: { type: 'zerofog:selected', sessionId: 'wrong', version: MESSAGE_VERSION, payload: {} },
      origin,
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(false);
  });

  it('rejects wrong version', () => {
    const event = new MessageEvent('message', {
      data: { type: 'zerofog:selected', sessionId, version: 999, payload: {} },
      origin,
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(false);
  });

  it('rejects non-object data', () => {
    const event = new MessageEvent('message', {
      data: 'not-an-object',
      origin,
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(false);
  });

  it('rejects messages without type', () => {
    const event = new MessageEvent('message', {
      data: { sessionId, version: MESSAGE_VERSION, payload: {} },
      origin,
    });
    expect(isValidPanelMessage(event, origin, sessionId)).toBe(false);
  });
});
