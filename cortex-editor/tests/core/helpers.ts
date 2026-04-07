import { oklchToHex } from '../../src/core/oklch.js'

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
