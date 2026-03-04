import { describe, expect, it, beforeEach } from 'vitest';
import {
  isDifferentRoute,
  shouldBlockAnchor,
} from '../../src/client/nav-blocker.js';

/**
 * Tests for the navigation blocker's pure functions.
 *
 * The nav-blocker is an ES5 browser script with ESM exports for testing.
 * Pure functions (isDifferentRoute, shouldBlockAnchor) are exported;
 * the browser IIFE is inert in test environments (template guard).
 */

// ── isDifferentRoute ─────────────────────────────────────────────

describe('isDifferentRoute', () => {
  beforeEach(() => {
    window.location.href = 'http://localhost:3000/foo';
  });

  it('returns true for a different pathname', () => {
    expect(isDifferentRoute('http://localhost:3000/bar')).toBe(true);
  });

  it('returns false for the same pathname', () => {
    expect(isDifferentRoute('http://localhost:3000/foo')).toBe(false);
  });

  it('returns false for a hash-only change', () => {
    expect(isDifferentRoute('http://localhost:3000/foo#section-a')).toBe(false);
    expect(isDifferentRoute('http://localhost:3000/foo#section-b')).toBe(false);
  });

  it('returns false for a query-only change', () => {
    expect(isDifferentRoute('http://localhost:3000/foo?a=1')).toBe(false);
    expect(isDifferentRoute('http://localhost:3000/foo?b=2')).toBe(false);
  });

  it('resolves relative paths against current location', () => {
    expect(isDifferentRoute('/bar')).toBe(true);
    expect(isDifferentRoute('/foo')).toBe(false);
  });
});

// ── shouldBlockAnchor ────────────────────────────────────────────

describe('shouldBlockAnchor', () => {
  beforeEach(() => {
    window.location.href = 'http://localhost:3000/foo';
  });

  it('returns true for same-origin, different-path link', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://localhost:3000/bar';
    expect(shouldBlockAnchor(anchor)).toBe(true);
  });

  it('returns false for external link (different origin)', () => {
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com/bar';
    expect(shouldBlockAnchor(anchor)).toBe(false);
  });

  it('returns false for target="_blank"', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://localhost:3000/bar';
    anchor.target = '_blank';
    expect(shouldBlockAnchor(anchor)).toBe(false);
  });

  it('returns false for same path (modals, dropdowns)', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://localhost:3000/foo';
    expect(shouldBlockAnchor(anchor)).toBe(false);
  });

  it('returns false for same path with hash', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://localhost:3000/foo#modal';
    expect(shouldBlockAnchor(anchor)).toBe(false);
  });
});
