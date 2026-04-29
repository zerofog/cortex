import { oklchToHex } from '../../src/core/oklch.js'
import type { PendingEdit } from '../../src/adapters/types.js'

/**
 * Simulate browser RGB using the same oklchToHex as production.
 * Self-referential by design: tests pipeline wiring, not converter accuracy.
 * Converter accuracy is validated independently in oklch.test.ts.
 */
export function oklchToRgb(oklch: string): string {
  const hex = oklchToHex(oklch)!
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Build a PendingEdit with stable defaults for tests. Override any field by
 * passing it in `overrides`. Centralized here so PendingEdit shape changes
 * don't require updating multiple identical copies across test files.
 *
 * Default intentId is fixed (not random) so test failure messages are stable;
 * tests that need uniqueness should override it explicitly.
 */
export function makeEdit(overrides: Partial<PendingEdit> = {}): PendingEdit {
  return {
    intentId: 'test-intent-1',
    source: 'src/Hero.tsx:5:3',
    property: 'color',
    value: 'red',
    previousValue: 'blue',
    timestamp: 1000,
    ...overrides,
  }
}
