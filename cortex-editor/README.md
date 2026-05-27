# cortex-editor

**Cursor's visual editor, but for AI CLI tools.**

Cortex is a dev-time visual editor for web apps. Select an element in the browser, adjust design tokens visually, see the change immediately — then hand the staged edits to Claude Code, which applies them back to your source files.

## 30-second quickstart

Run these in the app package you want to edit (the one with your Vite/Next/Webpack config):

```bash
npm install -D cortex-editor
npx cortex init
```

Then start your dev server, start Claude Code from the same directory, and run `/cortex` to activate the editor.

## What it does

- **Select + adjust visually.** Click an element, change supported design properties (spacing, radius, gap, typography, color) in the Cortex panel.
- **Staging buffer + Apply.** Changes preview instantly and accumulate as staged edits in the browser — your source files are untouched until you Apply.
- **Source edits via your own agent.** On Apply, Cortex hands the staged intents to Claude Code over MCP. Deterministic edits are applied directly; edits needing judgment are written by Claude with its normal file-editing tools.

## Requirements

- Node.js 20 or newer.
- A local web app on a normal dev server — Vite (fully supported), standalone Webpack 5 (supported), or Next.js (experimental/partial).
- React / Vue / Svelte with Tailwind CSS or CSS Modules.
- Claude Code to apply staged edits back to source. You can preview and stage edits without it; source files just aren't written until an agent applies them.

## MCP auto-discovery

`cortex init` writes a project-scoped Claude Code MCP server to `.mcp.json` (`npx cortex mcp`). There is no separate MCP package to install. After init, restart Claude Code or run `/mcp` and approve the `cortex` server.

## No embedded API keys

AI-assisted edits route through your existing Claude Code session over MCP. Cortex does not embed, require, or transmit any API keys of its own.

## Full documentation

Setup details, the editing workflow, Webpack/Next specifics, annotation persistence, and troubleshooting live in the project repository:

https://github.com/zerofog/cortex

## License

MIT — see [LICENSE](./LICENSE).
