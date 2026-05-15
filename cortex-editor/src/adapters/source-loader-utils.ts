export function shouldExcludeCortexSource(
  resourcePath: string,
  includeNodeModules: readonly string[] = [],
): boolean {
  const cleanPath = resourcePath.split('?')[0]?.replace(/\\/g, '/') ?? resourcePath.replace(/\\/g, '/')
  if (!cleanPath.includes('/node_modules/')) return false
  return !includeNodeModules.some(pkg => cleanPath.includes(`/node_modules/${pkg}/`))
}

/**
 * Per-plugin-instance lock-held registry shared by the webpack plugin and the
 * source-loader (ZF0-1851, symmetric to Vite's cortexDisabledByLock flag).
 * When the plugin's lock acquire fails with LockHeldError, it marks its own
 * `runtimeId` here; the source-loader checks the id at load time and skips
 * transformation, making the lock-refused plugin cleanly inert.
 *
 * Per-instance keying is required for MultiCompiler / double-registration:
 * one plugin can be lock-refused while another holds the lock; a module-global
 * flag would wrongly disable the live plugin's transforms too.
 */
const disabledRuntimes = new Set<string>()

export function markRuntimeDisabled(runtimeId: string): void {
  disabledRuntimes.add(runtimeId)
}

export function markRuntimeEnabled(runtimeId: string): void {
  disabledRuntimes.delete(runtimeId)
}

export function isRuntimeDisabled(runtimeId: string | undefined): boolean {
  return runtimeId !== undefined && disabledRuntimes.has(runtimeId)
}
