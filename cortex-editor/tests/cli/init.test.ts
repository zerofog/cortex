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

  it('detects cortexEditor in vite.config.ts', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'vite.config.ts': 'import { cortexEditor } from "cortex-editor/vite"\nexport default { plugins: [cortexEditor()] }',
    })
    try {
      const result = await runInit(dir)
      expect(result.vitePluginFound).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('warns when cortexEditor not found in vite config', async () => {
    const dir = makeTmpProject({
      'package.json': '{"name":"test","devDependencies":{"cortex-editor":"^0.1.0"}}',
      'vite.config.ts': 'export default { plugins: [] }',
    })
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const result = await runInit(dir)
        expect(result.vitePluginFound).toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('cortexEditor plugin NOT found')
        )
      } finally {
        warnSpy.mockRestore()
      }
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
})
