import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import {
  Project,
  SyntaxKind,
  ts,
  type Expression,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
  type Statement,
} from 'ts-morph'
import {
  NEXT_CONFIG_FILES,
  VITE_CONFIG_FILES,
  WEBPACK_CONFIG_FILES,
  detectPackageManager,
  hasDependency,
  type BundlerKind,
  type PackageJson,
  type PackageManager,
} from './detect.js'
import { createTelemetry } from '../adapters/telemetry.js'
import { resolveTelemetryEnabled, resolveTelemetryEndpoint } from '../adapters/telemetry-config.js'
import { version as cortexVersion } from '../version.js'

const VITE_SETUP_PACKAGES = ['vite', '@vitejs/plugin-react'] as const

export interface PromptInstallRequest {
  cwd: string
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
 * Find a config object literal through the simple shapes init can rewrite:
 * object literals, defineConfig({ ... }), and same-file identifier indirection.
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

function isCommonJsExportTarget(node: Node): boolean {
  return node.getText().trim() === 'module.exports'
}

function isCommonJsExportAssignment(binaryExpression: Node): boolean {
  if (!binaryExpression.isKind(SyntaxKind.BinaryExpression)) return false
  if (binaryExpression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return false
  return isCommonJsExportTarget(binaryExpression.getLeft())
}

function findCommonJSExportExpression(sourceFile: SourceFile): Expression | undefined {
  const assignment = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .find(expr => isCommonJsExportAssignment(expr))
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

function createConfigSourceFile(fileName: string, content: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      noResolve: true,
      skipLibCheck: true,
    },
  })
  return project.createSourceFile(fileName, content)
}

function assertParseable(sourceFile: SourceFile, basename: string): void {
  const compilerSourceFile = sourceFile.compilerNode as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[]
  }
  const syntaxDiag = compilerSourceFile.parseDiagnostics ?? []
  if (syntaxDiag.length === 0) return

  const raw = syntaxDiag[0]!.messageText
  const text = typeof raw === 'string'
    ? raw
    : ts.flattenDiagnosticMessageText(raw, '\n')
  throw new Error(`${basename}: failed to parse - ${text}`)
}

