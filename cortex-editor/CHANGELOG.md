# Changelog

All notable changes to cortex-editor. Follows [Keep a Changelog](https://keepachangelog.com) loosely; versions follow [SemVer](https://semver.org) (pre-1.0: breaking changes may land in MINOR).

## 0.3.1 — 2026-07-21

Fast-follow from the 0.3.0 real-app retest (a production Next 16.1.6 app). Activation was confirmed working; these fix the gaps the retest surfaced.

### Fixed
- **Strict repos can `next build` again — no cast needed.** The `withCortex` input type was a hand-rolled shadow of Next's `NextConfig` with `[key: string]: unknown` index signatures; Next's real `NextConfig`/`TurbopackOptions` are interfaces (no implicit index signature), so `withCortex(realNextConfig)` failed tsc in any `typescript.ignoreBuildErrors:false` project — first on the webpack callback, then (once that was derived) on `turbopack` and the outer index signature. The exported `NextConfig` is now an alias of the consumer's own `import('next').NextConfig`, the turbopack rule merge is typed against Next's own rule types (no casts), and the compile-time contract test is wired into `npm run typecheck` (it previously sat outside the tsc program — which is how this class shipped twice). If you added `as Parameters<typeof withCortex>[0]` to your next.config as a workaround, delete it.
- **Restarting Claude Code no longer destroys staged edits.** The dev server (and the browser) wiped the staging buffer whenever a new `cortex mcp` process announced a different session UUID — but Claude Code spawns a fresh `cortex mcp` per conversation, so every Claude restart (and every hello alternation between two concurrent Claude windows) silently discarded the designer's staged-but-unapplied work. The UUID-keyed wipe is removed on all three sides; every hello now runs the reconcile pass instead (auto-clears only intents whose edits verifiably landed in source).
- **Capability copy no longer mentions an API key.** "Component library editing requires an API key" contradicted the README's no-API-keys pledge (no API-key concept exists in cortex); it now says "requires Claude Code", matching the sibling capability messages.
- **The token picker now works on Next apps.** The webpack/Next bridge's browser hello never carried the design-system payloads (swatches, color chips, text components, spacing tokens) — the Vite adapter shipped them from day one, so on every Next app the picker showed "No design tokens detected" even when the server had resolved the theme. The webpack hello now resolves and ships the same four payloads (warmed at boot; absent fields simply omit).
- **`<CortexDevScripts/>` refusals are diagnosable from the page itself.** When injection is refused (bridge not running, torn discovery read, stale lock, wrong project root…), the component now renders an inert `<script data-cortex-inactive="…" data-cortex-reason="…">` marker instead of null — RSC-worker console output can be swallowed by the host, which previously produced boots with no injection and zero diagnostics. The could-not-read reason also names WHICH fallback resolved the project root (prop / `__CORTEX_PROJECT_ROOT` env / cwd), the load-bearing fact when Next's inferred workspace root diverges from the app dir. Dev-only; production still renders nothing.
- **Tailwind v3 apps can edit again.** The v3 resolver used a bare `import()` (couldn't evaluate a `tailwind.config.ts` at dev-server runtime) and resolved `tailwindcss` from cortex's own `node_modules` (invisible under pnpm). It now resolves the **project's** `tailwindcss` via `createRequire(projectRoot)` and loads the config through Tailwind's own `loadConfig` — handling `.ts`/`.js`/`.mjs`/`.cjs` under any package manager.
- **Unresolvable Tailwind theme no longer kills all editing.** Previously any Tailwind app whose theme wouldn't resolve degraded to preview-only and staged nothing — even inline overrides that never needed the theme. Now an unresolved theme disables utility-CLASS editing only; inline-style and CSS-module overrides still stage and save.
- **No more spurious WS/lock warnings on Next.** The WebSocket-fallback bootstrap warning (Vite-specific advice) no longer fires on every Next page load — WS is the intended Next transport. The quick-restart "Another cortex instance…" warning is suppressed when a transient predecessor drains and the retry reclaims; it fires only for a genuine second dev server.
- **MCP no longer errors on an immediate call.** A tools/call within ~1-2s of `cortex mcp` start now awaits the in-flight connection instead of returning "Not connected", while still failing fast when the dev server is genuinely down.

### Changed
- `next` added as a **devDependency** (types only; still an optional peer at runtime).
- **Object literals passed to `withCortex` are now excess-property-checked.** The old index signature accepted any junk key silently; with the real `NextConfig` type, a typo'd key in an inline literal is a compile error (ecosystem-standard strictness). Unknown keys still pass through at runtime.
- `TurbopackConfig`, `TurbopackRuleObject`, `TurbopackLoaderItem` are **deprecated** (superseded by Next's own types); they keep their exact 0.3.0 shapes and will be removed in 0.4.0.

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
