import fs from 'node:fs'
import path from 'node:path'
import { Project, SyntaxKind, ts, type SourceFile, type ObjectLiteralExpression } from 'ts-morph'

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

  // 3. Inject cortexEditor plugin into Vite config (or detect existing)
  let vitePluginFound: boolean | null = null
  let vitePluginInjected = false
  const viteConfigPath = [
    'vite.config.ts', 'vite.config.js', 'vite.config.mts',
    'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs',
  ]
    .map(f => path.join(cwd, f))
    .find(f => fs.existsSync(f))

  if (viteConfigPath) {
    const basename = path.basename(viteConfigPath)
    const content = fs.readFileSync(viteConfigPath, 'utf8')

    if (content.includes('cortexEditor')) {
      vitePluginFound = true
      console.log(`  ${basename}: cortexEditor plugin found`)
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
        console.log(`  ${basename}: cortexEditor plugin injected`)
      }
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

  return { mcpWritten, vitePluginFound, vitePluginInjected, depFound }
}
