import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChangeEntry } from './client/toolbar.js';

// ─── Types ───────────────────────────────────────────────────────

export type MachineState = 'idle' | 'pending_diff' | 'processing';

export interface ElementDiff {
  elementSelector: string;
  componentChain: string[];
  elementType: string;
  changes: ChangeEntry[];
}

export interface AccumulatedDiff {
  version: 1;
  sessionId: string;
  elements: ElementDiff[];
  metadata: { createdAt: string };
}

export interface FinalizePayload {
  elementId: number;
  testId: string | null;
  componentChain: string[];
  elementType: string;
  changes: ChangeEntry[];
}

export interface CompletionReport {
  applied: number[];
  failed: { index: number; reason: string }[];
}

// ─── Runtime validators (trust-boundary guards) ─────────────────

export function isFinalizePayload(v: unknown): v is FinalizePayload {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.elementId === 'number' &&
    (obj.testId === null || typeof obj.testId === 'string') &&
    Array.isArray(obj.componentChain) &&
    obj.componentChain.every((c: unknown) => typeof c === 'string') &&
    typeof obj.elementType === 'string' &&
    Array.isArray(obj.changes)
  );
}

export function isCompletionReport(v: unknown): v is CompletionReport {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    Array.isArray(obj.applied) &&
    obj.applied.every((n: unknown) => typeof n === 'number') &&
    Array.isArray(obj.failed) &&
    obj.failed.every((f: unknown) =>
      typeof f === 'object' && f !== null &&
      typeof (f as Record<string, unknown>).index === 'number' &&
      typeof (f as Record<string, unknown>).reason === 'string'
    )
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function escapeAttrValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class StateConflictError extends Error {
  currentState: MachineState;
  attemptedTransition: string;

  constructor(currentState: MachineState, attemptedTransition: string) {
    super(`Cannot ${attemptedTransition} in state '${currentState}'`);
    Object.setPrototypeOf(this, StateConflictError.prototype);
    this.name = 'StateConflictError';
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}

// ─── StateManager ────────────────────────────────────────────────

export interface StateManagerOptions {
  sessionId: string;
  walDir: string;
  timeoutMs?: number;
  onTimeout?: () => void;
}

const WAL_FILENAME = 'pending-diff.json';
const DEFAULT_TIMEOUT_MS = 120_000;

function isValidElementDiff(el: unknown): el is ElementDiff {
  if (typeof el !== 'object' || el === null) return false;
  const obj = el as Record<string, unknown>;
  return (
    typeof obj.elementSelector === 'string' &&
    Array.isArray(obj.componentChain) &&
    typeof obj.elementType === 'string' &&
    Array.isArray(obj.changes)
  );
}

export class StateManager {
  private state: MachineState = 'idle';
  private diff: AccumulatedDiff | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private claimEpoch = 0;
  private readonly sessionId: string;
  private readonly walDir: string;
  private readonly walPath: string;
  private readonly walParentReal: string | null;
  private readonly timeoutMs: number;
  private readonly onTimeout?: () => void;

  constructor(options: StateManagerOptions) {
    this.sessionId = options.sessionId;
    this.walDir = options.walDir;
    this.walPath = join(options.walDir, WAL_FILENAME);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onTimeout = options.onTimeout;
    // Pre-resolve parent path for symlink check (null if dir doesn't exist yet)
    try { this.walParentReal = realpathSync(resolve(options.walDir, '..')); }
    catch { this.walParentReal = null; }
  }

  getState(): MachineState {
    return this.state;
  }

  getDiff(): Readonly<AccumulatedDiff> | null {
    return this.diff;
  }

  receiveDiff(payload: FinalizePayload): AccumulatedDiff {
    if (this.state !== 'idle') {
      throw new StateConflictError(this.state, 'receiveDiff');
    }

    const elementSelector = payload.testId
      ? `[data-testid="${escapeAttrValue(payload.testId)}"]`
      : 'unknown';

    const diff: AccumulatedDiff = {
      version: 1,
      sessionId: this.sessionId,
      elements: [{
        elementSelector,
        componentChain: payload.componentChain,
        elementType: payload.elementType,
        changes: payload.changes,
      }],
      metadata: { createdAt: new Date().toISOString() },
    };

    this.writeWal(diff);
    this.diff = diff;
    this.state = 'pending_diff';
    return diff;
  }

  /** Atomically persist diff to WAL, verifying no symlink escape. */
  private writeWal(diff: AccumulatedDiff): void {
    mkdirSync(this.walDir, { recursive: true });
    const realWalDir = realpathSync(this.walDir);
    const parentReal = this.walParentReal ?? realpathSync(resolve(this.walDir, '..'));
    if (!realWalDir.startsWith(parentReal)) {
      throw new Error(`WAL directory symlink escape detected: ${realWalDir}`);
    }
    const data = JSON.stringify(diff, null, 2);
    const tmpPath = this.walPath + '.tmp';
    const fd = openSync(tmpPath, 'w');
    try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmpPath, this.walPath);
  }

  claimDiff(): Readonly<AccumulatedDiff> {
    if (this.state !== 'pending_diff') {
      throw new StateConflictError(this.state, 'claimDiff');
    }

    this.state = 'processing';
    const capturedEpoch = ++this.claimEpoch;
    this.timeoutTimer = setTimeout(() => {
      if (this.claimEpoch !== capturedEpoch) return;
      this.state = 'pending_diff';
      this.onTimeout?.();
    }, this.timeoutMs);

    return this.diff!;
  }

  complete(report: CompletionReport): CompletionReport {
    if (this.state !== 'processing') {
      throw new StateConflictError(this.state, 'complete');
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    // Delete WAL
    try { unlinkSync(this.walPath); } catch { /* ignore if already gone */ }

    this.diff = null;
    this.state = 'idle';
    return report;
  }

  recover(): void {
    if (!existsSync(this.walPath)) {
      return; // No WAL — stay idle
    }

    try {
      const raw = readFileSync(this.walPath, 'utf-8');
      const parsed = JSON.parse(raw) as AccumulatedDiff;
      // Deep validation: version, elements shape, and sessionId update
      if (
        parsed.version === 1 &&
        Array.isArray(parsed.elements) &&
        parsed.elements.every(isValidElementDiff)
      ) {
        parsed.sessionId = this.sessionId;
        this.diff = parsed;
        this.state = 'pending_diff';
      }
      // Best-effort cleanup of stale .tmp files from atomic writes
      try {
        const tmpPath = this.walPath + '.tmp';
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch { /* ignore */ }
    } catch {
      console.warn('[cortex] Corrupt WAL file found, ignoring');
      // Stay idle
    }
  }

  dispose(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.state = 'idle';
    this.diff = null;
  }
}
