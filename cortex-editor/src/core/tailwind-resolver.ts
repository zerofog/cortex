/**
 * Maps CSS property + computed value → Tailwind class name.
 *
 * At startup, inverts the resolved Tailwind theme into a lookup table:
 *   CSS property → CSS value (px) → Tailwind class
 *
 * This powers deterministic editing: when the user changes padding-top
 * from 8px to 16px, the resolver finds pt-2 → pt-4 without AI.
 */

/** Minimal shape of a resolved Tailwind theme (from resolveConfig) */
export interface ResolvedTheme {
  spacing?: Record<string, string>
  fontSize?: Record<string, string | [string, Record<string, string>]>
}

/** CSS property → Tailwind utility prefix mapping */
interface UtilityMapping {
  themeKey: 'spacing' | 'fontSize'
  prefix: string
}

const REM_PX = 16

/**
 * Static mapping from CSS properties to Tailwind utility info.
 * Each entry maps a CSS property to its theme key and class prefix.
 */
const UTILITY_MAP: Record<string, UtilityMapping> = {
  'padding-top': { themeKey: 'spacing', prefix: 'pt' },
  'padding-right': { themeKey: 'spacing', prefix: 'pr' },
  'padding-bottom': { themeKey: 'spacing', prefix: 'pb' },
  'padding-left': { themeKey: 'spacing', prefix: 'pl' },
  'margin-top': { themeKey: 'spacing', prefix: 'mt' },
  'margin-right': { themeKey: 'spacing', prefix: 'mr' },
  'margin-bottom': { themeKey: 'spacing', prefix: 'mb' },
  'margin-left': { themeKey: 'spacing', prefix: 'ml' },
  'gap': { themeKey: 'spacing', prefix: 'gap' },
  'row-gap': { themeKey: 'spacing', prefix: 'gap-y' },
  'column-gap': { themeKey: 'spacing', prefix: 'gap-x' },
  'width': { themeKey: 'spacing', prefix: 'w' },
  'height': { themeKey: 'spacing', prefix: 'h' },
  'min-width': { themeKey: 'spacing', prefix: 'min-w' },
  'min-height': { themeKey: 'spacing', prefix: 'min-h' },
  'max-width': { themeKey: 'spacing', prefix: 'max-w' },
  'max-height': { themeKey: 'spacing', prefix: 'max-h' },
  'font-size': { themeKey: 'fontSize', prefix: 'text' },
}

/** Convert a CSS value with units to px. Returns null if not convertible. */
function toPx(value: string): string | null {
  if (value.endsWith('px')) return value
  if (value.endsWith('rem')) {
    const num = parseFloat(value)
    if (Number.isNaN(num)) return null
    return `${num * REM_PX}px`
  }
  if (value === '0') return '0px'
  return null
}

export class TailwindResolver {
  private lookup = new Map<string, Map<string, string>>()

  private constructor() {}

  /**
   * Create a resolver from an already-resolved Tailwind theme object.
   * Use this in tests or when you already have the resolved config.
   */
  static fromTheme(theme: ResolvedTheme): TailwindResolver {
    const resolver = new TailwindResolver()
    resolver.invertTheme(theme)
    return resolver
  }

  /**
   * Create a resolver by loading and resolving the project's tailwind config.
   * Returns null if tailwindcss is not installed.
   */
  static async fromConfig(projectRoot: string): Promise<TailwindResolver | null> {
    const { isAbsolute } = await import('path')
    if (!isAbsolute(projectRoot)) {
      throw new Error(`projectRoot must be an absolute path, got: ${projectRoot}`)
    }

    let resolveConfig: (config: unknown) => { theme?: ResolvedTheme }
    try {
      // @ts-expect-error — tailwindcss is an optional peer dep; import fails gracefully at runtime
      const mod = await import('tailwindcss/resolveConfig')
      resolveConfig = mod.default
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_MODULE_NOT_FOUND') {
        return null // tailwindcss not installed — expected
      }
      throw err
    }

    const config = await TailwindResolver.loadConfig(projectRoot)
    if (!config) return null
    const resolved = resolveConfig(config)
    return TailwindResolver.fromTheme(resolved.theme ?? {})
  }

  private static async loadConfig(projectRoot: string): Promise<Record<string, unknown> | null> {
    const { join } = await import('path')

    const configNames = [
      'tailwind.config.ts',
      'tailwind.config.js',
      'tailwind.config.mjs',
      'tailwind.config.cjs',
    ]

    for (const name of configNames) {
      try {
        const configPath = join(projectRoot, name)
        const mod = await import(configPath)
        return mod.default ?? mod
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_MODULE_NOT_FOUND') {
          continue // file doesn't exist, try next
        }
        throw err // file exists but is broken — surface the error
      }
    }
    return null
  }

  /** Find the Tailwind class for a CSS property + computed value (in px). */
  findClass(property: string, value: string): string | null {
    const propertyMap = this.lookup.get(property)
    if (!propertyMap) return null
    return propertyMap.get(value) ?? null
  }

  /** Get all snap point values (in px) for a CSS property. Sorted numerically. */
  getSnapPoints(property: string): string[] {
    const propertyMap = this.lookup.get(property)
    if (!propertyMap) return []
    return Array.from(propertyMap.keys()).sort((a, b) => {
      return parseFloat(a) - parseFloat(b)
    })
  }

  private invertTheme(theme: ResolvedTheme): void {
    for (const [cssProperty, mapping] of Object.entries(UTILITY_MAP)) {
      const scale = theme[mapping.themeKey]
      if (!scale || typeof scale !== 'object') continue

      const propertyMap = new Map<string, string>()

      for (const [key, rawValue] of Object.entries(scale)) {
        const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
        if (typeof value !== 'string') continue

        const pxValue = toPx(value)
        if (pxValue == null) continue

        const className = `${mapping.prefix}-${key}`
        propertyMap.set(pxValue, className)
      }

      if (propertyMap.size > 0) {
        this.lookup.set(cssProperty, propertyMap)
      }
    }
  }
}
