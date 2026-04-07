import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StyleDetector } from '../../src/core/rewriter/detector.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

let tmpDir: string
let detector: StyleDetector

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-detector-'))
  detector = new StyleDetector()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Helper: write a file inside tmpDir, creating intermediate dirs as needed. */
function writeFixture(relativePath: string, content: string): void {
  const full = path.join(tmpDir, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('StyleDetector', () => {
  describe('Tailwind detection', () => {
    it.each([
      ['tailwind.config.js', 'module.exports = {}'],
      ['tailwind.config.ts', 'export default {}'],
      ['tailwind.config.mjs', 'export default {}'],
      ['tailwind.config.cjs', 'module.exports = {}'],
    ])('detects %s in project root', async (filename, content) => {
      writeFixture(filename, content)
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
    })
  })

  describe('Tailwind v4 CSS config', () => {
    it('detects @config directive in CSS file', async () => {
      writeFixture('src/styles.css', '@config "../tailwind.config.js";\n@tailwind base;')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
    })

    it('detects @tailwind directive in CSS file', async () => {
      writeFixture('src/app.css', '@tailwind base;\n@tailwind components;')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
    })

    it('detects Tailwind v4 @import "tailwindcss" in CSS file', async () => {
      writeFixture('src/index.css', '@import "tailwindcss";\n\n:root { color: red; }')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
    })

    it('detects @tailwindcss/vite in package.json devDependencies', async () => {
      writeFixture('package.json', JSON.stringify({
        devDependencies: { '@tailwindcss/vite': '^4.0.0', vite: '^6.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
    })
  })

  describe('CSS Modules detection', () => {
    it('detects .module.css imported by a source file', async () => {
      writeFixture('src/components/Hero.module.css', '.root { color: red; }')
      writeFixture('src/components/Hero.tsx', "import styles from './Hero.module.css'\nexport function Hero() { return <div className={styles.root} /> }")
      const result = await detector.detect(tmpDir)
      expect(result.hasCSSModules).toBe(true)
    })
  })

  describe('Orphan module CSS', () => {
    it('returns false when .module.css exists but no source imports it', async () => {
      writeFixture('src/components/Hero.module.css', '.root { color: red; }')
      // No source file imports it
      const result = await detector.detect(tmpDir)
      expect(result.hasCSSModules).toBe(false)
    })
  })

  describe('CSS-in-JS detection', () => {
    it('detects styled-components in dependencies', async () => {
      writeFixture('package.json', JSON.stringify({
        dependencies: { 'styled-components': '^6.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasCSSInJS).toBe(true)
    })

    it('detects @emotion/styled in devDependencies', async () => {
      writeFixture('package.json', JSON.stringify({
        devDependencies: { '@emotion/styled': '^11.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasCSSInJS).toBe(true)
    })

    it('detects @emotion/react in dependencies', async () => {
      writeFixture('package.json', JSON.stringify({
        dependencies: { '@emotion/react': '^11.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasCSSInJS).toBe(true)
    })
  })

  describe('Mixed detection', () => {
    it('detects both Tailwind and CSS Modules', async () => {
      writeFixture('tailwind.config.js', 'module.exports = {}')
      writeFixture('src/Hero.module.css', '.root { color: red; }')
      writeFixture('src/Hero.tsx', "import styles from './Hero.module.css'")
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.hasCSSModules).toBe(true)
      expect(result.hasPlainCSS).toBe(false)
    })
  })

  describe('Component library detection', () => {
    it('detects @mantine/core as hasComponentLibrary: true', async () => {
      writeFixture('package.json', JSON.stringify({
        dependencies: { '@mantine/core': '^7.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasComponentLibrary).toBe(true)
    })

    it('returns hasComponentLibrary: false when no component library', async () => {
      writeFixture('package.json', JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasComponentLibrary).toBe(false)
    })
  })

  describe('Empty project', () => {
    it('classifies as plain CSS when no signals found', async () => {
      const result = await detector.detect(tmpDir)
      expect(result.hasPlainCSS).toBe(true)
      expect(result.hasTailwind).toBe(false)
      expect(result.hasCSSModules).toBe(false)
      expect(result.hasCSSInJS).toBe(false)
    })
  })

  describe('Tailwind version detection', () => {
    it('detects version 4 from @tailwindcss/vite in package.json', async () => {
      writeFixture('package.json', JSON.stringify({
        devDependencies: { '@tailwindcss/vite': '^4.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.tailwindVersion).toBe(4)
    })

    it('detects version 4 from @tailwindcss/postcss in package.json', async () => {
      writeFixture('package.json', JSON.stringify({
        devDependencies: { '@tailwindcss/postcss': '^4.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.tailwindVersion).toBe(4)
    })

    it('detects version 4 from @import "tailwindcss" in CSS', async () => {
      writeFixture('src/index.css', '@import "tailwindcss";')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.tailwindVersion).toBe(4)
    })

    it('detects version 3 from tailwind.config.js', async () => {
      writeFixture('tailwind.config.js', 'module.exports = {}')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.tailwindVersion).toBe(3)
    })

    it('detects version 3 from @tailwind directive', async () => {
      writeFixture('src/app.css', '@tailwind base;\n@tailwind components;')
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(true)
      expect(result.tailwindVersion).toBe(3)
    })

    it('returns undefined tailwindVersion when no Tailwind detected', async () => {
      const result = await detector.detect(tmpDir)
      expect(result.hasTailwind).toBe(false)
      expect(result.tailwindVersion).toBeUndefined()
    })
  })

  describe('Summary format', () => {
    it('produces "Detected: Tailwind" for Tailwind-only project', async () => {
      writeFixture('tailwind.config.js', 'module.exports = {}')
      const result = await detector.detect(tmpDir)
      expect(result.summary).toBe('Detected: Tailwind')
    })

    it('produces "Detected: Tailwind + CSS Modules" for mixed', async () => {
      writeFixture('tailwind.config.ts', 'export default {}')
      writeFixture('src/Hero.module.css', '.root {}')
      writeFixture('src/Hero.tsx', "import s from './Hero.module.css'")
      const result = await detector.detect(tmpDir)
      expect(result.summary).toBe('Detected: Tailwind + CSS Modules')
    })

    it('produces "Detected: CSS-in-JS" for styled-components project', async () => {
      writeFixture('package.json', JSON.stringify({
        dependencies: { 'styled-components': '^6.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.summary).toBe('Detected: CSS-in-JS')
    })

    it('produces "No style system detected" for empty project', async () => {
      const result = await detector.detect(tmpDir)
      expect(result.summary).toBe('No style system detected')
    })

    it('produces three-way summary when all detected', async () => {
      writeFixture('tailwind.config.js', 'module.exports = {}')
      writeFixture('src/Hero.module.css', '.root {}')
      writeFixture('src/Hero.tsx', "import s from './Hero.module.css'")
      writeFixture('package.json', JSON.stringify({
        dependencies: { '@emotion/react': '^11.0.0' },
      }))
      const result = await detector.detect(tmpDir)
      expect(result.summary).toBe('Detected: Tailwind + CSS Modules + CSS-in-JS')
    })
  })
})
