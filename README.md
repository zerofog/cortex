# Cortex Visual Editor

Cortex is a dev-time visual editor for web apps. It lets you select elements in the browser, adjust design tokens visually, preview changes immediately, and hand staged edits to Claude Code so they can be applied back to source.

## Support Status

Cortex's complete install-to-Apply workflow currently targets Vite and standalone Webpack 5 apps.

- Vite: supported. `cortex init` can configure the Vite plugin automatically.
- Next.js: experimental/partial. `cortex init` can wrap `next.config.*` for source instrumentation, but visual editor activation and Apply are not end-to-end supported yet.
- Standalone Webpack/CRA: supported for Webpack 5 projects where you can add a Webpack plugin and run the app over HTTP in development. `cortex init` can configure `cortexWebpack()` automatically when a `webpack.config.*` file is present. HtmlWebpackPlugin projects get automatic script injection; projects without HtmlWebpackPlugin get a generated manual snippet. HTTPS Webpack dev pages are not supported yet because the standalone bridge serves its injected script and WebSocket endpoint from local HTTP.

The Webpack adapter design is captured in [`docs/superpowers/specs/2026-05-07-webpack-adapter-current-architecture.md`](docs/superpowers/specs/2026-05-07-webpack-adapter-current-architecture.md).

## Requirements

- Node.js 20 or newer.
- A local web app with a normal dev server.
- Claude Code for applying staged edits back to source. You can preview and stage edits without Claude Code, but source files are not updated until an agent applies them.

## Install

Install Cortex from npm. There is no separate MCP package to download; `cortex init` writes the Claude Code MCP config for this project.

Run these commands from the app package you want to edit. In a monorepo, that is usually the workspace/package containing your Vite config and app source, not necessarily the repo root.

```bash
npm install -D cortex-editor
npx cortex init
```

Use your project's package manager if it is not npm:

```bash
pnpm add -D cortex-editor
pnpm exec cortex init
```

```bash
yarn add -D cortex-editor
yarn cortex init
# or: yarn exec cortex init
```

```bash
bun add -d cortex-editor
bunx cortex init
```

`cortex init` is idempotent. It preserves existing Cortex setup and existing custom project slash commands.

## What Init Does

`cortex init` configures the project for Cortex:

1. Adds a project-scoped Claude Code MCP server to `.mcp.json`.
2. Adds a project slash command at `.claude/commands/cortex.md`, so Claude Code users can run `/cortex`.
3. Detects the app adapter:
   - If it finds `vite.config.*`, it injects `cortexEditor()` from `cortex-editor/vite`.
   - If it finds `next.config.*`, it wraps the exported config with `withCortex(...)` from `cortex-editor/next`.
   - If both Next and Vite configs are present, it configures Next only to avoid modifying auxiliary Vite configs used for tests or tooling.
   - If both Vite and standalone Webpack configs are present, it configures Vite and warns before skipping Webpack.
   - If it finds standalone `webpack.config.*`, it injects `cortexWebpack()` from `cortex-editor/webpack`.

The MCP server entry written to `.mcp.json` looks like this:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "npx",
      "args": ["cortex", "mcp"]
    }
  }
}
```

Today `cortex init` writes an npm/npx-based MCP command. If your team does not have `npx` available, edit the `command` and `args` in `.mcp.json` to use your package manager's equivalent:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "pnpm",
      "args": ["exec", "cortex", "mcp"]
    }
  }
}
```

Claude Code treats project-scoped MCP servers as a trust boundary. After `cortex init`, restart Claude Code or run `/mcp` and approve the `cortex` server when prompted. See Claude Code's [MCP documentation](https://code.claude.com/docs/en/mcp) for project-scoped MCP behavior and approval prompts.

Claude Code project slash commands live in `.claude/commands/`. Cortex creates `.claude/commands/cortex.md`, which becomes `/cortex` in Claude Code. See Claude Code's [slash command documentation](https://code.claude.com/docs/en/slash-commands) for how project commands are discovered.

Commit the generated `.mcp.json`, `.claude/commands/cortex.md`, and app config changes if you want the team to share the setup. Do not commit `.cortex/`; it is runtime state written by the local dev server.

## Run Cortex In Vite Or Webpack

After install and init in a Vite or standalone Webpack app:

1. Start your app's normal dev server. Use whatever command your project already uses, such as `npm run dev`, `pnpm dev`, `yarn start`, `turbo dev`, or a custom script.
2. Open the app in your browser.
3. Start or restart Claude Code from the same project/app directory where you ran `cortex init`.
4. In Claude Code, run `/mcp` and confirm the `cortex` server is approved and connected.
5. Run `/cortex`.

`/cortex` checks Cortex status and activates the visual editor when the dev server and browser are connected.

Webpack projects using HtmlWebpackPlugin receive automatic browser script injection. CRA/react-scripts projects need a config override layer such as CRACO or react-app-rewired so `cortexWebpack()` can be added to the underlying Webpack config. If your project does not use HtmlWebpackPlugin, Cortex emits `cortex-manual-injection.html` during development with the snippet to add to your dev HTML template. Standalone Webpack support currently expects the dev page to be served over HTTP; HTTPS Webpack dev pages can block the local HTTP script and plain WebSocket bridge as mixed content.

You can also activate Cortex from Claude by asking "Activate Cortex", or from the browser with the default shortcut:

```text
Cmd/Ctrl + Shift + .
```

## Editing Workflow

1. Activate Cortex with `/cortex` or the browser shortcut.
2. Select an element in the browser.
3. Adjust supported visual properties in the Cortex panel.
4. Cortex previews the change immediately and stores it as a staged edit.
5. With Claude Code connected, click Apply in the panel or run `/cortex apply`.
6. Claude reads the staged edits through MCP.
7. Cortex applies deterministic edits directly when it can.
8. For edits that need source judgment, Claude edits the source files with its normal file-editing tools.
9. Claude discards completed staged intents so the browser buffer stays in sync.

