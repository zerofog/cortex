export function shouldExcludeCortexSource(
  resourcePath: string,
  includeNodeModules: readonly string[] = [],
): boolean {
  const cleanPath = resourcePath.split('?')[0]?.replace(/\\/g, '/') ?? resourcePath.replace(/\\/g, '/')
  if (!cleanPath.includes('/node_modules/')) return false
  return !includeNodeModules.some(pkg => cleanPath.includes(`/node_modules/${pkg}/`))
}
