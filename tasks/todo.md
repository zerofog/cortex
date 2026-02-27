# Address Post-Fix Architecture Review Findings

## Tasks

- [x] Create test directory structure (`tests/server/`, `tests/client/`) with scaffold tests
- [x] Delete old `tests/scaffold.test.ts`
- [x] Update `vitest.config.ts` — explicit includes per project, remove exclude hack
- [x] Create `tsconfig.test.json` extending base, includes tests, overrides `rootDir`
- [x] Update `typecheck` script to use `tsconfig.test.json`
- [x] Enumerate client exports explicitly (3 entries, no wildcard)
- [x] Upgrade `isolatedModules` to `verbatimModuleSyntax`
- [x] Verify: build, typecheck, test all pass

## Review

All 5 findings addressed:

| Finding | Resolution |
|---|---|
| H1: Wildcard client export | 3 explicit entries in `package.json` exports |
| H3: Client project matches zero files | `tests/client/scaffold.test.ts` created, vitest client project runs |
| H4: Server exclude catch-all trap | Replaced with `include: ['tests/server/**']` — no exclude needed |
| Tests excluded from typecheck | `tsconfig.test.json` with `rootDir: "."` + updated typecheck script |
| isolatedModules outdated | Replaced with `verbatimModuleSyntax` |
| #5: Inline sourcemaps | Deferred to Phase 4 (no real source to leak yet) |

### Note: Plan deviation
The plan's `tsconfig.test.json` didn't account for the inherited `rootDir: "src"` which would reject test files outside `src/`. Added `"rootDir": "."` override — only affects type-checking scope since this config is `--noEmit` only.
