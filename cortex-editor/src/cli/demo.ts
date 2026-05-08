import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'

export interface DemoResult {
  scaffolded: boolean
  reset: boolean
  demoDir: string
}

// ---------------------------------------------------------------------------
// Template files (inline — no external template directory)
// ---------------------------------------------------------------------------

function resolvePackageJson(demoDir: string): string {
  // Resolve cortex-editor reference:
  // - Running from source (dev): use file: link to local package
  // - Running from npm install: use ^version from installed package
  // - Fallback: 'latest'
  let cortexEditorRef = 'latest'
  const cliDir = path.dirname(fileURLToPath(import.meta.url))
  const pkgRoot = path.resolve(cliDir, '../..')
  const localPkgJson = path.join(pkgRoot, 'package.json')
  if (fs.existsSync(localPkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(localPkgJson, 'utf8'))
      if (pkg.name === 'cortex-editor') {
        const isInsideNodeModules = pkgRoot.includes(`${path.sep}node_modules${path.sep}`)
        if (isInsideNodeModules && pkg.version) {
          cortexEditorRef = `^${pkg.version}`
        } else {
          cortexEditorRef = `file:${path.relative(demoDir, pkgRoot)}`
        }
      }
    } catch { /* ignore */ }
  }

  return JSON.stringify(
    {
      name: 'cortex-demo',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
      },
      dependencies: {
        react: '^19.1.0',
        'react-dom': '^19.1.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.5.2',
        'cortex-editor': cortexEditorRef,
        vite: '^6.3.5',
        tailwindcss: '^4.1.8',
        '@tailwindcss/vite': '^4.1.8',
      },
    },
    null,
    2
  ) + '\n'
}

const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cortexEditor } from 'cortex-editor/vite'

export default defineConfig({
  plugins: [cortexEditor(), react(), tailwindcss()],
})
`

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cortex Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

const MAIN_TSX = `import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(<App />)
`

const INDEX_CSS = `@import 'tailwindcss';

@theme {
  --color-canvas: #f8fafc;
  --color-surface: #ffffff;
  --color-border-muted: #e2e8f0;
  --color-brand: #2563eb;
}

@custom-variant dark (&:is(.dark *));
`

const APP_TSX = `import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system'

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('demo-theme') as Theme) ?? 'system'
  })

  useEffect(() => {
    localStorage.setItem('demo-theme', theme)
    const html = document.documentElement

    if (theme === 'dark') {
      html.classList.add('dark')
      html.classList.remove('light')
    } else if (theme === 'light') {
      html.classList.remove('dark')
      html.classList.add('light')
    } else {
      // system: let OS preference drive it
      html.classList.remove('dark', 'light')
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => mq.matches ? html.classList.add('dark') : html.classList.remove('dark')
      apply()
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])

  return [theme, setTheme] as const
}

