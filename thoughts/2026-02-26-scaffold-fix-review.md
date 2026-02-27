# Architecture Review Findings (2026-02-26)

**Review target**: Phase 1 scaffold fix implementation (tsconfig.json, package.json, tsup.config.ts, vitest.config.ts)
**Review team**: jsts, dx, frontend, security, mts (auto-selected based on build/config focus)
**Mode**: both (clink multi-model + native Claude agents)

---

## Cross-Reviewer Consensus

Issues flagged by 3+ reviewers independently — highest-confidence signals:

| Issue | Flagged By | Severity |
|---|---|---|
| JSX transform conflict: tsconfig automatic vs tsup classic pragma | jsts(2), frontend(2), mts(2), dx(1) — **7/10** | CRITICAL |
| `@types/node: ">=20"` unbounded, resolves to v25 while engine says >=20 | jsts(2), frontend(2), mts(2), security(1), dx(1) — **8/10** | HIGH |
| `clean: true` on first config block only — race condition with parallel blocks | jsts(2), frontend(1), mts(2), dx(1) — **6/10** | HIGH |
| Tests excluded from `tsc --noEmit` / vitest environment needs DOM splitting | jsts(2), frontend(2), mts(1), dx(2) — **7/10** | MEDIUM |
| Client source maps resolve to wrong URL for iframe-injected scripts | frontend(2), security(1) — **3/10** | MEDIUM |

---

## Consolidated Findings by Severity

### CRITICAL — Must fix before Phase 4

#### C1. JSX Transform Conflict Between tsconfig and tsup (7/10 reviewers)

**Files**: `tsconfig.json:13-14`, `tsup.config.ts:39-42`

tsconfig declares the **automatic** JSX runtime:
```json
"jsx": "react-jsx",
"jsxImportSource": "preact"
```

tsup's client IIFE block overrides esbuild with the **classic** transform:
```ts
esbuildOptions(options) {
  options.jsxFactory = 'h';
  options.jsxFragment = 'Fragment';
}
```

These are mutually exclusive strategies. `tsc --noEmit` expects automatic imports (no `h` needed), while esbuild emits `h(...)` calls requiring manual import. The first real `.tsx` component will either:
- Pass typecheck but throw `h is not defined` at runtime (if developer follows IDE/tsconfig)
- Work at runtime but confuse the type checker (if developer manually imports `h`)

**Fix — Option A (classic, recommended for IIFE):**
```json
// tsconfig.json — align to classic
"jsx": "react",
"jsxFactory": "h",
"jsxFragmentFactory": "Fragment"
```
Remove `jsxImportSource`. Developers import `{ h, Fragment }` from `'preact'` explicitly.

**Fix — Option B (automatic):**
Remove the `esbuildOptions` block from tsup entirely. esbuild reads tsconfig and handles automatic imports. Slightly larger IIFE bundle due to jsx-runtime wrapper.

---

### HIGH — Should fix in v1

#### H1. `@types/node: ">=20"` Unbounded Version (8/10 reviewers)

**File**: `package.json:29`

Resolves to `@types/node@25.3.1` today. Node 25 types include APIs that don't exist in Node 20 (the declared minimum). Code using `node:sqlite`, newer `crypto.subtle` methods, or changed `fetch` signatures will typecheck but crash on Node 20.

**Fix**: `"@types/node": "^20"` — pins to Node 20 type family.

#### H2. `clean: true` Race Condition (6/10 reviewers)

**File**: `tsup.config.ts:9`

Only the first config block (bin) has `clean: true`. tsup may run blocks concurrently. If block 1 cleans `dist/` while blocks 2-3 are writing, outputs disappear non-deterministically.

**Fix**: Remove `clean: true` from the config block. Add deterministic pre-clean:
```json
"scripts": {
  "prebuild": "rm -rf dist",
  "build": "tsup"
}
```

#### H3. No `exports` Field — Package Un-importable as Library (jsts-native)

**File**: `package.json`

The package has `"type": "module"` and `"bin"` but no `"exports"`, `"main"`, or `"types"`. If `server.ts` is meant to be `import()`-ed (the plan describes this), Node.js module resolution will fail.

**Fix**:
```json
"exports": {
  ".": {
    "types": "./dist/server.d.ts",
    "import": "./dist/server.js"
  },
  "./client/*": "./dist/client/*"
}
```