function hasNamedCallExpression(node: Node, name: string): boolean {
  if (node.isKind(SyntaxKind.CallExpression) && node.getExpression().getText() === name) {
    return true
  }

  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some(call => (
    call.getExpression().getText() === name
  ))
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

/**
 * True only when `functionName` is importable under that EXACT local name from
 * `moduleSpecifier` — i.e. a named import whose local binding is `functionName`
 * (not an alias like `CortexDevScripts as CDS`). The layout codemod renders a
 * literal `<CortexDevScripts />`, so an aliased-only import does NOT satisfy the
 * requirement: `hasNamedImport` reports the import present (getName() returns the
 * imported name, ignoring the alias), the codemod skips adding a binding, and the
 * rendered element resolves to an undefined identifier at build time.
 */
function hasUsableNamedImport(sourceFile: SourceFile, functionName: string, moduleSpecifier: string): boolean {
  return sourceFile.getImportDeclarations().some(declaration =>
    declaration.getModuleSpecifierValue() === moduleSpecifier &&
    declaration.getNamedImports().some(namedImport =>
      namedImport.getName() === functionName && !namedImport.getAliasNode()
    )
  )
}

/** How `localName` is bound in the file, considering imports AND local
 *  declarations:
 *  - 'value'     — a usable runtime binding exists (value import from any module,
 *                  or a local function/class/variable declaration). The rendered
 *                  element resolves; inserting our import would be a duplicate
 *                  identifier (TS2300).
 *  - 'type-only' — ONLY type-space bindings exist (`import type`). The element
 *                  cannot resolve at runtime, and adding a value import of the
 *                  same name still collides with the type import — unfixable
 *                  without editing the user's imports, so callers must bail.
 *  - null        — the name is free; our import can be added safely. */
function localBindingKind(sourceFile: SourceFile, localName: string): 'value' | 'type-only' | null {
  if (
    sourceFile.getFunction(localName) ||
    sourceFile.getClass(localName) ||
    sourceFile.getVariableDeclaration(localName)
  ) {
    return 'value'
  }
  let sawTypeOnly = false
  for (const declaration of sourceFile.getImportDeclarations()) {
    const declTypeOnly = declaration.isTypeOnly()
    if (declaration.getDefaultImport()?.getText() === localName ||
        declaration.getNamespaceImport()?.getText() === localName) {
      if (!declTypeOnly) return 'value'
      sawTypeOnly = true
      continue
    }
    for (const namedImport of declaration.getNamedImports()) {
      const local = namedImport.getAliasNode()?.getText() ?? namedImport.getName()
      if (local !== localName) continue
      if (declTypeOnly || namedImport.isTypeOnly()) sawTypeOnly = true
      else return 'value'
    }
  }
  return sawTypeOnly ? 'type-only' : null
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

/**
 * Index of the first statement after any leading directive prologue
 * (`'use client'`, `'use server'`, CommonJS `"use strict"`). Statements must be
 * inserted here, not at 0: prepending above a directive demotes it off line 1,
 * so it stops being a directive prologue and silently loses effect.
 */
/** The directive-prologue string value of a leading statement (e.g. `'use client'`,
 *  `"use strict"`), or null if the statement is not a directive-prologue string
 *  literal. Shared by getInsertIndexAfterDirectives and hasClientOrServerDirective
 *  so the "is this a directive prologue statement" rule lives in one place. */
function directivePrologueValue(statement: Statement): string | null {
  if (statement.getKind() !== SyntaxKind.ExpressionStatement) return null
  const expression = statement.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression()
  const kind = expression.getKind()
  if (kind !== SyntaxKind.StringLiteral && kind !== SyntaxKind.NoSubstitutionTemplateLiteral) return null
  // getText() includes the quotes/backticks; slice them off to get the value.
  return expression.getText().slice(1, -1)
}

function getInsertIndexAfterDirectives(sourceFile: SourceFile): number {
  const statements = sourceFile.getStatements()
  let insertIndex = 0
  while (insertIndex < statements.length && directivePrologueValue(statements[insertIndex]!) !== null) {
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
      getInsertIndexAfterDirectives(sourceFile),
      `const { ${functionName} } = require("${moduleSpecifier}")\n`
    )
  }
}

function configExpressionUsesNamedCall(
  sourceFile: SourceFile,
  expression: Node,
  name: string
): boolean {
  if (hasNamedCallExpression(expression, name)) return true

  const identifier = expression.getText().trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(identifier)) return false

  const declaration = sourceFile.getVariableDeclaration(identifier)
  const initializer = declaration?.getInitializer()
  return Boolean(initializer && hasNamedCallExpression(initializer, name))
}

function objectPropertyValueUsesNamedCall(
  sourceFile: SourceFile,
  property: Node,
  name: string
): boolean {
  if (property.isKind(SyntaxKind.PropertyAssignment)) {
    const initializer = property.getInitializer()
    return Boolean(initializer && configExpressionUsesNamedCall(sourceFile, initializer, name))
  }

  return configExpressionUsesNamedCall(sourceFile, property, name)
}

function viteConfigUsesCortexEditor(
  content: string,
  basename: string,
  moduleConfig: boolean,
): boolean {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)
  const configObject = findConfigObject(sourceFile, moduleConfig)
  const pluginsProperty = configObject?.getProperty('plugins')
  return Boolean(
    pluginsProperty && objectPropertyValueUsesNamedCall(sourceFile, pluginsProperty, 'cortexEditor')
  )
}

function nextConfigUsesWithCortex(
  content: string,
  basename: string,
  moduleConfig: boolean,
): boolean {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)

  if (moduleConfig) {
    const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
    return Boolean(
      defaultExport &&
      configExpressionUsesNamedCall(sourceFile, defaultExport.getExpression(), 'withCortex')
    )
  }

  return sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression).some(binaryExpression => (
    isCommonJsExportAssignment(binaryExpression) &&
    configExpressionUsesNamedCall(sourceFile, binaryExpression.getRight(), 'withCortex')
  ))
}

