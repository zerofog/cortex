import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StateManager,
  StateConflictError,
  isFinalizePayload,
  isCompletionReport,
  type FinalizePayload,
  type AccumulatedDiff,
} from '../../src/state.js';

// ─── Test fixtures ──────────────────────────────────────────────

function makePayload(overrides?: Partial<FinalizePayload>): FinalizePayload {
  return {
    elementId: 1,
    testId: 'btn-submit',
    componentChain: ['Button', 'Form'],
    elementType: 'button',
    changes: [{
      property: 'padding',
      token: 'md',
      previousToken: 'sm',
      previousCssValue: '8px',
      cssProperty: 'padding',
      cssValue: '16px',
      styleOrigin: { origin: 'unknown' },
    }],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('StateManager', () => {
  let walDir: string;
  let sm: StateManager;

  beforeEach(() => {
    walDir = mkdtempSync(join(tmpdir(), 'cortex-state-'));
    sm = new StateManager({ sessionId: 'test-session', walDir });
  });

  afterEach(() => {
    sm.dispose();
    try { rmSync(walDir, { recursive: true }); } catch { /* ignore */ }
  });

  // ── Happy path ──────────────────────────────────────────────

  it('completes full cycle: idle → pending_diff → processing → idle', async () => {
    expect(sm.getState()).toBe('idle');

    const diff = await sm.receiveDiff(makePayload());
    expect(sm.getState()).toBe('pending_diff');
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);

    const { diff: claimed, claimToken } = sm.claimDiff();
    expect(sm.getState()).toBe('processing');
    expect(claimed).toBe(diff);

    const report = sm.complete({ applied: [0], failed: [] }, claimToken);
    expect(sm.getState()).toBe('idle');
    expect(report.applied).toEqual([0]);
  });

  // ── State guards ────────────────────────────────────────────

  it('rejects receiveDiff when pending_diff', async () => {
    await sm.receiveDiff(makePayload());
    await expect(sm.receiveDiff(makePayload())).rejects.toThrowError(
      expect.objectContaining({ currentState: 'pending_diff' })
    );
  });

  it('rejects receiveDiff when processing', async () => {
    await sm.receiveDiff(makePayload());
    sm.claimDiff(); // destructuring not needed — we only care about the state guard
    await expect(sm.receiveDiff(makePayload())).rejects.toThrowError(
      expect.objectContaining({ currentState: 'processing' })
    );
  });

  // Phase 6: Concurrent receiveDiff race test
  it('rejects concurrent receiveDiff calls', async () => {
    const [r1, r2] = await Promise.allSettled([
      sm.receiveDiff(makePayload()),
      sm.receiveDiff(makePayload()),
    ]);
    const settled = [r1, r2];
    expect(settled.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(r => r.status === 'rejected')).toHaveLength(1);
  });

  it('rejects claimDiff when idle', () => {
    expect(() => sm.claimDiff()).toThrow(StateConflictError);
  });

  it('rejects complete when not processing', () => {
    expect(() => sm.complete({ applied: [], failed: [] }, 'any-token')).toThrow(StateConflictError);
  });

  // ── WAL persistence ─────────────────────────────────────────

  it('writes WAL file on receiveDiff', async () => {
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
  });

  it('deletes WAL file on complete', async () => {
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    sm.complete({ applied: [0], failed: [] }, claimToken);
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(false);
  });

  it('WAL contains valid AccumulatedDiff', async () => {
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    const raw = readFileSync(walPath, 'utf-8');
    const parsed = JSON.parse(raw) as AccumulatedDiff;
    expect(parsed.version).toBe(1);
    expect(parsed.sessionId).toBe('test-session');
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.elements[0]!.elementSelector).toBe('[data-testid="btn-submit"]');
    expect(parsed.metadata.createdAt).toBeTruthy();
  });

  // ── Timeout ─────────────────────────────────────────────────

  it('timeout reverts processing → pending_diff', async () => {
    sm.dispose();
    sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff(); // token not needed — testing timeout behavior
      expect(sm.getState()).toBe('processing');

      vi.advanceTimersByTime(120_000);
      expect(sm.getState()).toBe('pending_diff');
    } finally {
      vi.useRealTimers();
    }
  });

  it('onTimeout callback fires on timeout', async () => {
    const onTimeout = vi.fn();
    sm.dispose();
    sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000, onTimeout });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff(); // token not needed — testing timeout callback

      vi.advanceTimersByTime(120_000);
      expect(onTimeout).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout is cleared on complete (no revert)', async () => {
    sm.dispose();
    sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      const { claimToken } = sm.claimDiff();
      sm.complete({ applied: [0], failed: [] }, claimToken);

      vi.advanceTimersByTime(120_000);
      expect(sm.getState()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fencing token prevents stale timeout from reverting', async () => {
    sm.dispose();
    sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
    // First cycle: receiveDiff → claim → complete
    await sm.receiveDiff(makePayload());
    const { claimToken: token1 } = sm.claimDiff();
    sm.complete({ applied: [0], failed: [] }, token1);

    // Second cycle: new receiveDiff → claim
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff(); // token not needed — testing epoch fencing
      expect(sm.getState()).toBe('processing');

      // Advance past the first timeout period — stale callback should be fenced off
      vi.advanceTimersByTime(120_000);
      // Should still be pending_diff from the second timeout, not the stale first
      expect(sm.getState()).toBe('pending_diff');
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Recovery ────────────────────────────────────────────────

  it('recovers state from existing WAL', () => {
    // Write WAL manually
    const walPath = join(walDir, 'pending-diff.json');
    const diff: AccumulatedDiff = {
      version: 1,
      sessionId: 'test-session',
      elements: [{
        elementSelector: '[data-testid="test"]',
        componentChain: ['Button'],
        elementType: 'button',
        changes: [],
      }],
      metadata: { createdAt: new Date().toISOString() },
    };
    writeFileSync(walPath, JSON.stringify(diff));

    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('pending_diff');
    expect(fresh.getDiff()).not.toBeNull();
    expect(fresh.getDiff()!.elements[0]!.elementSelector).toBe('[data-testid="test"]');
    // Verify full cycle works on recovered state
    const { claimToken } = fresh.claimDiff();
    fresh.complete({ applied: [0], failed: [] }, claimToken);
    expect(fresh.getState()).toBe('idle');
    fresh.dispose();
  });

  it('stays idle when no WAL exists', () => {
    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('idle');
    fresh.dispose();
  });

  it('stays idle on corrupt WAL (no crash)', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, 'not valid json {{{{');

    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('idle');
    fresh.dispose();
  });

  // ── Element selector ────────────────────────────────────────

  it('uses "unknown" selector when testId is null', async () => {
    const diff = await sm.receiveDiff(makePayload({ testId: null }));
    expect(diff.elements[0]!.elementSelector).toBe('unknown');
  });

  // ── M15: testId escaping ───────────────────────────────────

  it('escapes quotes and backslashes in testId', async () => {
    const diff = await sm.receiveDiff(makePayload({ testId: 'a"b\\c' }));
    expect(diff.elements[0]!.elementSelector).toBe('[data-testid="a\\"b\\\\c"]');
  });
});

