/**
 * OKLCH → sRGB hex conversion with CSS Color Level 4 gamut mapping.
 *
 * Pipeline: OKLCH → OKLab → LMS (cube root) → linear sRGB → gamut map → sRGB (gamma) → hex
 *
 * When the OKLCH color is outside the sRGB gamut, we reduce chroma (C) via
 * binary search until all linear sRGB channels are in [0, 1]. This matches
 * browser behavior per CSS Color Level 4 §12.2 and produces hex values that
 * match what getComputedStyle returns.
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 */

/** sRGB gamma correction (no clamping — caller handles gamut). */
function srgbGamma(v: number): number {
  return v <= 0.0031308
    ? 12.92 * v
    : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/** Convert OKLab (L, a, b) → linear sRGB [r, g, b]. */
function oklabToLinearSRGB(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const lc = l_ * l_ * l_
  const mc = m_ * m_ * m_
  const sc = s_ * s_ * s_

  return [
    +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
}

/** Check if all linear sRGB channels are in [0, 1] (within epsilon). */
function isInGamut(r: number, g: number, b: number): boolean {
  const EPS = 1e-6
  return r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS
}

/**
 * Convert an oklch() CSS color function to 6-digit lowercase hex.
 * Out-of-gamut values are mapped back into sRGB by reducing chroma (binary search).
 * Returns null for unparseable input.
 */
export function oklchToHex(oklchStr: string): string | null {
  const m = oklchStr.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)/)
  if (!m) return null

  let L = parseFloat(m[1]!)
  if (m[2] === '%') L /= 100
  const C = parseFloat(m[3]!)
  const H = parseFloat(m[4]!)

  if (Number.isNaN(L) || Number.isNaN(C) || Number.isNaN(H)) return null

  const hRad = (H * Math.PI) / 180

  // Convert with full chroma first
  const cosH = Math.cos(hRad)
  const sinH = Math.sin(hRad)
  let [rl, gl, bl] = oklabToLinearSRGB(L, C * cosH, C * sinH)

  // Gamut mapping: if out of sRGB gamut, binary search on chroma
  if (!isInGamut(rl, gl, bl)) {
    let lo = 0
    let hi = C
    // 20 iterations gives precision < C / 2^20 ≈ 0.000001
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      const [r2, g2, b2] = oklabToLinearSRGB(L, mid * cosH, mid * sinH)
      if (isInGamut(r2, g2, b2)) {
        lo = mid
        rl = r2
        gl = g2
        bl = b2
      } else {
        hi = mid
      }
    }
  }

  // Clamp to handle floating point epsilon (isInGamut allows ±1e-6)
  const r = Math.round(srgbGamma(Math.max(0, Math.min(1, rl))) * 255)
  const g = Math.round(srgbGamma(Math.max(0, Math.min(1, gl))) * 255)
  const bv = Math.round(srgbGamma(Math.max(0, Math.min(1, bl))) * 255)

  return `#${((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1)}`
}
