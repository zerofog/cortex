import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWriteTargetInsideRoot } from '../../src/core/edit-pipeline.js'

/**
 * Security regression — pre-publish security review finding P2-1: symlink
 * path-traversal on NEW-FILE writes.
 *
 * `isWriteTargetInsideRoot` confines every source-file write to the project
 * root. The prior implementation realpath'd the full path, but when the leaf
 * did not exist yet (a new file, or a CSS-Module source path) it fell back to
 * a symlink-BLIND string check. A pre-existing symlinked directory inside the
 * root pointing OUTSIDE it (common in monorepo / pnpm trees) let a crafted
 * edit path create a file outside the root — and a malicious browser-side edit
 * payload fully controls that path string.
 *
 * Fix: when the leaf does not exist, realpath the nearest EXISTING ancestor
 * (symlink-aware) instead of string-checking. The first test here FAILS against
 * the old string-fallback (it returned true, allowing the escape) and passes
 * with the fix.
 *
 * Run in the `node` (server) vitest project — needs real fs + symlinks.
 */
describe('isWriteTargetInsideRoot — symlink traversal confinement', () => {
  let root: string
  let outside: string

  beforeEach(() => {
    // realpath because macOS /tmp -> /private/tmp; the function's contract is
    // that the project root is already realpath'd (matches the EditPipeline
    // constructor: this.projectRoot = realpathSync(resolve(...))).
    root = realpathSync(mkdtempSync(join(tmpdir(), 'cortex-root-')))
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'cortex-outside-')))
    mkdirSync(join(root, 'src'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('REJECTS a new file created through a symlinked dir that escapes the root', () => {
    // src/link -> <outside>. A write to src/link/new.tsx would land OUTSIDE.
    symlinkSync(outside, join(root, 'src', 'link'), 'dir')
    const escapeTarget = join(root, 'src', 'link', 'new.tsx')
    // FAILS without the fix: the old string fallback saw only the in-root path
    // string (realpath threw on the missing leaf) and returned true.
    expect(isWriteTargetInsideRoot(escapeTarget, root)).toBe(false)
  })

  it('REJECTS overwriting an existing file reached through an escaping symlink', () => {
    symlinkSync(outside, join(root, 'src', 'link'), 'dir')
    writeFileSync(join(outside, 'secret.tsx'), 'x')
    expect(
      isWriteTargetInsideRoot(join(root, 'src', 'link', 'secret.tsx'), root),
    ).toBe(false)
  })

  it('ACCEPTS a legitimate new file directly inside the root', () => {
    expect(isWriteTargetInsideRoot(join(root, 'src', 'New.tsx'), root)).toBe(true)
  })

  it('ACCEPTS a new file in a not-yet-existing nested dir inside the root', () => {
    // src exists; a/ b/ New.tsx do not. Nearest existing ancestor is src/ (in root).
    expect(
      isWriteTargetInsideRoot(join(root, 'src', 'a', 'b', 'New.tsx'), root),
    ).toBe(true)
  })

  it('ACCEPTS an existing file inside the root', () => {
    const f = join(root, 'src', 'App.tsx')
    writeFileSync(f, 'x')
    expect(isWriteTargetInsideRoot(f, root)).toBe(true)
  })

  it('REJECTS a parent-directory traversal path', () => {
    expect(isWriteTargetInsideRoot(join(root, '..', 'evil.tsx'), root)).toBe(false)
  })

  it('treats the project root itself as inside (boundary)', () => {
    expect(isWriteTargetInsideRoot(root, root)).toBe(true)
  })
})
