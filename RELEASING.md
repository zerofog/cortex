# Releasing cortex-editor

How to decide the next version number, and how to publish it.

## Versioning policy

We follow [Semantic Versioning](https://semver.org). Given `MAJOR.MINOR.PATCH`:

| Bump | When | Cortex-editor examples |
|---|---|---|
| **PATCH** (`0.2.0` → `0.2.1`) | Bug fix, perf improvement, internal refactor. **No observable behavior change** for anyone not hitting the bug. | Lazy-loading `postcss`; fixing a stale stack trace; a `tsup` config tweak that doesn't change emitted output. |
| **MINOR** (`0.2.0` → `0.3.0`) | New capability added. **Existing usage keeps working.** | A new opt-in env var (e.g. `CORTEX_TELEMETRY`); a new CLI flag; a new exported function; supporting a new bundler. |
| **MAJOR** (`0.2.0` → `1.0.0`) | **Breaking change.** Code that worked at the prior version no longer does. | Renaming `cortex init`; removing a plugin export; changing an MCP tool schema; bumping the minimum Node version; raising a peer-dep floor. |

### Pre-1.0 (where we are now)

Until we ship `1.0.0`, the semver convention relaxes: **breaking changes are allowed in minor bumps** (`0.2.x` → `0.3.0`). `PATCH` still means non-breaking. `MAJOR` is reserved for "we're declaring stability — `1.0.0`."

If you'd rather treat semver strictly even pre-1.0, that's fine — just be consistent.

## The decision in one question

For any change, ask:

> **Could a consumer who upgrades without reading the changelog have their app break?**

- **No** → `PATCH`.
- **No, but they get a new capability they have to opt into** → `MINOR`.
- **Yes — something they relied on changed or vanished** → `MAJOR` (or `MINOR` pre-1.0).

## Breakable surfaces in cortex-editor

A change to any of these is at minimum a `MINOR` (pre-1.0) / `MAJOR` (post-1.0) bump — non-additive changes here break real consumers:

- **CLI commands and flags.** `cortex init`, `cortex mcp`, anything user-typed. Renaming or removing a flag is a break.
- **Plugin/adapter exports.** `cortexEditor()` from `cortex-editor/vite`, `withCortex()` from `cortex-editor/next`, `cortexWebpack()` from `cortex-editor/webpack`. Removing or signature-changing these breaks every app config that imports them.
- **MCP tool schemas.** This is the **highest-blast-radius** surface — Claude Code sessions speak to cortex via these tools by name and shape. Renaming a tool or changing its input schema breaks every active Claude Code session using cortex until cortex republishes a compatible schema. Add tools; don't rename them.
- **Library exports.** Anything re-exported from `cortex-editor`'s root entry (`parseV4Theme`, `EditPipeline`, `TailwindResolver`, etc.). Signature changes or removals here are breaks.
- **Peer-dep floors.** Raising `vite >=5.1` to `vite >=6` excludes consumers on Vite 5 — a break.
- **Config-file shapes.** `.mcp.json`, `.cortex/usage.json`, `.cortex/annotations.json`, the structure of injected `.claude/commands/cortex.md`. Schema-incompatible changes break installs that already wrote the old shape.

Additive changes to any of these (new optional argument, new tool, new env var, new opt-in flag) are `MINOR`.

## Where the version lives

Two places must stay in sync:

- `cortex-editor/package.json` — the `"version"` field.
- `cortex-editor/src/version.ts` — the `version` constant read by `cortex --version`, MCP server metadata, and the telemetry payload.

`cortex-editor/tests/cli/version-sync.test.ts` fails CI if the two drift. When you bump, update **both**.

## Commit messages signal the bump

Commits in this repo follow [Conventional Commits](https://www.conventionalcommits.org):

- `fix:` → `PATCH`
- `feat:` → `MINOR`
- `perf:` / `refactor:` / `chore:` → no consumer-visible change → `PATCH` (or no bump if pre-publish prep)
- A footer of `BREAKING CHANGE: <description>`, or a `!` after the type (`feat!:`) → `MAJOR` (or `MINOR` pre-1.0)

A practical workflow before automation: keep a running `## Unreleased` section in a `CHANGELOG.md` and append a one-liner per PR. At release time, the highest-severity entry tells you the bump.

Tools like [changesets](https://github.com/changesets/changesets) or [standard-version](https://github.com/conventional-changelog/standard-version) can compute the bump and generate a changelog from `git log` automatically. Worth adopting once releases become routine.

## Publish checklist

Run these in order. Items marked **(local)** are maintainer-only actions the CI/automation never takes.

1. **Sanity check.** Run the full edit loop once manually — browser click → property change → Apply → Claude Code applies to source — in `dev-app/` or a scratch Vite app. The automated tests cover everything *except* the interactive Apply gesture through Claude Code MCP.
2. **Audit git history for secrets** before flipping the repo public. Untracked-file cleanup did not rewrite history. Run a scan (`gitleaks detect --no-banner`, or `git log --all -p | grep -iE 'BEGIN .* (PRIVATE|RSA) KEY|api[_-]?key|password|secret|token' | head`) — anything in old commits becomes publicly cloneable and cacheable once the repo flips, and that is not reversible.
3. **(local) `npm login`** — interactive; 2FA prompts at publish step if enabled.
4. **Preview the tarball.** From `cortex-editor/`:
   ```bash
   npm publish --dry-run
   ```
   This runs the real `prepublishOnly` (lean build, no source maps, externalized `@babel/parser` + `zod`) and lists the files. No side effects.
5. **Flip the repo public**, if going open-source:
   ```bash
   gh repo edit zerofog/cortex --visibility public --accept-visibility-change-consequences
   ```
   Do this **before** `npm publish` so the `repository`/`homepage`/`bugs` links in the published README resolve. Going public is effectively one-way — anything pushed public is cloneable + cacheable even if you later re-private.
6. **(local) Publish.** From `cortex-editor/`:
   ```bash
   npm publish
   ```
   `cortex-editor` is unscoped → public by default, no `--access` flag needed. 2FA OTP prompts here if enabled. Publishing is permanent — unpublish is only available within 72 hours, and the version number stays burned.
7. **Tag the release.** From the repo root:
   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```
   (Substitute the version you actually published.)
8. **Verify.**
   - `npm view cortex-editor` shows the new version.
   - `https://www.npmjs.com/package/cortex-editor` renders the README, license, and repo link correctly.
   - `npm install -D cortex-editor` in a fresh Vite + React project succeeds; `npx cortex init` configures the project; the dev server boots with the cortex script injected.

## When to bump before publishing

If `main` accumulates substantive changes between the last publish-prep PR and the actual `npm publish`, decide the bump *before* you publish — otherwise you'll publish features as the wrong version.

- Land everything you want in this release on `main`.
- Apply the decision-in-one-question above against the diff since the last published version.
- Bump `package.json` + `src/version.ts` (sync-guarded by `tests/cli/version-sync.test.ts`).
- Then run the publish checklist.

## Related

- `ZF0-1976` — Publish cortex-editor 0.2.0 to npm + make repo public (the live ticket holding the next publish run).
- `ZF0-1973` — Externalize `@babel/parser` + `zod` (the change that shaped the publish artifact).
- `cortex-editor/tests/cli/version-sync.test.ts` — the CI guard that catches version drift.
