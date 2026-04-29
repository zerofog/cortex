/** Generate a unique correlation ID. Prefers `crypto.randomUUID()`; falls back
 *  to a non-cryptographic timestamp+random combination when running in a
 *  non-secure context (LAN dev over plain HTTP, file://, restrictive iframe
 *  sandboxes) where `crypto.randomUUID` throws or is undefined. Intent IDs
 *  only need uniqueness within a session, not unguessability — the fallback
 *  is appropriate. */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  return `cortex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
