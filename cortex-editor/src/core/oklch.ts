/** sRGB gamma correction with clamping to [0, 1]. */
function srgbGamma(v: number): number {
  const clamped = Math.max(0, Math.min(1, v))
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

/**
 * Convert an oklch() CSS color function to 6-digit lowercase hex.
 * Out-of-gamut values are clamped to sRGB. Returns null for unparseable input.
 *
 * Pipeline: OKLCH → OKLab → LMS (cube root) → linear sRGB → sRGB (gamma) → hex
 * Reference: https://bottosson.github.io/posts/oklab/
 */
export function oklchToHex(oklchStr: string): string | null {
  const m = oklchStr.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/)
  if (!m) return null

  let l = parseFloat(m[1]!)
  if (m[2] === '%') l /= 100
  const c = parseFloat(m[3]!)
  const h = parseFloat(m[4]!)

  if (Number.isNaN(l) || Number.isNaN(c) || Number.isNaN(h)) return null

  // OKLCH → OKLab
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  // OKLab → LMS (inverse cube root)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const lc = l_ * l_ * l_
  const mc = m_ * m_ * m_
  const sc = s_ * s_ * s_

  // LMS → linear sRGB
  const rl = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc
  const gl = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc

  const r = Math.round(srgbGamma(rl) * 255)
  const g = Math.round(srgbGamma(gl) * 255)
  const bv = Math.round(srgbGamma(bl) * 255)

  return `#${((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1)}`
}
