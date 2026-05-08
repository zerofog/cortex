import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runInit } from '../../src/cli/init.js'

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
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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

  it('injects cortexEditor into defineConfig with no plugins', async () => {
    const viteConfig = [
      'import { defineConfig } from \'vite\'',
      '',
      'export default defineConfig({',
      '  server: { port: 3000 },',
      '})',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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

  it('throws on dynamic Next config functions instead of guessing how to wrap them', async () => {
    const nextConfig = 'export default () => ({ reactStrictMode: true })'
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('dynamic Next config functions')
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toBe(nextConfig)
    } finally {
      cleanup(dir)
    }
  })

  it('throws when a Next default export identifier resolves to a function config', async () => {
    const nextConfig = [
      'const nextConfig = () => ({ reactStrictMode: true })',
      'export default nextConfig',
    ].join('\n')
    const dir = makeTmpProject({
      'package.json': '{"name":"test","type":"module","devDependencies":{"cortex-editor":"^0.1.0","next":"^16.0.0"}}',
      'next.config.mjs': nextConfig,
    })
    try {
      await expect(runInit(dir)).rejects.toThrow('dynamic Next config functions')
      const content = fs.readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
      expect(content).toBe(nextConfig)
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
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
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

  it('warns when cortex-editor not in dependencies', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","dependencies":{}}',
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await runInit(dir)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('cortex-editor not in dependencies')
        )
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
