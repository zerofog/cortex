import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TailwindRewriter } from '../../../src/core/rewriter/tailwind.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let rewriter: TailwindRewriter

beforeEach(() => {
  rewriter = new TailwindRewriter()
})

afterEach(() => {
  rewriter.dispose()
})

/**
 * Column positions below point at the JSX element opening '<' character.
 * jsx-utils' findJsxElementAt uses line + col to locate the element,
 * so the column doesn't need to match the className exactly — it needs
 * to land inside or at the start of the JSX opening tag.
 */

describe('TailwindRewriter.rewriteClassList', () => {
  it('removes a class from a static string className', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'A.tsx')
    writeFileSync(file, `export const A = () => <div className="flex body-md px-4" />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, remove: 'body-md' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    expect(res.newContent).toContain('className="flex px-4"')
  })

  it('adds a class to a static string className', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'B.tsx')
    writeFileSync(file, `export const B = () => <div className="flex px-4" />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, add: 'body-md' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    expect(res.newContent).toMatch(/className="flex px-4 body-md"|className="body-md flex px-4"|className="flex body-md px-4"/)
  })

  it('adds and removes in a single call (class swap)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'C.tsx')
    writeFileSync(file, `export const C = () => <div className="body-md" />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, remove: 'body-md', add: 'heading-1' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    expect(res.newContent).toContain('className="heading-1"')
  })

  it('is no-op when class to remove is not present (success=true, content unchanged)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'D.tsx')
    writeFileSync(file, `export const D = () => <div className="flex" />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, remove: 'body-md' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    expect(res.newContent).toBe(res.oldContent)
  })

  it('handles ternary expression with static string arms', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'E.tsx')
    writeFileSync(file, `export const E = ({on}:{on:boolean}) => <div className={on ? "body-md flex" : "px-4"} />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 43, remove: 'body-md', add: 'heading-1' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    // The arm matching `remove` gets the mutation.
    expect(res.newContent).toMatch(/"heading-1 flex"|"flex heading-1"/)
  })

  it('handles clsx/cn call expression with static string args', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'F.tsx')
    writeFileSync(file, `import {cn} from 'x'\nexport const F = () => <div className={cn("flex", "body-md")} />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 2, col: 25, remove: 'body-md' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    // The string arg "body-md" becomes empty — acceptable outputs include
    // cn("flex", "") or cn("flex").
    expect(res.newContent).toMatch(/cn\("flex"\)|cn\("flex",\s*""\)/)
  })

  it('returns success=false for template literal className', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'G.tsx')
    writeFileSync(file, `export const G = ({x}:{x:string}) => <div className={\`body-md \${x}\`} />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 43, remove: 'body-md' })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.reason.toLowerCase()).toMatch(/template literal/)
  })

  it('returns success=false when no className attribute is present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'H.tsx')
    writeFileSync(file, `export const H = () => <div style={{color:'red'}} />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, add: 'body-md' })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.reason.toLowerCase()).toMatch(/classname/)
  })

  it('adds class idempotently (no duplicate when already present)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'I.tsx')
    writeFileSync(file, `export const I = () => <div className="flex body-md" />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, add: 'body-md' })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.reason)
    expect((res.newContent.match(/body-md/g) ?? []).length).toBe(1)
  })

  it('handles element with no className at all when add-only and missing attr is a deterministic failure (not silent)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-rl-'))
    const file = join(dir, 'J.tsx')
    writeFileSync(file, `export const J = () => <div />\n`)
    const res = await rewriter.rewriteClassList({ filePath: file, line: 1, col: 25, add: 'body-md' })
    // No className attr → caller falls back to AI. Explicit failure, not success.
    expect(res.success).toBe(false)
  })
})