function webpackConfigUsesCortexWebpack(
  content: string,
  basename: string,
  moduleConfig: boolean,
): boolean {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)
  const configObject = findConfigObject(sourceFile, moduleConfig)
  const pluginsProperty = configObject?.getProperty('plugins')
  return Boolean(
    pluginsProperty && objectPropertyValueUsesNamedCall(sourceFile, pluginsProperty, 'cortexWebpack')
  )
}

function findFirstExisting(cwd: string, names: readonly string[]): string | null {
  return names
    .map(file => path.join(cwd, file))
    .find(file => fs.existsSync(file)) ?? null
}

function isModuleConfig(filePath: string, content: string, pkgType?: string): boolean {
  const ext = path.extname(filePath)
  if (ext === '.mjs' || ext === '.mts') return true
  if (ext === '.cjs' || ext === '.cts') return false

  const sourceFile = createConfigSourceFile(path.basename(filePath), content)
  if (findCommonJSExportExpression(sourceFile)) return false

  const exportAssignment = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
  if (exportAssignment && !(exportAssignment.compilerNode as ts.ExportAssignment).isExportEquals) {
    return true
  }

  return pkgType === 'module'
}

function viteConfigCanBeAutoConfigured(
  content: string,
  basename: string,
  moduleConfig: boolean,
): boolean {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)
  return Boolean(findConfigObject(sourceFile, moduleConfig))
}

function injectVitePlugin(
  content: string,
  basename: string,
  moduleConfig: boolean,
): { content: string; injected: boolean } {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)

  const configObject = findConfigObject(sourceFile, moduleConfig)
  if (!configObject) {
    throw new Error(
      `${basename}: could not find config object - expected defineConfig({...}), export default {...}, or module.exports = {...}`
    )
  }

  const pluginAdded = addPluginToConfigObject(configObject, 'cortexEditor()', basename)
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

function wrapConfigExpression(sourceFile: SourceFile, expr: Expression, helperName: string): string {
  const exprText = expr.getText()
  if (isFunctionConfigExpression(sourceFile, expr)) {
    return `async (...args) => ${helperName}(await (${exprText})(...args))`
  }
  return `${helperName}(${exprText})`
}

function injectNextWrapper(
  content: string,
  basename: string,
  moduleConfig: boolean,
): { content: string; injected: boolean } {
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)

  if (moduleConfig) {
    const defaultExport = sourceFile.getFirstDescendantByKind(SyntaxKind.ExportAssignment)
    if (!defaultExport) return { content, injected: false }

    const expr = defaultExport.getExpression()
    expr.replaceWithText(wrapConfigExpression(sourceFile, expr, 'withCortex'))
    ensureHelperBinding(sourceFile, 'withCortex', 'cortex-editor/next', moduleConfig)
    return { content: sourceFile.getFullText(), injected: true }
  }

  const assignment = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .find(expr => isCommonJsExportAssignment(expr))
  if (!assignment) return { content, injected: false }

  const right = assignment.getRight()
  right.replaceWithText(wrapConfigExpression(sourceFile, right, 'withCortex'))
  ensureHelperBinding(sourceFile, 'withCortex', 'cortex-editor/next', moduleConfig)
  return { content: sourceFile.getFullText(), injected: true }
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
      // Cortex must run before React's dev transform. React injects Fast
      // Refresh scaffolding above the user's JSX; if Cortex annotates after
      // that, data-cortex-source line numbers point at generated code instead
      // of the real file and deterministic JSX edits miss their target.
      initializer.insertElement(0, pluginExpression)
      return true
    }
    console.warn(`  ${basename}: plugins is not an array literal - add ${pluginExpression} manually`)
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
  const sourceFile = createConfigSourceFile(basename, content)
  assertParseable(sourceFile, basename)

  const configObject = findConfigObject(sourceFile, moduleConfig)
  if (!configObject) {
    const exportKind = moduleConfig ? 'default export object' : 'module.exports object'
    throw new Error(`${basename}: expected ${exportKind} to configure with cortexWebpack()`)
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
  viteConfigCreated: boolean
  nextConfigFound: boolean | null
  nextConfigInjected: boolean
  nextConfigCreated: boolean
  webpackConfigFound: boolean
  webpackConfigInjected: boolean
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
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
      } else if (signal) {
        reject(new Error(`${request.command} ${request.args.join(' ')} exited with signal ${signal}`))
      } else {
        reject(
          new Error(
            `${request.command} ${request.args.join(' ')} exited with ${code ?? 'unknown status'}`
          )
        )
      }
    })
  })
}

