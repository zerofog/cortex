# Changelog

All notable changes to cortex-editor. Follows [Keep a Changelog](https://keepachangelog.com) loosely; versions follow [SemVer](https://semver.org) (pre-1.0: breaking changes may land in MINOR).

## 0.3.0 — 2026-07-19

### Added
- **Next 16 App Router support (dev mode, default Turbopack).** `withCortex()` now instruments source via `turbopack.rules` (previously it only hooked `webpack()`, which the default `next dev` never calls — it was silently inert). Source attribution covers client AND server components; editor activation and staged-edit Apply are verified end-to-end for client components.
- `<CortexDevScripts />` server component exported from `cortex-editor/next` — delivers the editor bootstrap in Next apps (Next has no HTML-injection hook). Reads the `.cortex/` discovery files at render time; renders `null` in production and when the bridge isn't running.
- `cortex init` inserts `<CortexDevScripts />` into the Next root layout (`app/` or `src/app/`, `.tsx`/`.jsx`/`.js`), via a ts-morph AST codemod that handles `>` in JSX attributes and directive prologues, and bails loudly rather than guessing.
- New discovery file `.cortex/injection.json` (port, sessionId, toggleShortcut; `0600`) written by the standalone bridge.
- `withCortex` options: `projectRoot`, `port`, `toggleShortcut`.
- `react >=18` added as an **optional** peer dependency (needed only for `<CortexDevScripts />`).

### Changed
- **`withCortex()` still returns a plain `NextConfig` object** (composes with `withBundleAnalyzer(withCortex(cfg))` etc.). The dev-only bridge now starts as a side effect, gated on the dev-server process signal — no change to how you export the config.
- Next instrumentation applies to server compilations too (previously client-only, which caused hydration-mismatch attribute loss). `serverExternalPackages` automatically gains `cortex-editor` (also in production `next build`, so a project importing `<CortexDevScripts />` resolves).

### Fixed
- WebSocket-fallback channel (standalone webpack bridge, and Next): keyboard toggle presses after bundle boot were silently dropped — the channel now installs a narrow `cortex/set-active` bridge and clears it on dispose.

### Known limitations (documented in README + tasks/todo.md)
- Pages Router, Next 13–15 (Turbopack path), `.js` files containing JSX / custom `pageExtensions`, Sass modules, strict-CSP inline policies, `next dev --experimental-https`.
- Server-component edits full-reload instead of Fast Refresh patching; post-Apply HMR verification is not Next-aware.
- The ZF0-1851 lock-refusal gate is best-effort under Turbopack (the loader runs in a separate worker process); the injected bootstrap token remains readable in inline markup (same posture as the shipped adapters). Both tracked as follow-ups.

## 0.2.0 — 2026-07-14

Initial npm publish surface: Vite + standalone Webpack 5 end-to-end editing, `cortex init` / `cortex mcp` CLI, MCP staged-edit tools.
