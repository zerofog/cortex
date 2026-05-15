import fs from 'fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AnnotationStore } from '../../src/core/annotations.js'
import { saveAnnotations, loadAnnotations } from '../../src/core/annotations-persistence.js'
import { CortexSession } from '../../src/core/session.js'
import type { Annotation, CreateAnnotationParams } from '../../src/adapters/types.js'

describe('AnnotationStore', () => {
  let store: AnnotationStore

  beforeEach(() => {
    store = new AnnotationStore()
  })

  it('creates an annotation with pending status', () => {
    const ann = store.create({
      elementSource: 'App.tsx:10:5',
      text: 'Make this bigger',
    })
    expect(ann.id).toBeTruthy()
    expect(ann.status).toBe('pending')
    expect(ann.elementSource).toBe('App.tsx:10:5')
    expect(ann.text).toBe('Make this bigger')
    expect(ann.thread).toEqual([])
    expect(ann.createdAt).toBeGreaterThan(0)
    expect(ann.updatedAt).toBeGreaterThan(0)
  })

  it('getPending returns only pending annotations', () => {
    const a1 = store.create({ elementSource: 'App.tsx:1:1', text: 'first' })
    const a2 = store.create({ elementSource: 'App.tsx:2:1', text: 'second' })
    store.acknowledge(a2.id)

    const pending = store.getPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.id).toBe(a1.id)
  })

  it('getById returns annotation or null', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    expect(store.getById(ann.id)).toMatchObject({ id: ann.id })
    expect(store.getById('nonexistent')).toBeNull()
  })

  it('acknowledge transitions pending → acknowledged', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const updated = store.acknowledge(ann.id)
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('acknowledged')
    expect(store.getById(ann.id)!.status).toBe('acknowledged')
  })

  it('resolve transitions acknowledged → resolved', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    const resolved = store.resolve(ann.id, 'Increased padding to lg')
    expect(resolved).not.toBeNull()
    expect(resolved!.status).toBe('resolved')
    expect(resolved!.resolution).toEqual({
      summary: 'Increased padding to lg',
    })
  })

  it('dismiss transitions pending → dismissed', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const dismissed = store.dismiss(ann.id, 'not applicable')
    expect(dismissed).not.toBeNull()
    expect(dismissed!.status).toBe('dismissed')
    expect(dismissed!.dismissReason).toBe('not applicable')
  })

  it('dismiss transitions acknowledged → dismissed', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    const dismissed = store.dismiss(ann.id)
    expect(dismissed).not.toBeNull()
    expect(dismissed!.status).toBe('dismissed')
  })

  it('rejects pending → resolved (must acknowledge first)', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const result = store.resolve(ann.id, 'summary')
    expect(result).toBeNull()
    expect(store.getById(ann.id)!.status).toBe('pending')
  })

  it('rejects transitions from terminal states', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')

    expect(store.acknowledge(ann.id)).toBeNull()
    expect(store.resolve(ann.id, 'again')).toBeNull()
    expect(store.dismiss(ann.id)).toBeNull()

    const ann2 = store.create({ elementSource: 'App.tsx:2:1', text: 'test2' })
    store.dismiss(ann2.id)
    expect(store.acknowledge(ann2.id)).toBeNull()
    expect(store.resolve(ann2.id, 'nope')).toBeNull()
    expect(store.dismiss(ann2.id)).toBeNull()
  })

  it('rejects repeated transition to same state', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    // acknowledge again (already acknowledged, not pending)
    expect(store.acknowledge(ann.id)).toBeNull()
  })

  it('addMessage adds to thread in non-terminal state', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const updated = store.addMessage(ann.id, {
      from: 'user',
      text: 'Can you fix this?',
    })
    expect(updated).not.toBeNull()
    expect(updated!.thread).toHaveLength(1)
    expect(updated!.thread[0]!.from).toBe('user')
    expect(updated!.thread[0]!.text).toBe('Can you fix this?')
    expect(updated!.thread[0]!.id).toBeTruthy()
    expect(updated!.thread[0]!.timestamp).toBeGreaterThan(0)
  })

  it('addMessage rejects for terminal states', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')
    expect(
      store.addMessage(ann.id, { from: 'agent', text: 'too late' }),
    ).toBeNull()

    const ann2 = store.create({ elementSource: 'App.tsx:2:1', text: 'test2' })
    store.dismiss(ann2.id)
    expect(
      store.addMessage(ann2.id, { from: 'user', text: 'too late' }),
    ).toBeNull()
  })

  it('creates annotation with pinPosition', () => {
    const ann = store.create({
      elementSource: 'App.tsx:5:3',
      text: 'move this',
      pinPosition: { x: 0.5, y: 0.3 },
    })
    expect(ann.pinPosition).toEqual({ x: 0.5, y: 0.3 })
  })

  it('getAll returns all annotations', () => {
    store.create({ elementSource: 'App.tsx:1:1', text: 'a' })
    store.create({ elementSource: 'App.tsx:2:1', text: 'b' })
    store.create({ elementSource: 'App.tsx:3:1', text: 'c' })
    expect(store.getAll()).toHaveLength(3)
  })

  describe('eviction policy (count cap)', () => {
    it('evicts oldest terminal entry when terminal count exceeds maxTerminal', () => {
      const store = new AnnotationStore({ maxTerminal: 3 })
      const ids: string[] = []
      for (let i = 0; i < 4; i++) {
        const ann = store.create({
          elementSource: `App.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(ann.id)
        store.resolve(ann.id, `summary ${i}`)
        ids.push(ann.id)
      }

      expect(store.getById(ids[0]!)).toBeNull()
      expect(store.getById(ids[1]!)).not.toBeNull()
      expect(store.getById(ids[2]!)).not.toBeNull()
      expect(store.getById(ids[3]!)).not.toBeNull()
      expect(store.getAll()).toHaveLength(3)
    })

    it('never evicts pending or acknowledged entries regardless of cap', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      // Three pending entries — none have flipped terminal.
      const p1 = store.create({ elementSource: 'A.tsx:1:1', text: 'p1' })
      const p2 = store.create({ elementSource: 'A.tsx:2:1', text: 'p2' })
      const p3 = store.create({ elementSource: 'A.tsx:3:1', text: 'p3' })

      // Two acknowledged — still in flight.
      const a1 = store.create({ elementSource: 'A.tsx:4:1', text: 'a1' })
      const a2 = store.create({ elementSource: 'A.tsx:5:1', text: 'a2' })
      store.acknowledge(a1.id)
      store.acknowledge(a2.id)

      // Drive THREE separate entries through to resolved — terminalOrder push
      // count is 3 > maxTerminal=2 → oldest terminal evicts. Pending/ack must
      // be untouched.
      for (let i = 0; i < 3; i++) {
        const t = store.create({
          elementSource: `T.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(t.id)
        store.resolve(t.id, `s${i}`)
      }

      expect(store.getById(p1.id)).not.toBeNull()
      expect(store.getById(p2.id)).not.toBeNull()
      expect(store.getById(p3.id)).not.toBeNull()
      expect(store.getById(a1.id)).not.toBeNull()
      expect(store.getById(a2.id)).not.toBeNull()
      // 5 in-flight + 2 surviving terminal = 7.
      expect(store.getAll()).toHaveLength(7)
    })

    it('evicts terminal entries in FIFO order (oldest terminal flip evicts first)', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      // Create three annotations, but resolve them OUT OF CREATION ORDER:
      // - a1 created first, but resolved LAST.
      // - a3 created last, but resolved FIRST.
      const a1 = store.create({
        elementSource: 'A.tsx:1:1',
        text: 'first created',
      })
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'middle' })
      const a3 = store.create({
        elementSource: 'A.tsx:3:1',
        text: 'last created',
      })

      store.acknowledge(a3.id)
      store.resolve(a3.id, 'a3 done') // terminal #1
      store.acknowledge(a2.id)
      store.resolve(a2.id, 'a2 done') // terminal #2
      store.acknowledge(a1.id)
      store.resolve(a1.id, 'a1 done') // terminal #3 → evicts a3

      expect(store.getById(a3.id)).toBeNull() // first terminal-flipped → first evicted
      expect(store.getById(a2.id)).not.toBeNull()
      expect(store.getById(a1.id)).not.toBeNull()
    })

    it('dismiss participates in the same FIFO queue as resolve', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      const a1 = store.create({ elementSource: 'A.tsx:1:1', text: 'one' })
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'two' })
      const a3 = store.create({ elementSource: 'A.tsx:3:1', text: 'three' })

      store.dismiss(a1.id) // terminal #1 (dismiss)
      store.acknowledge(a2.id)
      store.resolve(a2.id, 's') // terminal #2 (resolve)
      store.dismiss(a3.id) // terminal #3 → evicts a1

      expect(store.getById(a1.id)).toBeNull()
      expect(store.getById(a2.id)).not.toBeNull()
      expect(store.getById(a3.id)).not.toBeNull()
    })

    it('rejects non-positive maxTerminal at construction', () => {
      expect(() => new AnnotationStore({ maxTerminal: 0 })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: -1 })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: 1.5 })).toThrow(
        /positive integer/,
      )
      // Number.isInteger also rejects NaN and Infinity; lock those in so a
      // future refactor to `max <= 0 || !Number.isInteger(max)` keeps coverage.
      expect(() => new AnnotationStore({ maxTerminal: NaN })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: Infinity })).toThrow(
        /positive integer/,
      )
    })

    it('snapshot captured before eviction retains its payload after the entry is evicted', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      const a1 = store.create({ elementSource: 'A.tsx:1:1', text: 'first' })
      store.acknowledge(a1.id)
      const snap1 = store.resolve(a1.id, 'first done')!
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'second' })
      store.acknowledge(a2.id)
      store.resolve(a2.id, 'second done')

      // Cause an eviction of a1.
      const a3 = store.create({ elementSource: 'A.tsx:3:1', text: 'third' })
      store.acknowledge(a3.id)
      store.resolve(a3.id, 'third done')

      // What this test actually proves: a snapshot captured at terminal-flip time
      // continues to carry its full payload AFTER the underlying entry is evicted
      // from the store. (Note: this does NOT prove `snapshot()` returns a copy vs
      // a live reference — terminal entries are immutable through the public API,
      // so the copy-vs-reference distinction is unobservable post-resolve.)
      expect(snap1.id).toBe(a1.id)
      expect(snap1.status).toBe('resolved')
      expect(snap1.resolution).toEqual({ summary: 'first done' })
      expect(snap1.thread).toEqual([])

      // The store no longer holds a1.
      expect(store.getById(a1.id)).toBeNull()
    })

    it('default maxTerminal is 100 (regression guard)', () => {
      const store = new AnnotationStore()
      // Create 101 terminal entries; entry #1 must be evicted.
      const ids: string[] = []
      for (let i = 0; i < 101; i++) {
        const ann = store.create({
          elementSource: `App.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(ann.id)
        store.resolve(ann.id, `s${i}`)
        ids.push(ann.id)
      }
      expect(store.getById(ids[0]!)).toBeNull()
      expect(store.getById(ids[1]!)).not.toBeNull()
      expect(store.getAll()).toHaveLength(100)
    })
  })

  describe('with persistence', () => {
    let tmpDir: string
    let filePath: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-store-'))
      filePath = path.join(tmpDir, 'annotations.json')
    })

    afterEach(() => {
      vi.restoreAllMocks()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('hydrates from existing valid file — store integration', () => {
      const knownAnn = {
        id: 'hydrate-test-id',
        status: 'pending' as const,
        elementSource: 'App.tsx:1:1',
        text: 'hydrate me',
        createdAt: 1000,
        updatedAt: 1000,
        thread: [],
        kind: 'comment' as const,
      }
      saveAnnotations(filePath, [knownAnn])

      const store = new AnnotationStore({ persistence: { filePath } })

      // Assert the store integrates the loaded data — getById and getPending
      // must surface the hydrated annotation. (A bug where hydration writes
      // to a different internal field would pass a getAll-only assertion.)
      expect(store.getById('hydrate-test-id')).toMatchObject({
        id: 'hydrate-test-id',
        text: 'hydrate me',
        status: 'pending',
      })
      expect(store.getPending().map((a) => a.id)).toEqual(['hydrate-test-id'])
      expect(store.getAll()).toHaveLength(1)
    })

    it('starts empty when file is missing', () => {
      // filePath does not exist yet — no file created
      const store = new AnnotationStore({ persistence: { filePath } })
      expect(store.getAll()).toEqual([])
    })

    it('create() writes through to file', () => {
      const store = new AnnotationStore({ persistence: { filePath } })
      store.create({ elementSource: 'App.tsx:1:1', text: 'write me' })

      const persisted = loadAnnotations(filePath)
      expect(persisted).toHaveLength(1)
      expect(persisted[0]!.text).toBe('write me')
      expect(persisted[0]!.status).toBe('pending')
    })

    it('acknowledge() writes through to file', () => {
      const store = new AnnotationStore({ persistence: { filePath } })
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'ack me' })
      store.acknowledge(ann.id)

      const persisted = loadAnnotations(filePath)
      expect(persisted).toHaveLength(1)
      expect(persisted[0]!.status).toBe('acknowledged')
    })

    it('resolve() writes through to file', () => {
      const store = new AnnotationStore({ persistence: { filePath } })
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'resolve me' })
      store.acknowledge(ann.id)
      store.resolve(ann.id, 'fixed it')

      const persisted = loadAnnotations(filePath)
      expect(persisted).toHaveLength(1)
      expect(persisted[0]!.status).toBe('resolved')
      expect(persisted[0]!.resolution).toEqual({ summary: 'fixed it' })
    })

    it('dismiss() writes through to file', () => {
      const store = new AnnotationStore({ persistence: { filePath } })
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'dismiss me' })
      store.dismiss(ann.id, 'not applicable')

      const persisted = loadAnnotations(filePath)
      expect(persisted).toHaveLength(1)
      expect(persisted[0]!.status).toBe('dismissed')
      expect(persisted[0]!.dismissReason).toBe('not applicable')
    })

    it('addMessage() writes through to file', () => {
      const store = new AnnotationStore({ persistence: { filePath } })
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'message me' })
      store.addMessage(ann.id, { from: 'user', text: 'hello' })

      const persisted = loadAnnotations(filePath)
      expect(persisted).toHaveLength(1)
      expect(persisted[0]!.thread).toHaveLength(1)
      expect(persisted[0]!.thread[0]!.text).toBe('hello')
      expect(persisted[0]!.thread[0]!.from).toBe('user')
    })

    it('eviction is reflected in the persisted file — memory and disk agree', () => {
      const store = new AnnotationStore({ maxTerminal: 2, persistence: { filePath } })

      const anns: string[] = []
      for (let i = 0; i < 3; i++) {
        const ann = store.create({ elementSource: `App.tsx:${i}:1`, text: `t${i}` })
        store.acknowledge(ann.id)
        store.resolve(ann.id, `s${i}`)
        anns.push(ann.id)
      }

      // 3rd resolve pushes terminalOrder to 3, evicting the 1st
      const persisted = loadAnnotations(filePath)
      const persistedIds = persisted.map((a) => a.id)
      expect(persistedIds).not.toContain(anns[0])
      expect(persistedIds).toContain(anns[1])
      expect(persistedIds).toContain(anns[2])

      // Integration claim: in-memory state and on-disk state must agree after eviction.
      // Without this, a bug where eviction wipes the Map but persists a stale snapshot
      // would still pass the above 3 assertions.
      const memoryIds = store.getAll().map((a) => a.id).sort()
      expect(persistedIds.sort()).toEqual(memoryIds)
    })

    it('does not call writeFileSync when persistence is unset', () => {
      // Spy proves negative-behavior: no write attempt anywhere, not just to a
      // path we happen to know about. Falsifiable by any regression that calls
      // saveAnnotations() unconditionally.
      const writeSpy = vi.spyOn(fs, 'writeFileSync')
      const store = new AnnotationStore()
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'no persist' })
      store.acknowledge(ann.id)
      store.resolve(ann.id, 'done')

      expect(writeSpy).not.toHaveBeenCalled()
    })

    it('hydrated terminalOrder is chronological — evicts oldest by updatedAt', () => {
      // Counter-based mock: every Date.now() call returns a strictly increasing
      // value. Robust to refactors that change how many times each mutation
      // invokes Date.now() — the chronological invariant (ann1 < ann2 < ann3)
      // holds regardless of call count.
      let mockTime = 0
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        mockTime += 100
        return mockTime
      })

      const storeA = new AnnotationStore({ maxTerminal: 3, persistence: { filePath } })
      const ann1 = storeA.create({ elementSource: 'A.tsx:1:1', text: 'oldest' })
      storeA.acknowledge(ann1.id)
      storeA.resolve(ann1.id, 'done1')

      const ann2 = storeA.create({ elementSource: 'A.tsx:2:1', text: 'middle' })
      storeA.acknowledge(ann2.id)
      storeA.resolve(ann2.id, 'done2')

      const ann3 = storeA.create({ elementSource: 'A.tsx:3:1', text: 'newest' })
      storeA.acknowledge(ann3.id)
      storeA.resolve(ann3.id, 'done3')

      dateSpy.mockRestore()

      // Step 2: construct a NEW store from the same file — terminalOrder hydrated from disk
      const storeB = new AnnotationStore({ maxTerminal: 3, persistence: { filePath } })
      expect(storeB.getAll()).toHaveLength(3) // all 3 at cap

      // Step 3: add 4th annotation (create + ack + resolve) — should evict ann1 (oldest updatedAt=300)
      const ann4 = storeB.create({ elementSource: 'A.tsx:4:1', text: 'fourth' })
      storeB.acknowledge(ann4.id)
      storeB.resolve(ann4.id, 'done4')

      const allIds = storeB.getAll().map((a) => a.id)
      expect(allIds).not.toContain(ann1.id)  // evicted — oldest updatedAt
      expect(allIds).toContain(ann2.id)
      expect(allIds).toContain(ann3.id)
      expect(allIds).toContain(ann4.id)
    })

    it('caps over-cap hydration — drops oldest terminal entries to fit maxTerminal', () => {
      // Scenario: annotations.json was hand-edited or maxTerminal was reduced
      // between sessions, so the file contains MORE terminal entries than the
      // cap. Constructor must enforce the cap on hydration — otherwise
      // getAll() returns over-cap until the next mutation triggers eviction,
      // violating the invariant. Two reviewers (Greptile + Copilot) flagged
      // this in PR #140.
      const fixtures: Annotation[] = []
      for (let i = 0; i < 5; i++) {
        fixtures.push({
          id: `evict-${i}`,
          status: 'resolved',
          elementSource: `A.tsx:${i}:1`,
          text: `entry ${i}`,
          createdAt: i * 100,
          updatedAt: i * 100,
          thread: [],
          kind: 'comment',
          resolution: { summary: `done ${i}` },
        })
      }
      saveAnnotations(filePath, fixtures)

      const store = new AnnotationStore({ maxTerminal: 3, persistence: { filePath } })
      const allIds = store.getAll().map((a) => a.id)
      expect(allIds).toHaveLength(3)
      // Oldest two (evict-0, evict-1) dropped — chronological by updatedAt
      expect(allIds).not.toContain('evict-0')
      expect(allIds).not.toContain('evict-1')
      expect(allIds).toEqual(expect.arrayContaining(['evict-2', 'evict-3', 'evict-4']))
    })

    it('preserves all pending/acknowledged annotations on hydration even if over maxTerminal', () => {
      // Cap applies only to terminal entries — active annotations are NEVER
      // evicted. A file with 5 pending + 5 resolved should hydrate the 5
      // pending unconditionally and trim the resolved set to fit maxTerminal.
      const fixtures: Annotation[] = []
      for (let i = 0; i < 5; i++) {
        fixtures.push({
          id: `pending-${i}`,
          status: 'pending',
          elementSource: `A.tsx:${i}:1`,
          text: `pending ${i}`,
          createdAt: i * 100,
          updatedAt: i * 100,
          thread: [],
          kind: 'comment',
        })
      }
      for (let i = 0; i < 5; i++) {
        fixtures.push({
          id: `resolved-${i}`,
          status: 'resolved',
          elementSource: `A.tsx:${i + 5}:1`,
          text: `resolved ${i}`,
          createdAt: (i + 5) * 100,
          updatedAt: (i + 5) * 100,
          thread: [],
          kind: 'comment',
          resolution: { summary: `done ${i}` },
        })
      }
      saveAnnotations(filePath, fixtures)

      const store = new AnnotationStore({ maxTerminal: 2, persistence: { filePath } })
      // 5 pending + 2 most-recent resolved = 7 total
      expect(store.getAll()).toHaveLength(7)
      expect(store.getPending().map((a) => a.id)).toEqual(
        expect.arrayContaining(['pending-0', 'pending-1', 'pending-2', 'pending-3', 'pending-4']),
      )
      const resolvedIds = store.getAll().filter((a) => a.status === 'resolved').map((a) => a.id)
      expect(resolvedIds).toHaveLength(2)
      expect(resolvedIds).toEqual(expect.arrayContaining(['resolved-3', 'resolved-4']))
    })
  })
  describe('getActive', () => {
    it.each([
      ['pending', true],
      ['acknowledged', true],
      ['resolved', false],
      ['dismissed', false],
    ] as const)('status=%s: included=%s', (status, shouldBeIncluded) => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      if (status === 'acknowledged') {
        store.acknowledge(ann.id)
      } else if (status === 'resolved') {
        store.acknowledge(ann.id)
        store.resolve(ann.id, 'done')
      } else if (status === 'dismissed') {
        store.dismiss(ann.id)
      }
      // pending requires no transition

      const active = store.getActive()
      if (shouldBeIncluded) {
        expect(active).toHaveLength(1)
        expect(active[0]!.id).toBe(ann.id)
      } else {
        expect(active).toHaveLength(0)
      }
    })

    it('returns pending + acknowledged together, excludes terminal states', () => {
      const pending = store.create({ elementSource: 'App.tsx:1:1', text: 'pending' })
      const acknowledged = store.create({ elementSource: 'App.tsx:2:1', text: 'acknowledged' })
      const resolved = store.create({ elementSource: 'App.tsx:3:1', text: 'resolved' })
      const dismissed = store.create({ elementSource: 'App.tsx:4:1', text: 'dismissed' })

      store.acknowledge(acknowledged.id)
      store.acknowledge(resolved.id)
      store.resolve(resolved.id, 'done')
      store.dismiss(dismissed.id)

      const active = store.getActive()
      expect(active).toHaveLength(2)
      const ids = active.map(a => a.id)
      expect(ids).toContain(pending.id)
      expect(ids).toContain(acknowledged.id)
      expect(ids).not.toContain(resolved.id)
      expect(ids).not.toContain(dismissed.id)
    })

    it('returns defensive snapshots (mutating returned annotation does not affect store)', () => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      const active = store.getActive()
      expect(active).toHaveLength(1)

      // mutate the returned snapshot
      active[0]!.text = 'mutated'

      // store must be unaffected
      const activeAgain = store.getActive()
      expect(activeAgain[0]!.text).toBe('test')
    })
  })

  describe('snapshot deep-clone invariant', () => {
    it('resolution.summary mutation is isolated from the live store entry', () => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      store.acknowledge(ann.id)
      const resolved = store.resolve(ann.id, 'done')!
      resolved.resolution!.summary = 'tampered'
      expect(store.getById(ann.id)!.resolution!.summary).toBe('done')
    })

    it('thread[0].text mutation is isolated from the live store entry', () => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      store.acknowledge(ann.id)
      const withMessage = store.addMessage(ann.id, {
        from: 'user',
        text: 'hello',
      })!
      withMessage.thread[0]!.text = 'tampered'
      expect(store.getById(ann.id)!.thread[0]!.text).toBe('hello')
    })

    it('pinPosition.x mutation is isolated from the live store entry', () => {
      const ann = store.create({
        elementSource: 'App.tsx:1:1',
        text: 'test',
        pinPosition: { x: 100, y: 200 },
      })
      const snapshot = store.getById(ann.id)!
      snapshot.pinPosition!.x = 999
      expect(store.getById(ann.id)!.pinPosition!.x).toBe(100)
    })

    it('elementContext and currentStyles mutations are isolated from the live store entry', () => {
      const ann = store.create({
        elementSource: 'App.tsx:1:1',
        text: 'test',
        elementContext: {
          tagName: 'div',
          componentName: null,
          domSelector: '#root',
          textPreview: 'hi',
        },
        currentStyles: { color: 'red' },
      })
      const snapshot = store.getById(ann.id)!
      snapshot.elementContext!.tagName = 'span'
      snapshot.currentStyles!.color = 'blue'
      const live = store.getById(ann.id)!
      expect(live.elementContext!.tagName).toBe('div')
      expect(live.currentStyles!.color).toBe('red')
    })

    it('fixMeta.property mutation is isolated from the live store entry', () => {
      const ann = store.create({
        elementSource: 'App.tsx:1:1',
        text: 'test',
        kind: 'fix-request',
        fixMeta: { property: 'padding', value: 'lg', reason: 'too tight' },
      })
      const snapshot = store.getById(ann.id)!
      snapshot.fixMeta!.property = 'margin'
      expect(store.getById(ann.id)!.fixMeta!.property).toBe('padding')
    })

    it('create() return value is isolated from the live store entry', () => {
      // Locks the invariant on create()'s exit path specifically, so a future
      // refactor that returns the freshly-built annotation without snapshot()
      // is caught.
      const fresh = store.create({
        elementSource: 'App.tsx:1:1',
        text: 'test',
        pinPosition: { x: 10, y: 20 },
      })
      fresh.pinPosition!.x = 999
      expect(store.getById(fresh.id)!.pinPosition!.x).toBe(10)
    })

    it('getAll() returns each entry as an isolated snapshot', () => {
      // Locks the invariant on getAll(), the .map(snapshot) hot path that a
      // future refactor might "optimize" to return live entries.
      const ann = store.create({
        elementSource: 'App.tsx:1:1',
        text: 'test',
        elementContext: {
          tagName: 'div',
          componentName: null,
          domSelector: '#root',
          textPreview: 'hi',
        },
      })
      const all = store.getAll()
      all[0]!.elementContext!.tagName = 'span'
      expect(store.getById(ann.id)!.elementContext!.tagName).toBe('div')
    })
  })

  // ZF0-1857: the snapshot-deep-clone block above pins the OUTPUT side (mutating
  // a returned snapshot). These pin the symmetric INPUT side of create():
  // (1) the live store entry must not share nested object refs with the caller's
  // params, and (2) a non-cloneable params value must throw BEFORE any store
  // mutation, so the store is never left holding a poisoned entry.
  describe('create() input-side hardening (ZF0-1857)', () => {
    it('mutating the params object after create() does not corrupt the live store entry', () => {
      const params: CreateAnnotationParams = {
        elementSource: 'App.tsx:1:1',
        text: 'original',
        elementContext: { tagName: 'div', componentName: null, domSelector: '#root', textPreview: 'hi' },
        currentStyles: { color: 'red' },
        pinPosition: { x: 10, y: 20 },
        kind: 'fix-request',
        fixMeta: { property: 'padding', value: 'lg', reason: 'too tight' },
      }
      const ann = store.create(params)

      // Caller mutates THEIR params object after create() returned.
      params.elementContext!.tagName = 'span'
      params.currentStyles!.color = 'blue'
      params.pinPosition!.x = 999
      params.fixMeta!.property = 'margin'

      const live = store.getById(ann.id)!
      expect(live.elementContext!.tagName).toBe('div')
      expect(live.currentStyles!.color).toBe('red')
      expect(live.pinPosition!.x).toBe(10)
      expect(live.fixMeta!.property).toBe('padding')
    })

    it('non-cloneable params throw before any store mutation — store stays usable', () => {
      // A non-cloneable value (function) that bypassed Zod validation. The
      // pre-storage structuredClone throws DataCloneError BEFORE the store is
      // touched, so there is no half-inserted poisoned entry. Without the
      // input-side clone, the bad entry lands in the store and every later
      // getAll()/getById() re-throws on its snapshot.
      const poison = {
        elementSource: 'App.tsx:1:1',
        text: 'poison',
        currentStyles: { color: (() => {}) as unknown as string },
      } as CreateAnnotationParams

      expect(() => store.create(poison)).toThrow()
      // Store untouched — not poisoned, still empty.
      expect(store.getAll()).toEqual([])
      // A subsequent valid create still works — the store is not in a bad state.
      const ok = store.create({ elementSource: 'App.tsx:2:2', text: 'fine' })
      expect(store.getById(ok.id)).not.toBeNull()
      expect(store.getAll()).toHaveLength(1)
    })
  })
})

describe('CortexSession passthrough', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-session-'))
    filePath = path.join(tmpDir, 'annotations.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('wires persistence through CortexConfig.annotationsFilePath', () => {
    const session = new CortexSession({
      root: '/tmp',
      mode: 'dev',
      annotationsFilePath: filePath,
    })
    session.annotations.create({ elementSource: 'App.tsx:1:1', text: 'session wired' })

    const persisted = loadAnnotations(filePath)
    expect(persisted).toHaveLength(1)
    expect(persisted[0]!.text).toBe('session wired')
  })
})
