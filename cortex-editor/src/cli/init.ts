import fs from 'node:fs'
import path from 'node:path'
import { Project, SyntaxKind, ts, type SourceFile, type ObjectLiteralExpression, type Expression } from 'ts-morph'

/**
 * Find the config object literal in a Vite config file.
 * Supports ESM and CommonJS configs, plus same-file identifier indirection.
 */
function resolveObjectLiteralExpression(
  sourceFile: SourceFile,
  expr: Expression,
  options: { allowCallObjectArg?: boolean } = {},
  seen = new Set<string>(),
): ObjectLiteralExpression | undefined {
  if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
  }

  if (options.allowCallObjectArg && expr.getKind() === SyntaxKind.CallExpression) {
    const callExpr = expr.asKindOrThrow(SyntaxKind.CallExpression)
    const firstArg = callExpr.getArguments()[0]
    if (firstArg && firstArg.getKind() !== SyntaxKind.SpreadElement) {
      return resolveObjectLiteralExpression(sourceFile, firstArg as Expression, options, seen)
    }
  }

  if (expr.getKind() === SyntaxKind.Identifier) {
    const name = expr.getText()
    if (seen.has(name)) return undefined
    seen.add(name)
    const initializer = sourceFile.getVariableDeclaration(name)?.getInitializer()
    if (initializer) return resolveObjectLiteralExpression(sourceFile, initializer, options, seen)
  }

  return undefined
}

function findCommonJSExportExpression(sourceFile: SourceFile): Expression | undefined {
  const assignment = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .find(expr =>
      expr.getLeft().getText() === 'module.exports' &&
      expr.getOperatorToken().getKind() === SyntaxKind.EqualsToken
    )
  return assignment?.getRight()
}

function findConfigObject(sourceFile: SourceFile, moduleConfig: boolean): ObjectLiteralExpression | undefined {
  if (moduleConfig) {
    const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
    const expr = defaultExport?.getExpression()
    return expr ? resolveObjectLiteralExpression(sourceFile, expr, { allowCallObjectArg: true }) : undefined
  }

  const expr = findCommonJSExportExpression(sourceFile)
  return expr ? resolveObjectLiteralExpression(sourceFile, expr, { allowCallObjectArg: true }) : undefined
}

function createSourceFile(content: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      noResolve: true,
      skipLibCheck: true,
    },
  })
  // Use .ts extension to enable full syntax support regardless of actual file extension.
  return project.createSourceFile('config.ts', content)
}

function assertParseable(sourceFile: SourceFile, basename: string): void {
  // Check syntax-level parse errors only (not type errors).
  const compilerSourceFile = sourceFile.compilerNode as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[]
  }
  const syntaxDiag = compilerSourceFile.parseDiagnostics ?? []
  if (syntaxDiag.length === 0) return

  const raw = syntaxDiag[0]!.messageText
  const text = typeof raw === 'string'
    ? raw
    : ts.flattenDiagnosticMessageText(raw, '\n')
  throw new Error(`${basename}: failed to parse — ${text}`)
}

function hasCallExpressionNamed(sourceFile: SourceFile, functionName: string): boolean {
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(call => call.getExpression().getText() === functionName)
}