async function defaultPromptInstall(request: PromptInstallRequest): Promise<boolean> {
  if (!stdin.isTTY) return false

  const command = createInstallRequest(request.packageManager, request.packages, request.cwd)
  const promptCwd = path.resolve(request.cwd)
  const cwdHint = promptCwd === path.resolve(process.cwd())
    ? ''
    : ` in ${promptCwd}`
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await rl.question(
      `Cortex needs ${request.packages.join(' and ')} to configure source annotations. Run "${command.command} ${command.args.join(' ')}"${cwdHint} now? [Y/n] `
    )
    return answer.trim() === '' || /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
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
  const approved = await promptInstall({ cwd, packageManager, packages: missing, reason })
  if (!approved) {
    const installRequest = createInstallRequest(packageManager, missing, cwd)
    console.warn(
      `  Cortex setup incomplete: missing ${missing.join(' and ')} required to configure source annotations.`
    )
    console.warn(
      `  Install missing packages with: ${installRequest.command} ${installRequest.args.join(' ')}`
    )
    console.warn('  Then re-run: npx cortex init')
    return false
  }

  const installPackages = options.installPackages ?? defaultInstallPackages
  const installRequest = createInstallRequest(packageManager, missing, cwd)
  await installPackages(installRequest)
  return true
}

function writeViteConfig(cwd: string): string {
  const viteConfigPath = path.join(cwd, 'vite.config.ts')
  const content = [
    'import { defineConfig } from \'vite\'',
    'import react from \'@vitejs/plugin-react\'',
    'import { cortexEditor } from \'cortex-editor/vite\'',
    '',
    'export default defineConfig({',
    '  plugins: [cortexEditor(), react()],',
    '})',
    '',
  ].join('\n')
  fs.writeFileSync(viteConfigPath, content)
  console.log('  vite.config.ts: created with cortexEditor plugin')
  return viteConfigPath
}

function writeNextConfig(cwd: string): string {
  const nextConfigPath = path.join(cwd, 'next.config.mjs')
  const content = [
    'import { withCortex } from \'cortex-editor/next\'',
    '',
    'export default withCortex({})',
    '',
  ].join('\n')
  fs.writeFileSync(nextConfigPath, content)
  console.log('  next.config.mjs: created with withCortex()')
  return nextConfigPath
}

/** True when the layout already renders a `<CortexDevScripts>` JSX element
 *  (opening or self-closing). Idempotency keys on the rendered element — not a
 *  substring — so a mention in a comment or a bare import never counts as
 *  "already present". */
function layoutRendersCortexDevScripts(sourceFile: SourceFile): boolean {
  const namesCortex = (node: JsxOpeningElement | JsxSelfClosingElement): boolean =>
    node.getTagNameNode().getText() === 'CortexDevScripts'
  return (
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).some(namesCortex) ||
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).some(namesCortex)
  )
}

/** True when the layout opens with a `'use client'` or `'use server'` directive
 *  prologue. CortexDevScripts transitively imports server-only Node modules
 *  (fs/path), so importing it into a client-component graph makes Next FAIL
 *  compilation — the codemod must bail rather than inject an unusable import. */
function hasClientOrServerDirective(sourceFile: SourceFile): boolean {
  for (const statement of sourceFile.getStatements()) {
    const value = directivePrologueValue(statement)
    if (value === null) break // past the directive prologue
    if (value === 'use client' || value === 'use server') return true
  }
  return false
}

/** The opening tag of the first `<body>` host element, located via the AST so a
 *  `>` inside an attribute expression (`className={n > 2 ? …}`) cannot truncate
 *  the match and a commented-out `<body>` is never mistaken for the real one. */