// ─── Runtime validators ───────────────────────────────────────────

describe('isFinalizePayload', () => {
  it('accepts valid payload', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [],
    })).toBe(true);
  });

  it('accepts null testId', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      componentChain: [],
      elementType: 'div',
      changes: [],
    })).toBe(true);
  });

  it('rejects string elementId', () => {
    expect(isFinalizePayload({
      elementId: 'el-1',
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects missing componentChain', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects non-string items in componentChain', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: [123],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects null', () => {
    expect(isFinalizePayload(null)).toBe(false);
  });

  it('rejects primitives', () => {
    expect(isFinalizePayload('string')).toBe(false);
    expect(isFinalizePayload(42)).toBe(false);
  });

  it('accepts payload with optional selector string', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: '.my-selector',
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(true);
  });

  it('rejects payload with non-string selector', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: 123,
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(false);
  });

  // H2: CSS value validation in change entries
  it('accepts valid change entry with allowed values', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        cssProperty: 'padding',
        cssValue: '16px',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(true);
  });

  it('rejects change with disallowed cssProperty', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        cssProperty: 'position',
        cssValue: 'absolute',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });

  it('rejects change with disallowed token', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'xxl',
        cssProperty: 'padding',
        cssValue: '32px',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });

  it('rejects change with disallowed origin', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        cssProperty: 'padding',
        cssValue: '16px',
        styleOrigin: { origin: 'evil-origin' },
      }],
    })).toBe(false);
  });

  it('rejects change with CSS injection in cssValue', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        cssProperty: 'padding',
        cssValue: '16px; background: url(http://evil.com)',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });

  it('rejects change with excessively long cssValue', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        cssProperty: 'padding',
        cssValue: 'a'.repeat(201),
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });
});

