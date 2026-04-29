// Cache prefix at module level — port does not change during page lifetime
const PREFIX = typeof location !== 'undefined'
  ? `cortex:${location.port || '0'}:`
  : 'cortex:0:'

function get<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  const fullKey = PREFIX + key
  const raw = (() => {
    try { return localStorage.getItem(fullKey) } catch { return null }
  })()
  if (raw === null) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!validate(parsed)) {
      console.warn(`[cortex] localStorage entry ${key} failed schema validation — discarding`)
      try { localStorage.removeItem(fullKey) } catch { /* private mode */ }
      return fallback
    }
    return parsed
  } catch (err) {
    console.warn(`[cortex] localStorage entry ${key} could not be parsed — discarding`, err)
    try { localStorage.removeItem(fullKey) } catch { /* private mode */ }
    return fallback
  }
}

/** Returns true on success, false on quota / private-mode failure (logged). Callers
 *  may use the return to surface a "buffer not persisted" warning to the user. */
function set(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch (err) {
    console.warn(`[cortex] localStorage set failed for ${key}`, err instanceof Error ? err.message : err)
    return false
  }
}

function clear(): void {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}

export const cortexStorage = { get, set, clear } as const

/** Validates a stored {x, y} position — used by useSnapToEdge and useToolbarDock. */
export function isValidPosition(v: unknown): v is { x: number; y: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'x' in v &&
    'y' in v &&
    typeof (v as { x: unknown }).x === 'number' &&
    Number.isFinite((v as { x: number }).x) &&
    typeof (v as { y: unknown }).y === 'number' &&
    Number.isFinite((v as { y: number }).y)
  )
}
