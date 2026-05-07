# Integration Tests (`tests/integration/`)

This directory holds **deployment-artifact and cross-module integration tests**
for `cortex-editor`. They run in a single vitest fork (`pool: 'forks',
singleFork: true` in `vitest.config.ts`) so build steps and shared resources
don't race.

## The 6-layer test pyramid

| Layer | Purpose | Lives in |
|------:|---------|----------|
| 1 | Pure unit | `tests/adapters/` (most), `tests/core/` |
| 2 | Component / module | `tests/cli/init.test.ts`, etc. |
| 3 | Wire-format / schema | `tests/schemas/` |
| 4 | In-process integration | `tests/cli/mcp.test.ts` (DI'd `InMemoryTransport`) |
| **5** | **Deployment-artifact** | `tests/integration/cli-process.test.ts` (this directory) |
| 6 | Browser-driven UI e2e | `tests/e2e/` (Playwright) |

## Layer 5 — what `cli-process.test.ts` catches

Tests in `cli-process.test.ts` spawn the *built* `dist/cli/index.js` and talk
to it over real stdio via `@modelcontextprotocol/sdk`'s `StdioClientTransport`.
This catches deployment-only bugs that Layer 4 (in-process, DI'd transport)
cannot:

- `package.json` `bin.cortex` field broken or missing
- `dist/cli/index.js` missing exports (DCE / tsup config regression)
- Stdio handshake regression (MCP SDK version skew between server and client)
- MCP server boot failure under fresh process (env / cwd assumptions)
- Tool registration regression visible only across the process boundary
- Notification routing regression (Vite WS forward → MCP notification)

## Layer 5 — what it deliberately does NOT catch

- Real Vite plugin lifecycle bugs (Layer 6's job)
- Real source-file mutation correctness (Layer 6's job)
- Multi-framework integration (Layer 6's job)
- Visual / UX regressions (Layer 6's job, Playwright screenshots)

## Helpers

- `helpers/cli-build.ts` — `ensureCliBuilt()` builds the CLI iff `dist/cli/index.js`
  is missing or older than any source file in `src/cli/`, `src/core/`, `src/schemas/`.
  Cached at module scope so the build runs at most once per vitest fork.
- `helpers/process-cleanup.ts` — `killChildGracefully(child, timeoutMs)` sends
  SIGTERM, waits up to `timeoutMs`, then escalates to SIGKILL. Safe on
  already-exited children. Use this in `afterAll` for any child you spawn
  outside of `StdioClientTransport`'s lifecycle.

## Adding a new Layer-5 test

1. Decide what deployment-only invariant you want to catch — one that Layer 4
   (in-process MCP via `InMemoryTransport`) cannot reach.
2. Write the test under `tests/integration/cli-process.test.ts` (or a sibling
   file under `tests/integration/`).
3. **Document a falsifiability mutation** in a comment next to the test: a
   single-line change to source that makes the test fail. If you can't write
   one, the test is theatre — delete it.
4. Use `ensureCliBuilt()` in `beforeAll` (180_000ms timeout — first build is
   ~3-5s, subsequent runs are skipped).
5. Use `StdioClientTransport` for the MCP client — it owns the child process
   lifecycle. Don't manually `child_process.spawn` unless you need fine-grained
   control over stderr / signals; if you do, use `killChildGracefully` in
   `afterAll`.
6. Use ephemeral ports (`listen(0, '127.0.0.1', ...)`) for any TCP/WS server
   you stand up — never hardcoded ports.

## Per-test runtime budget

- Per test: ≤2s
- Total file (4 tests + build cache miss): ≤10s
- Total file on warm build cache: ≤5s

If a test exceeds the budget, profile with `vitest --reporter=verbose` first.
The most common cause is a missing `await` on `transport.close()` causing
afterAll to wait for socket teardown.
