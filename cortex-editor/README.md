# cortex-editor

**Claude Code's visual editor.**

Cortex is a dev-time visual editor for web apps. Select an element in the browser, adjust design tokens visually, see the change immediately — then hand the staged edits to Claude Code, which applies them back to your source files.

## What you'll do

Install Cortex into your app, activate it from Claude Code with `/cortex`, click elements in the browser to edit them, and apply your changes when you're ready. Source files only change when you say so.

## Quick start

### 1. Install

Run from your app's folder (the one with `package.json`):

```bash
npm install -D cortex-editor
npx cortex init
```

### 2. Start your app

```bash
npm run dev
```

Leave this terminal running. Note the URL it prints (e.g. `http://localhost:5173`) and open it in a browser.

### 3. Open Claude Code

Start Claude Code in the **same folder** as your app. If it was already open, restart it from this folder so it picks up the new MCP server.

### 4. Activate

In Claude Code, type `/cortex`. Reload your browser tab — the Cortex panel appears on the side.

### 5. Edit + Apply

- Click any element to edit it.
- Adjust spacing, color, typography, etc. in the panel.
- Click **Apply** (or run `/cortex apply` in Claude Code) when you're ready. Claude Code writes the changes to your source files.

> **Staging, not saving.** Your edits live in the browser until you Apply. Reload without applying and they're gone — on purpose. Experiment freely; commit when ready.

## Why Cortex?

Designers usually bounce between Figma (where the change is visual) and Claude Code (where the change becomes code) — a round-trip that loses fidelity at every step.

Cortex puts the editing surface on the live app itself. You adjust spacing, color, and typography directly on real content, with real responsive behavior, then Apply hands the intent to Claude Code. No spec to write, no screenshot to annotate, no translation step.

## Supported stacks

- **Vite** — fully supported. `cortex init` auto-configures the plugin.
- **Webpack 5** — supported (HtmlWebpackPlugin or manual snippet).
- **Next.js** — experimental. `cortex init` instruments source; full Apply flow not yet end-to-end.

Works with **React, Vue, or Svelte**, styled with **Tailwind CSS** or **CSS Modules**.

## Requirements

- Node.js 20 or newer.
- Claude Code for the Apply step ([code.claude.com](https://code.claude.com/)).

## MCP auto-discovery

`cortex init` writes a project-scoped Claude Code MCP server to `.mcp.json` (`npx cortex mcp`). No separate MCP package to install. After init, restart Claude Code or run `/mcp` and approve the `cortex` server.

## No embedded API keys

AI-assisted edits route through your existing Claude Code session over MCP. Cortex does not embed, require, or transmit any API keys of its own.

## Full documentation

Step-by-step setup walkthrough, Webpack/Next specifics, annotation persistence, and troubleshooting live in the project repository:

https://github.com/zerofog/cortex#getting-started

## License

MIT — see [LICENSE](./LICENSE).