function isRequireCall(expr: Expression | undefined, moduleSpecifier: string): boolean {
  if (!expr || expr.getKind() !== SyntaxKind.CallExpression) return false
  const call = expr.asKindOrThrow(SyntaxKind.CallExpression)
  if (call.getExpression().getText() !== 'require') return false
  const firstArg = call.getArguments()[0]
  return firstArg?.getText().replace(/^['"]|['"]$/g, '') === moduleSpecifier
}

function hasNamedImport(sourceFile: SourceFile, functionName: string, moduleSpecifier: string): boolean {
  return sourceFile.getImportDeclarations().some(declaration =>
    declaration.getModuleSpecifierValue() === moduleSpecifier &&
    declaration.getNamedImports().some(namedImport => namedImport.getName() === functionName)
  )
}

function hasNamedRequire(sourceFile: SourceFile, functionName: string, moduleSpecifier: string): boolean {
  return sourceFile.getVariableDeclarations().some(declaration => {
    const nameNode = declaration.getNameNode()
    if (nameNode.getKind() !== SyntaxKind.ObjectBindingPattern) return false
    const binding = nameNode.asKindOrThrow(SyntaxKind.ObjectBindingPattern)
    const hasBinding = binding.getElements().some(element => element.getName() === functionName)
    return hasBinding && isRequireCall(declaration.getInitializer(), moduleSpecifier)
  })
}

function getCommonJSHelperInsertIndex(sourceFile: SourceFile): number {
  const statements = sourceFile.getStatements()
  let insertIndex = 0

  while (insertIndex < statements.length) {
    const statement = statements[insertIndex]!
    if (statement.getKind() !== SyntaxKind.ExpressionStatement) break
    const expression = statement.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression()
    if (expression.getKind() !== SyntaxKind.StringLiteral) break
    insertIndex++
  }

  return insertIndex
}

function ensureHelperBinding(
  sourceFile: SourceFile,
  functionName: string,
  moduleSpecifier: string,
  moduleConfig: boolean,
): void {
  if (hasNamedImport(sourceFile, functionName, moduleSpecifier) ||
      hasNamedRequire(sourceFile, functionName, moduleSpecifier)) {
    return
  }

  if (moduleConfig) {
    sourceFile.addImportDeclaration({
      namedImports: [functionName],
      moduleSpecifier,
    })
  } else {
    sourceFile.insertStatements(
      getCommonJSHelperInsertIndex(sourceFile),
      `const { ${functionName} } = require("${moduleSpecifier}")\n`
    )
  }
}

function hasConfiguredHelperCall(content: string, basename: string, functionName: string): boolean {
  const sourceFile = createSourceFile(content)
  assertParseable(sourceFile, basename)
  return hasCallExpressionNamed(sourceFile, functionName)
}

function findFirstExisting(cwd: string, names: string[]): string | undefined {
  return names
    .map(f => path.join(cwd, f))
    .find(f => fs.existsSync(f))
}

function isModuleConfig(filePath: string, content: string, pkgType?: string): boolean {
  const ext = path.extname(filePath)
  if (ext === '.mjs' || ext === '.mts') return true
  if (ext === '.cjs' || ext === '.cts') return false

  const sourceFile = createSourceFile(content)
  if (findCommonJSExportExpression(sourceFile)) return false

  const exportAssignment = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
  if (exportAssignment && !(exportAssignment.compilerNode as ts.ExportAssignment).isExportEquals) {
    return true
  }

  return pkgType === 'module'
}

function injectVitePlugin(
  content: string,
  basename: string,
  moduleConfig: boolean,
): { content: string; injected: boolean } {
  const sourceFile = createSourceFile(content)
  assertParseable(sourceFile, basename)

  const configObject = findConfigObject(sourceFile, moduleConfig)
  if (!configObject) {
    throw new Error(
      `${basename}: could not find config object — expected defineConfig({...}), export default {...}, or module.exports = {...}`
    )
  }

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

  if (!pluginAdded) return { content, injected: false }

  ensureHelperBinding(sourceFile, 'cortexEditor', 'cortex-editor/vite', moduleConfig)
  return { content: sourceFile.getFullText(), injected: true }
}

function isFunctionConfigExpression(sourceFile: SourceFile, expr: Expression): boolean {
  const kind = expr.getKind()
  if (kind === SyntaxKind.ArrowFunction || kind === SyntaxKind.FunctionExpression) return true
  if (kind !== SyntaxKind.Identifier) return false

  const name = expr.getText()
  const variable = sourceFile.getVariableDeclaration(name)
  const initializer = variable?.getInitializer()
  if (initializer) {
    const initializerKind = initializer.getKind()
    return initializerKind === SyntaxKind.ArrowFunction ||
      initializerKind === SyntaxKind.FunctionExpression
  }

  return Boolean(sourceFile.getFunction(name))
}

function injectNextWrapper(
  content: string,
  basename: string,
  moduleConfig: boolean,
): { content: string; injected: boolean } {
  const sourceFile = createSourceFile(content)
  assertParseable(sourceFile, basename)

  if (moduleConfig) {
    const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
    if (!defaultExport) {
      throw new Error(`${basename}: could not find default export to wrap with withCortex(...)`)
    }
    const expr = defaultExport.getExpression()
    const exprText = expr.getText()
    if (isFunctionConfigExpression(sourceFile, expr)) {
      throw new Error(`${basename}: dynamic Next config functions must be wrapped with withCortex(...) manually`)
    }

    expr.replaceWithText(`withCortex(${exprText})`)
    ensureHelperBinding(sourceFile, 'withCortex', 'cortex-editor/next', moduleConfig)
    return { content: sourceFile.getFullText(), injected: true }
  }

  const assignment = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .find(expr =>
      expr.getLeft().getText() === 'module.exports' &&
      expr.getOperatorToken().getKind() === SyntaxKind.EqualsToken
    )

  if (!assignment) {
    throw new Error(`${basename}: could not find module.exports to wrap with withCortex(...)`)
  }

  const right = assignment.getRight()
  const rightText = right.getText()
  if (isFunctionConfigExpression(sourceFile, right)) {
    throw new Error(`${basename}: dynamic Next config functions must be wrapped with withCortex(...) manually`)
  }

  right.replaceWithText(`withCortex(${rightText})`)
  ensureHelperBinding(sourceFile, 'withCortex', 'cortex-editor/next', moduleConfig)
  return { content: sourceFile.getFullText(), injected: true }
}

function findCommonJSExportObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  const expr = findCommonJSExportExpression(sourceFile)
  return expr ? resolveObjectLiteralExpression(sourceFile, expr) : undefined
}

function addPluginToConfigObject(
  configObject: ObjectLiteralExpression,
  pluginExpression: string,
  basename: string,
): boolean {
  const pluginsProp = configObject.getProperty('plugins')
  if (pluginsProp) {
    const initializer = pluginsProp.getChildrenOfKind(SyntaxKind.ArrayLiteralExpression)[0]
    if (initializer) {
      initializer.addElement(pluginExpression)
      return true
    }
    console.warn(`  ${basename}: plugins is not an array literal — add ${pluginExpression} manually`)
    return false
  }
  configObject.addPropertyAssignment({
    name: 'plugins',
    initializer: `[${pluginExpression}]`,
  })
  return true
}

function injectWebpackPlugin(
  content: string,
  basename: string,
  moduleConfig: boolean,
): { content: string; injected: boolean } {
  const sourceFile = createSourceFile(content)
  assertParseable(sourceFile, basename)

  let configObject: ObjectLiteralExpression | undefined
  if (moduleConfig) {
    const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
    if (!defaultExport) {
      throw new Error(`${basename}: could not find default export to configure with cortexWebpack()`)
    }
    const expr = defaultExport.getExpression()
    if (isFunctionConfigExpression(sourceFile, expr)) {
      throw new Error(`${basename}: dynamic Webpack config functions must add cortexWebpack() manually`)
    }
    if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) {
      configObject = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    }
    if (!configObject) {
      configObject = resolveObjectLiteralExpression(sourceFile, expr)
    }
    if (!configObject) {
      throw new Error(`${basename}: expected default export object to configure with cortexWebpack()`)
    }
    const pluginAdded = addPluginToConfigObject(configObject, 'cortexWebpack()', basename)
    if (!pluginAdded) return { content, injected: false }
    ensureHelperBinding(sourceFile, 'cortexWebpack', 'cortex-editor/webpack', moduleConfig)
    return { content: sourceFile.getFullText(), injected: true }
  }

  configObject = findCommonJSExportObject(sourceFile)
  if (!configObject) {
    throw new Error(`${basename}: expected module.exports object to configure with cortexWebpack()`)
  }
  const pluginAdded = addPluginToConfigObject(configObject, 'cortexWebpack()', basename)
  if (!pluginAdded) return { content, injected: false }
  ensureHelperBinding(sourceFile, 'cortexWebpack', 'cortex-editor/webpack', moduleConfig)
  return { content: sourceFile.getFullText(), injected: true }
}

