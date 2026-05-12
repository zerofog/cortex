import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { resolveAnnotationsFilePath } from '../../src/adapters/annotations-path-resolver.js'

describe('resolveAnnotationsFilePath', () => {
  // -------------------------------------------------------------------------
  // Env-var parse — strict opt-in matrix
  // -------------------------------------------------------------------------
  describe('CORTEX_PERSIST_ANNOTATIONS parsing', () => {
    it.each([
      ['true', true, 'exact lowercase'],
      ['TRUE', true, 'uppercase normalized via toLowerCase'],
      ['True', true, 'mixed case normalized'],
      [' true ', true, 'surrounding whitespace trimmed'],
      ['true\n', true, 'trailing newline trimmed'],
      ['\ttrue\t', true, 'tabs trimmed'],
    ])('enables persistence when env=%j (%s)', (envVal, _expected, _why) => {
      const mkdirSync = vi.fn()
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: { CORTEX_PERSIST_ANNOTATIONS: envVal },
        mkdirSync,
        warn,
      })
      expect(result).toBe(path.join('/tmp/proj', '.cortex', 'annotations.json'))
      expect(mkdirSync).toHaveBeenCalledTimes(1)
      expect(warn).not.toHaveBeenCalled()
    })

    it.each([
      ['1', 'numeric truthy NOT accepted — strict opt-in'],
      ['yes', 'yes NOT accepted — strict opt-in'],
      ['on', 'on NOT accepted — strict opt-in'],
      ['false', 'explicit false off'],
      ['FALSE', 'uppercase false off'],
      ['0', 'numeric falsy off'],
      ['', 'empty string off'],
      ['truthy', 'arbitrary string off'],
    ])('disables persistence when env=%j (%s)', (envVal, _why) => {
      const mkdirSync = vi.fn()
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: { CORTEX_PERSIST_ANNOTATIONS: envVal },
        mkdirSync,
        warn,
      })
      expect(result).toBeUndefined()
      expect(mkdirSync).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })

    it('disables persistence when CORTEX_PERSIST_ANNOTATIONS is unset', () => {
      const mkdirSync = vi.fn()
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: {}, // unset
        mkdirSync,
        warn,
      })
      expect(result).toBeUndefined()
      expect(mkdirSync).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Path construction
  // -------------------------------------------------------------------------
  describe('path construction', () => {
    it('joins root + .cortex + annotations.json', () => {
      const mkdirSync = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/home/dev/my-project',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
      })
      expect(result).toBe(
        path.join('/home/dev/my-project', '.cortex', 'annotations.json'),
      )
    })

    it('calls mkdirSync on the .cortex/ directory with mode 0o700, recursive', () => {
      const mkdirSync = vi.fn()
      resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
      })
      expect(mkdirSync).toHaveBeenCalledTimes(1)
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/proj', '.cortex'),
        expect.objectContaining({ recursive: true, mode: 0o700 }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // mkdir-failure downgrade — the foot-gun that cff9c4be fixed
  // -------------------------------------------------------------------------
  describe('mkdir-failure downgrade (no write-storm)', () => {
    it('returns undefined and warns ONCE when mkdir throws EACCES', () => {
      const mkdirSync = vi.fn(() => {
        const err: NodeJS.ErrnoException = new Error('EACCES: permission denied')
        err.code = 'EACCES'
        throw err
      })
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/tmp/readonly',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
        warn,
      })
      expect(result).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toMatch(/Disabling annotations persistence/i)
      expect(warn.mock.calls[0]?.[0]).toMatch(/could not create .cortex/i)
    })

    it('returns undefined and warns ONCE when mkdir throws EROFS (read-only filesystem)', () => {
      const mkdirSync = vi.fn(() => {
        const err: NodeJS.ErrnoException = new Error('EROFS: read-only filesystem')
        err.code = 'EROFS'
        throw err
      })
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/docker-mount',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
        warn,
      })
      expect(result).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('passes the error message through to warn (for diagnosis)', () => {
      const mkdirSync = vi.fn(() => {
        throw new Error('disk full: ENOSPC')
      })
      const warn = vi.fn()
      resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
        warn,
      })
      expect(warn.mock.calls[0]?.[1]).toContain('disk full: ENOSPC')
    })

    it('handles non-Error throws gracefully', () => {
      const mkdirSync = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string thrown — not an Error instance'
      })
      const warn = vi.fn()
      const result = resolveAnnotationsFilePath({
        root: '/tmp/proj',
        env: { CORTEX_PERSIST_ANNOTATIONS: 'true' },
        mkdirSync,
        warn,
      })
      expect(result).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Defaults — process.env / console.warn / fs.mkdirSync
  // -------------------------------------------------------------------------
  describe('defaults', () => {
    it('uses process.env when env option is omitted', () => {
      const original = process.env.CORTEX_PERSIST_ANNOTATIONS
      process.env.CORTEX_PERSIST_ANNOTATIONS = 'true'
      try {
        const mkdirSync = vi.fn()
        const result = resolveAnnotationsFilePath({
          root: '/tmp/proj',
          mkdirSync,
        })
        expect(result).toBe(path.join('/tmp/proj', '.cortex', 'annotations.json'))
      } finally {
        if (original === undefined) delete process.env.CORTEX_PERSIST_ANNOTATIONS
        else process.env.CORTEX_PERSIST_ANNOTATIONS = original
      }
    })
  })
})