## Using Cortex Without Claude Code

You can activate Cortex and preview visual edits without Claude Code connected.

Without Claude Code:

- edits are staged only;
- source files are not updated;
- commits and pushes do not happen;
- staged edits live in browser memory/localStorage and, while the dev server is running, the dev server's in-memory Cortex cache.

Connect Claude Code and use `/cortex apply` when you are ready to write staged edits back to source.

## Can Claude Code Install Cortex For Me?

Yes. Open Claude Code in your app project and ask it to install Cortex. It can run the same commands:

```bash
npm install -D cortex-editor
npx cortex init
```

Claude may ask for permission before running install or init commands. After init finishes, restart Claude Code or run `/mcp` so Claude loads and approves the new project-scoped `cortex` MCP server. If your project uses pnpm, Yarn, or Bun, ask Claude to use that package manager instead of npm.

## Manual Setup

If automatic config cannot update your Vite config, add the plugin manually:

```ts
import { defineConfig } from 'vite'
import { cortexEditor } from 'cortex-editor/vite'

export default defineConfig({
  plugins: [cortexEditor()],
})
```

For Next.js, the partial adapter wrapper is:

```js
const { withCortex } = require('cortex-editor/next')

const nextConfig = {}

module.exports = withCortex(nextConfig)
```

or, in ESM:

```js
import { withCortex } from 'cortex-editor/next'

const nextConfig = {}

export default withCortex(nextConfig)
```

For standalone Webpack 5, add the plugin manually:

```js
const { cortexWebpack } = require('cortex-editor/webpack')

module.exports = {
  plugins: [cortexWebpack()],
}
```

## Optional: Persisting annotations across restarts

By default, annotations and threads live in memory for the lifetime of the dev server and are cleared whenever Vite or Webpack restarts. To survive restarts, opt in via an environment variable:

```bash
CORTEX_PERSIST_ANNOTATIONS=true npm run dev
```

When enabled, Cortex writes annotations to `.cortex/annotations.json` in your project root and hydrates from that file on every session start. Writes are atomic (write-temp-then-rename), so a crash mid-write cannot corrupt the live file.

**Staleness caveat:** annotations are tied to a specific snapshot of your UI and source code. After code changes, an annotation may reference DOM elements or source lines that no longer exist. The designer is responsible for resolving or dismissing stale annotations.

**Privacy:** `.cortex/` is already in the repo's `.gitignore` — annotations stay local to your machine. Schema is versioned (`{ version: 1, annotations: [...] }`); mismatched versions are dropped with a warning rather than failing the dev server.

**Failure modes:** if `.cortex/` cannot be created (read-only filesystem, container bind-mount, permission issues), Cortex logs a one-time warning and falls back to ephemeral mode — no per-mutation noise. If `annotations.json` becomes corrupt or its schema version no longer matches the running Cortex, the session starts empty and logs a warning; the file is overwritten on the next mutation. If you want to preserve in-flight annotations across a Cortex upgrade with a schema bump, back up `annotations.json` first.

Default behavior (env var unset or any value other than `true`, case-insensitive) is unchanged — annotations remain ephemeral.

## Troubleshooting

### `/cortex` says the MCP server is unavailable

Restart Claude Code from the project directory, then run `/mcp` and approve the project-scoped `cortex` server. Claude Code reads the MCP server from `.mcp.json`.

### Cortex cannot connect to the dev server

Start your app's normal dev server and reload the browser page. Cortex discovers its local bridge port from `.cortex/port`, which the Vite and Webpack adapters write when the dev server starts. Restart the dev server if `.cortex/port` or `.cortex/token` is stale or missing; without a token, write/apply requests are rejected. If `.cortex/port` is missing, the MCP server falls back to port `5173`.

### The panel does not appear

Confirm all of the following:

- your app is running in dev mode;
- the page is open in the browser;
- the Vite config includes `cortexEditor()` or the Webpack config includes `cortexWebpack()`;
- Claude Code `/mcp` shows `cortex` connected if you are activating through Claude;
- the page's HTML includes a `</head>` tag so the Vite adapter can inject the browser script;
- Webpack projects without HtmlWebpackPlugin have manually added the snippet emitted as `cortex-manual-injection.html`;
- standalone Webpack projects are served over HTTP during Cortex sessions; HTTPS Webpack dev pages are not supported yet;
- your app's Content Security Policy allows Cortex's dev-time injected scripts.

### Apply times out

Apply requires Claude Code to be connected through the Cortex MCP server. Run `/mcp`, approve/connect `cortex`, then retry `/cortex apply` or click Apply again.

### Staged edits disappear after reload

Cortex persists staged edits in browser `localStorage`. Private browsing, disabled storage, quota failures, or clearing site data can remove staged edits before Claude applies them.

### Monorepo setup does not work

Run install/init in the app package whose dev server renders the page you want to edit. Start Claude Code from that same directory, or make sure Claude Code can see that package's `.mcp.json`, `.claude/commands/cortex.md`, and `.cortex/port`.

## Uninstall

Remove the package:

```bash
npm remove cortex-editor
```

Then remove the generated config:

- delete the `cortex` entry from `.mcp.json`, or delete `.mcp.json` only if Cortex was the only server in it;
- delete `.claude/commands/cortex.md`;
- delete `.cortex/`;
- remove `cortexEditor()` from `vite.config.*`, `withCortex(...)` from `next.config.*`, or `cortexWebpack()` from `webpack.config.*` if they were added.
