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