describe('isCompletionReport', () => {
  it('accepts valid report', () => {
    expect(isCompletionReport({
      applied: [0, 1],
      failed: [{ index: 2, reason: 'not found' }],
    })).toBe(true);
  });

  it('accepts empty arrays', () => {
    expect(isCompletionReport({ applied: [], failed: [] })).toBe(true);
  });

  it('rejects non-number in applied', () => {
    expect(isCompletionReport({ applied: ['0'], failed: [] })).toBe(false);
  });

  it('rejects missing reason in failed', () => {
    expect(isCompletionReport({ applied: [], failed: [{ index: 0 }] })).toBe(false);
  });

  it('rejects non-object failed items', () => {
    expect(isCompletionReport({ applied: [], failed: ['bad'] })).toBe(false);
  });

  it('rejects NaN in applied', () => {
    expect(isCompletionReport({ applied: [NaN], failed: [] })).toBe(false);
  });

  it('rejects Infinity in applied', () => {
    expect(isCompletionReport({ applied: [Infinity], failed: [] })).toBe(false);
  });

  it('rejects float in applied', () => {
    expect(isCompletionReport({ applied: [1.5], failed: [] })).toBe(false);
  });

  it('rejects NaN index in failed', () => {
    expect(isCompletionReport({ applied: [], failed: [{ index: NaN, reason: 'bad' }] })).toBe(false);
  });

  it('rejects null', () => {
    expect(isCompletionReport(null)).toBe(false);
  });
});

// ─── WU2: State Machine Hardening tests ───────────────────────────

