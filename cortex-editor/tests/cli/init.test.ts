import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runInit } from '../../src/cli/init.js'
import { detectPackageManager } from '../../src/cli/detect.js'

/** Create a temp directory with optional files pre-seeded. */
function makeTmpProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-init-'))
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
  return dir
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('cortex init', () => {
  it.each([
    [{}, 'npm'],
    [{ 'package-lock.json': '' }, 'npm'],
    [{ 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{ 'yarn.lock': '' }, 'yarn'],
    [{ 'bun.lockb': '' }, 'bun'],
    [{ 'bun.lock': '' }, 'bun'],
  ] as Array<[Record<string, string>, string]>)('detects %s as %s', (files, expected) => {
    const dir = makeTmpProject({ 'package.json': '{"name":"test"}', ...files })
    try {
      expect(detectPackageManager(dir)).toBe(expected)
    } finally {
      cleanup(dir)
    }
  })

  it.each([
    ['pnpm@9.15.0', 'pnpm'],
    ['yarn@4.5.1', 'yarn'],
    ['bun@1.1.42', 'bun'],
    ['npm@10.9.2', 'npm'],
  ] as Array<[string, string]>)(
    // This exercises the PackageJson fallback passed to detectPackageManager,
    // not a package.json read from the temp directory.
    'detects packageManager=%s as %s when no lockfile exists',
    (packageManager, expected) => {
      const dir = makeTmpProject({ 'package.json': '{"name":"test"}' })
      try {
        expect(detectPackageManager(dir, { packageManager })).toBe(expected)
      } finally {
        cleanup(dir)
      }
    }
  )

  it('errors when no package.json found', async () => {
    const dir = makeTmpProject()
    try {
      await expect(runInit(dir)).rejects.toThrow('No package.json found')
    } finally {
      cleanup(dir)
    }
  })

  it('creates .mcp.json with cortex server config', async () => {
    const dir = makeTmpProject({ 'package.json': '{"name":"test"}' })
    try {
      await runInit(dir)
      const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'))
      expect(mcp.mcpServers.cortex).toEqual({
        command: 'npx',
        args: ['cortex', 'mcp'],
      })
    } finally {
      cleanup(dir)
    }
  })

  it('preserves existing .mcp.json entries when adding cortex', async () => {
    const existing = JSON.stringify({
      mcpServers: { other: { command: 'other-tool', args: [] } },
    })
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.mcp.json': existing,
    })
    try {
      await runInit(dir)
      const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'))
      expect(mcp.mcpServers.other).toEqual({ command: 'other-tool', args: [] })
      expect(mcp.mcpServers.cortex).toEqual({ command: 'npx', args: ['cortex', 'mcp'] })
    } finally {
      cleanup(dir)
    }
  })

  it('handles malformed .mcp.json with clear error message', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.mcp.json': '{ not valid json',
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('.mcp.json')
    } finally {
      cleanup(dir)
    }
  })

  it('skips if cortex already configured in .mcp.json', async () => {
    const existing = JSON.stringify({
      mcpServers: { cortex: { command: 'npx', args: ['cortex', 'mcp'] } },
    })
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.mcp.json': existing,
    })
    try {
      const result = await runInit(dir)
      expect(result.mcpWritten).toBe(false)
      // File should be unchanged
      const content = fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')
      expect(content).toBe(existing)
    } finally {
      cleanup(dir)
    }
  })

  it('skips injection when cortexEditor already present (idempotent)', async () => {
    const viteConfig = [
      'import { cortexEditor } from "cortex-editor/vite"',
      'import { defineConfig } from "vite"',
      '',
      'export default defineConfig({',
      '  plugins: [cortexEditor()],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(false)
      // File should be unchanged
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toBe(viteConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexEditor into defineConfig with existing plugins array', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      'import react from \'@vitejs/plugin-react\'',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toContain('import { cortexEditor } from "cortex-editor/vite"')
      expect(content).toContain('cortexEditor()')
      // Original plugin still present
      expect(content).toContain('react()')
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat a commented cortexEditor call as an installed Vite plugin', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      '// TODO: add cortexEditor() once setup is ready',
      'export default defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toContain('import { cortexEditor } from "cortex-editor/vite"')
      expect(content).toContain('plugins: [cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat an unused cortexEditor call as an installed Vite plugin', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      'import { cortexEditor } from \'cortex-editor/vite\'',
      '',
      'const unused = cortexEditor()',
      '',
      'export default defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toContain('plugins: [cortexEditor()]')
      expect(content).toContain('const unused = cortexEditor()')
      expect(content.match(/import \{ cortexEditor \}/g)).toHaveLength(1)
    } finally {
      cleanup(dir)
    }
  })

  it('prompts to install the missing Vite peer before treating an existing Vite config as complete', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      'export default defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const promptInstall = vi.fn(async () => true)
      const installPackages = vi.fn(async () => {})

      const result = await runInit(dir, { promptInstall, installPackages })

      expect(result.detectedBundler).toBe('vite')
      expect(result.vitePluginInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      expect(promptInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'missing-vite-peer',
          packages: ['vite'],
        })
      )
      expect(installPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'npm',
          args: ['install', '-D', 'vite'],
          cwd: dir,
        })
      )
    } finally {
      cleanup(dir)
    }
  })

  it('does not mutate an existing Vite config when the user declines missing Vite peer installation', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      'export default defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const promptInstall = vi.fn(async () => false)
        const installPackages = vi.fn(async () => {})

        const result = await runInit(dir, { promptInstall, installPackages })

        expect(result.setupComplete).toBe(false)
        expect(result.vitePluginInjected).toBe(false)
        expect(fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')).toBe(viteConfig)
        expect(promptInstall).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: 'missing-vite-peer',
            packages: ['vite'],
          })
        )
        expect(installPackages).not.toHaveBeenCalled()

        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(warnings).toContain('missing vite required')
        expect(warnings).toContain('Install missing packages with: npm install -D vite')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat peerDependencies as installed packages for the missing Vite peer check', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      'export default defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: { 'cortex-editor': '^0.1.0' },
        peerDependencies: { vite: '^5.1.0' },
      }),
      'vite.config.ts': viteConfig,
    })
    try {
      const promptInstall = vi.fn(async () => true)
      const installPackages = vi.fn(async () => {})

      const result = await runInit(dir, { promptInstall, installPackages })

      expect(result.setupComplete).toBe(true)
      expect(promptInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'missing-vite-peer',
          packages: ['vite'],
        })
      )
      expect(installPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['install', '-D', 'vite'],
        })
      )
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexEditor into defineConfig with no plugins', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      'export default defineConfig({',
      '  server: { port: 3000 },',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toContain('import { cortexEditor } from "cortex-editor/vite"')
      expect(content).toContain('plugins: [cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexEditor into bare export with plugins', async () => {
    const viteConfig = [
      'export default {',
      '  plugins: [somePlugin()],',
      '}',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.js': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.js'), 'utf8')
      expect(content).toContain('import { cortexEditor } from "cortex-editor/vite"')
      expect(content).toContain('cortexEditor()')
      expect(content).toContain('somePlugin()')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexEditor into bare export with no plugins', async () => {
    const viteConfig = 'export default {}'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.js': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.js'), 'utf8')
      expect(content).toContain('import { cortexEditor } from "cortex-editor/vite"')
      expect(content).toContain('plugins: [cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('throws on malformed vite config with helpful message', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.ts': 'this is not valid javascript {{{',
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('vite.config.ts')
      // File should be unchanged
      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toBe('this is not valid javascript {{{')
    } finally {
      cleanup(dir)
    }
  })

  it('warns with the detected package manager when cortex-editor is not in dependencies', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","dependencies":{}}',
      'pnpm-lock.yaml': '',
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await runInit(dir)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('pnpm add -D cortex-editor')
        )
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it.each([
    [
      'Vite',
      {
        'package.json': '{"name":"test","devDependencies":{"vite":"^5.1.0"}}',
        'vite.config.ts': [
          'import { defineConfig } from \'vite\'',
          '',
          'export default defineConfig({',
          '  plugins: [],',
          '})',
        ].join('\n'),
      },
      'vite.config.ts',
    ],
    [
      'Next.js',
      {
        'package.json': '{"name":"test","devDependencies":{"next":"^16.0.0"}}',
        'next.config.mjs': 'export default { reactStrictMode: true }\n',
      },
      'next.config.mjs',
    ],
  ] as Array<[string, Record<string, string>, string]>)(
    'does not rewrite %s config before cortex-editor is installed',
    async (_bundler, files, configPath) => {
      const dir = makeTmpProject(files)
      try {
        const promptInstall = vi.fn(async () => true)
        const installPackages = vi.fn(async () => {})
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
          const originalConfig = fs.readFileSync(path.join(dir, configPath), 'utf8')

          const result = await runInit(dir, { promptInstall, installPackages })

          expect(result.depFound).toBe(false)
          expect(result.setupComplete).toBe(false)
          expect(result.vitePluginInjected).toBe(false)
          expect(result.nextConfigInjected).toBe(false)
          expect(fs.readFileSync(path.join(dir, configPath), 'utf8')).toBe(originalConfig)
          expect(promptInstall).not.toHaveBeenCalled()
          expect(installPackages).not.toHaveBeenCalled()
          expect(warnSpy.mock.calls.flat().join('\n')).toContain(
            'cortex-editor not in dependencies'
          )
        } finally {
          warnSpy.mockRestore()
        }
      } finally {
        cleanup(dir)
      }
    }
  )

  it('counts cortex-editor optionalDependencies as installed for setup completeness', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      'import { cortexEditor } from \'cortex-editor/vite\'',
      '',
      'export default defineConfig({',
      '  plugins: [cortexEditor()],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: { vite: '^5.1.0' },
        optionalDependencies: { 'cortex-editor': '^0.1.0' },
      }),
      'vite.config.ts': viteConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)

        expect(result.depFound).toBe(true)
        expect(result.setupComplete).toBe(true)
        expect(warnSpy.mock.calls.flat().join('\n')).not.toContain('cortex-editor not in dependencies')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('installs Vite with the detected package manager and creates a configured Vite stub when no bundler is detected', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'pnpm-lock.yaml': '',
    })
    try {
      const promptInstall = vi.fn(async () => true)
      const installPackages = vi.fn(async () => {})

      const result = await runInit(dir, { promptInstall, installPackages })

      expect(result.detectedBundler).toBe('none')
      expect(result.packageManager).toBe('pnpm')
      expect(result.viteConfigCreated).toBe(true)
      expect(result.setupComplete).toBe(true)
      expect(promptInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          packageManager: 'pnpm',
          packages: ['vite', '@vitejs/plugin-react'],
        })
      )
      expect(installPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'pnpm',
          args: ['add', '-D', 'vite', '@vitejs/plugin-react'],
          cwd: dir,
        })
      )

      const content = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(content).toContain('import react from \'@vitejs/plugin-react\'')
      expect(content).toContain('import { cortexEditor } from \'cortex-editor/vite\'')
      expect(content).toContain('plugins: [react(), cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('creates a configured Vite stub without installing packages when Vite is already a dependency', async () => {
    const dir = makeTmpProject({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: {
          'cortex-editor': '^0.1.0',
          vite: '^5.1.0',
          '@vitejs/plugin-react': '^5.0.0',
        },
      }),
    })
    try {
      const promptInstall = vi.fn(async () => true)
      const installPackages = vi.fn(async () => {})

      const result = await runInit(dir, { promptInstall, installPackages })

      expect(result.detectedBundler).toBe('vite')
      expect(result.viteConfigCreated).toBe(true)
      expect(result.setupComplete).toBe(true)
      expect(promptInstall).not.toHaveBeenCalled()
      expect(installPackages).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('does not claim setup is complete when the user declines missing Vite installation', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
    })
    try {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir, {
          promptInstall: async () => false,
          installPackages: async () => {},
        })

        expect(result.setupComplete).toBe(false)
        expect(result.viteConfigCreated).toBe(false)
        expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false)

        const logs = logSpy.mock.calls.flat().join('\n')
        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(logs).not.toContain('Setup complete')
        expect(warnings).toContain('Cortex setup incomplete')
        expect(warnings).toContain('Install missing packages')
      } finally {
        logSpy.mockRestore()
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('names the actual missing Vite setup packages when install is declined', async () => {
    const dir = makeTmpProject({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: {
          'cortex-editor': '^0.1.0',
          vite: '^5.1.0',
        },
      }),
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir, {
          promptInstall: async () => false,
          installPackages: async () => {},
        })

        expect(result.setupComplete).toBe(false)
        expect(result.viteConfigCreated).toBe(false)

        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(warnings).toContain('missing @vitejs/plugin-react required')
        expect(warnings).toContain('Install missing packages with: npm install -D @vitejs/plugin-react')
        expect(warnings).not.toContain('Vite is required')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('reports the signal when package installation is terminated', async () => {
    const dir = makeTmpProject({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: {
          'cortex-editor': '^0.1.0',
        },
      }),
    })
    const child = {
      on: vi.fn(),
    }
    child.on.mockImplementation(
      (event: string, handler: (code: number | null, signal: string | null) => void) => {
        if (event === 'close') queueMicrotask(() => handler(null, 'SIGTERM'))
        return child
      }
    )
    const spawn = vi.fn(() => child)

    vi.resetModules()
    vi.doMock('node:child_process', () => ({ spawn }))
    try {
      const { runInit: runInitWithMockedSpawn } = await import('../../src/cli/init.js')

      await expect(
        runInitWithMockedSpawn(dir, {
          promptInstall: async () => true,
        })
      ).rejects.toThrow('npm install -D vite @vitejs/plugin-react exited with signal SIGTERM')

      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['install', '-D', 'vite', '@vitejs/plugin-react'],
        expect.objectContaining({ cwd: dir, stdio: 'inherit' })
      )
    } finally {
      vi.doUnmock('node:child_process')
      vi.resetModules()
      cleanup(dir)
    }
  })

  it('wraps an existing Next.js config with withCortex instead of trying the Vite path', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': 'export default { reactStrictMode: true }\n',
    })
    try {
      const result = await runInit(dir)

      expect(result.detectedBundler).toBe('next')
      expect(result.nextConfigInjected).toBe(true)
      expect(result.viteConfigCreated).toBe(false)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('import { withCortex } from \'cortex-editor/next\'')
      expect(content).toContain('export default withCortex({ reactStrictMode: true })')
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat a commented withCortex call as a configured Next.js wrapper', async () => {
    const nextConfig = [
      '// TODO: wrap this config with withCortex()',
      'export default { reactStrictMode: true }',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('import { withCortex } from \'cortex-editor/next\'')
      expect(content).toContain('export default withCortex({ reactStrictMode: true })')
    } finally {
      cleanup(dir)
    }
  })

  it('skips injection when an ESM Next.js config export is already wrapped with withCortex', async () => {
    const nextConfig = [
      'import { withCortex } from \'cortex-editor/next\'',
      '',
      'export default withCortex({ reactStrictMode: true })',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(false)
      expect(result.setupComplete).toBe(true)
      expect(fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')).toBe(nextConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat an unused withCortex call as a configured Next.js wrapper', async () => {
    const nextConfig = [
      'import { withCortex } from \'cortex-editor/next\'',
      '',
      'const unused = withCortex({ poweredByHeader: false })',
      '',
      'export default { reactStrictMode: true }',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('export default withCortex({ reactStrictMode: true })')
      expect(content).toContain('const unused = withCortex({ poweredByHeader: false })')
      expect(content.match(/import \{ withCortex \}/g)).toHaveLength(1)
    } finally {
      cleanup(dir)
    }
  })

  it('keeps nextConfigFound true when an existing supported Next.js config needs manual wrapping', async () => {
    const nextConfig = [
      'const config = { reactStrictMode: true }',
      'module.exports.config = config',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.js': nextConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)

        expect(result.nextConfigFound).toBe(true)
        expect(result.nextConfigInjected).toBe(false)
        expect(result.setupComplete).toBe(false)
        expect(fs.readFileSync(path.join(dir, 'next.config.js'), 'utf8')).toBe(nextConfig)
        expect(warnSpy.mock.calls.flat().join('\n')).toContain('could not auto-configure Next.js')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('wraps a CommonJS Next.js config with withCortex', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.js': 'module.exports = { reactStrictMode: true }\n',
    })
    try {
      const result = await runInit(dir)

      expect(result.detectedBundler).toBe('next')
      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.js'), 'utf8')
      expect(content).toContain('const { withCortex } = require(\'cortex-editor/next\')')
      expect(content).toContain('module.exports = withCortex({ reactStrictMode: true })')
    } finally {
      cleanup(dir)
    }
  })

  it('preserves CommonJS directive prologues before inserting the withCortex require', async () => {
    const nextConfig = [
      '\'use strict\'',
      '',
      'module.exports = { reactStrictMode: true }',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.js': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.js'), 'utf8')
      const directiveIndex = content.indexOf('\'use strict\'')
      const requireIndex = content.indexOf('const { withCortex }')
      const exportIndex = content.indexOf('module.exports = withCortex')
      expect(content.startsWith('\'use strict\'')).toBe(true)
      expect(requireIndex).toBeGreaterThan(directiveIndex)
      expect(exportIndex).toBeGreaterThan(requireIndex)
    } finally {
      cleanup(dir)
    }
  })

  it('does not claim setup is complete for unsupported Next.js config extensions', async () => {
    const originalConfig = 'module.exports = { reactStrictMode: true }\n'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.cjs': originalConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)

        expect(result.detectedBundler).toBe('next')
        expect(result.nextConfigInjected).toBe(false)
        expect(result.nextConfigCreated).toBe(false)
        expect(result.setupComplete).toBe(false)
        expect(fs.readFileSync(path.join(dir, 'next.config.cjs'), 'utf8')).toBe(originalConfig)
        expect(fs.existsSync(path.join(dir, 'next.config.mjs'))).toBe(false)

        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(warnings).toContain('does not support this config extension')
        expect(warnings).toContain('next.config.js')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('preserves phase arguments when wrapping a function-style Next.js config', async () => {
    const nextConfig = [
      'export default (phase, { defaultConfig }) => {',
      '  return { reactStrictMode: phase === "phase-development-server" }',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('export default async (...args) => withCortex(await ((phase, { defaultConfig }) => {')
      expect(content).toContain('})(...args))')
      expect(content).toContain('phase === "phase-development-server"')
    } finally {
      cleanup(dir)
    }
  })

  it('preserves async function configs when wrapping CommonJS Next.js config', async () => {
    const nextConfig = [
      'module.exports = async (phase) => {',
      '  return { reactStrictMode: phase === "phase-production-build" }',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.js': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.js'), 'utf8')
      expect(content).toContain('module.exports = async (...args) => withCortex(await (async (phase) => {')
      expect(content).toContain('})(...args))')
      expect(content).toContain('phase === "phase-production-build"')
    } finally {
      cleanup(dir)
    }
  })

  it('creates a Next.js config when Next is detected without a config file', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
    })
    try {
      const result = await runInit(dir)

      expect(result.detectedBundler).toBe('next')
      expect(result.nextConfigCreated).toBe(true)
      expect(result.setupComplete).toBe(true)

      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('withCortex')
      expect(content).toContain('cortex-editor/next')
    } finally {
      cleanup(dir)
    }
  })

  it.each([
    [
      'webpack dependency',
      {
        'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      },
    ],
    [
      'webpack config',
      {
        'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
        'webpack.config.js': 'module.exports = {}\n',
      },
    ],
    [
      'react-scripts dependency',
      {
        'package.json': '{"name":"test","dependencies":{"react-scripts":"^5.0.0"},"devDependencies":{"cortex-editor":"^0.1.0"}}',
      },
    ],
  ] as Array<[string, Record<string, string>]>)
  ('reports Webpack as unsupported for %s without creating Vite or Webpack adapter config', async (_caseName, files) => {
    const dir = makeTmpProject({
      ...files,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)

        expect(result.detectedBundler).toBe('webpack')
        expect(result.setupComplete).toBe(false)
        expect(result.viteConfigCreated).toBe(false)
        expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false)
        if (files['webpack.config.js']) {
          expect(fs.readFileSync(path.join(dir, 'webpack.config.js'), 'utf8')).toBe(files['webpack.config.js'])
        } else {
          expect(fs.existsSync(path.join(dir, 'webpack.config.js'))).toBe(false)
        }

        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(warnings).toContain('does not support standalone Webpack yet')
        expect(warnings).toContain('ZF0-934')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('errors when package.json contains invalid JSON', async () => {
    const dir = makeTmpProject({ 'package.json': '{ broken json' })
    try {
      await expect(runInit(dir)).rejects.toThrow('package.json: failed to parse')
    } finally {
      cleanup(dir)
    }
  })

  it('errors when mcpServers is not an object', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.mcp.json': '{"mcpServers": "not-an-object"}',
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('"mcpServers" must be an object')
    } finally {
      cleanup(dir)
    }
  })

  it('errors when .mcp.json root is not a plain object', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.mcp.json': '[]',
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('root value must be a JSON object')
    } finally {
      cleanup(dir)
    }
  })
})
