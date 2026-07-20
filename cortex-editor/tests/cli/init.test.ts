import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { injectDevScriptsIntoLayout, runInit } from '../../src/cli/init.js'
import { detectBundler, detectPackageManager } from '../../src/cli/detect.js'

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

  it('detects Vite from config files even when vite is not listed in package.json', () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      'vite.config.ts': 'export default {}\n',
    })
    try {
      expect(detectBundler(dir, {})).toEqual({
        kind: 'vite',
        configPath: path.join(dir, 'vite.config.ts'),
        source: 'config',
      })
    } finally {
      cleanup(dir)
    }
  })

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
      const result = await runInit(dir)
      expect(result.mcpWritten).toBe(true)
      const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'))
      expect(mcp.mcpServers.cortex).toEqual({
        command: 'npx',
        args: ['cortex', 'mcp'],
      })
    } finally {
      cleanup(dir)
    }
  })

  it('creates a project /cortex Claude Code slash command', async () => {
    const dir = makeTmpProject({ 'package.json': '{"name":"test"}' })
    try {
      const result = await runInit(dir)
      expect(result.slashCommandFound).toBe(true)
      expect(result.slashCommandWritten).toBe(true)

      const command = fs.readFileSync(path.join(dir, '.claude', 'commands', 'cortex.md'), 'utf8')
      expect(command).toContain('description: Activate or manage the Cortex visual editor')
      expect(command).toContain('call `cortex_status`')
      expect(command).toContain('call `cortex_activate`')
      expect(command).toContain('call `cortex_get_pending_edits`')
      expect(command).toContain("start the app's normal dev server")
    } finally {
      cleanup(dir)
    }
  })

  it('preserves an existing project /cortex slash command', async () => {
    const existing = [
      '---',
      'description: Custom local Cortex command',
      '---',
      '',
      'Use our internal workflow.',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test"}',
      '.claude/commands/cortex.md': existing,
    })
    try {
      const result = await runInit(dir)
      expect(result.slashCommandFound).toBe(true)
      expect(result.slashCommandWritten).toBe(false)

      const command = fs.readFileSync(path.join(dir, '.claude', 'commands', 'cortex.md'), 'utf8')
      expect(command).toBe(existing)
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

  it('does not treat commented cortexEditor text as configured', async () => {
    const viteConfig = [
      'import { defineConfig } from "vite"',
      '',
      '// TODO: add cortexEditor() after installing Cortex',
      'export default defineConfig({ plugins: [] })',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^6.0.0"}}',
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
      expect(content).toContain('plugins: [cortexEditor(), react()]')
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

  it('detects cortexEditor when Vite plugins are referenced by identifier', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      'import react from \'@vitejs/plugin-react\'',
      'import { cortexEditor } from \'cortex-editor/vite\'',
      '',
      'const plugins = [react(), cortexEditor()]',
      '',
      'export default defineConfig({',
      '  plugins,',
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
      expect(result.setupComplete).toBe(true)
      expect(fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')).toBe(viteConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('warns instead of crashing on unsupported CommonJS Vite config export shapes', async () => {
    const viteConfig = 'exports.config = { plugins: [] }\n'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^5.1.0"}}',
      'vite.config.cjs': viteConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)

        expect(result.detectedBundler).toBe('vite')
        expect(result.vitePluginInjected).toBe(false)
        expect(result.setupComplete).toBe(false)
        expect(fs.readFileSync(path.join(dir, 'vite.config.cjs'), 'utf8')).toBe(viteConfig)
        expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false)
        expect(warnSpy.mock.calls.flat().join('\n')).toContain(
          'Vite config cannot be auto-configured'
        )
      } finally {
        warnSpy.mockRestore()
      }
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
          cwd: dir,
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
            cwd: dir,
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
          cwd: dir,
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

  it('injects cortexEditor into CommonJS Vite config objects', async () => {
    const viteConfig = [
      'const { defineConfig } = require("vite")',
      '',
      'module.exports = defineConfig({',
      '  plugins: [],',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^6.0.0"}}',
      'vite.config.cjs': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.cjs'), 'utf8')
      expect(content).toContain('const { cortexEditor } = require("cortex-editor/vite")')
      expect(content).toContain('plugins: [cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexEditor into CommonJS Vite object-literal configs', async () => {
    const viteConfig = [
      'module.exports = {',
      '  plugins: [],',
      '}',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","vite":"^6.0.0"}}',
      'vite.config.cjs': viteConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
      expect(result.vitePluginInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'vite.config.cjs'), 'utf8')
      expect(content).toContain('const { cortexEditor } = require("cortex-editor/vite")')
      expect(content).toContain('plugins: [cortexEditor()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects withCortex into ESM Next config', async () => {
    const nextConfig = [
      'const nextConfig = { reactStrictMode: true }',
      'export default nextConfig',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.nextConfigFound).toBe(true)
      expect(result.nextConfigInjected).toBe(true)
      expect(result.vitePluginFound).toBe(null)
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('import { withCortex } from "cortex-editor/next"')
      expect(content).toContain('export default withCortex(nextConfig)')
      expect(content).toContain('reactStrictMode: true')
    } finally {
      cleanup(dir)
    }
  })

  it('injects withCortex into CommonJS Next config', async () => {
    const nextConfig = [
      'const nextConfig = { reactStrictMode: true }',
      'module.exports = nextConfig',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.cjs': nextConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.nextConfigFound).toBe(true)
      expect(result.nextConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.cjs'), 'utf8')
      expect(content).toContain('const { withCortex } = require("cortex-editor/next")')
      expect(content).toContain('module.exports = withCortex(nextConfig)')
    } finally {
      cleanup(dir)
    }
  })

  it('skips Next injection when withCortex already wraps the config', async () => {
    const nextConfig = [
      'const { withCortex } = require("cortex-editor/next")',
      'const nextConfig = { reactStrictMode: true }',
      'module.exports = withCortex(nextConfig)',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.cjs': nextConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.nextConfigFound).toBe(true)
      expect(result.nextConfigInjected).toBe(false)
      const content = fs.readFileSync(path.join(dir, 'next.config.cjs'), 'utf8')
      expect(content).toBe(nextConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat commented withCortex text as configured', async () => {
    const nextConfig = [
      '// withCortex should be added by cortex init',
      'const nextConfig = { reactStrictMode: true }',
      'module.exports = nextConfig',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.cjs': nextConfig,
    })
    try {
      const result = await runInit(dir)
      expect(result.nextConfigFound).toBe(true)
      expect(result.nextConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.cjs'), 'utf8')
      expect(content).toContain('const { withCortex } = require("cortex-editor/next")')
      expect(content).toContain('module.exports = withCortex(nextConfig)')
    } finally {
      cleanup(dir)
    }
  })

  it('does not inject Vite when a Next config is present', async () => {
    const nextConfig = [
      'const nextConfig = { reactStrictMode: true }',
      'export default nextConfig',
    ].join('\n')
    const viteConfig = [
      'import { defineConfig } from "vite"',
      'export default defineConfig({ plugins: [] })',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0","vite":"^6.0.0"}}',
      'next.config.mjs': nextConfig,
      'vite.config.ts': viteConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)
        expect(result.nextConfigInjected).toBe(true)
        expect(result.vitePluginFound).toBe(null)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('skipping Vite setup to avoid configuring auxiliary tooling')
        )
      } finally {
        warnSpy.mockRestore()
      }
      const nextContent = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      const viteContent = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      expect(nextContent).toContain('withCortex(nextConfig)')
      expect(viteContent).toBe(viteConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('warns and skips Webpack when a Vite config is selected', async () => {
    const viteConfig = [
      'import { defineConfig } from "vite"',
      'export default defineConfig({ plugins: [] })',
    ].join('\n')
    const webpackConfig = 'module.exports = {}'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","vite":"^6.0.0","webpack":"^5.0.0"}}',
      'vite.config.ts': viteConfig,
      'webpack.config.js': webpackConfig,
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)
        expect(result.vitePluginInjected).toBe(true)
        expect(result.webpackConfigFound).toBe(true)
        expect(result.webpackConfigInjected).toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('skipping Webpack setup because Vite is the selected app adapter')
        )
      } finally {
        warnSpy.mockRestore()
      }
      const viteContent = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8')
      const webpackContent = fs.readFileSync(path.join(dir, 'webpack.config.js'), 'utf8')
      expect(viteContent).toContain('cortexEditor()')
      expect(webpackContent).toBe(webpackConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('wraps dynamic Next config functions without dropping runtime arguments', async () => {
    const nextConfig = 'export default () => ({ reactStrictMode: true })'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('export default async (...args) => withCortex(await (() => ({ reactStrictMode: true }))(...args))')
    } finally {
      cleanup(dir)
    }
  })

  it('wraps Next default export identifiers that resolve to function configs', async () => {
    const nextConfig = [
      'const nextConfig = () => ({ reactStrictMode: true })',
      'export default nextConfig',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.nextConfigInjected).toBe(true)
      expect(result.setupComplete).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toContain('const nextConfig = () => ({ reactStrictMode: true })')
      expect(content).toContain('export default async (...args) => withCortex(await (nextConfig)(...args))')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexWebpack into standalone CommonJS webpack config', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.js': 'module.exports = {}',
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      expect(result.vitePluginFound).toBe(null)
      expect(result.nextConfigFound).toBe(null)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.js'), 'utf8')
      expect(content).toContain('const { cortexWebpack } = require("cortex-editor/webpack")')
      expect(content).toContain('plugins: [cortexWebpack()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexWebpack when a CommonJS webpack config exports an identifier', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.cjs': [
        'const config = { mode: "development" }',
        'module.exports = config',
      ].join('\n'),
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.cjs'), 'utf8')
      expect(content).toContain('const { cortexWebpack } = require("cortex-editor/webpack")')
      expect(content).toContain('const config = { mode: "development",')
      expect(content).toContain('plugins: [cortexWebpack()]')
      expect(content).toContain('module.exports = config')
    } finally {
      cleanup(dir)
    }
  })

  it('preserves a CommonJS directive prologue when inserting cortexWebpack require', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.cjs': [
        '#!/usr/bin/env node',
        "'use strict'",
        '',
        'module.exports = { mode: "development" }',
      ].join('\n'),
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.cjs'), 'utf8')
      expect(content.startsWith('#!/usr/bin/env node\n')).toBe(true)
      expect(content.indexOf("'use strict'")).toBeLessThan(
        content.indexOf('const { cortexWebpack } = require("cortex-editor/webpack")')
      )
      expect(content).toContain('plugins: [cortexWebpack()]')
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat commented cortexWebpack text as configured', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.cjs': [
        '// cortexWebpack() belongs in plugins',
        'module.exports = { mode: "development" }',
      ].join('\n'),
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.cjs'), 'utf8')
      expect(content).toContain('const { cortexWebpack } = require("cortex-editor/webpack")')
      expect(content).toContain('plugins: [cortexWebpack()]')
    } finally {
      cleanup(dir)
    }
  })

  it('classifies CommonJS configs from AST so commented export default text does not force ESM injection', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.js': [
        '// export default { mode: "development" }',
        'module.exports = { mode: "development" }',
      ].join('\n'),
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.js'), 'utf8')
      expect(content).toContain('const { cortexWebpack } = require("cortex-editor/webpack")')
      expect(content).not.toContain('import { cortexWebpack }')
      expect(content).toContain('plugins: [cortexWebpack()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexWebpack into standalone ESM webpack config', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.mjs': 'export default { mode: "development" }',
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.mjs'), 'utf8')
      expect(content).toContain('cortex-editor/webpack')
      expect(content).toContain('plugins: [cortexWebpack()]')
    } finally {
      cleanup(dir)
    }
  })

  it('injects cortexWebpack when an ESM webpack config exports an identifier', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","webpack":"^5.0.0"}}',
      'webpack.config.mjs': [
        'const config = { mode: "development" }',
        'export default config',
      ].join('\n'),
    })
    try {
      const result = await runInit(dir)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.mjs'), 'utf8')
      expect(content).toContain('import { cortexWebpack } from "cortex-editor/webpack"')
      expect(content).toContain('const config = { mode: "development",')
      expect(content).toContain('plugins: [cortexWebpack()]')
      expect(content).toContain('export default config')
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
          cwd: dir,
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
      expect(content).toContain('plugins: [cortexEditor(), react()]')
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
      expect(content).toContain('import { withCortex } from "cortex-editor/next"')
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
      expect(content).toContain('import { withCortex } from "cortex-editor/next"')
      expect(content).toContain('export default withCortex({ reactStrictMode: true })')
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat commented module.exports text as a CommonJS Next.js config', async () => {
    const nextConfig = [
      '// Legacy example: module.exports = {}',
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
      expect(content).toContain('import { withCortex } from "cortex-editor/next"')
      expect(content).toContain('export default withCortex({ reactStrictMode: true })')
      expect(content).not.toContain('module.exports = withCortex')
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
      expect(content).toContain('const { withCortex } = require("cortex-editor/next")')
      expect(content).toContain('module.exports = withCortex({ reactStrictMode: true })')
    } finally {
      cleanup(dir)
    }
  })

  it('ignores exports.* assignments when locating the CommonJS Next.js config export', async () => {
    const nextConfig = [
      'exports.metadata = { reactStrictMode: false }',
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
      expect(content).toContain('exports.metadata = { reactStrictMode: false }')
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

  it('configures CommonJS .cjs Next.js configs', async () => {
    const originalConfig = 'module.exports = { reactStrictMode: true }\n'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.cjs': originalConfig,
    })
    try {
      const result = await runInit(dir)

      expect(result.detectedBundler).toBe('next')
      expect(result.nextConfigFound).toBe(true)
      expect(result.nextConfigInjected).toBe(true)
      expect(result.nextConfigCreated).toBe(false)
      expect(result.setupComplete).toBe(true)
      expect(fs.existsSync(path.join(dir, 'next.config.mjs'))).toBe(false)
      const content = fs.readFileSync(path.join(dir, 'next.config.cjs'), 'utf8')
      expect(content).toContain('const { withCortex } = require("cortex-editor/next")')
      expect(content).toContain('module.exports = withCortex({ reactStrictMode: true })')
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
      'react-scripts dependency',
      {
        'package.json': '{"name":"test","dependencies":{"react-scripts":"^5.0.0"},"devDependencies":{"cortex-editor":"^0.1.0"}}',
      },
    ],
  ] as Array<[string, Record<string, string>]>)
  ('does not claim setup is complete for %s without a Webpack config file', async (_caseName, files) => {
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
        expect(result.webpackConfigFound).toBe(false)
        expect(result.webpackConfigInjected).toBe(false)
        expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false)
        expect(fs.existsSync(path.join(dir, 'webpack.config.js'))).toBe(false)

        const warnings = warnSpy.mock.calls.flat().join('\n')
        expect(warnings).toContain('no webpack.config.* file was found')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      cleanup(dir)
    }
  })

  it('configures a Webpack config even when webpack is not listed in package.json', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'webpack.config.js': 'module.exports = {}\n',
    })
    try {
      const result = await runInit(dir)

      expect(result.detectedBundler).toBe('webpack')
      expect(result.setupComplete).toBe(true)
      expect(result.viteConfigCreated).toBe(false)
      expect(result.webpackConfigFound).toBe(true)
      expect(result.webpackConfigInjected).toBe(true)
      expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false)
      const content = fs.readFileSync(path.join(dir, 'webpack.config.js'), 'utf8')
      expect(content).toContain('const { cortexWebpack } = require("cortex-editor/webpack")')
      expect(content).toContain('plugins: [cortexWebpack()]')
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

describe('injectDevScriptsIntoLayout', () => {
  const LAYOUT = [
    'export default function RootLayout({ children }: { children: React.ReactNode }) {',
    '  return (',
    '    <html lang="en">',
    '      <body className="antialiased">{children}</body>',
    '    </html>',
    '  )',
    '}',
    '',
  ].join('\n')

  it('inserts the import and element inside <body> of app/layout.tsx', () => {
    const dir = makeTmpProject({ 'app/layout.tsx': LAYOUT })
    const result = injectDevScriptsIntoLayout(dir)
    expect(result.status).toBe('inserted')
    const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
    expect(content.startsWith("import { CortexDevScripts } from 'cortex-editor/next'")).toBe(true)
    expect(content).toContain('<body className="antialiased">\n        <CortexDevScripts />')
  })

  it('finds src/app/layout.tsx when app/ is nested under src/', () => {
    const dir = makeTmpProject({ 'src/app/layout.tsx': LAYOUT })
    const result = injectDevScriptsIntoLayout(dir)
    expect(result.status).toBe('inserted')
    expect(fs.readFileSync(path.join(dir, 'src', 'app', 'layout.tsx'), 'utf8')).toContain('<CortexDevScripts />')
  })

  it('is idempotent — reports already when the component is present', () => {
    const dir = makeTmpProject({ 'app/layout.tsx': LAYOUT })
    injectDevScriptsIntoLayout(dir)
    const afterFirst = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
    expect(injectDevScriptsIntoLayout(dir).status).toBe('already')
    expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(afterFirst)
  })

  it('reports not-found when no root layout exists', () => {
    const dir = makeTmpProject({})
    expect(injectDevScriptsIntoLayout(dir).status).toBe('not-found')
  })

  it('bails without writing when the layout has no <body> tag', () => {
    const custom = 'export default function RootLayout() { return null }\n'
    const dir = makeTmpProject({ 'app/layout.tsx': custom })
    expect(injectDevScriptsIntoLayout(dir).status).toBe('no-body-tag')
    expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(custom)
  })

  it('inserts correctly when <body> has a > inside an attribute expression', () => {
    const layout = [
      'export default function RootLayout(',
      '  { children, count }: { children: React.ReactNode; count: number },',
      ') {',
      '  return (',
      '    <html lang="en">',
      "      <body className={count > 2 ? 'a' : 'b'}>{children}</body>",
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      // The element is inserted exactly once...
      expect((content.match(/<CortexDevScripts/g) ?? []).length).toBe(1)
      // ...the className attribute survives intact (the old regex split it at `count >`)...
      expect(content).toContain("className={count > 2 ? 'a' : 'b'}")
      // ...and the element lands as a child of <body>, not inside the attribute.
      expect(content).toContain("<body className={count > 2 ? 'a' : 'b'}>\n        <CortexDevScripts />")
    } finally {
      cleanup(dir)
    }
  })

  it.each([['use client'], ['use server']] as const)(
    "rejects a '%s' root layout and leaves it byte-for-byte unchanged",
    (directive) => {
      const layout = [
        `'${directive}'`,
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html lang="en">',
        '      <body>{children}</body>',
        '    </html>',
        '  )',
        '}',
        '',
      ].join('\n')
      const dir = makeTmpProject({ 'app/layout.tsx': layout })
      try {
        const result = injectDevScriptsIntoLayout(dir)
        // CortexDevScripts transitively imports server-only fs/path; importing it
        // into a client-component graph makes Next FAIL compilation. Bail without
        // touching the file.
        expect(result.status).toBe('client-layout-unsupported')
        expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(layout)
      } finally {
        cleanup(dir)
      }
    }
  )

  it('inserts when CortexDevScripts appears only in a comment (not a rendered element)', () => {
    const layout = [
      '// TODO: render CortexDevScripts somewhere in here',
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      expect(content).toContain('<CortexDevScripts />')
      expect(content).toContain("import { CortexDevScripts } from 'cortex-editor/next'")
    } finally {
      cleanup(dir)
    }
  })

  it('reports already without rewriting when a real <CortexDevScripts /> element is present', () => {
    const layout = [
      "import { CortexDevScripts } from 'cortex-editor/next'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        <CortexDevScripts />',
      '        {children}',
      '      </body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const before = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('already')
      expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(before)
    } finally {
      cleanup(dir)
    }
  })

  it('returns parse-error (not false success) on a syntactically broken layout (silent-failure review)', () => {
    // ts-morph parses leniently; without an assertParseable guard a broken
    // layout could match <body>, get an insertion, and report 'inserted'.
    const broken = 'export default function RootLayout({ children }) { return ( <html><body>{children</body' // unclosed
    const dir = makeTmpProject({ 'app/layout.tsx': broken })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('parse-error')
      // File left untouched.
      expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(broken)
    } finally {
      cleanup(dir)
    }
  })

  it('bails with name-conflict on a type-only CortexDevScripts import (codex delta P2)', () => {
    // `import type` cannot render the element at runtime, and a value import of
    // the same name would collide with it — unfixable without editing the
    // user's imports. Must NOT report already/inserted (both would be lies).
    const layout = [
      "import type { CortexDevScripts } from 'cortex-editor/next'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const before = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('name-conflict')
      expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(before)
    } finally {
      cleanup(dir)
    }
  })

  it('treats a local CortexDevScripts declaration as a usable binding — no conflicting import (codex delta P2)', () => {
    // A locally-declared component named CortexDevScripts renders itself;
    // inserting our import would duplicate the identifier.
    const layout = [
      'function CortexDevScripts() { return null }',
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        <CortexDevScripts />',
      '        {children}',
      '      </body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const before = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('already')
      expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(before)
    } finally {
      cleanup(dir)
    }
  })

  it('does not insert a duplicate import when CortexDevScripts is already bound from another module (review [0]/[2])', () => {
    // The element is rendered and CortexDevScripts is already in scope from a
    // re-export barrel. Inserting our own import would duplicate the local name
    // (TS2300). Report 'already' and leave the file untouched.
    const layout = [
      "import { CortexDevScripts } from '@/lib/cortex'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        <CortexDevScripts />',
      '        {children}',
      '      </body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const before = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('already')
      expect(fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')).toBe(before)
    } finally {
      cleanup(dir)
    }
  })

  it('inserts the element but no duplicate import when a barrel binding exists without a rendered element (review [0]/[2])', () => {
    const layout = [
      "import { CortexDevScripts } from '@/lib/cortex'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      expect(content).toContain('<CortexDevScripts />')
      // No second CortexDevScripts import — the barrel binding already resolves it.
      expect((content.match(/import \{ CortexDevScripts \}/g) ?? []).length).toBe(1)
      expect(content).not.toContain("from 'cortex-editor/next'")
    } finally {
      cleanup(dir)
    }
  })

  it('reconciles a usable import when the element is present but only an aliased import exists (cubic P1)', () => {
    // Element rendered, but the only import is aliased — the layout would not
    // compile (`CortexDevScripts` is undefined). Reporting 'already' here would
    // claim success on a broken layout; instead add a usable import.
    const layout = [
      "import { CortexDevScripts as CDS } from 'cortex-editor/next'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        <CortexDevScripts />',
      '        {children}',
      '      </body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      // A usable (non-aliased) CortexDevScripts import now exists.
      expect(content).toContain("import { CortexDevScripts } from 'cortex-editor/next'")
    } finally {
      cleanup(dir)
    }
  })

  it('inserts the element (without duplicating the import) when the import exists but nothing renders it', () => {
    const layout = [
      "import { CortexDevScripts } from 'cortex-editor/next'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      expect(content).toContain('<CortexDevScripts />')
      // The pre-existing import must not be duplicated (a second one is a TS redeclare error).
      expect((content.match(/import \{ CortexDevScripts \}/g) ?? []).length).toBe(1)
    } finally {
      cleanup(dir)
    }
  })

  it('adds a usable CortexDevScripts import when only an aliased import exists (3E)', () => {
    const layout = [
      "import { CortexDevScripts as CDS } from 'cortex-editor/next'",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      // The rendered <CortexDevScripts /> needs a binding by that exact name; the
      // aliased import (CDS) alone would leave the JSX identifier undefined at
      // build time. A usable non-aliased import must therefore be added.
      expect(content).toContain('<CortexDevScripts />')
      expect(content).toMatch(/import \{ CortexDevScripts \} from ['"]cortex-editor\/next['"]/)
      // The pre-existing aliased import is preserved, not clobbered.
      expect(content).toContain('CortexDevScripts as CDS')
    } finally {
      cleanup(dir)
    }
  })

  it('targets the real <body>, not a commented-out one earlier in the JSX', () => {
    const layout = [
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      {/* <body>old shell</body> */}',
      '      <body className="real">{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const dir = makeTmpProject({ 'app/layout.tsx': layout })
    try {
      const result = injectDevScriptsIntoLayout(dir)
      expect(result.status).toBe('inserted')
      const content = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
      expect((content.match(/<CortexDevScripts/g) ?? []).length).toBe(1)
      // The element belongs to the real <body>, not lodged inside the JSX comment.
      expect(content).toContain('<body className="real">\n        <CortexDevScripts />')
      expect(content).toContain('{/* <body>old shell</body> */}')
    } finally {
      cleanup(dir)
    }
  })
})