describe('StateManager hardening', () => {
  let walDir: string;

  beforeEach(() => {
    walDir = mkdtempSync(join(tmpdir(), 'cortex-state-h-'));
  });

  afterEach(() => {
    try { rmSync(walDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('dispose resets state to idle and clears diff', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    expect(sm.getState()).toBe('pending_diff');
    expect(sm.getDiff()).not.toBeNull();

    sm.dispose();
    expect(sm.getState()).toBe('idle');
    expect(sm.getDiff()).toBeNull();
  });

  it('recovery updates sessionId to current session', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'old-session',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: new Date().toISOString() },
    }));

    const sm = new StateManager({ sessionId: 'new-session', walDir });
    sm.recover();
    expect(sm.getState()).toBe('pending_diff');
    expect(sm.getDiff()!.sessionId).toBe('new-session');
    sm.dispose();
  });

  it('recovery rejects WAL with invalid CSS property in changes', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [{
          property: 'padding',
          token: 'md',
          cssProperty: 'position',  // disallowed CSS property
          cssValue: 'absolute',
          styleOrigin: { origin: 'unknown' },
        }],
      }],
      metadata: { createdAt: new Date().toISOString() },
    }));

    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    sm.dispose();
  });

  it('recovery rejects WAL with invalid token in changes', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [{
          property: 'padding',
          token: 'xxl',  // disallowed token
          cssProperty: 'padding',
          cssValue: '16px',
          styleOrigin: { origin: 'unknown' },
        }],
      }],
      metadata: { createdAt: new Date().toISOString() },
    }));

    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    sm.dispose();
  });

  it('recovery with invalid element shape stays idle', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{ bad: true }],
      metadata: { createdAt: new Date().toISOString() },
    }));

    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    sm.dispose();
  });

  it('recovery cleans up stale .tmp files', () => {
    const walPath = join(walDir, 'pending-diff.json');
    const tmpPath = walPath + '.tmp';
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: new Date().toISOString() },
    }));
    writeFileSync(tmpPath, 'stale tmp data');

    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('pending_diff');
    expect(existsSync(tmpPath)).toBe(false);
    sm.dispose();
  });

  // C1: Claim token tests
  it('complete with wrong claimToken throws StateConflictError', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    sm.claimDiff(); // generate real token
    expect(() => sm.complete({ applied: [0], failed: [] }, 'wrong-token'))
      .toThrow(StateConflictError);
    sm.dispose();
  });

  it('timeout clears claimedDiffHash — re-claim of same diff succeeds (H1 deadlock fix)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff();

      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');

      // H1: Re-claim of same diff should succeed after timeout (deadlock fix)
      const { claimToken } = sm.claimDiff();
      expect(sm.getState()).toBe('processing');
      sm.complete({ applied: [0], failed: [] }, claimToken);
      sm.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  // H8: Index bounds validation
  it('complete with out-of-bounds applied index throws RangeError', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    expect(() => sm.complete({ applied: [5], failed: [] }, claimToken))
      .toThrow(RangeError);
    sm.dispose();
  });

  it('complete with out-of-bounds failed index throws RangeError', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    expect(() => sm.complete({ applied: [], failed: [{ index: -1, reason: 'bad' }] }, claimToken))
      .toThrow(RangeError);
    sm.dispose();
  });

  it('complete with negative applied index throws RangeError', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    expect(() => sm.complete({ applied: [-1], failed: [] }, claimToken))
      .toThrow(RangeError);
    sm.dispose();
  });

  // H7: dispose({deleteWal:true}) removes WAL file only when idle
  it('dispose({deleteWal:true}) removes WAL file when idle', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);

    // Complete the cycle to return to idle
    const { claimToken } = sm.claimDiff();
    sm.complete({ applied: [0], failed: [] }, claimToken);
    // Re-create WAL for the idle deletion test
    await sm.receiveDiff(makePayload());
    expect(existsSync(walPath)).toBe(true);
    const { claimToken: ct2 } = sm.claimDiff();
    sm.complete({ applied: [0], failed: [] }, ct2);

    // Now in idle — deleteWal should work
    // Manually write a leftover WAL to verify cleanup
    const { writeFileSync } = await import('node:fs');
    writeFileSync(walPath, '{}');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose({ deleteWal: true });
    expect(existsSync(walPath)).toBe(false);
  });

  it('dispose({deleteWal:true}) preserves WAL when pending_diff (for recovery)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose({ deleteWal: true });
    // WAL should survive for crash recovery
    expect(existsSync(walPath)).toBe(true);
  });

  it('dispose() without deleteWal preserves WAL file', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose();
    expect(existsSync(walPath)).toBe(true);
  });

  // H1: After timeout, re-claim succeeds (deadlock fix clears claimedDiffHash)
  it('re-claim of same diff after timeout succeeds (H1 deadlock fix)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff(); // first claim stores diff hash

      // Timeout fires — reverts to pending_diff and clears claimedDiffHash
      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');

      // H1: Re-claim succeeds — no deadlock
      const { claimToken } = sm.claimDiff();
      expect(sm.getState()).toBe('processing');
      sm.complete({ applied: [0], failed: [] }, claimToken);
      sm.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows claim of same diff after successful complete (fresh cycle)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    sm.complete({ applied: [0], failed: [] }, claimToken);

    // Submit the SAME diff again — complete() clears the hash, so this is a fresh cycle
    await sm.receiveDiff(makePayload());
    const { claimToken: token2 } = sm.claimDiff();
    expect(sm.getState()).toBe('processing');
    sm.complete({ applied: [0], failed: [] }, token2);
    sm.dispose();
  });

  it('timeout clears claimedDiffHash — re-claim of same diff succeeds (H1 deadlock fix)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff();
      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');
      // After timeout, re-claim of same diff should succeed (deadlock fix)
      const { claimToken } = sm.claimDiff();
      expect(sm.getState()).toBe('processing');
      sm.complete({ applied: [0], failed: [] }, claimToken);
      sm.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows claim of a DIFFERENT diff after timeout', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      sm.claimDiff();

      // Timeout fires
      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');
      // Force reset for new diff
      sm.dispose();
    } finally {
      vi.useRealTimers();
    }

    // Submit a different diff
    const sm2 = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm2.receiveDiff(makePayload({ testId: 'different-element' }));
    const { claimToken } = sm2.claimDiff();
    expect(sm2.getState()).toBe('processing');
    sm2.complete({ applied: [0], failed: [] }, claimToken);
    sm2.dispose();
  });

  // C5-server: selector field in FinalizePayload
  it('uses selector field when provided instead of testId', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    const diff = await sm.receiveDiff(makePayload({
      testId: 'btn-submit',
      selector: '.my-custom-selector',
    } as Partial<FinalizePayload>));
    expect(diff.elements[0]!.elementSelector).toBe('.my-custom-selector');
    sm.dispose();
  });

  it('falls back to testId selector when selector not provided', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    const diff = await sm.receiveDiff(makePayload({ testId: 'btn-submit' }));
    expect(diff.elements[0]!.elementSelector).toBe('[data-testid="btn-submit"]');
    sm.dispose();
  });

  // H1: Async WAL rollback on write failure
  it('receiveDiff rolls back state to idle on WAL write failure', async () => {
    // Use a non-existent path nested under a file (not a directory) to trigger write failure
    const badWalDir = join(walDir, 'pending-diff.json', 'impossible');
    // Create the file that blocks mkdir
    writeFileSync(join(walDir, 'pending-diff.json'), 'not a dir');

    const sm = new StateManager({ sessionId: 'test', walDir: badWalDir });
    await expect(sm.receiveDiff(makePayload())).rejects.toThrow();
    expect(sm.getState()).toBe('idle');
    expect(sm.getDiff()).toBeNull();
    sm.dispose();
  });
});
