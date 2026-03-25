import * as fs from 'node:fs'
import * as path from 'node:path'

export type StyleSystem = 'tailwind' | 'css-modules' | 'css-in-js' | 'plain-css'

export interface DetectionResult {
  hasCSSModules: boolean
  hasTailwind: boolean
  hasCSSInJS: boolean
  hasPlainCSS: boolean
  summary: string
}

const TAILWIND_CONFIG_NAMES = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
]

const CSS_IN_JS_PACKAGES = [
  'styled-components',
  '@emotion/styled',
  '@emotion/react',
]

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])

export class StyleDetector {
  async detect(projectRoot: string): Promise<DetectionResult> {
    // Single async scan, shared across all detectors
    const allFiles = await this.scanFiles(projectRoot)

    const [hasTailwind, hasCSSModules, hasCSSInJS] = await Promise.all([
      this.detectTailwind(projectRoot, allFiles),
      this.detectCSSModules(allFiles),
      this.detectCSSInJS(projectRoot),
    ])

    const hasPlainCSS = !hasTailwind && !hasCSSModules && !hasCSSInJS
    const summary = this.buildSummary(hasTailwind, hasCSSModules, hasCSSInJS)

    return { hasTailwind, hasCSSModules, hasCSSInJS, hasPlainCSS, summary }
  }

  private async scanFiles(root: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(root, { recursive: true })
      return (entries as string[])
        .filter(entry => !entry.includes(`${path.sep}node_modules${path.sep}`) && !entry.startsWith(`node_modules${path.sep}`))
        .map(entry => path.join(root, entry))
    } catch {
      return []
    }
  }

  private async detectTailwind(root: string, allFiles: string[]): Promise<boolean> {
    // Check for Tailwind v4 Vite plugin in package.json
    try {
      const pkg = await fs.promises.readFile(path.join(root, 'package.json'), 'utf-8')
      const parsed = JSON.parse(pkg) as Record<string, Record<string, string>>
      const allDeps = { ...parsed.dependencies, ...parsed.devDependencies }
      if ('@tailwindcss/vite' in allDeps || '@tailwindcss/postcss' in allDeps) return true
    } catch { /* no package.json or parse error */ }

    for (const name of TAILWIND_CONFIG_NAMES) {
      try {
        await fs.promises.access(path.join(root, name))
        return true
      } catch { /* not found */ }
    }

    const cssFiles = allFiles.filter(f => f.endsWith('.css'))
    for (const file of cssFiles) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8')
        if (/@tailwind\b/.test(content) || /@config\s+["']/.test(content) || /@import\s+["']tailwindcss["']/.test(content)) return true
      } catch { /* skip unreadable */ }
    }

    return false
  }

  private async detectCSSModules(allFiles: string[]): Promise<boolean> {
    const hasModuleCss = allFiles.some(f => f.endsWith('.module.css'))
    if (!hasModuleCss) return false

    const sourceFiles = allFiles.filter(f => SOURCE_EXTENSIONS.has(path.extname(f)))
    for (const src of sourceFiles) {
      try {
        const content = await fs.promises.readFile(src, 'utf-8')
        if (/\.module\.css/.test(content)) return true
      } catch { /* skip unreadable */ }
    }

    return false
  }

  private async detectCSSInJS(root: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(path.join(root, 'package.json'), 'utf-8')
      const pkg = JSON.parse(content) as Record<string, Record<string, string>>
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
      return CSS_IN_JS_PACKAGES.some(name => name in allDeps)
    } catch {
      return false
    }
  }

  private buildSummary(tw: boolean, cm: boolean, cij: boolean): string {
    const parts: string[] = []
    if (tw) parts.push('Tailwind')
    if (cm) parts.push('CSS Modules')
    if (cij) parts.push('CSS-in-JS')
    if (parts.length === 0) return 'No style system detected'
    return `Detected: ${parts.join(' + ')}`
  }
}
