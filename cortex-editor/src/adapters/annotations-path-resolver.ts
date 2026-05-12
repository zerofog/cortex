import fs from 'node:fs'
import path from 'node:path'

/**
 * Options for {@link resolveAnnotationsFilePath}. All injection points exist so
 * the resolver is a pure function under test — vite/webpack adapter test setup
 * is heavyweight, and a pure helper keeps the env-var parsing + mkdir-downgrade
 * logic covered by unit tests rather than relying on Step 9.5 manual verification.
 */
export interface ResolveAnnotationsPathOptions {
  /** Project root directory (typically from bundler `config.root`). */
  readonly root: string
  /** Environment-variable source. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv
  /** Directory-creation function. Injectable for testing. Defaults to `fs.mkdirSync`. */
  readonly mkdirSync?: (
    path: fs.PathLike,
    options: fs.MakeDirectoryOptions,
  ) => string | undefined
  /** Warning sink for non-fatal failures. Defaults to `console.warn`. */
  readonly warn?: (message: string, detail: unknown) => void
}

/**
 * Resolves the on-disk path for annotations persistence based on the
 * `CORTEX_PERSIST_ANNOTATIONS` environment variable, returning `undefined` when
 * persistence is disabled.
 *
 * Strict opt-in: the env-var value (trimmed + lower-cased) must exactly equal
 * `'true'`. Common alternates (`'1'`, `'yes'`, `'on'`) are treated as disabled
 * — boolean conventions are inconsistent across tools (`DEBUG=1`, `RUST_LOG=true`,
 * `FORCE_COLOR=on`), so a single canonical accepted value avoids silent surprises.
 *
 * On enable, the `.cortex/` directory is pre-created with mode `0o700` so the
 * persistence layer can hydrate on session construction (the bundler's normal
 * lazy `.cortex/` mkdir happens later, on the `listening` event). If that mkdir
 * fails (EACCES, EROFS, ENOSPC), the resolver downgrades to `undefined` and
 * logs a single warning — without the downgrade, every subsequent annotation
 * mutation would attempt a write to a non-writable directory and emit a per-
 * mutation warning storm. Background: regression test in this file's
 * `mkdir-failure downgrade` describe block.
 */
export function resolveAnnotationsFilePath(
  options: ResolveAnnotationsPathOptions,
): string | undefined {
  const {
    root,
    env = process.env,
    mkdirSync = fs.mkdirSync,
    warn = (msg: string, detail: unknown) => {
      console.warn(msg, detail)
    },
  } = options

  const raw = env.CORTEX_PERSIST_ANNOTATIONS
  const enabled = (raw ?? '').trim().toLowerCase() === 'true'
  if (!enabled) return undefined

  const filePath = path.join(root, '.cortex', 'annotations.json')

  try {
    mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  } catch (err) {
    warn(
      '[cortex] Disabling annotations persistence — could not create .cortex/:',
      err instanceof Error ? err.message : String(err),
    )
    return undefined
  }

  return filePath
}
