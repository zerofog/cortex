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

    it('returns empty array and warns on invalid JSON', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, 'not json {', 'utf8')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('returns empty array and warns on version mismatch', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(filePath, JSON.stringify({ version: 2, annotations: [] }), 'utf8')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('returns empty array and warns on shape mismatch (id is number instead of string)', () => {
      const filePath = path.join(tmpDir, 'annotations.json')
      fs.writeFileSync(
        filePath,
        JSON.stringify({ version: 1, annotations: [{ id: 123 }] }),
        'utf8',
      )

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadAnnotations(filePath)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledTimes(1)
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
