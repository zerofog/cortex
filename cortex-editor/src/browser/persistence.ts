// Cache prefix at module level — port does not change during page lifetime
const PREFIX = typeof location !== 'undefined'
  ? `cortex:${location.port || '0'}:`
  : 'cortex:0:'

function get<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!validate(parsed)) return fallback
    return parsed
  } catch {
    return fallback
  }
}

function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota exceeded or private browsing — silently degrade
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
