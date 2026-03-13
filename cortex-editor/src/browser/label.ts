export interface SourceInfo {
  componentName: string | null
  fileName: string
  line: string
  filePath: string
}

/** Parse a data-cortex-source attribute into structured parts */
export function parseCortexSource(el: HTMLElement): SourceInfo | null {
  const source = el.getAttribute('data-cortex-source')
  if (!source) return null

  const parts = source.split(':')
  const filePath = parts[0] ?? ''
  const fileName = filePath.split('/').pop() ?? filePath
  const line = parts[1] ?? ''
  const baseName = fileName.replace(/\.\w+$/, '')
  const componentName = /^[A-Z]/.test(baseName) ? baseName : null

  return { componentName, fileName, line, filePath }
}

/** Get a compact label (hover overlay) */
export function getLabel(el: HTMLElement): string {
  const info = parseCortexSource(el)
  if (info?.componentName) return info.componentName

  const tag = el.tagName.toLowerCase()
  const cls = el.className
  if (typeof cls === 'string' && cls.trim()) {
    return `${tag}.${cls.trim().split(/\s+/)[0]}`
  }
  return tag
}

/** Get a detailed label (selection overlay) */
export function getSelectionLabel(el: HTMLElement): string {
  const info = parseCortexSource(el)
  if (!info) {
    const tag = el.tagName.toLowerCase()
    const cls = el.className
    if (typeof cls === 'string' && cls.trim()) {
      return `${tag}.${cls.trim().split(/\s+/)[0]}`
    }
    return tag
  }

  const { componentName, fileName, line } = info
  if (componentName && line) return `${componentName} — ${fileName}:${line}`
  if (componentName) return `${componentName} — ${fileName}`
  if (line) return `${fileName}:${line}`
  return fileName
}
