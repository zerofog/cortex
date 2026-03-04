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

  it('completes full cycle: idle → pending_diff → processing → idle', () => {
    expect(sm.getState()).toBe('idle');

    const diff = sm.receiveDiff(makePayload());
    expect(sm.getState()).toBe('pending_diff');
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);

    const claimed = sm.claimDiff();
    expect(sm.getState()).toBe('processing');
    expect(claimed).toBe(diff);

    const report = sm.complete({ applied: [0], failed: [] });
    expect(sm.getState()).toBe('idle');
    expect(report.applied).toEqual([0]);
  });

  // ── State guards ────────────────────────────────────────────

  it('rejects receiveDiff when pending_diff', () => {
    sm.receiveDiff(makePayload());
    expect(() => sm.receiveDiff(makePayload())).toThrowError(
      expect.objectContaining({ currentState: 'pending_diff' })
    );
  });

  it('rejects receiveDiff when processing', () => {
    sm.receiveDiff(makePayload());
    sm.claimDiff();
    expect(() => sm.receiveDiff(makePayload())).toThrowError(
      expect.objectContaining({ currentState: 'processing' })
    );
  });

  it('rejects claimDiff when idle', () => {
    expect(() => sm.claimDiff()).toThrow(StateConflictError);
  });

  it('rejects complete when not processing', () => {
    expect(() => sm.complete({ applied: [], failed: [] })).toThrow(StateConflictError);
  });

  // ── WAL persistence ─────────────────────────────────────────

  it('writes WAL file on receiveDiff', () => {
    sm.receiveDiff(makePayload());
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(true);
  });

  it('deletes WAL file on complete', () => {
    sm.receiveDiff(makePayload());
    sm.claimDiff();
    sm.complete({ applied: [0], failed: [] });
    const walPath = join(walDir, 'pending-diff.json');
    expect(existsSync(walPath)).toBe(false);
  });

  it('WAL contains valid AccumulatedDiff', () => {
    sm.receiveDiff(makePayload());
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

  it('timeout reverts processing → pending_diff', () => {
    vi.useFakeTimers();
    try {
      sm.dispose();
      sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
      sm.receiveDiff(makePayload());
      sm.claimDiff();
      expect(sm.getState()).toBe('processing');

      vi.advanceTimersByTime(120_000);
      expect(sm.getState()).toBe('pending_diff');
    } finally {
      vi.useRealTimers();
    }
  });

  it('onTimeout callback fires on timeout', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    try {
      sm.dispose();
      sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000, onTimeout });
      sm.receiveDiff(makePayload());
      sm.claimDiff();

      vi.advanceTimersByTime(120_000);
      expect(onTimeout).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout is cleared on complete (no revert)', () => {
    vi.useFakeTimers();
    try {
      sm.dispose();
      sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
      sm.receiveDiff(makePayload());
      sm.claimDiff();
      sm.complete({ applied: [0], failed: [] });

      vi.advanceTimersByTime(120_000);
      expect(sm.getState()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fencing token prevents stale timeout from reverting', () => {
    vi.useFakeTimers();
    try {
      sm.dispose();
      sm = new StateManager({ sessionId: 'test-session', walDir, timeoutMs: 120_000 });
      // First cycle: receiveDiff → claim → timeout pending
      sm.receiveDiff(makePayload());
      sm.claimDiff();
      // Complete before timeout fires (clears timer, but tests the epoch guard)
      sm.complete({ applied: [0], failed: [] });

      // Second cycle: new receiveDiff → claim
      sm.receiveDiff(makePayload());
      sm.claimDiff();
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

  it('uses "unknown" selector when testId is null', () => {
    const diff = sm.receiveDiff(makePayload({ testId: null }));
    expect(diff.elements[0]!.elementSelector).toBe('unknown');
  });

  // ── M15: testId escaping ───────────────────────────────────

  it('escapes quotes and backslashes in testId', () => {
    const diff = sm.receiveDiff(makePayload({ testId: 'a"b\\c' }));
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

  it('dispose resets state to idle and clears diff', () => {
    const sm = new StateManager({ sessionId: 'test', walDir });
    sm.receiveDiff(makePayload());
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
});
