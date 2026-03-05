import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, unlinkSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { open, mkdir, rename, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ChangeEntry } from './client/toolbar.js';
import {
  ALLOWED_CSS_PROPERTIES,
  ALLOWED_TOKENS,
  ALLOWED_ORIGINS,
  CSS_VALUE_UNSAFE,
  CSS_VALUE_MAX_LENGTH,
} from './validation.js';

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
  selector?: string;
  componentChain: string[];
  elementType: string;
  changes: ChangeEntry[];
}

export interface CompletionReport {
  applied: number[];
  failed: { index: number; reason: string }[];
}

// ─── Runtime validators (trust-boundary guards) ─────────────────

function isValidChangeEntry(c: unknown): boolean {
  if (typeof c !== 'object' || c === null) return false;
  const e = c as Record<string, unknown>;
  if (
    typeof e.property !== 'string' ||
    typeof e.token !== 'string' ||
    typeof e.cssProperty !== 'string' ||
    typeof e.cssValue !== 'string' ||
    typeof e.styleOrigin !== 'object' || e.styleOrigin === null
  ) return false;

  // H2: Validate values against allowlists (not just types)
  if (!ALLOWED_CSS_PROPERTIES.has(e.cssProperty as string)) return false;
  if (!ALLOWED_TOKENS.has(e.token as string)) return false;
  const origin = (e.styleOrigin as Record<string, unknown>).origin;
  if (typeof origin !== 'string' || !ALLOWED_ORIGINS.has(origin)) return false;
  const cssValue = e.cssValue as string;
  if (cssValue.length > CSS_VALUE_MAX_LENGTH || CSS_VALUE_UNSAFE.test(cssValue)) return false;

  return true;
}

export function isFinalizePayload(v: unknown): v is FinalizePayload {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.elementId === 'number' &&
    (obj.testId === null || typeof obj.testId === 'string') &&
    (!('selector' in obj) || typeof obj.selector === 'string') &&
    Array.isArray(obj.componentChain) &&
    obj.componentChain.every((c: unknown) => typeof c === 'string') &&
    typeof obj.elementType === 'string' &&
    Array.isArray(obj.changes) &&
    obj.changes.every(isValidChangeEntry)
  );
}

export function isCompletionReport(v: unknown): v is CompletionReport {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    Array.isArray(obj.applied) &&
    obj.applied.every((n: unknown) => Number.isInteger(n)) &&
    Array.isArray(obj.failed) &&
    obj.failed.every((f: unknown) =>
      typeof f === 'object' && f !== null &&
      Number.isInteger((f as Record<string, unknown>).index) &&
      typeof (f as Record<string, unknown>).reason === 'string'
    )
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function escapeAttrValue(s: string): string {
  return s.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
    obj.componentChain.every((c: unknown) => typeof c === 'string') &&
    typeof obj.elementType === 'string' &&
    Array.isArray(obj.changes) &&
    obj.changes.every(isValidChangeEntry)
  );
}

export class StateManager {
  private state: MachineState = 'idle';
  private diff: AccumulatedDiff | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private claimEpoch = 0;
  private claimToken: string | null = null;
  private claimedDiffHash: string | null = null;
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

  async receiveDiff(payload: FinalizePayload): Promise<AccumulatedDiff> {
    if (this.state !== 'idle') {
      throw new StateConflictError(this.state, 'receiveDiff');
    }

    const elementSelector = payload.selector
      ?? (payload.testId
        ? `[data-testid="${escapeAttrValue(payload.testId)}"]`
        : 'unknown');

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

    // Set state synchronously to prevent concurrent receiveDiff calls
    this.state = 'pending_diff';
    this.diff = diff;
    try {
      await this.writeWal(diff);
    } catch (err) {
      // Rollback on write failure
      this.state = 'idle';
      this.diff = null;
      throw err;
    }
    return diff;
  }