const CORTEX_SLASH_COMMAND = `---
description: Activate or manage the Cortex visual editor for this project
argument-hint: [activate|status|apply|deactivate]
---

# Cortex

Use the Cortex MCP tools for this project. Interpret \`$ARGUMENTS\` as an optional action:

- No arguments or \`activate\`: call \`cortex_status\`. If the dev server is not connected, tell the user to start the app's normal dev server and open the app in a browser. If connected, call \`cortex_activate\`.
- \`status\`: call \`cortex_status\` and summarize whether the dev server, browser, and editor are connected.
- \`deactivate\` or \`close\`: call \`cortex_deactivate\`.
- \`apply\`: call \`cortex_get_pending_edits\`. If there are staged edits, call \`cortex_apply_edits\` with their intent IDs. For any \`needs-source-edit\` result, inspect the intent/source context as needed, edit the source with normal file-editing tools, then call \`cortex_discard_edits\` for completed intent IDs. Report failed IDs clearly.

If the Cortex MCP server is unavailable, ask the user to restart Claude Code or run \`/mcp\` and approve the project-scoped \`cortex\` server.
`

export interface InitResult {
  mcpWritten: boolean
  slashCommandFound: boolean
  slashCommandWritten: boolean
  vitePluginFound: boolean | null
  vitePluginInjected: boolean
  nextConfigFound: boolean | null
  nextConfigInjected: boolean
  webpackConfigFound: boolean
  webpackConfigInjected: boolean
  depFound: boolean
}