export default function App() {
  const [theme, setTheme] = useTheme()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="mx-auto max-w-3xl px-6 py-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Cortex Demo
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A sample app wired up with Cortex. Edit styles visually, then
              finalize changes back to source.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 p-0.5">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={\`px-2.5 py-1 text-xs font-medium rounded-md transition-colors \${
                  theme === t
                    ? 'bg-white dark:bg-slate-500 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }\`}
              >
                {t === 'light' ? '\\u2600' : t === 'dark' ? '\\u263E' : '\\u{1F5A5}'} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Feature card */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">
            Token-Constrained Editing
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Cortex limits edits to design-system tokens — spacing, typography,
            and color scales — so every change stays consistent. No arbitrary
            pixel values, no one-off hex codes.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="inline-flex items-center rounded bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              Tailwind
            </span>
            <span className="inline-flex items-center rounded bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              React
            </span>
            <span className="inline-flex items-center rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Vite
            </span>
          </div>
        </section>

        {/* Example content */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">
            Try It Out
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Open Claude Code in this directory and ask it to change the header
            background, adjust spacing, or swap colors. Cortex intercepts the
            edits and applies them live.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Primary Action
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Secondary
            </button>
          </div>
        </section>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tokens', value: '5 scales' },
            { label: 'Latency', value: '<50ms' },
            { label: 'File types', value: 'JSX / TSX' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center"
            >
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{stat.value}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-700 py-6 text-center text-xs text-slate-400">
        Built with Cortex &middot; cortex-editor
      </footer>
    </div>
  )
}
`

const MCP_JSON = JSON.stringify(
  {
    mcpServers: {
      cortex: {
        command: 'npx',
        args: ['cortex', 'mcp'],
      },
    },
  },
  null,
  2
) + '\n'

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
    },
    include: ['src'],
  },
  null,
  2
) + '\n'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GITIGNORE = `node_modules/
dist/
.cortex/
`

const TEMPLATE_FILES: Record<string, string> = {
  'vite.config.ts': VITE_CONFIG,
  'index.html': INDEX_HTML,
  'tsconfig.json': TSCONFIG,
  '.mcp.json': MCP_JSON,
  '.gitignore': GITIGNORE,
  'src/main.tsx': MAIN_TSX,
  'src/App.tsx': APP_TSX,
  'src/index.css': INDEX_CSS,
}

function writeTemplates(demoDir: string): void {
  // package.json is dynamic (resolves cortex-editor path)
  const pkgJson = resolvePackageJson(demoDir)
  const abs0 = path.join(demoDir, 'package.json')
  fs.mkdirSync(path.dirname(abs0), { recursive: true })
  fs.writeFileSync(abs0, pkgJson)

  for (const [relPath, content] of Object.entries(TEMPLATE_FILES)) {
    const abs = path.join(demoDir, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
}

function gitInit(demoDir: string): void {
  execFileSync('git', ['init'], { cwd: demoDir, stdio: 'ignore' })
  execFileSync('git', ['add', '-A'], { cwd: demoDir, stdio: 'ignore' })
  execFileSync(
    'git',
    ['-c', 'user.name=cortex', '-c', 'user.email=cortex@demo', 'commit', '-m', 'initial scaffold'],
    { cwd: demoDir, stdio: 'ignore' }
  )
}

function gitReset(demoDir: string): void {
  execFileSync('git', ['checkout', '.'], { cwd: demoDir, stdio: 'ignore' })
  execFileSync('git', ['clean', '-fd'], { cwd: demoDir, stdio: 'ignore' })
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runDemo(opts: {
  cwd?: string
  fresh?: boolean
  skipOpen?: boolean
  skipServe?: boolean
} = {}): Promise<DemoResult> {
  const cwd = opts.cwd ?? process.cwd()
  const demoDir = path.join(cwd, 'cortex-demo')

  // --fresh: nuke and re-scaffold
  if (fs.existsSync(demoDir) && opts.fresh) {
    if (fs.lstatSync(demoDir).isSymbolicLink()) {
      throw new Error('cortex-demo is a symlink. Remove it manually before using --fresh.')
    }
    fs.rmSync(demoDir, { recursive: true, force: true })
  } else if (fs.existsSync(demoDir)) {
    // Existing dir (not nuked): reset and restart
    if (!fs.existsSync(path.join(demoDir, '.git'))) {
      throw new Error('cortex-demo/ exists but is not a git repo. Run with --fresh to re-scaffold.')
    }
    console.log('[cortex] Demo app found. Resetting files...')
    gitReset(demoDir)
    console.log('[cortex] Files reset via git checkout.')

    if (!opts.skipServe) {
      await startDevServer(demoDir, !opts.skipOpen)
    }

    return { scaffolded: false, reset: true, demoDir }
  }

  // Scaffold fresh
  console.log('[cortex] Scaffolding cortex-demo/...')
  fs.mkdirSync(demoDir, { recursive: true })
  writeTemplates(demoDir)
  gitInit(demoDir)
  console.log('[cortex] Scaffold complete. Git repo initialized.')

  if (!opts.skipServe) {
    await startDevServer(demoDir, !opts.skipOpen)
  }

  return { scaffolded: true, reset: false, demoDir }
}

// ---------------------------------------------------------------------------
// Dev server management (only runs when skipServe is false)
// ---------------------------------------------------------------------------

async function startDevServer(demoDir: string, open: boolean): Promise<void> {
  console.log('[cortex] Installing dependencies...')
  execFileSync('npm', ['install'], { cwd: demoDir, stdio: 'inherit' })

  console.log('[cortex] Starting dev server...')
  const child = spawn('npm', ['run', 'dev'], {
    cwd: demoDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Wait for Vite's "ready" message and extract the URL
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    let found = false
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Dev server did not start within 30s'))
    }, 30_000)

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stdout.write(text)
      if (found) return // URL already found — stop accumulating
      output += text
      // Vite prints: Local: http://localhost:5173/
      const match = output.match(/Local:\s+(https?:\/\/[^\s]+)/)
      if (match) {
        found = true
        output = '' // free accumulated buffer
        clearTimeout(timeout)
        resolve(match[1]!)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Dev server exited with code ${code ?? 'null'} before printing a URL`))
    })
  })

  if (open) {
    openBrowser(url)
  }

  console.log(`\n[cortex] Demo running at ${url}`)
  console.log('[cortex] Open Claude Code in cortex-demo/ and start editing!')
  console.log('[cortex] Press Ctrl+C to stop.\n')

  // Keep process alive until killed
  await new Promise<void>((resolve) => {
    const cleanup = () => { child.kill(); resolve() }
    process.once('SIGINT', cleanup)
    process.once('SIGTERM', cleanup)
    child.on('close', () => {
      process.removeListener('SIGINT', cleanup)
      process.removeListener('SIGTERM', cleanup)
      resolve()
    })
  })
  process.exit(0)
}
