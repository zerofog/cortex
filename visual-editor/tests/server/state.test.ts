import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StateManager,
  StateConflictError,
  IndexOutOfBoundsError,
  isFinalizePayload,
  isCompletionReport,
  isValidElementDiff,
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

  it('WAL contains valid AccumulatedDiff with SHA-256 checksum', async () => {
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    const raw = readFileSync(walPath, 'utf-8');
    const lastNewline = raw.lastIndexOf('\n');
    expect(lastNewline).toBeGreaterThan(0);
    const json = raw.substring(0, lastNewline);
    const storedChecksum = raw.substring(lastNewline + 1);
    // Verify checksum format and correctness
    expect(storedChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update(json).digest('hex')).toBe(storedChecksum);
    const parsed = JSON.parse(json) as AccumulatedDiff;
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

  it('rejects WAL with corrupted checksum', () => {
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
    const json = JSON.stringify(diff, null, 2);
    const badChecksum = '0'.repeat(64);
    writeFileSync(walPath, json + '\n' + badChecksum);
    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('idle');
    expect(existsSync(walPath)).toBe(false); // WAL was deleted
    fresh.dispose();
  });

  it('accepts legacy WAL without checksum', () => {
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
    writeFileSync(walPath, JSON.stringify(diff, null, 2));
    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('pending_diff');
    // Verify the diff content was loaded correctly
    const { diff: claimed } = fresh.claimDiff();
    expect(claimed.version).toBe(1);
    expect(claimed.elements).toHaveLength(diff.elements.length);
    expect(claimed.elements[0]!.elementSelector).toBe('[data-testid="test"]');
    fresh.dispose();
  });

  it('accepts WAL with valid checksum', () => {
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
    const json = JSON.stringify(diff, null, 2);
    const checksum = createHash('sha256').update(json).digest('hex');
    writeFileSync(walPath, json + '\n' + checksum);
    const fresh = new StateManager({ sessionId: 'test-session', walDir });
    fresh.recover();
    expect(fresh.getState()).toBe('pending_diff');
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

  // R9-5b: elementId edge cases validated by Number.isInteger
  it('rejects NaN elementId', () => {
    expect(isFinalizePayload({
      elementId: NaN, testId: 'btn', componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(false);
  });

  it('rejects negative elementId', () => {
    expect(isFinalizePayload({
      elementId: -1, testId: 'btn', componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(false);
  });

  it('rejects float elementId', () => {
    expect(isFinalizePayload({
      elementId: 1.5, testId: 'btn', componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(false);
  });

  it('rejects Infinity elementId', () => {
    expect(isFinalizePayload({
      elementId: Infinity, testId: 'btn', componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(false);
  });

  it('accepts elementId of 0', () => {
    expect(isFinalizePayload({
      elementId: 0, testId: 'btn', componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(true);
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
        previousToken: 'sm',
        previousCssValue: '8px',
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

  it('rejects reason with control characters', () => {
    expect(isCompletionReport({
      applied: [],
      failed: [{ index: 0, reason: 'bad\x00reason' }],
    })).toBe(false);
  });

  it('rejects reason > 1000 chars', () => {
    expect(isCompletionReport({
      applied: [],
      failed: [{ index: 0, reason: 'x'.repeat(1001) }],
    })).toBe(false);
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

  // H1: escapeAttrValue escapes ] to prevent attribute selector breakout
  it('escapes ] in testId for attribute selector safety', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    const diff = await sm.receiveDiff(makePayload({ testId: 'a]b' }));
    expect(diff.elements[0]!.elementSelector).toBe('[data-testid="a\\]b"]');
    sm.dispose();
  });

  // H11: Selector validation rejects unsafe characters
  it('receiveDiff rejects payload with unsafe selector (script injection)', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: '.foo { } body::after { content: "xss" }',
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(false);
  });

  it('receiveDiff rejects payload with excessively long selector', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: '.a'.repeat(300),
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(false);
  });

  it('receiveDiff accepts payload with valid CSS selector', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: '[data-testid="card-1"] > .inner',
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(true);
  });

  // H5: previousToken validation
  it('rejects change with invalid previousToken', () => {
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
        previousToken: 'xxl',
        previousCssValue: '8px',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });

  it('accepts change with null previousToken', () => {
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
        previousToken: null,
        previousCssValue: '',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(true);
  });

  it('rejects change with CSS injection in previousCssValue', () => {
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
        previousToken: 'sm',
        previousCssValue: '8px; background: url(evil)',
        styleOrigin: { origin: 'unknown' },
      }],
    })).toBe(false);
  });

  // M4: recovery rejects null metadata
  it('recovery stays idle on WAL with null metadata', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: null,
    }));
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    sm.dispose();
  });

  it('recovery stays idle on WAL with missing createdAt in metadata', () => {
    const walPath = join(walDir, 'pending-diff.json');
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { something: 'else' },
    }));
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    sm.dispose();
  });

  // H12: dispose with force deletes WAL even during pending_diff
  it('dispose({deleteWal:true, force:true}) removes WAL during pending_diff', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose({ deleteWal: true, force: true });
    expect(existsSync(walPath)).toBe(false);
  });

  // M3: StateConflictError kind field
  it('complete with wrong token has kind token-mismatch', async () => {
    expect.assertions(2);
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    sm.claimDiff();
    try {
      sm.complete({ applied: [0], failed: [] }, 'wrong-token');
    } catch (e) {
      expect(e).toBeInstanceOf(StateConflictError);
      expect((e as StateConflictError).kind).toBe('token-mismatch');
    }
    sm.dispose();
  });

  // H3: complete() with out-of-bounds index preserves original timeout for recovery
  it('complete with out-of-bounds index preserves original timeout for recovery', async () => {
    const onTimeout = vi.fn();
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100, onTimeout });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      const { claimToken } = sm.claimDiff();
      expect(() => sm.complete({ applied: [5], failed: [] }, claimToken))
        .toThrow(IndexOutOfBoundsError);
      // State stays processing immediately after the throw
      expect(sm.getState()).toBe('processing');
      // But the restarted timeout fires and auto-recovers to pending_diff
      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');
      expect(onTimeout).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
    sm.dispose();
  });

  // M3-R5: Repeated bad completions do not extend the timeout deadline
  it('repeated bad completions do not extend the timeout deadline', async () => {
    const onTimeout = vi.fn();
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 200, onTimeout });
    await sm.receiveDiff(makePayload());
    vi.useFakeTimers();
    try {
      const { claimToken } = sm.claimDiff();
      // Three bad completions at different offsets — none should extend the deadline
      vi.advanceTimersByTime(50);
      expect(() => sm.complete({ applied: [5], failed: [] }, claimToken))
        .toThrow(IndexOutOfBoundsError);
      vi.advanceTimersByTime(50);
      expect(() => sm.complete({ applied: [5], failed: [] }, claimToken))
        .toThrow(IndexOutOfBoundsError);
      vi.advanceTimersByTime(50);
      expect(() => sm.complete({ applied: [5], failed: [] }, claimToken))
        .toThrow(IndexOutOfBoundsError);
      // At t=199ms — still within the original 200ms deadline
      vi.advanceTimersByTime(49);
      expect(sm.getState()).toBe('processing');
      // At t=200ms — exactly at the original deadline
      vi.advanceTimersByTime(1);
      expect(sm.getState()).toBe('pending_diff');
      expect(onTimeout).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
    sm.dispose();
  });

  // R6-T2: complete() after timeout throws StateConflictError (state is pending_diff)
  it('complete after timeout throws StateConflictError (state is pending_diff)', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir, timeoutMs: 100 });
    await sm.receiveDiff(makePayload());
    expect.assertions(3);
    vi.useFakeTimers();
    try {
      const { claimToken } = sm.claimDiff();
      vi.advanceTimersByTime(100);
      expect(sm.getState()).toBe('pending_diff');
      try {
        sm.complete({ applied: [0], failed: [] }, claimToken);
      } catch (e) {
        expect(e).toBeInstanceOf(StateConflictError);
        expect((e as StateConflictError).currentState).toBe('pending_diff');
      }
    } finally {
      vi.useRealTimers();
    }
    sm.dispose();
  });

  // H4: complete() rejects partial coverage report
  it('complete rejects partial coverage report', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    const { claimToken } = sm.claimDiff();
    // Payload has 1 element but report covers 0 — incomplete
    expect(() => sm.complete({ applied: [], failed: [] }, claimToken))
      .toThrow(IndexOutOfBoundsError);
    sm.dispose();
  });

  // H4: multi-element partial coverage throws IndexOutOfBoundsError
  it('complete rejects partial coverage on multi-element diff', () => {
    // Use WAL recovery to create a 3-element diff (receiveDiff always creates 1-element)
    const walPath = join(walDir, 'pending-diff.json');
    const multiDiff: AccumulatedDiff = {
      version: 1,
      sessionId: 'test',
      elements: [
        { elementSelector: '[data-testid="a"]', componentChain: ['A'], elementType: 'div', changes: [] },
        { elementSelector: '[data-testid="b"]', componentChain: ['B'], elementType: 'span', changes: [] },
        { elementSelector: '[data-testid="c"]', componentChain: ['C'], elementType: 'p', changes: [] },
      ],
      metadata: { createdAt: new Date().toISOString() },
    };
    writeFileSync(walPath, JSON.stringify(multiDiff));
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('pending_diff');
    const { claimToken } = sm.claimDiff();
    // Only report 1 of 3 elements — should throw incomplete report
    expect(() => sm.complete({ applied: [0], failed: [] }, claimToken))
      .toThrow(IndexOutOfBoundsError);
    sm.dispose();
  });

  // M-duplicates: isCompletionReport rejects negative indices
  it('isCompletionReport rejects negative indices', () => {
    expect(isCompletionReport({ applied: [-1], failed: [] })).toBe(false);
  });

  // M-duplicates: isCompletionReport rejects duplicate applied indices
  it('isCompletionReport rejects duplicate applied indices', () => {
    expect(isCompletionReport({ applied: [0, 0], failed: [] })).toBe(false);
  });

  // M-duplicates: isCompletionReport rejects duplicate failed indices
  it('isCompletionReport rejects duplicate failed indices', () => {
    expect(isCompletionReport({
      applied: [],
      failed: [{ index: 0, reason: 'a' }, { index: 0, reason: 'b' }],
    })).toBe(false);
  });

  // M-lengths: isFinalizePayload rejects testId > 200 chars
  it('isFinalizePayload rejects testId > 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'x'.repeat(201),
      componentChain: ['A'],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  // M-lengths: isFinalizePayload rejects componentChain element > 200 chars
  it('isFinalizePayload rejects componentChain element > 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['x'.repeat(201)],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  // M-selector: SAFE_SELECTOR allows single-quoted attribute values
  it('receiveDiff accepts payload with single-quoted attribute selector', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: null,
      selector: "[data-testid='card-1'] > .inner",
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(true);
  });

  // M-staleness: recover() ignores WAL older than 24 hours
  it('recover ignores WAL older than 24 hours', () => {
    const walPath = join(walDir, 'pending-diff.json');
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: oldDate },
    }));
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    // WAL file should be deleted
    expect(existsSync(walPath)).toBe(false);
    sm.dispose();
  });

  // R9-5c: WAL recovery timestamp validation
  it('recover ignores WAL with unparseable createdAt', () => {
    const walPath = join(walDir, 'pending-diff.json');
    const json = JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: 'not-a-date' },
    });
    const checksum = createHash('sha256').update(json).digest('hex');
    writeFileSync(walPath, json + '\n' + checksum);
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    expect(existsSync(walPath)).toBe(false);
    sm.dispose();
  });

  it('recover ignores WAL with future createdAt', () => {
    const walPath = join(walDir, 'pending-diff.json');
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const json = JSON.stringify({
      version: 1,
      sessionId: 'test',
      elements: [{
        elementSelector: '[data-testid="x"]',
        componentChain: ['A'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: futureDate },
    });
    const checksum = createHash('sha256').update(json).digest('hex');
    writeFileSync(walPath, json + '\n' + checksum);
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.recover();
    expect(sm.getState()).toBe('idle');
    expect(existsSync(walPath)).toBe(false);
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

  // T2: Adversarial receiveDiff race — WAL written once
  it('concurrent receiveDiff calls — second one throws conflict', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    // First receiveDiff succeeds
    const first = sm.receiveDiff(makePayload());
    // Second immediate call should throw StateConflictError (state is already pending_diff)
    await expect(sm.receiveDiff(makePayload())).rejects.toThrow(StateConflictError);
    await first;
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose();
  });

  // T7: dispose({deleteWal:true}) during processing state without force
  it('dispose({deleteWal:true}) preserves WAL during processing state', async () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    await sm.receiveDiff(makePayload());
    sm.claimDiff(); // move to processing
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
    sm.dispose({ deleteWal: true }); // no force — WAL should survive
    expect(existsSync(walPath)).toBe(true);
  });

  // L17: isCompletionReport rejects overlapping applied/failed
  it('isCompletionReport rejects overlapping applied and failed indices', () => {
    expect(isCompletionReport({
      applied: [0, 1],
      failed: [{ index: 1, reason: 'conflict' }],
    })).toBe(false);
  });

  // M27: Field-level limits
  it('isFinalizePayload rejects componentChain > 50', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: Array(51).fill('A'),
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('isFinalizePayload rejects changes > 100', () => {
    const change = {
      property: 'padding', token: 'md', cssProperty: 'padding', cssValue: '16px',
      previousToken: 'sm', previousCssValue: '8px', styleOrigin: { origin: 'unknown' },
    };
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'button',
      changes: Array(101).fill(change),
    })).toBe(false);
  });

  it('isFinalizePayload rejects elementType > 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1,
      testId: 'btn',
      componentChain: ['A'],
      elementType: 'x'.repeat(201),
      changes: [],
    })).toBe(false);
  });
});

