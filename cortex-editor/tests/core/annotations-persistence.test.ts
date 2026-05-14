import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'node:os'
import path from 'node:path'
import type { Annotation } from '../../src/adapters/types.js'
import {
  loadAnnotations,
  saveAnnotations,
} from '../../src/core/annotations-persistence.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFullAnnotation(): Annotation {
  return {
    id: 'ann-test-id-001',
    status: 'resolved',
    elementSource: 'App.tsx:42:8',
    text: 'Make this button blue',
    elementContext: {
      tagName: 'BUTTON',
      componentName: 'PrimaryButton',
      domSelector: '#submit-btn',
      textPreview: 'Submit',
    },
    currentStyles: {
      color: 'red',
      fontSize: '14px',
    },
    pinPosition: { x: 0.35, y: 0.72 },
    createdAt: 1710000000000,
    updatedAt: 1710000001000,
    resolution: { summary: 'Changed to brand blue' },
    thread: [
      {
        id: 'msg-001',
        from: 'user',
        text: 'Please make this blue',
        timestamp: 1710000000500,
      },
      {
        id: 'msg-002',
        from: 'agent',
        text: 'Done — updated to #0057b7',
        timestamp: 1710000001000,
      },
    ],
    kind: 'fix-request',
    fixMeta: {
      property: 'color',
      value: '#0057b7',
      reason: 'Brand color from design spec',
    },
  }
}

// ---------------------------------------------------------------------------
// Setup: temp dir per test
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-persist-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('annotations-persistence', () => {
  describe('loadAnnotations', () => {
    it('returns empty array on missing file without calling console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations('/path/that/absolutely/does/not/exist.json')

      expect(result).toEqual([])
      expect(warnSpy).not.toHaveBeenCalled()
    })

    // ZF0-1853: on a non-ENOENT load failure (corrupt JSON, version mismatch,
    // Zod shape failure) loadAnnotations renames the unreadable file to
    // `.corrupted-<timestamp>.json` BEFORE returning [], so the next save
    // creates a fresh file instead of silently overwriting recoverable data.
    // Each failure path emits TWO warns: the specific error, then the backup.
    const corruptedBackups = (): string[] =>
      fs.readdirSync(tmpDir).filter((f) => /\.corrupted-\d+\.json$/.test(f))

    it('returns empty array, warns, and backs up the file on invalid JSON', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, 'not json {', 'utf8')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(2)
      // call[0]: the specific error path — a regression collapsing the error
      // paths into one generic warn would still pass count but fail this.
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/invalid JSON/i)
      // call[1]: the forensic backup, with the backup filename.
      expect(warnSpy.mock.calls[1]?.[0]).toMatch(/backed up/i)
      // Original is renamed away; exactly one timestamped backup remains.
      expect(fs.existsSync(filePath)).toBe(false)
      expect(corruptedBackups()).toHaveLength(1)
    })

    it('returns empty array, warns, and backs up the file on version mismatch', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, JSON.stringify({ version: 2, annotations: [] }), 'utf8')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(2)
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/schema mismatch/i)
      expect(warnSpy.mock.calls[1]?.[0]).toMatch(/backed up/i)
      expect(fs.existsSync(filePath)).toBe(false)
      expect(corruptedBackups()).toHaveLength(1)
    })

    it('returns empty array, warns, and backs up on shape mismatch (id is number instead of string)', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(
        filePath,
        JSON.stringify({ version: 1, annotations: [{ id: 123 }] }),
        'utf8',
      )

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(2)
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/schema mismatch/i)
      expect(warnSpy.mock.calls[1]?.[0]).toMatch(/backed up/i)
      expect(fs.existsSync(filePath)).toBe(false)
      expect(corruptedBackups()).toHaveLength(1)
    })

    it('does NOT back up on a read error — cannot read means cannot back up (ZF0-1853)', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, 'irrelevant', 'utf8')
      // Simulate EACCES — a read failure that is NOT ENOENT.
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        const err: NodeJS.ErrnoException = new Error('EACCES: permission denied')
        err.code = 'EACCES'
        throw err
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      // Exactly one warn (the read failure) — no backup attempt.
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/read failed/i)
      expect(corruptedBackups()).toHaveLength(0)
    })

    it('treats backup failure as non-fatal — still returns [] and does not throw (ZF0-1853)', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, 'not json {', 'utf8')
      // The rename that performs the backup fails — must not crash loadAnnotations.
      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('EXDEV: cross-device link not permitted')
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      let result: ReturnType<typeof loadAnnotations>
      expect(() => { result = loadAnnotations(filePath) }).not.toThrow()
      expect(result!).toEqual([])
      // call[0]: invalid JSON, call[1]: the non-fatal backup-failure warn.
      expect(warnSpy).toHaveBeenCalledTimes(2)
      expect(warnSpy.mock.calls[1]?.[0]).toMatch(/could not back up/i)
    })

    it('roundtrips an annotation with all fields and preserves deep equality', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      const original = buildFullAnnotation()

      saveAnnotations(filePath, [original])
      const loaded = loadAnnotations(filePath)

      expect(loaded).toHaveLength(1)
      expect(loaded[0]).toEqual(original)
    })
  })

  describe('saveAnnotations', () => {
    it('saves on a fresh path — file exists after save and load roundtrips', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      const ann = buildFullAnnotation()

      expect(fs.existsSync(filePath)).toBe(false)

      saveAnnotations(filePath, [ann])

      expect(fs.existsSync(filePath)).toBe(true)

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      expect(raw).toMatchObject({ version: 1 })

      const loaded = loadAnnotations(filePath)
      expect(loaded).toHaveLength(1)
      expect(loaded[0]).toEqual(ann)
    })

    it('atomic write — live file untouched when .tmp write fails', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      const originalAnn = buildFullAnnotation()

      // Pre-populate the live file with a valid known envelope
      saveAnnotations(filePath, [originalAnn])
      const before = loadAnnotations(filePath)
      expect(before).toHaveLength(1)

      // Mock writeFileSync to throw on the next call (the .tmp write)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw new Error('mocked EACCES')
      })

      const newAnn: Annotation = { ...originalAnn, id: 'ann-different-001', text: 'new text' }
      saveAnnotations(filePath, [newAnn])

      // Live file must still contain original data — NOT newAnn, NOT []
      const after = loadAnnotations(filePath)
      expect(after).toHaveLength(1)
      expect(after[0]).toEqual(originalAnn)
      expect(after[0]?.id).not.toBe(newAnn.id)

      // console.warn must have been called
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })
})
