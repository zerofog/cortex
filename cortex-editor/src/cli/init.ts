import fs from 'node:fs'
import path from 'node:path'

export interface InitResult {
  mcpWritten: boolean
  vitePluginFound: boolean | null
  depFound: boolean
}

export async function runInit(cwd: string = process.cwd()): Promise<InitResult> {
  // 1. Check for package.json and parse it once (used later for dep check)
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found. Run this from your project root.')
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    throw new Error(
      `package.json: failed to parse — ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 2. Write/update .mcp.json
  const mcpPath = path.join(cwd, '.mcp.json')
  let mcpConfig: Record<string, unknown> = {}
  let mcpWritten = false

  if (fs.existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
    } catch (err) {
      throw new Error(
        `.mcp.json: failed to parse — ${err instanceof Error ? err.message : String(err)}\n` +
        'Fix the JSON syntax and re-run cortex init.'
      )
    }
    if (typeof mcpConfig !== 'object' || mcpConfig === null || Array.isArray(mcpConfig)) {
      throw new Error('.mcp.json: root value must be a JSON object.')
    }
  }

  // Validate mcpServers is an object if present
  const rawServers = mcpConfig.mcpServers
  if (rawServers !== undefined && rawServers !== null &&
      (typeof rawServers !== 'object' || Array.isArray(rawServers))) {
    throw new Error('.mcp.json: "mcpServers" must be an object.')
  }
  const servers = (rawServers ?? {}) as Record<string, unknown>

  if (servers.cortex) {
    console.log('  .mcp.json: cortex already configured')
  } else {
    servers.cortex = { command: 'npx', args: ['cortex', 'mcp'] }
    mcpConfig.mcpServers = servers
    fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n')
    console.log('  .mcp.json: added cortex MCP server')
    mcpWritten = true
  }

  // 3. Check Vite config for cortexEditor plugin
  let vitePluginFound: boolean | null = null
  const viteConfigPath = [
    'vite.config.ts', 'vite.config.js', 'vite.config.mts',
    'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs',
  ]
    .map(f => path.join(cwd, f))
    .find(f => fs.existsSync(f))

  if (viteConfigPath) {
    const content = fs.readFileSync(viteConfigPath, 'utf8')
    vitePluginFound = content.includes('cortexEditor')
    if (vitePluginFound) {
      console.log(`  ${path.basename(viteConfigPath)}: cortexEditor plugin found`)
    } else {
      console.warn(`  ${path.basename(viteConfigPath)}: cortexEditor plugin NOT found`)
      console.warn('    Add to your Vite config: plugins: [cortexEditor()]')
      console.warn('    Import: import { cortexEditor } from "cortex-editor/vite"')
    }
  } else {
    console.warn('  No vite.config found — skipping plugin check')
  }

  // 4. Check cortex-editor is installed
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const depFound = Boolean(allDeps['cortex-editor'])
  if (!depFound) {
    console.warn('  cortex-editor not in dependencies. Run: npm install -D cortex-editor')
  }

  console.log('')
  console.log('Setup complete. Restart your editor to pick up the MCP server.')

  return { mcpWritten, vitePluginFound, depFound }
}