// ─── R9-5d: isValidElementDiff direct tests ─────────────────────

describe('isValidElementDiff', () => {
  const validChange = {
    property: 'padding', token: 'md', cssProperty: 'padding', cssValue: '16px',
    previousToken: 'sm', previousCssValue: '8px', styleOrigin: { origin: 'unknown' },
  };

  it('accepts valid element diff', () => {
    expect(isValidElementDiff({
      elementSelector: '[data-testid="x"]',
      componentChain: ['A'],
      elementType: 'button',
      changes: [validChange],
    })).toBe(true);
  });

  it('rejects elementSelector > 500 chars', () => {
    expect(isValidElementDiff({
      elementSelector: 'a'.repeat(501),
      componentChain: ['A'],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects elementSelector with injection characters', () => {
    expect(isValidElementDiff({
      elementSelector: '.foo { } body::after',
      componentChain: ['A'],
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects componentChain > 50 entries', () => {
    expect(isValidElementDiff({
      elementSelector: '.foo',
      componentChain: Array(51).fill('A'),
      elementType: 'button',
      changes: [],
    })).toBe(false);
  });

  it('rejects elementType > 200 chars', () => {
    expect(isValidElementDiff({
      elementSelector: '.foo',
      componentChain: ['A'],
      elementType: 'x'.repeat(201),
      changes: [],
    })).toBe(false);
  });

  it('rejects changes > 100 entries', () => {
    expect(isValidElementDiff({
      elementSelector: '.foo',
      componentChain: ['A'],
      elementType: 'button',
      changes: Array(101).fill(validChange),
    })).toBe(false);
  });

  it('rejects non-object and null', () => {
    expect(isValidElementDiff(null)).toBe(false);
    expect(isValidElementDiff('string')).toBe(false);
    expect(isValidElementDiff(42)).toBe(false);
  });
});

// ─── R9-6: Boundary acceptance tests (at exact limits) ──────────

describe('boundary acceptance (at exact limits)', () => {
  const validChange = {
    property: 'padding', token: 'md', cssProperty: 'padding', cssValue: '16px',
    previousToken: 'sm', previousCssValue: '8px', styleOrigin: { origin: 'unknown' },
  };

  it('isFinalizePayload accepts testId exactly 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: 'x'.repeat(200), componentChain: ['A'], elementType: 'button', changes: [],
    })).toBe(true);
  });

  it('isFinalizePayload accepts componentChain element exactly 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: 'btn', componentChain: ['x'.repeat(200)], elementType: 'button', changes: [],
    })).toBe(true);
  });

  it('isFinalizePayload accepts elementType exactly 200 chars', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: 'btn', componentChain: ['A'], elementType: 'x'.repeat(200), changes: [],
    })).toBe(true);
  });

  it('isFinalizePayload accepts componentChain exactly 50 elements', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: 'btn', componentChain: Array(50).fill('A'), elementType: 'button', changes: [],
    })).toBe(true);
  });

  it('isFinalizePayload accepts changes exactly 100 entries', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: 'btn', componentChain: ['A'], elementType: 'button',
      changes: Array(100).fill(validChange),
    })).toBe(true);
  });

  it('isCompletionReport accepts reason exactly 1000 chars', () => {
    expect(isCompletionReport({
      applied: [],
      failed: [{ index: 0, reason: 'x'.repeat(1000) }],
    })).toBe(true);
  });

  it('isFinalizePayload accepts selector exactly 500 chars', () => {
    expect(isFinalizePayload({
      elementId: 1, testId: null, selector: '.a'.repeat(250),
      componentChain: ['A'], elementType: 'div', changes: [],
    })).toBe(true);
  });

  it('isValidElementDiff accepts elementSelector exactly 500 chars', () => {
    expect(isValidElementDiff({
      elementSelector: '.a'.repeat(250),
      componentChain: ['A'],
      elementType: 'div',
      changes: [],
    })).toBe(true);
  });
});