function findBodyOpeningElement(sourceFile: SourceFile): JsxOpeningElement | undefined {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
    .find(opening => opening.getTagNameNode().getText() === 'body')
}

// One source of truth for the injected binding — a renamed export won't trip
// the compiler on these string literals (repo Post-Fix "rename audit" rule).
const CORTEX_DEV_SCRIPTS = 'CortexDevScripts'
const CORTEX_NEXT_MODULE = 'cortex-editor/next'
const CORTEX_DEV_SCRIPTS_IMPORT = `import { ${CORTEX_DEV_SCRIPTS} } from '${CORTEX_NEXT_MODULE}'`

/** Add a usable `import { CortexDevScripts }` after the directive prologue,
 *  unless a non-aliased binding already exists. An aliased-only import
 *  (`CortexDevScripts as CDS`) does NOT satisfy the rendered `<CortexDevScripts />`
 *  element, so a proper import is still added; the two differ in local name so
 *  there is no duplicate-identifier conflict. */
function ensureCortexDevScriptsImport(sourceFile: SourceFile): void {
  if (hasUsableNamedImport(sourceFile, CORTEX_DEV_SCRIPTS, CORTEX_NEXT_MODULE)) return
  // The name is already VALUE-bound elsewhere (barrel re-export import, or a
  // local function/class/variable): the rendered element resolves via that
  // binding, and adding our import would duplicate the local identifier.
  // (Type-only bindings are handled by the callers, which bail with
  // 'name-conflict' BEFORE reaching here — see localBindingKind.)
  if (localBindingKind(sourceFile, CORTEX_DEV_SCRIPTS) === 'value') return
  sourceFile.insertStatements(getInsertIndexAfterDirectives(sourceFile), CORTEX_DEV_SCRIPTS_IMPORT)
}

/** Insert <CortexDevScripts/> into the App Router root layout. Deliberately
 *  conservative: single unambiguous layout file, AST-located `<body>` element,
 *  loud bail-out otherwise — a wrong guess in user JSX is worse than a manual
 *  one-liner. Parses the source with ts-morph (like the config codemods above)
 *  rather than regex/substring so `>` in attributes, directive prologues, and
 *  comment mentions are handled correctly. */
