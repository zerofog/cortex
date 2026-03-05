import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { initNavBlocker } from '../../src/client/nav-blocker.js';

/**
 * Tests for the nav-blocker IIFE behavior via the exported initNavBlocker function.
 * These test the stateful browser logic (History patching, event listeners, etc.)
 * in a jsdom environment.
 */

const SESSION_ID = 'test-session-123';
const SIDECAR_ORIGIN = 'http://localhost:3100';

describe('initNavBlocker', () => {
  let handle: { teardown: () => void } | undefined;
  let origPushState: typeof History.prototype.pushState;
  let origReplaceState: typeof History.prototype.replaceState;

  beforeEach(() => {
    // Save originals before each test
    origPushState = History.prototype.pushState;
    origReplaceState = History.prototype.replaceState;
    // Reset __ZEROFOG__ to avoid cross-test teardown interference
    (window as any).__ZEROFOG__ = undefined;
    // Set a known location
    window.location.href = 'http://localhost:3000/app';
  });

  afterEach(() => {
    // Always teardown to restore History.prototype
    if (handle) {
      handle.teardown();
      handle = undefined;
    }
    // Ensure History.prototype is restored (safety net)
    if (History.prototype.pushState !== origPushState && !(History.prototype.pushState as any).__cortexNavBlocker) {
      History.prototype.pushState = origPushState;
    }
    if (History.prototype.replaceState !== origReplaceState && !(History.prototype.replaceState as any).__cortexNavBlocker) {
      History.prototype.replaceState = origReplaceState;
    }
  });

  function activate() {
    // Send structured enable message
    const event = new MessageEvent('message', {
      origin: SIDECAR_ORIGIN,
      data: { type: 'nav-blocker-enable', version: 1, sessionId: SESSION_ID },
    });
    window.dispatchEvent(event);
  }

  function deactivate() {
    const event = new MessageEvent('message', {
      origin: SIDECAR_ORIGIN,
      data: { type: 'nav-blocker-disable', version: 1, sessionId: SESSION_ID },
    });
    window.dispatchEvent(event);
  }

  // ── Basic blocking ──────────────────────────────────────────

  it('pushState to different route is blocked when active', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/other');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('pushState'));
    // Location should not have changed in the mock (jsdom limitation),
    // but the pushState should have been blocked (no call to original)
    spy.mockRestore();
  });

  it('pushState to same route is allowed', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/app?tab=1');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('replaceState to different route is blocked when active', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.replaceState(null, '', '/other');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('replaceState'));
    spy.mockRestore();
  });

  // ── currentUrl tracking (H5 fix) ───────────────────────────

  it('currentUrl updated after allowed navigation', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    // Push to same path (allowed)
    history.pushState(null, '', '/app#section');
    // This should update currentUrl — deactivate and reactivate won't help test directly,
    // but we verify no warnings were emitted for the allowed push
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/app?q=1');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── Structured message validation (M3 fix) ─────────────────

  it('structured message handler validates version and sessionId', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    // Wrong version — should be ignored
    window.dispatchEvent(new MessageEvent('message', {
      origin: SIDECAR_ORIGIN,
      data: { type: 'nav-blocker-enable', version: 2, sessionId: SESSION_ID },
    }));

    // Should not be active — pushState to different route should work
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/other-route');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects messages with wrong sessionId', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    window.dispatchEvent(new MessageEvent('message', {
      origin: SIDECAR_ORIGIN,
      data: { type: 'nav-blocker-enable', version: 1, sessionId: 'wrong-id' },
    }));

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/other');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects bare string messages (old format)', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    window.dispatchEvent(new MessageEvent('message', {
      origin: SIDECAR_ORIGIN,
      data: 'zerofog:nav-blocker-enable',
    }));

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/other');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── Click blocking ──────────────────────────────────────────

  it('blocks same-origin different-path anchor click when active', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const anchor = document.createElement('a');
    anchor.href = 'http://localhost:3000/other';
    document.body.appendChild(anchor);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const prevented = !anchor.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('click'));
    spy.mockRestore();
    document.body.removeChild(anchor);
  });

  it('does not block external/blank-target link', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const anchor = document.createElement('a');
    anchor.href = 'https://example.com/foo';
    anchor.target = '_blank';
    document.body.appendChild(anchor);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    document.body.removeChild(anchor);
  });

  // ── Teardown (M2 fix) ──────────────────────────────────────

  it('teardown removes listeners and restores History.prototype', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    // Teardown
    handle!.teardown();

    // pushState should no longer be wrapped
    expect((History.prototype.pushState as any).__cortexNavBlocker).toBeUndefined();
    expect((History.prototype.replaceState as any).__cortexNavBlocker).toBeUndefined();

    // Navigation should not be blocked after teardown
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/after-teardown');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    handle = undefined; // already torn down
  });

  it('double-init without teardown is blocked', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    // Remove teardown so the guard sees patches but no teardown function
    (window as any).__ZEROFOG__ = undefined;

    const handle2 = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    expect(handle2).toBeUndefined();
  });

  it('double-init with prior teardown does HMR-style replacement', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    // Second init sees __ZEROFOG__.teardownNavBlocker → tears down old, sets up new
    const handle2 = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    expect(handle2).toBeDefined();
    handle = handle2; // update for afterEach cleanup
  });

  it('teardown then re-init works cleanly', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    handle!.teardown();

    // Re-init after teardown should work
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    expect(handle).toBeDefined();
    activate();

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/blocked-again');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── H6: zerofog:navigation event dispatch ───────────────────

  it('dispatches zerofog:navigation after successful pushState to different route', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('zerofog:navigation', listener);

    // Navigate to a different pathname (from /app to /dashboard)
    history.pushState(null, '', '/dashboard?tab=1');

    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('zerofog:navigation');

    window.removeEventListener('zerofog:navigation', listener);
  });

  it('dispatches zerofog:navigation after successful replaceState to different route', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('zerofog:navigation', listener);

    // Navigate to a different pathname (from /app to /settings)
    history.replaceState(null, '', '/settings#section');

    expect(events.length).toBe(1);

    window.removeEventListener('zerofog:navigation', listener);
  });

  it('does NOT dispatch zerofog:navigation for same-pathname query/hash changes', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('zerofog:navigation', listener);

    // Same pathname (/app) with different query/hash — should NOT fire
    history.pushState(null, '', '/app?tab=1');
    history.replaceState(null, '', '/app#section');

    expect(events.length).toBe(0);

    window.removeEventListener('zerofog:navigation', listener);
  });

  it('does NOT dispatch zerofog:navigation when pushState is blocked', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
    activate();

    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('zerofog:navigation', listener);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    history.pushState(null, '', '/other');
    spy.mockRestore();

    // Blocked navigation should NOT dispatch zerofog:navigation
    expect(events.length).toBe(0);

    window.removeEventListener('zerofog:navigation', listener);
  });

  it('does NOT dispatch zerofog:navigation for hash-only or query-only changes', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('zerofog:navigation', listener);

    // Hash-only and query-only changes on same pathname should NOT fire navigation event
    history.pushState(null, '', '#section');
    history.replaceState(null, '', '?tab=2');
    history.pushState(null, '', '#other');

    expect(events.length).toBe(0);

    window.removeEventListener('zerofog:navigation', listener);
  });

  // ── Activation/deactivation toggle ──────────────────────────

  it('activation/deactivation via postMessage toggles blocking', () => {
    handle = initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Not active yet — navigation should work
    history.pushState(null, '', '/free');
    expect(spy).not.toHaveBeenCalled();

    // Activate
    activate();
    history.pushState(null, '', '/blocked');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();

    // Deactivate
    deactivate();
    history.pushState(null, '', '/free-again');
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
