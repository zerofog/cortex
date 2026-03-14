import { describe, it, expect } from 'vitest'
import { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

function createTempFile(content: string): string {
  const dir = join(tmpdir(), `cortex-rewriter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'Test.tsx')
  writeFileSync(filePath, content)
  return filePath
}

function cleanupTempFile(filePath: string): void {
  try { rmSync(filePath) } catch {}
  try { rmSync(dirname(filePath), { recursive: true }) } catch {}
}

describe('TailwindRewriter', () => {
  describe('static className string', () => {
    it('replaces pt-2 with pt-4 in static className', async () => {
      const source = `export function App() {
  return <div className="pt-2 text-sm rounded-lg">Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-top',
          oldToken: 'pt-2',
          newToken: 'pt-4',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain('className="pt-4 text-sm rounded-lg"')
          expect(result.oldContent).toBe(source)
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('replaces class at end of className string', async () => {
      const source = `export function App() {
  return <div className="text-sm rounded-lg pt-2">Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-top',
          oldToken: 'pt-2',
          newToken: 'pt-4',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain('className="text-sm rounded-lg pt-4"')
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })
  })

  describe('ternary className', () => {
    it('replaces correct branch in ternary', async () => {
      const source = `export function App({ active }: { active: boolean }) {
  return <div className={active ? 'p-2 bg-blue-500' : 'p-4 bg-gray-500'}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding',
          oldToken: 'p-2',
          newToken: 'p-6',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain("'p-6 bg-blue-500'")
          expect(result.newContent).toContain("'p-4 bg-gray-500'")
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('replaces in whenFalse branch', async () => {
      const source = `export function App({ active }: { active: boolean }) {
  return <div className={active ? 'p-2' : 'p-4'}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding',
          oldToken: 'p-4',
          newToken: 'p-8',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain("'p-2'")
          expect(result.newContent).toContain("'p-8'")
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })
  })

  describe('clsx/classnames calls', () => {
    it('replaces static arg in clsx call', async () => {
      const source = `import clsx from 'clsx'
export function App({ extra }: { extra: string }) {
  return <div className={clsx('p-2', 'bg-white', extra)}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 3,
          col: 10,
          property: 'padding',
          oldToken: 'p-2',
          newToken: 'p-4',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain("clsx('p-4', 'bg-white', extra)")
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('rejects conditional object in clsx', async () => {
      const source = `import clsx from 'clsx'
export function App({ compact }: { compact: boolean }) {
  return <div className={clsx({ 'p-2': compact, 'p-4': !compact })}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 3,
          col: 10,
          property: 'padding',
          oldToken: 'p-2',
          newToken: 'p-4',
        })

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.reason).toContain('Conditional object')
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })
  })

  describe('rejection cases', () => {
    it('rejects template literal className', async () => {
      const source = `export function App({ size }: { size: string }) {
  return <div className={\`p-\${size} text-sm\`}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding',
          oldToken: 'p-2',
          newToken: 'p-4',
        })

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.reason).toContain('Template literal')
        }
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('rejects element without className', async () => {
      const source = `export function App() {
  return <div style={{ padding: '8px' }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new TailwindRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding',
          oldToken: 'p-2',
          newToken: 'p-4',
        })

        expect(result.success).toBe(false)
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('handles missing file gracefully', async () => {
      const rewriter = new TailwindRewriter()
      const result = await rewriter.rewrite({
        filePath: '/nonexistent/file.tsx',
        line: 1,
        col: 1,
        property: 'padding',
        oldToken: 'p-2',
        newToken: 'p-4',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toContain('Cannot read file')
      }
    })
  })
})