export function injectDevScriptsIntoLayout(cwd: string):
  | { status: 'inserted'; layoutPath: string }
  | { status: 'already'; layoutPath: string }
  | { status: 'not-found' }
  | { status: 'no-body-tag'; layoutPath: string }
  | { status: 'client-layout-unsupported'; layoutPath: string }
  | { status: 'parse-error'; layoutPath: string }
  | { status: 'name-conflict'; layoutPath: string } {
  const candidates = [
    path.join('app', 'layout.tsx'),
    path.join('app', 'layout.jsx'),
    path.join('app', 'layout.js'),
    path.join('src', 'app', 'layout.tsx'),
    path.join('src', 'app', 'layout.jsx'),
    path.join('src', 'app', 'layout.js'),
  ]
    .map((p) => path.join(cwd, p))
    .filter((p) => fs.existsSync(p))

  if (candidates.length === 0) return { status: 'not-found' }
  const layoutPath = candidates[0]!

  const content = fs.readFileSync(layoutPath, 'utf8')
  // Parse as .tsx regardless of the on-disk extension so JSX is always
  // recognized — a `.js` App Router layout still contains JSX that the plain
  // TypeScript scanner would otherwise reject.
  const sourceFile = createConfigSourceFile('layout.tsx', content)

  // ts-morph parses leniently, so a syntactically-broken layout yields a
  // partial AST — findBodyOpeningElement could still match a <body>, we'd
  // insertText into a file we didn't understand, and report 'inserted' success.
  // Every other codemod in this file guards with assertParseable; do the same,
  // but return a status (not a throw — runInit switches on it) so init surfaces
  // "couldn't parse your layout" instead of a false success.
  try {
    assertParseable(sourceFile, path.basename(layoutPath))
  } catch {
    return { status: 'parse-error', layoutPath }
  }

  // A 'use client'/'use server' root layout would pull the server-only
  // CortexDevScripts into a client-component graph, breaking Next's build. Bail
  // without modifying the file — the user must render it from a server layout.
  if (hasClientOrServerDirective(sourceFile)) return { status: 'client-layout-unsupported', layoutPath }

  // A type-only binding (`import type { CortexDevScripts }`) can neither render
  // the element at runtime nor coexist with a value import of the same name
  // (duplicate identifier). Unfixable without editing the user's imports — bail.
  const bindingKind = localBindingKind(sourceFile, CORTEX_DEV_SCRIPTS)
  if (bindingKind === 'type-only') return { status: 'name-conflict', layoutPath }

  if (layoutRendersCortexDevScripts(sourceFile)) {
    // The element is present, but a rendered `<CortexDevScripts />` with only an
    // aliased/missing import does not compile. Reconcile the import before
    // reporting 'already' — otherwise init would claim success on a layout that
    // fails to build. A usable VALUE binding (ours, a barrel's, or a local
    // declaration) means it is genuinely done.
    if (hasUsableNamedImport(sourceFile, CORTEX_DEV_SCRIPTS, CORTEX_NEXT_MODULE) || bindingKind === 'value') {
      return { status: 'already', layoutPath }
    }
    ensureCortexDevScriptsImport(sourceFile)
    fs.writeFileSync(layoutPath, sourceFile.getFullText())
    return { status: 'inserted', layoutPath }
  }

  const bodyOpen = findBodyOpeningElement(sourceFile)
  if (!bodyOpen) return { status: 'no-body-tag', layoutPath }

  // Insert the child at the exact end of the opening tag. The offset comes from
  // the AST, so a `>` inside an attribute expression can't misplace it.
  sourceFile.insertText(bodyOpen.getEnd(), `\n        <${CORTEX_DEV_SCRIPTS} />`)
  ensureCortexDevScriptsImport(sourceFile)

  fs.writeFileSync(layoutPath, sourceFile.getFullText())
  return { status: 'inserted', layoutPath }
}

function selectBundler(
  cwd: string,
  pkg: PackageJson,
  paths: {
    viteConfigPath: string | null
    nextConfigPath: string | null
    webpackConfigPath: string | null
  },
): BundlerKind {
  if (paths.nextConfigPath) return 'next'
  if (paths.viteConfigPath) return 'vite'
  if (paths.webpackConfigPath) return 'webpack'
  if (hasDependency(pkg, 'next')) return 'next'
  if (hasDependency(pkg, 'vite')) return 'vite'
  if (hasDependency(pkg, 'webpack') || hasDependency(pkg, 'react-scripts')) return 'webpack'
  void cwd
  return 'none'
}

