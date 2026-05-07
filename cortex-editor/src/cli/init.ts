import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Project, SyntaxKind, ts, type SourceFile, type ObjectLiteralExpression } from 'ts-morph'
import {
  detectBundler,
  detectPackageManager,
  hasDependency,
  type BundlerKind,
  type PackageJson,
  type PackageManager,
} from './detect.js'

const VITE_SETUP_PACKAGES = ['vite', '@vitejs/plugin-react'] as const

export interface PromptInstallRequest {
  packageManager: PackageManager
  packages: string[]
  reason: 'missing-bundler' | 'missing-vite-config' | 'missing-vite-peer'
}

export interface InstallPackagesRequest {
  packageManager: PackageManager
  command: string
  args: string[]
  cwd: string
  packages: string[]
}

export interface InitOptions {
  promptInstall?: (request: PromptInstallRequest) => Promise<boolean>
  installPackages?: (request: InstallPackagesRequest) => Promise<void>
}

/**
 * Find the config object literal in a Vite config file.
 * Supports: `export default defineConfig({...})` and `export default {...}`
 */
function findConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  // Look for `export default ...`
  const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
  if (!defaultExport) return undefined

  const expr = defaultExport.getExpression()

  // Case 1: `export default defineConfig({...})` — call expression with object arg
  if (expr.getKind() === SyntaxKind.CallExpression) {
    const callExpr = expr.asKindOrThrow(SyntaxKind.CallExpression)
    const firstArg = callExpr.getArguments()[0]
    if (firstArg?.getKind() === SyntaxKind.ObjectLiteralExpression) {
      return firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    }
  }

  // Case 2: `export default {...}` — bare object literal
  if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
  }

  return undefined
}

export interface InitResult {
  mcpWritten: boolean
  vitePluginFound: boolean | null
  vitePluginInjected: boolean
  viteConfigCreated: boolean
  nextConfigFound: boolean | null
  nextConfigInjected: boolean
  nextConfigCreated: boolean
  depFound: boolean
  detectedBundler: BundlerKind
  packageManager: PackageManager
  setupComplete: boolean
}

function createInstallRequest(
  packageManager: PackageManager,
  packages: string[],
  cwd: string
): InstallPackagesRequest {
  if (packageManager === 'pnpm') {
    return {
      packageManager,
      command: 'pnpm',
      args: ['add', '-D', ...packages],
      cwd,
      packages,
    }
  }
  if (packageManager === 'yarn') {
    return {
      packageManager,
      command: 'yarn',
      args: ['add', '-D', ...packages],
      cwd,
      packages,
    }
  }
  if (packageManager === 'bun') {
    return {
      packageManager,
      command: 'bun',
      args: ['add', '-d', ...packages],
      cwd,
      packages,
    }
  }
  return {
    packageManager,
    command: 'npm',
    args: ['install', '-D', ...packages],
    cwd,
    packages,
  }
}

async function defaultInstallPackages(request: InstallPackagesRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${request.command} ${request.args.join(' ')} exited with ${code}`))
      }
    })
  })
}

async function defaultPromptInstall(request: PromptInstallRequest): Promise<boolean> {
  if (!stdin.isTTY) return false

  const command = createInstallRequest(request.packageManager, request.packages, process.cwd())
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await rl.question(
      `Cortex needs ${request.packages.join(' and ')} to configure source annotations. Run "${command.command} ${command.args.join(' ')}" now? [Y/n] `
    )
    return answer.trim() === '' || /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

function writeViteConfig(cwd: string): string {
  const viteConfigPath = path.join(cwd, 'vite.config.ts')
  const content = [
    'import { defineConfig } from \'vite\'',
    'import react from \'@vitejs/plugin-react\'',
    'import { cortexEditor } from \'cortex-editor/vite\'',
    '',
    'export default defineConfig({',
    '  plugins: [react(), cortexEditor()],',
    '})',
    '',
  ].join('\n')
  fs.writeFileSync(viteConfigPath, content)
  console.log('  vite.config.ts: created with cortexEditor plugin')
  return viteConfigPath
}

function isFunctionExpression(expression: string): boolean {
  const trimmed = expression.trim()
  return (
    /^(async\s+)?function\b/.test(trimmed) ||
    /^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed)
  )
}

function isFunctionIdentifier(content: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    new RegExp(`\\b(async\\s+)?function\\s+${escaped}\\s*\\(`).test(content) ||
    new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`).test(content)
  )
}

function shouldWrapAsNextFunction(content: string, expression: string): boolean {
  const trimmed = expression.trim()
  return isFunctionExpression(trimmed) || (
    /^[A-Za-z_$][\w$]*$/.test(trimmed) && isFunctionIdentifier(content, trimmed)
  )
}

