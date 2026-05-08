import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { runDemo, type DemoResult } from '../../src/cli/demo.js'

/** Create a temp directory to serve as the parent cwd for demo scaffolding. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-demo-test-'))
}

function cleanup(dir: string): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY' && code !== 'EPERM') throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
    }
  }
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('cortex demo', () => {
  describe('scaffolding', () => {
    it('creates cortex-demo/ directory with all expected files', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const demoDir = path.join(cwd, 'cortex-demo')
        expect(fs.existsSync(demoDir)).toBe(true)

        const expectedFiles = [
          'package.json',
          'vite.config.ts',
          'index.html',
          'tsconfig.json',
          '.mcp.json',
          'src/main.tsx',
          'src/App.tsx',
          'src/index.css',
        ]
        for (const file of expectedFiles) {
          expect(
            fs.existsSync(path.join(demoDir, file)),
            `expected ${file} to exist`
          ).toBe(true)
        }
      } finally {
        cleanup(cwd)
      }
    })

    it('package.json is valid JSON with correct dependencies', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const pkgPath = path.join(cwd, 'cortex-demo', 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

        expect(pkg.name).toBe('cortex-demo')
        expect(pkg.private).toBe(true)
        expect(pkg.type).toBe('module')
        expect(pkg.dependencies).toHaveProperty('react')
        expect(pkg.dependencies).toHaveProperty('react-dom')
        expect(pkg.devDependencies).toHaveProperty('vite')
        expect(pkg.devDependencies).toHaveProperty('cortex-editor')
        expect(pkg.devDependencies).toHaveProperty('@vitejs/plugin-react')
        expect(pkg.devDependencies).toHaveProperty('tailwindcss')
        expect(pkg.devDependencies).toHaveProperty('@tailwindcss/vite')
        expect(pkg.scripts.dev).toBe('vite')
      } finally {
        cleanup(cwd)
      }
    })

    it('vite.config.ts includes cortexEditor plugin', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const content = fs.readFileSync(
          path.join(cwd, 'cortex-demo', 'vite.config.ts'),
          'utf8'
        )
        expect(content).toContain('cortexEditor')
        expect(content).toContain("from 'cortex-editor/vite'")
        expect(content).toContain('plugins: [cortexEditor(), react(), tailwindcss()]')
      } finally {
        cleanup(cwd)
      }
    })

    it('.mcp.json includes cortex server config', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const mcp = JSON.parse(
          fs.readFileSync(path.join(cwd, 'cortex-demo', '.mcp.json'), 'utf8')
        )
        expect(mcp.mcpServers.cortex).toEqual({
          command: 'npx',
          args: ['cortex', 'mcp'],
        })
      } finally {
        cleanup(cwd)
      }
    })

    it('src/App.tsx exists and contains JSX', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const content = fs.readFileSync(
          path.join(cwd, 'cortex-demo', 'src', 'App.tsx'),
          'utf8'
        )
        expect(content).toContain('export default function App')
      } finally {
        cleanup(cwd)
      }
    })

    it('src/index.css defines app-owned color chips', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const content = fs.readFileSync(
          path.join(cwd, 'cortex-demo', 'src', 'index.css'),
          'utf8'
        )
        expect(content).toContain('@theme')
        expect(content).toContain('--color-surface')
        expect(content).toContain('--color-border-muted')
        expect(content).toContain('--color-brand')
      } finally {
        cleanup(cwd)
      }
    })

    it('git repo is initialized with initial commit', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const demoDir = path.join(cwd, 'cortex-demo')

        // .git directory should exist
        expect(fs.existsSync(path.join(demoDir, '.git'))).toBe(true)

        // Should have at least one commit
        const log = execSync('git log --oneline', { cwd: demoDir, encoding: 'utf8' })
        expect(log.trim().length).toBeGreaterThan(0)
        expect(log).toContain('initial scaffold')
      } finally {
        cleanup(cwd)
      }
    })
  })

  describe('reset (subsequent run)', () => {
    it('resets modified files via git checkout on subsequent run', async () => {
      const cwd = makeTmpDir()
      try {
        // First run: scaffold
        await runDemo({ cwd, skipServe: true })
        const demoDir = path.join(cwd, 'cortex-demo')
        const appPath = path.join(demoDir, 'src', 'App.tsx')

        // Capture original content
        const original = fs.readFileSync(appPath, 'utf8')

        // Modify a file
        fs.writeFileSync(appPath, '// modified content\nexport default function App() { return <div/> }')

        // Second run: should reset
        await runDemo({ cwd, skipServe: true })

        // File should be restored to original
        const restored = fs.readFileSync(appPath, 'utf8')
        expect(restored).toBe(original)
      } finally {
        cleanup(cwd)
      }
    })
  })

  describe('--fresh flag', () => {
    it('removes and re-scaffolds when fresh is true', async () => {
      const cwd = makeTmpDir()
      try {
        // First run: scaffold
        await runDemo({ cwd, skipServe: true })
        const demoDir = path.join(cwd, 'cortex-demo')

        // Add an extra file that wouldn't be in the scaffold
        fs.writeFileSync(path.join(demoDir, 'extra.txt'), 'should be removed')

        // Fresh run: should nuke and rebuild
        await runDemo({ cwd, fresh: true, skipServe: true })

        // Extra file should be gone
        expect(fs.existsSync(path.join(demoDir, 'extra.txt'))).toBe(false)
        // Standard files should exist
        expect(fs.existsSync(path.join(demoDir, 'package.json'))).toBe(true)
        expect(fs.existsSync(path.join(demoDir, 'src', 'App.tsx'))).toBe(true)
      } finally {
        cleanup(cwd)
      }
    })
  })

  describe('return value', () => {
    it('returns { scaffolded: true, reset: false } on first run', async () => {
      const cwd = makeTmpDir()
      try {
        const result = await runDemo({ cwd, skipServe: true })
        expect(result).toEqual<DemoResult>({
          scaffolded: true,
          reset: false,
          demoDir: path.join(cwd, 'cortex-demo'),
        })
      } finally {
        cleanup(cwd)
      }
    })

    it('returns { scaffolded: false, reset: true } on subsequent run', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const result = await runDemo({ cwd, skipServe: true })
        expect(result).toEqual<DemoResult>({
          scaffolded: false,
          reset: true,
          demoDir: path.join(cwd, 'cortex-demo'),
        })
      } finally {
        cleanup(cwd)
      }
    })

    it('returns { scaffolded: true, reset: false } on fresh run over existing', async () => {
      const cwd = makeTmpDir()
      try {
        await runDemo({ cwd, skipServe: true })
        const result = await runDemo({ cwd, fresh: true, skipServe: true })
        expect(result).toEqual<DemoResult>({
          scaffolded: true,
          reset: false,
          demoDir: path.join(cwd, 'cortex-demo'),
        })
      } finally {
        cleanup(cwd)
      }
    })
  })
})