export async function runInit(
  cwd: string = process.cwd(),
  options: InitOptions = {}
): Promise<InitResult> {
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found. Run this from your project root.')
  }

  let pkg: PackageJson
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    throw new Error(
      `package.json: failed to parse - ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const mcpPath = path.join(cwd, '.mcp.json')
  let mcpConfig: Record<string, unknown> = {}
  let mcpWritten = false

  if (fs.existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
    } catch (err) {
      throw new Error(
        `.mcp.json: failed to parse - ${err instanceof Error ? err.message : String(err)}\n` +
        'Fix the JSON syntax and re-run cortex init.'
      )
    }
    if (typeof mcpConfig !== 'object' || mcpConfig === null || Array.isArray(mcpConfig)) {
      throw new Error('.mcp.json: root value must be a JSON object.')
    }
  }

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

  const viteConfigPath = findFirstExisting(cwd, VITE_CONFIG_FILES)
  const nextConfigPath = findFirstExisting(cwd, NEXT_CONFIG_FILES)
  const webpackConfigPath = findFirstExisting(cwd, WEBPACK_CONFIG_FILES)
  const webpackConfigFound = Boolean(webpackConfigPath)
  const detectedBundler = selectBundler(cwd, pkg, {
    viteConfigPath,
    nextConfigPath,
    webpackConfigPath,
  })
  const packageManager = detectPackageManager(cwd, pkg)
  const depFound = hasDependency(pkg, 'cortex-editor')

  let vitePluginFound: boolean | null = null
  let vitePluginInjected = false
  let viteConfigCreated = false
  let nextConfigFound: boolean | null = null
  let nextConfigInjected = false
  let nextConfigCreated = false
  let webpackConfigInjected = false
  let adapterConfigured = false

  if (!depFound) {
    const installRequest = createInstallRequest(packageManager, ['cortex-editor'], cwd)
    console.warn(
      '  cortex-editor not in dependencies - add it before configuring source annotations.'
    )
    console.warn(
      `  Install cortex-editor with: ${installRequest.command} ${installRequest.args.join(' ')}`
    )
  } else if (detectedBundler === 'next') {
    if (viteConfigPath && nextConfigPath) {
      console.warn(
        `  ${path.basename(viteConfigPath)} found alongside ${path.basename(nextConfigPath)}; ` +
        'skipping Vite setup to avoid configuring auxiliary tooling'
      )
    }

    if (!nextConfigPath) {
      writeNextConfig(cwd)
      nextConfigFound = true
      nextConfigInjected = true
      nextConfigCreated = true
      adapterConfigured = true
    } else {
      nextConfigFound = true
      const basename = path.basename(nextConfigPath)
      const content = fs.readFileSync(nextConfigPath, 'utf8')
      const moduleConfig = isModuleConfig(nextConfigPath, content, pkg.type)

      if (nextConfigUsesWithCortex(content, basename, moduleConfig)) {
        console.log(`  ${basename}: withCortex config found`)
        adapterConfigured = true
      } else {
        const result = injectNextWrapper(content, basename, moduleConfig)
        if (result.injected) {
          fs.writeFileSync(nextConfigPath, result.content)
          nextConfigInjected = true
          adapterConfigured = true
          console.log(`  ${basename}: withCortex config injected`)
        } else {
          console.warn(
            `  ${basename}: could not auto-configure Next.js - wrap your config with withCortex() from cortex-editor/next`
          )
        }
      }
    }

    // Next has no HTML-injection hook, so the editor bootstrap ships as a
    // <CortexDevScripts/> server component the root layout must render.
    const layoutResult = injectDevScriptsIntoLayout(cwd)
    switch (layoutResult.status) {
      case 'inserted':
        console.log(`  ${path.relative(cwd, layoutResult.layoutPath)}: <CortexDevScripts /> added to <body>`)
        break
      case 'already':
        console.log(`  ${path.relative(cwd, layoutResult.layoutPath)}: <CortexDevScripts /> already present`)
        break
      case 'not-found':
        console.warn(
          '  app/layout.tsx not found - add <CortexDevScripts /> (from cortex-editor/next) inside <body> of your root layout'
        )
        break
      case 'no-body-tag':
        console.warn(
          `  ${path.relative(cwd, layoutResult.layoutPath)}: no <body> tag found - add <CortexDevScripts /> (from cortex-editor/next) inside <body> manually`
        )
        break
      case 'client-layout-unsupported':
        console.warn(
          `  ${path.relative(cwd, layoutResult.layoutPath)}: root layout is a client component ('use client') - ` +
          'CortexDevScripts is server-only. Add <CortexDevScripts /> to a server layout, or render it from a server component.'
        )
        break
      case 'parse-error':
        console.warn(
          `  ${path.relative(cwd, layoutResult.layoutPath)}: could not parse - add <CortexDevScripts /> (from cortex-editor/next) inside <body> manually once the file compiles`
        )
        break
      case 'name-conflict':
        console.warn(
          `  ${path.relative(cwd, layoutResult.layoutPath)}: 'CortexDevScripts' is bound as a type-only import - ` +
          'remove the type-only import and add `import { CortexDevScripts } from \'cortex-editor/next\'` plus <CortexDevScripts /> inside <body> manually'
        )
        break
    }
  } else if (detectedBundler === 'vite') {
    if (webpackConfigPath && viteConfigPath) {
      console.warn(
        `  ${path.basename(webpackConfigPath)} found alongside ${path.basename(viteConfigPath)}; ` +
        'skipping Webpack setup because Vite is the selected app adapter'
      )
    }

    if (!viteConfigPath) {
      const installed = await ensurePackages(
        cwd,
        pkg,
        packageManager,
        VITE_SETUP_PACKAGES,
        'missing-vite-config',
        options
      )
      if (installed) {
        writeViteConfig(cwd)
        vitePluginFound = true
        vitePluginInjected = true
        viteConfigCreated = true
        adapterConfigured = true
      }
    } else {
      const vitePeerInstalled = await ensurePackages(
        cwd,
        pkg,
        packageManager,
        ['vite'],
        'missing-vite-peer',
        options
      )
      if (vitePeerInstalled) {
        const basename = path.basename(viteConfigPath)
        const content = fs.readFileSync(viteConfigPath, 'utf8')
        const moduleConfig = isModuleConfig(viteConfigPath, content, pkg.type)

        if (viteConfigUsesCortexEditor(content, basename, moduleConfig)) {
          vitePluginFound = true
          adapterConfigured = true
          console.log(`  ${basename}: cortexEditor plugin found`)
        } else if (!viteConfigCanBeAutoConfigured(content, basename, moduleConfig)) {
          vitePluginFound = false
          console.warn(
            `  ${basename}: Vite config cannot be auto-configured - use export default/module.exports syntax or add cortexEditor() manually.`
          )
        } else {
          const result = injectVitePlugin(content, basename, moduleConfig)
          if (result.injected) {
            fs.writeFileSync(viteConfigPath, result.content)
            vitePluginFound = true
            vitePluginInjected = true
            adapterConfigured = true
            console.log(`  ${basename}: cortexEditor plugin injected`)
          } else {
            vitePluginFound = false
          }
        }
      }
    }
  } else if (detectedBundler === 'webpack') {
    if (!webpackConfigPath) {
      console.warn(
        '  Webpack detected but no webpack.config.* file was found - add cortexWebpack() manually or create a config file, then re-run cortex init.'
      )
    } else {
      const basename = path.basename(webpackConfigPath)
      const content = fs.readFileSync(webpackConfigPath, 'utf8')
      const moduleConfig = isModuleConfig(webpackConfigPath, content, pkg.type)

      if (webpackConfigUsesCortexWebpack(content, basename, moduleConfig)) {
        adapterConfigured = true
        console.log(`  ${basename}: cortexWebpack plugin found`)
      } else {
        const result = injectWebpackPlugin(content, basename, moduleConfig)
        if (result.injected) {
          fs.writeFileSync(webpackConfigPath, result.content)
          webpackConfigInjected = true
          adapterConfigured = true
          console.log(`  ${basename}: cortexWebpack plugin injected`)
        }
      }
    }
  } else {
    const installed = await ensurePackages(
      cwd,
      pkg,
      packageManager,
      VITE_SETUP_PACKAGES,
      'missing-bundler',
      options
    )
    if (installed) {
      writeViteConfig(cwd)
      vitePluginFound = true
      vitePluginInjected = true
      viteConfigCreated = true
      adapterConfigured = true
    }
  }

  const setupComplete = depFound && adapterConfigured
  if (setupComplete) {
    console.log('  Setup complete. Restart your AI agent so it picks up .mcp.json.')
    // Fire-and-forget telemetry — never let it throw or block init.
    try {
      const telemetry = createTelemetry({
        enabled: resolveTelemetryEnabled({}),
        endpoint: resolveTelemetryEndpoint({}),
        cortexRoot: cwd,
        version: cortexVersion,
      })
      await telemetry.recordInit()
    } catch {
      // Swallow — telemetry must never break the init command.
    }
  } else {
    console.warn('  Cortex setup incomplete. Resolve the warnings above, then re-run cortex init.')
  }

  return {
    mcpWritten,
    slashCommandFound,
    slashCommandWritten,
    vitePluginFound,
    vitePluginInjected,
    viteConfigCreated,
    nextConfigFound,
    nextConfigInjected,
    nextConfigCreated,
    webpackConfigFound,
    webpackConfigInjected,
    depFound,
    detectedBundler,
    packageManager,
    setupComplete,
  }
}