  /** Atomically persist diff to WAL, verifying no symlink escape. */
  private async writeWal(diff: AccumulatedDiff): Promise<void> {
    await mkdir(this.walDir, { recursive: true });
    const realWalDir = await realpath(this.walDir);
    const parentReal = this.walParentReal ?? await realpath(resolve(this.walDir, '..'));
    if (!realWalDir.startsWith(parentReal + sep) && realWalDir !== parentReal) {
      throw new Error(`WAL directory symlink escape detected: ${realWalDir}`);
    }
    const data = JSON.stringify(diff, null, 2);
    const tmpPath = this.walPath + '.tmp';
    const fh = await open(tmpPath, 'w');
    try { await fh.writeFile(data); await fh.datasync(); } finally { await fh.close(); }
    await rename(tmpPath, this.walPath);
    // Datasync directory to ensure rename is durable across crash/power-loss
    const dirFh = await open(realWalDir, 'r');
    try { await dirFh.datasync(); } finally { await dirFh.close(); }
  }

  claimDiff(): { diff: Readonly<AccumulatedDiff>; claimToken: string } {
    if (this.state !== 'pending_diff') {
      throw new StateConflictError(this.state, 'claimDiff');
    }

    // Invariant: diff must exist in pending_diff state (set by receiveDiff/recover)
    if (!this.diff) throw new Error('invariant: diff is null in pending_diff state');

    // C1: Idempotency guard — reject re-claim of an already-claimed diff.
    // After timeout→re-claim, the original claimer may have already applied source edits.
    // Hashing the elements prevents double-application of the same edits.
    const diffHash = createHash('sha256').update(JSON.stringify(this.diff.elements)).digest('hex');
    if (this.claimedDiffHash === diffHash) {
      throw new StateConflictError(this.state, 'claimDiff (already claimed)');
    }

    this.state = 'processing';
    this.claimedDiffHash = diffHash;
    const token = randomUUID();
    this.claimToken = token;
    const capturedEpoch = ++this.claimEpoch;
    this.timeoutTimer = setTimeout(() => {
      if (this.claimEpoch !== capturedEpoch) return;
      this.claimToken = null;
      this.claimedDiffHash = null;
      this.state = 'pending_diff';
      this.onTimeout?.();
    }, this.timeoutMs);

    return { diff: this.diff, claimToken: token };
  }

  complete(report: CompletionReport, claimToken: string): CompletionReport {
    if (this.state !== 'processing') {
      throw new StateConflictError(this.state, 'complete');
    }
    if (this.claimToken !== claimToken) {
      throw new StateConflictError(this.state, 'complete (token mismatch)');
    }

    // Invariant: diff must exist in processing state (set by receiveDiff, guarded by claimDiff)
    if (!this.diff) throw new Error('invariant: diff is null in processing state');

    // H8: Validate report indices against diff bounds
    const maxIdx = this.diff.elements.length - 1;
    for (const idx of report.applied) {
      if (idx < 0 || idx > maxIdx) throw new RangeError(`applied index ${idx} out of bounds (0-${maxIdx})`);
    }
    for (const { index: idx } of report.failed) {
      if (idx < 0 || idx > maxIdx) throw new RangeError(`failed index ${idx} out of bounds (0-${maxIdx})`);
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    // C1: Clear claimedDiffHash on successful completion to allow new cycles
    this.claimedDiffHash = null;

    // Delete WAL
    try { unlinkSync(this.walPath); } catch { /* ignore if already gone */ }

    this.claimToken = null;
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

  dispose(opts?: { deleteWal?: boolean }): void {
    // Only delete WAL when idle — pending_diff/processing WAL should survive for recovery
    if (opts?.deleteWal && this.state === 'idle') {
      try { unlinkSync(this.walPath); } catch { /* ignore */ }
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.claimToken = null;
    this.claimedDiffHash = null;
    this.state = 'idle';
    this.diff = null;
  }
}
