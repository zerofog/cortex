import fs from 'node:fs'
import path from 'node:path'

export type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  packageManager?: string
}

export type BundlerKind = 'vite' | 'next' | 'webpack' | 'none'
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface BundlerDetection {
  kind: BundlerKind
  configPath: string | null
  source: 'config' | 'dependency' | 'none'
  unsupportedConfigPath?: string | null
}

export const VITE_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
] as const

export const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
] as const

export const UNSUPPORTED_NEXT_CONFIG_FILES = [
  'next.config.cjs',
  'next.config.cts',
  'next.config.mts',
] as const

export const WEBPACK_CONFIG_FILES = [
  'webpack.config.ts',
  'webpack.config.js',
  'webpack.config.mts',
  'webpack.config.mjs',
  'webpack.config.cts',
  'webpack.config.cjs',
] as const

export function allDependencies(pkg: PackageJson): Record<string, string> {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  }
}

export function hasDependency(pkg: PackageJson, name: string): boolean {
  return Boolean(allDependencies(pkg)[name])
}

export function findConfigPath(cwd: string, files: readonly string[]): string | null {
  for (const file of files) {
    const candidate = path.join(cwd, file)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function detectBundler(cwd: string, pkg: PackageJson): BundlerDetection {
  const viteConfig = findConfigPath(cwd, VITE_CONFIG_FILES)
  if (viteConfig) return { kind: 'vite', configPath: viteConfig, source: 'config' }

  const nextConfig = findConfigPath(cwd, NEXT_CONFIG_FILES)
  if (nextConfig) return { kind: 'next', configPath: nextConfig, source: 'config' }

  const unsupportedNextConfig = findConfigPath(cwd, UNSUPPORTED_NEXT_CONFIG_FILES)
  if (unsupportedNextConfig) {
    return {
      kind: 'next',
      configPath: null,
      source: 'config',
      unsupportedConfigPath: unsupportedNextConfig,
    }
  }

  const webpackConfig = findConfigPath(cwd, WEBPACK_CONFIG_FILES)
  if (webpackConfig) return { kind: 'webpack', configPath: webpackConfig, source: 'config' }

  if (hasDependency(pkg, 'vite')) return { kind: 'vite', configPath: null, source: 'dependency' }
  if (hasDependency(pkg, 'next')) return { kind: 'next', configPath: null, source: 'dependency' }
  if (hasDependency(pkg, 'webpack') || hasDependency(pkg, 'react-scripts')) {
    return { kind: 'webpack', configPath: null, source: 'dependency' }
  }

  return { kind: 'none', configPath: null, source: 'none' }
}

export function detectPackageManager(cwd: string, pkg: PackageJson = {}): PackageManager {
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm'
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  if (
    fs.existsSync(path.join(cwd, 'bun.lockb')) ||
    fs.existsSync(path.join(cwd, 'bun.lock'))
  ) {
    return 'bun'
  }
  if (pkg.packageManager?.startsWith('pnpm@')) return 'pnpm'
  if (pkg.packageManager?.startsWith('yarn@')) return 'yarn'
  if (pkg.packageManager?.startsWith('bun@')) return 'bun'
  if (pkg.packageManager?.startsWith('npm@')) return 'npm'
  return 'npm'
}