#### H4. Client Source Maps Resolve to Wrong URL in Iframe (3/10 reviewers)

**File**: `tsup.config.ts:35`, `dist/client/*.js`

The `//# sourceMappingURL=panel.js.map` is a relative path. For scripts injected into the app iframe, the browser resolves this relative to the page URL (`localhost:4000/some-page`), not the proxy's client path (`localhost:4000/__zerofog/client/`). Source maps silently fail to load.

**Fix**: Use `sourcemap: 'inline'` for client config (embeds map as base64 data URL, avoids URL resolution entirely).

---

### MEDIUM

- **Tests excluded from type checking** (`tsconfig.json:18`): `exclude: ["tests"]` means `tsc --noEmit` skips test files. Fix: remove `"tests"` or add `tsconfig.test.json`. (7/10)
- **Vitest environment needs DOM splitting**: Default `node` won't work for panel tests. Fix: add `environmentMatchGlobs: [['**/client/**', 'happy-dom']]`. (5/10)
- **Missing `isolatedModules: true`** (`tsconfig.json`): esbuild transpiles per-file; `const enum` and type-only re-exports can break silently. (jsts-clink)
- **Client IIFE missing `platform: 'browser'`** (`tsup.config.ts:27`): tsup defaults to Node platform for dependency resolution. (frontend-clink)
- **Supply chain: broad semver ranges** (`package.json`): All deps use `^`. Express 5 is still new. Consider `~` for Express until it stabilizes. (security-clink, security-native)
- **SSRF risk via proxy** (`http-proxy-middleware`): Proxy target must come from trusted server-side config, never from request params. Bind to `127.0.0.1` only. (security-clink, security-native)
- **WebSocket origin validation needed**: `ws` server must validate `Origin` header to prevent cross-site WebSocket hijacking. (security-clink)
- **No CSS handling strategy for IIFE**: Open Props ships CSS files; no esbuild CSS loader configured for Shadow DOM injection. (mts-native)
- **`dts: true` on private package**: bin.js and server.js declarations have no external consumer. Adds build time. (jsts-clink, mts-native)

### LOW

- `declaration: true` in tsconfig redundant with tsup `dts: true` — misleading but harmless (jsts-clink, jsts-native)
- `prepare` script runs build on every `npm install` for a private package (jsts-clink, mts-native, dx-native)
- Client `.js` files (inspector, nav-blocker) bypass TypeScript checking (mts-clink, dx-native)
- `es2020` target conservative for localhost dev tool (frontend-native)
- No `.npmrc` with `engine-strict=true` (security-native)
- Single tsconfig mixes Node server and browser client domains (mts-clink)
- No `postMessage` origin validation documented for cross-frame communication (security-clink)

---

## Positive Practices — Preserve These

1. **Three-way build split** (bin with shebang / server without / client IIFE) correctly separates targeting concerns (all reviewers)
2. **`noUncheckedIndexedAccess: true`** is an excellent strict flag for catching index bugs at compile time (jsts-clink, mts-clink, security-clink)
3. **Preact** is the right choice for Shadow DOM injection: ~3KB gzipped, minimal overhead (jsts-clink)
4. **Shebang correctly scoped** to CLI entry point only — the fix was the right architectural decision (frontend-clink, mts-clink)
5. **`outExtension()` override** produces clean `.js` filenames matching server injection expectations (frontend-clink, mts-clink)
6. **Build isolation** between server/client prevents server code or env vars from leaking to client bundle (security-clink)
7. **`strict: true`** with `noUncheckedIndexedAccess` hardens against entire classes of bugs (security-clink)
8. **`engines: { "node": ">=20" }`** ensures modern runtime with security patches (security-clink, dx-clink)

---

## Review Methodology Note

**Clink mode** (5 personas x 1 each): Distributed across Claude (jsts), Gemini (dx, security), and Codex (frontend, mts) for perspective diversity. Gemini provided broader DX/security coverage with concrete attack scenarios. Codex provided deeper build-system analysis with actual command execution. Claude gave the most detailed JSX transform analysis.

**Native mode** (5 personas x 1 each): Claude Task agents with full codebase access. Read all source files, ran `npm run build`, `npm run typecheck`, `npm test`, and `npm ls @types/node`. Provided more grounded findings with confirmed behavior rather than theoretical risks.

**Unique catches by mode**:
- *Clink-only*: `platform: 'browser'` missing (frontend-codex), `isolatedModules` missing (jsts-claude), CSP/SRI for injected scripts (security-gemini)
- *Native-only*: No `exports` field blocking library import (jsts-native), CSS handling gap for Open Props in Shadow DOM (mts-native), source map URL resolution failure in iframe (frontend-native)
- *Both modes agreed*: JSX conflict, `@types/node` unbounded, `clean` race condition, test exclusion gap

**Recommendation**: For config-level reviews, native mode with codebase access provided more actionable findings (could run builds and verify). Clink mode added valuable diversity of perspective, especially on security attack scenarios and ecosystem comparisons.

---

## Post-Fix Architecture Review (2026-02-26)

Review of the 4 config changes implementing the "should fix soon" items from the review above.

**Review team**: jsts, testing, frontend, dx, security (native mode — codebase access needed for config validation)

**Changes reviewed**:
- `tsconfig.json`: Added `isolatedModules: true`
- `vitest.config.ts`: Added `test.projects` with server (node) and client (happy-dom) environments
- `tsup.config.ts`: Added `platform: 'browser'` to client IIFE config
- `package.json`: Added `exports` field with `"."` and `"./client/*"` mappings

### Cross-Reviewer Consensus

Issues flagged by 3+ reviewers independently:

| Issue | Flagged By | Consensus Severity |
|---|---|---|
| Wildcard `./client/*` export exposes unbounded surface area | security, dx, frontend, jsts | HIGH |
| Inline source maps leak full source into iframe context / bloat bundle | security, frontend | HIGH |
| `isolatedModules` should be upgraded to `verbatimModuleSyntax` | security, frontend, jsts | MEDIUM |
| Vitest server project `exclude` pattern is fragile (catch-all trap) | testing, dx | MEDIUM |
| Test files excluded from `tsc --noEmit` (unchanged from prior review) | testing, frontend | MEDIUM |
| `prebuild: "rm -rf dist"` not cross-platform | frontend, dx | MEDIUM |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1

None from the config changes themselves. The original C1 (JSX transform conflict) is confirmed resolved by all reviewers.

**One conditional critical from security**: The wildcard export `"./client/*"` was flagged as enabling directory traversal via module resolution. Node.js 20+ rejects `..` in exports patterns (`ERR_INVALID_PACKAGE_TARGET`), but not all bundlers enforce this. Given `"private": true`, the practical risk is low today, but the fix is trivial — enumerate explicitly.

#### HIGH — Should fix soon

**H1. Replace wildcard `./client/*` with explicit enumeration** (security, dx, frontend, jsts)

The wildcard maps every file in `dist/client/` as a public export. This includes any build artifacts, source maps, or intermediate files that land there. The server reads these as raw files for injection — they are not importable modules (IIFEs have no exports).

Fix:
```json
"exports": {
  ".": {
    "types": "./dist/server.d.ts",
    "import": "./dist/server.js"
  },
  "./client/panel.js": "./dist/client/panel.js",
  "./client/inspector.js": "./dist/client/inspector.js",
  "./client/nav-blocker.js": "./dist/client/nav-blocker.js"
}
```

DX reviewer went further: questioned whether `./client/*` exports should exist at all (server resolves files internally via filesystem, not module resolution). Consider removing client exports entirely and using `path.join(__dirname, '../dist/client/')` in the server.

**H2. Inline source maps embed full source in iframe-injected scripts** (security, frontend)

`sourcemap: 'inline'` embeds complete original source as base64. Any JS in the iframe (target app, extensions, analytics) can decode it, revealing internal API paths, postMessage schemas, and session handling logic.

Options:
- `sourcemap: false` for client builds (simplest — IIFE output is readable without maps)
- `sourcemap: true` with server-side URL rewriting (`sourceMappingURL` → `/__cortex/client/panel.js.map`)

Security recommends `false`. Frontend recommends external with URL rewriting for Phase 4 when bundles get larger. Both agree inline is wrong for scripts injected into untrusted contexts.

**H3. Client project in vitest matches zero files** (testing)

The `tests/client/**/*.test.ts` glob matches nothing — no `tests/client/` directory exists. The happy-dom environment is configured but never exercised. This means the first client test will be the first time the config is validated.

Fix: Create `tests/client/scaffold.test.ts` that validates happy-dom wiring:
```ts
import { describe, expect, it } from 'vitest';
describe('client scaffold', () => {
  it('happy-dom environment is configured', () => {
    expect(typeof document).toBe('object');
  });
});
```

**H4. Server project `exclude` pattern creates catch-all trap** (testing, dx)

`include: ['tests/**/*.test.ts'], exclude: ['tests/client/**']` means every new directory (`tests/integration/`, `tests/browser/`) defaults to node environment. A proxy integration test that needs DOM APIs would fail cryptically.

Fix: Use explicit includes for both:
```ts
{ test: { name: 'server', environment: 'node', include: ['tests/server/**/*.test.ts', 'tests/*.test.ts'] } },
{ test: { name: 'client', environment: 'happy-dom', include: ['tests/client/**/*.test.ts'] } },
```

#### MEDIUM

- **Upgrade `isolatedModules` → `verbatimModuleSyntax`** (security, frontend, jsts): `verbatimModuleSyntax` is strictly stronger — also enforces `import type` syntax, preventing esbuild from bundling type-only dependencies. Supported by TS 5.4+. Free to adopt on a scaffold with no real code.
- **`prebuild: "rm -rf dist"` not cross-platform** (frontend, dx): Fails on Windows. Use `rimraf` or `node -e "fs.rmSync('dist',{recursive:true,force:true})"`. Low urgency if team is macOS/Linux only.
- **Test files still excluded from `tsc --noEmit`** (testing, frontend): Unchanged from prior review. Create `tsconfig.test.json` extending base with tests included.
- **`platform: 'browser'` needs `external` list** (security): Without explicit `external: ['fs', 'path', 'crypto', ...]`, accidental Node imports get silently polyfilled. Adding `external` makes them fail at build time instead.
- **No CI pipeline** (testing): No `.github/workflows/`. Tests/typecheck/build only gate locally.
- **`es2020` target conservative** (frontend): Localhost tool targeting developer browsers. `es2022` avoids unnecessary syntax transforms. esbuild `target` only controls syntax, not API polyfills.

#### LOW

- `declaration: true` in tsconfig redundant with tsup's `dts: true` (jsts, frontend)
- `prepare` script runs full build on every `npm install` for private package (dx)
- No `.npmrc` with `engine-strict=true` (security)
- Server source maps generated by default (security)
- Client `.js` files bypass TypeScript (security — convert to `.ts` before Phase 2)

### Positive Practices — Preserve These

1. **All 4 fixes are directionally correct** — every reviewer confirmed the changes address the intended issues from the prior review
2. **Three-way build split properly isolated** — shebang only on bin, server cleanly importable, client correctly targeted for browser
3. **JSX transform alignment confirmed resolved** — both tsconfig and tsup agree on automatic + preact import source
4. **`noUncheckedIndexedAccess: true` preserved** — all reviewers praised this
5. **`platform: 'browser'` acts as guardrail** — Node built-in imports now fail at build time rather than producing broken bundles
6. **Vitest `projects` over deprecated `environmentMatchGlobs`** — modern API, correct for v3.2
7. **`@types/node: "^20"` correctly pinned** (from prior fix) — types match minimum engine version

### Decision Log — What to Action vs Defer

| Finding | Action | When |
|---|---|---|
| H1: Enumerate client exports explicitly | Fix now | Trivial, prevents future issues |
| H2: Inline source maps in client | Defer to Phase 4 | Acceptable for scaffold (no real source to leak yet) |
| H3: Add client scaffold test | Fix now | Proves happy-dom wiring |
| H4: Explicit vitest project includes | Fix now | Prevents environment mismatch trap |
| `verbatimModuleSyntax` upgrade | Fix now | Free on empty scaffold |
| Cross-platform prebuild | Defer | Team is macOS only currently |
| Test tsconfig | Fix now | Cheap, prevents type-error accumulation |
| `external` list for client build | Defer to Phase 2 | No real imports yet |
| CI pipeline | Separate task | Not a config fix |
| `.js` → `.ts` client files | Phase 2 | Inspector/nav-blocker need TS for origin validation |
