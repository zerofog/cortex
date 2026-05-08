# Webpack Adapter Current Architecture

Supersedes the Webpack adapter portion of `2026-03-25-phase-8b-shortcuts-persistence-webpack-design.md`, which correctly identified the adapter need but predated Cortex's tokenized Apply/MCP flow.

## Goal

Standalone Webpack 5 projects should get the same Cortex browser editing surface and Apply path as Vite projects without installing Vite, Next, or framework-specific glue. The adapter must be explicit enough for Create React App override layers and custom Webpack dev servers, while failing clearly in setups where Webpack cannot inject browser scripts.

Cortex is dev-time only. If the Webpack compiler is in `production` mode, or `NODE_ENV=production`, the adapter should no-op and leave the production bundle unchanged.

## Public API

```js
const { cortexWebpack } = require('cortex-editor/webpack')

module.exports = {
  plugins: [cortexWebpack()],
}
```

Options:

- `projectRoot`: project root override; defaults to Webpack compiler context.
- `port`: local Cortex bridge port override; defaults to an available loopback port.
- `resolveAlias`: alias map passed to the shared source loader for CSS Module import resolution.
- `includeNodeModules`: package names in `node_modules` that should be instrumented; all other `node_modules` paths are skipped.
- `toggleShortcut`: same validated `$mod+...` shortcut format as the Vite adapter.

Webpack is an optional peer dependency. Non-Webpack users should not install or load Webpack just because `cortex-editor` is installed.

## Source Instrumentation

The adapter adds a `pre` loader rule for `.jsx` and `.tsx` client source. That rule uses the shared `source-loader` implementation, while `next-source-loader` remains a compatibility re-export for existing Next users.

The exclude predicate must be option-aware:

- default: skip every `/node_modules/` path for performance;
- with `includeNodeModules`: allow only exact package-segment matches such as `/node_modules/@acme/ui/`;
- never use bare substring matching for package names.

This keeps Webpack and Next behavior aligned with Vite's `createSourceTransform` path.

## Runtime Bridge

Webpack does not expose Vite's HMR message bus, so the adapter starts a loopback-only Cortex bridge:

- serves the browser bundle at `/@cortex/browser.js`;
- accepts browser WebSocket connections at `/cortex`;
- accepts CLI/MCP WebSocket connections at `/@cortex/ws`;
- writes `.cortex/port` and `.cortex/token` for `cortex mcp` discovery;
- injects `window.__cortex_ws_port__`, `window.__CORTEX_TOKEN__`, and `window.__CORTEX_SESSION_ID__` before the browser bundle boots;
- deletes discovery files on Webpack shutdown when the hook is available.

Write-bearing browser messages and CLI RPC messages must include the session token. File-context RPCs must stay inside the project root after symlink resolution.

The current standalone Webpack bridge is HTTP-only. It serves the injected browser script from `http://localhost:<port>/@cortex/browser.js` and expects the browser channel to connect to a plain localhost WebSocket. Projects running their Webpack dev page over HTTPS can block that bridge as mixed content or fail the WebSocket upgrade. For this release, Webpack users should run Cortex against an HTTP dev page; secure Webpack bridge support is follow-up work.

## HTML Injection

The happy path is `HtmlWebpackPlugin`:

1. detect the plugin through its static `getHooks(compilation)` API;
2. start the Cortex bridge if needed;
3. inject the bootstrap script before `</head>` in `beforeEmit`.

When `HtmlWebpackPlugin` is absent, automatic HTML mutation is not reliable. The adapter emits `cortex-manual-injection.html` and logs an actionable warning instructing the user to paste that snippet into their dev HTML template.

## Framework Boundaries

`cortex init` chooses exactly one app adapter:

- Next config wins over Vite/Webpack because Next can contain auxiliary configs;
- Vite config wins over standalone Webpack;
- standalone `webpack.config.*` gets `cortexWebpack()` only when no Next/Vite config was selected.

If `cortexWebpack()` is used inside a Next project, the adapter warns and points users to `withCortex()` rather than silently cross-contaminating the project.

Create React App is supported only where users can add a Webpack plugin through an override layer such as CRACO or react-app-rewired. Stock `react-scripts` does not expose `webpack.config.*`, so `cortex init` cannot mutate it directly.

## Verification

The ship bar for this adapter is:

- loader option tests for aliases and included node modules;
- HtmlWebpackPlugin injection tests for token/session/port/bootstrap;
- manual fallback emission tests;
- loopback bridge tests for browser `/cortex` and CLI `/@cortex/ws`;
- cleanup tests for `.cortex` files;
- `cortex init` tests proving Vite/Next/Webpack precedence and idempotency;
- package typecheck, build, and full test run.
