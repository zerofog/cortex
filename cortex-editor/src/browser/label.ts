export interface SourceInfo {
  componentName: string | null
  fileName: string
  line: string
  filePath: string
}

/** Parse a data-cortex-source attribute into structured parts.
 *  Splits from the right so Windows drive letters (C:\...) don't break parsing. */
export function parseCortexSource(el: HTMLElement): SourceInfo | null {
  const source = el.getAttribute('data-cortex-source')
  if (!source) return null

  // Split from the right: last two colon segments are line:col.
  // Validate segments are numeric to avoid misinterpreting Windows drive letters.
  const lastColon = source.lastIndexOf(':')
  const secondLastColon = source.lastIndexOf(':', lastColon - 1)

  let filePath: string
  let line: string
  if (secondLastColon > 0) {
    const candidateLine = source.slice(secondLastColon + 1, lastColon)
    const candidateCol = source.slice(lastColon + 1)
    if (/^\d+$/.test(candidateLine) && /^\d+$/.test(candidateCol)) {
      filePath = source.slice(0, secondLastColon)
      line = candidateLine
    } else if (lastColon > 0 && /^\d+$/.test(source.slice(lastColon + 1))) {
      filePath = source.slice(0, lastColon)
      line = source.slice(lastColon + 1)
    } else {
      filePath = source
      line = ''
    }
  } else if (lastColon > 0 && /^\d+$/.test(source.slice(lastColon + 1))) {
    filePath = source.slice(0, lastColon)
    line = source.slice(lastColon + 1)
  } else {
    filePath = source
    line = ''
  }

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  const baseName = fileName.replace(/\.\w+$/, '')
  const componentName = /^[A-Z]/.test(baseName) ? baseName : null

  return { componentName, fileName, line, filePath }
}

/** Encode a file path for use in vscode:// URIs.
 *  encodeURIComponent per segment preserves slashes but encodes #, ?, & etc. */
export function encodeFilePath(filePath: string): string {
  return filePath.split(/([/\\])/).map((seg, i) =>
    seg === '/' || seg === '\\'
      ? seg
      : i === 0 && /^[A-Za-z]:$/.test(seg)
        ? seg
        : encodeURIComponent(seg),
  ).join('')
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
