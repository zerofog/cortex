import type { Project, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { ensureTsMorph } from './jsx-utils.js'

export interface LazyTsMorphOptions {
  /** Whether the ts-morph Project uses an in-memory file system (default: false). */
  useInMemoryFileSystem?: boolean
}

/**
 * Lazy-initialized ts-morph Project + SyntaxKind enum for AST-based JSX rewriters.
 *
 * Each consumer (TailwindRewriter, InlineStyleRewriter, ToolApplicator) holds its own
 * LazyTsMorph instance — the Project is per-rewriter (carries per-source-file state),
 * but the lazy-init state machine is shared.
 *
 * Lifecycle:
 *   - ensureReady() returns a Promise that resolves to the initialized { project, SK }.
 *     Concurrent callers receive the same Promise (single-init invariant).
 *   - On initialization failure, the internal promise is nulled, allowing retry on the
 *     next ensureReady() call.
 *   - dispose() is idempotent. After dispose, ensureReady() rejects with a disposed error.
 */
export class LazyTsMorph {
  private project: Project | null = null
  private SK: typeof SyntaxKindEnum | null = null
  private _readyPromise: Promise<{ project: Project; SK: typeof SyntaxKindEnum }> | null = null
  private _disposed = false
  private readonly _useInMemoryFileSystem: boolean

  constructor(private readonly ownerName: string, options: LazyTsMorphOptions = {}) {
    this._useInMemoryFileSystem = options.useInMemoryFileSystem ?? false
  }

  ensureReady(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    if (this._disposed) return Promise.reject(new Error(`${this.ownerName} is disposed`))
    if (!this._readyPromise) {
      this._readyPromise = this._initialize().catch(err => {
        this._readyPromise = null
        throw err
      })
    }
    return this._readyPromise
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.project = null
    this.SK = null
    this._readyPromise = null
  }

  get isDisposed(): boolean { return this._disposed }

  private async _initialize(): Promise<{ project: Project; SK: typeof SyntaxKindEnum }> {
    const mod = await ensureTsMorph()
    this.SK = mod.SyntaxKind
    this.project = new mod.Project({
      useInMemoryFileSystem: this._useInMemoryFileSystem,
      compilerOptions: { jsx: 4 /* JsxEmit.ReactJSX */, allowJs: true },
      skipAddingFilesFromTsConfig: true,
    })
    return { project: this.project, SK: this.SK }
  }
}