function addEsmWithCortex(content: string): string | null {
  const match = content.match(/export\s+default\s+([\s\S]*?)\s*;?\s*$/)
  if (!match || match.index === undefined) return null

  const before = content.slice(0, match.index)
  const expression = match[1]!.trim().replace(/;\s*$/, '')
  const separator = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const exportExpression = shouldWrapAsNextFunction(content, expression)
    ? `async (...args) => withCortex(await (${expression})(...args))`
    : `withCortex(${expression})`
  return [
    'import { withCortex } from \'cortex-editor/next\'',
    `${before}${separator}export default ${exportExpression}`,
    '',
  ].join('\n')
}

function addCjsWithCortex(content: string): string | null {
  const match = content.match(/module\.exports\s*=\s*([\s\S]*?)\s*;?\s*$/)
  if (!match || match.index === undefined) return null

  const before = content.slice(0, match.index)
  const expression = match[1]!.trim().replace(/;\s*$/, '')
  const separator = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const exportExpression = shouldWrapAsNextFunction(content, expression)
    ? `async (...args) => withCortex(await (${expression})(...args))`
    : `withCortex(${expression})`
  return [
    'const { withCortex } = require(\'cortex-editor/next\')',
    `${before}${separator}module.exports = ${exportExpression}`,
    '',
  ].join('\n')
}

function configureNext(
  cwd: string,
  configPath: string | null,
  unsupportedConfigPath: string | null = null
): {
  found: boolean | null
  injected: boolean
  created: boolean
  configured: boolean
} {
  if (!configPath && unsupportedConfigPath) {
    const basename = path.basename(unsupportedConfigPath)
    console.warn(
      `  ${basename}: Next.js does not support this config extension. Rename it to next.config.js, next.config.mjs, or next.config.ts, then re-run cortex init.`
    )
    return { found: false, injected: false, created: false, configured: false }
  }

  if (!configPath) {
    const nextConfigPath = path.join(cwd, 'next.config.mjs')
    fs.writeFileSync(nextConfigPath, [
      'import { withCortex } from \'cortex-editor/next\'',
      '',
      'export default withCortex({})',
      '',
    ].join('\n'))
    console.log('  next.config.mjs: created with withCortex()')
    return { found: true, injected: true, created: true, configured: true }
  }

  const basename = path.basename(configPath)
  const content = fs.readFileSync(configPath, 'utf8')
  if (content.includes('withCortex')) {
    console.log(`  ${basename}: withCortex config found`)
    return { found: true, injected: false, created: false, configured: true }
  }

  const isCjs = content.includes('module.exports')
  const nextContent = isCjs ? addCjsWithCortex(content) : addEsmWithCortex(content)
  if (!nextContent) {
    console.warn(
      `  ${basename}: could not auto-configure Next.js — wrap your config with withCortex() from cortex-editor/next`
    )
    return { found: false, injected: false, created: false, configured: false }
  }

  fs.writeFileSync(configPath, nextContent)
  console.log(`  ${basename}: withCortex config injected`)
  return { found: true, injected: true, created: false, configured: true }
}

async function ensurePackages(
  cwd: string,
  pkg: PackageJson,
  packageManager: PackageManager,
  packages: readonly string[],
  reason: PromptInstallRequest['reason'],
  options: InitOptions
): Promise<boolean> {
  const missing = packages.filter(name => !hasDependency(pkg, name))
  if (missing.length === 0) return true

  const promptInstall = options.promptInstall ?? defaultPromptInstall
  const approved = await promptInstall({ packageManager, packages: missing, reason })
  if (!approved) {
    const installRequest = createInstallRequest(packageManager, missing, cwd)
    console.warn('  Cortex setup incomplete: Vite is required to add source annotations.')
    console.warn(`  Install Vite with: ${installRequest.command} ${installRequest.args.join(' ')}`)
    console.warn('  Then re-run: npx cortex init')
    return false
  }

  const installPackages = options.installPackages ?? defaultInstallPackages
  const installRequest = createInstallRequest(packageManager, missing, cwd)
  await installPackages(installRequest)
  return true
}