export async function runInit(cwd: string = process.cwd()): Promise<InitResult> {
  // 1. Check for package.json and parse it once (used later for dep check)
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found. Run this from your project root.')
  }

  let pkg: {
    type?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
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

  // 3. Add Claude Code slash command for the MCP-driven user entrypoint.
  const slashCommandPath = path.join(cwd, '.claude', 'commands', 'cortex.md')
  let slashCommandFound = false
  let slashCommandWritten = false
  if (fs.existsSync(slashCommandPath)) {
    slashCommandFound = true
    console.log('  .claude/commands/cortex.md: /cortex command already configured')
  } else {
    fs.mkdirSync(path.dirname(slashCommandPath), { recursive: true })
    fs.writeFileSync(slashCommandPath, CORTEX_SLASH_COMMAND)
    slashCommandFound = true
    slashCommandWritten = true
    console.log('  .claude/commands/cortex.md: added /cortex slash command')
  }

  // 4. Detect app adapter configs. Next takes precedence over Vite because
  // Next apps often carry Vite configs for tests or auxiliary tooling.
  let vitePluginFound: boolean | null = null
  let vitePluginInjected = false
  const viteConfigPath = findFirstExisting(cwd, [
    'vite.config.ts', 'vite.config.js', 'vite.config.mts',
    'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs',
  ])
  let nextConfigFound: boolean | null = null
  let nextConfigInjected = false
  const nextConfigPath = findFirstExisting(cwd, [
    'next.config.ts', 'next.config.mts', 'next.config.mjs',
    'next.config.js', 'next.config.cjs', 'next.config.cts',
  ])
  let webpackConfigInjected = false
  const webpackConfigPath = findFirstExisting(cwd, [
    'webpack.config.js', 'webpack.config.cjs', 'webpack.config.mjs',
    'webpack.config.ts', 'webpack.config.cts', 'webpack.config.mts',
  ])
  const webpackConfigFound = Boolean(webpackConfigPath)

  if (nextConfigPath) {
    const basename = path.basename(nextConfigPath)
    if (viteConfigPath) {
      console.warn(
        `  ${path.basename(viteConfigPath)} found alongside ${basename}; ` +
        'skipping Vite setup to avoid configuring auxiliary tooling'
      )
    }

    const content = fs.readFileSync(nextConfigPath, 'utf8')
    if (hasConfiguredHelperCall(content, basename, 'withCortex')) {
      nextConfigFound = true
      console.log(`  ${basename}: withCortex wrapper found`)
    } else {
      const result = injectNextWrapper(
        content,
        basename,
        isModuleConfig(nextConfigPath, content, pkg.type),
      )
      if (result.injected) {
        fs.writeFileSync(nextConfigPath, result.content)
        nextConfigFound = true
        nextConfigInjected = true
        console.log(`  ${basename}: withCortex wrapper injected`)
      } else {
        nextConfigFound = false
      }
    }
  } else if (viteConfigPath) {
    const basename = path.basename(viteConfigPath)
    if (webpackConfigPath) {
      console.warn(
        `  ${path.basename(webpackConfigPath)} found alongside ${basename}; ` +
        'skipping Webpack setup because Vite is the selected app adapter'
      )
    }
    const content = fs.readFileSync(viteConfigPath, 'utf8')

    if (hasConfiguredHelperCall(content, basename, 'cortexEditor')) {
      vitePluginFound = true
      console.log(`  ${basename}: cortexEditor plugin found`)
    } else {
      const result = injectVitePlugin(
        content,
        basename,
        isModuleConfig(viteConfigPath, content, pkg.type),
      )
      if (result.injected) {
        fs.writeFileSync(viteConfigPath, result.content)
        vitePluginFound = true
        vitePluginInjected = true
        console.log(`  ${basename}: cortexEditor plugin injected`)
      } else {
        vitePluginFound = false
      }
    }
  } else if (webpackConfigPath) {
    const basename = path.basename(webpackConfigPath)
    const content = fs.readFileSync(webpackConfigPath, 'utf8')
    if (hasConfiguredHelperCall(content, basename, 'cortexWebpack')) {
      console.log(`  ${basename}: cortexWebpack plugin found`)
    } else {
      const result = injectWebpackPlugin(
        content,
        basename,
        isModuleConfig(webpackConfigPath, content, pkg.type),
      )
      if (result.injected) {
        fs.writeFileSync(webpackConfigPath, result.content)
        webpackConfigInjected = true
        console.log(`  ${basename}: cortexWebpack plugin injected`)
      }
    }
  } else {
    console.warn('  No vite.config, next.config, or webpack.config found — skipping adapter setup')
  }

  // 6. Check cortex-editor is installed
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const depFound = Boolean(allDeps['cortex-editor'])
  if (!depFound) {
    console.warn('  cortex-editor not in dependencies. Run: npm install -D cortex-editor')
  }

  console.log('')
  console.log('Setup complete. Restart your editor to pick up the MCP server.')

  return {
    mcpWritten,
    slashCommandFound,
    slashCommandWritten,
    vitePluginFound,
    vitePluginInjected,
    nextConfigFound,
    nextConfigInjected,
    webpackConfigFound,
    webpackConfigInjected,
    depFound,
  }
}