export async function runInit(
  cwd: string = process.cwd(),
  options: InitOptions = {}
): Promise<InitResult> {
  // 1. Check for package.json and parse it once (used later for dep check)
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found. Run this from your project root.')
  }

  let pkg: PackageJson
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

  const detected = detectBundler(cwd, pkg)
  const packageManager = detectPackageManager(cwd, pkg)

  // 3. Configure the detected bundler.
  let vitePluginFound: boolean | null = null
  let vitePluginInjected = false
  let viteConfigCreated = false
  let nextConfigFound: boolean | null = null
  let nextConfigInjected = false
  let nextConfigCreated = false
  let bundlerConfigured = false

  const configureVite = async (viteConfigPath: string | null): Promise<void> => {
    if (!viteConfigPath) {
      const installed = await ensurePackages(
        cwd,
        pkg,
        packageManager,
        VITE_SETUP_PACKAGES,
        detected.kind === 'none' ? 'missing-bundler' : 'missing-vite-config',
        options
      )
      if (!installed) return

      writeViteConfig(cwd)
      vitePluginFound = true
      vitePluginInjected = true
      viteConfigCreated = true
      bundlerConfigured = true
      return
    }

    const vitePeerInstalled = await ensurePackages(
      cwd,
      pkg,
      packageManager,
      ['vite'],
      'missing-vite-peer',
      options
    )
    const basename = path.basename(viteConfigPath)
    const content = fs.readFileSync(viteConfigPath, 'utf8')

    if (content.includes('cortexEditor')) {
      vitePluginFound = true
      console.log(`  ${basename}: cortexEditor plugin found`)
      bundlerConfigured = vitePeerInstalled
    } else {
      // Attempt AST-based injection
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          allowJs: true,
          noResolve: true,
          skipLibCheck: true,
        },
      })
      // Use .ts extension to enable full syntax support regardless of actual file extension
      const sourceFile = project.createSourceFile('vite.config.ts', content)

      // Check for syntax-level parse errors only (not type errors)
      const syntaxDiag = sourceFile.getPreEmitDiagnostics()
        .filter(d => d.getCode() >= 1000 && d.getCode() < 2000)
      if (syntaxDiag.length > 0) {
        const raw = syntaxDiag[0]!.getMessageText()
        const text = typeof raw === 'string'
          ? raw
          : ts.flattenDiagnosticMessageText(raw.compilerObject, '\n')
        throw new Error(`${basename}: failed to parse — ${text}`)
      }

      // Find the config object literal
      const configObject = findConfigObject(sourceFile)
      if (!configObject) {
        throw new Error(
          `${basename}: could not find config object — expected defineConfig({...}) or export default {...}`
        )
      }

      // Find or create the plugins property
      let pluginAdded = false
      const pluginsProp = configObject.getProperty('plugins')
      if (pluginsProp) {
        const initializer = pluginsProp.getChildrenOfKind(SyntaxKind.ArrayLiteralExpression)[0]
        if (initializer) {
          initializer.addElement('cortexEditor()')
          pluginAdded = true
        } else {
          console.warn(`  ${basename}: plugins is not an array literal — add cortexEditor() manually`)
        }
      } else {
        configObject.addPropertyAssignment({
          name: 'plugins',
          initializer: '[cortexEditor()]',
        })
        pluginAdded = true
      }

      if (pluginAdded) {
        sourceFile.addImportDeclaration({
          namedImports: ['cortexEditor'],
          moduleSpecifier: 'cortex-editor/vite',
        })
        fs.writeFileSync(viteConfigPath, sourceFile.getFullText())
        vitePluginFound = true
        vitePluginInjected = true
        bundlerConfigured = vitePeerInstalled
        console.log(`  ${basename}: cortexEditor plugin injected`)
      } else {
        vitePluginFound = false
      }
    }
  }

  if (detected.kind === 'vite' || detected.kind === 'none') {
    await configureVite(detected.configPath)
  } else if (detected.kind === 'next') {
    const nextResult = configureNext(cwd, detected.configPath, detected.unsupportedConfigPath ?? null)
    nextConfigFound = nextResult.found
    nextConfigInjected = nextResult.injected
    nextConfigCreated = nextResult.created
    bundlerConfigured = nextResult.configured
  } else if (detected.kind === 'webpack') {
    console.warn(
      '  cortex-editor does not support standalone Webpack yet (tracked by ZF0-934).'
    )
    console.warn('  Use Vite or Next.js for now, or follow ZF0-934 for Webpack adapter support.')
  }

  // 4. Check cortex-editor is installed
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const depFound = Boolean(allDeps['cortex-editor'])
  if (!depFound) {
    const installRequest = createInstallRequest(packageManager, ['cortex-editor'], cwd)
    console.warn(
      `  cortex-editor not in dependencies. Run: ${installRequest.command} ${installRequest.args.join(' ')}`
    )
  }

  const setupComplete = depFound && bundlerConfigured
  if (setupComplete) {
    console.log('')
    console.log('Setup complete. Restart your editor to pick up the MCP server.')
  } else {
    console.warn('')
    console.warn('Cortex setup incomplete. Fix the messages above, then re-run: npx cortex init')
  }

  return {
    mcpWritten,
    vitePluginFound,
    vitePluginInjected,
    viteConfigCreated,
    nextConfigFound,
    nextConfigInjected,
    nextConfigCreated,
    depFound,
    detectedBundler: detected.kind,
    packageManager,
    setupComplete,
  }
}
