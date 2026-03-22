import { describe, it, expect, beforeEach } from 'vitest'
import { AnnotationStore } from '../../src/core/annotations.js'

describe('AnnotationStore', () => {
  let store: AnnotationStore

  beforeEach(() => {
    store = new AnnotationStore()
  })

  it('creates an annotation with pending status', () => {
    const ann = store.create({ elementSource: 'App.tsx:10:5', text: 'Make this bigger' })
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
    expect(resolved!.resolution).toEqual({ summary: 'Increased padding to lg' })
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
    const updated = store.addMessage(ann.id, { from: 'user', text: 'Can you fix this?' })
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
    expect(store.addMessage(ann.id, { from: 'agent', text: 'too late' })).toBeNull()

    const ann2 = store.create({ elementSource: 'App.tsx:2:1', text: 'test2' })
    store.dismiss(ann2.id)
    expect(store.addMessage(ann2.id, { from: 'user', text: 'too late' })).toBeNull()
  })

  it('creates annotation with pinPosition', () => {
    const ann = store.create({
      elementSource: 'App.tsx:5:3',
      text: 'move this',
      pinPosition: { x: 120, y: 340 },
    })
    expect(ann.pinPosition).toEqual({ x: 120, y: 340 })
  })

  it('getAll returns all annotations', () => {
    store.create({ elementSource: 'App.tsx:1:1', text: 'a' })
    store.create({ elementSource: 'App.tsx:2:1', text: 'b' })
    store.create({ elementSource: 'App.tsx:3:1', text: 'c' })
    expect(store.getAll()).toHaveLength(3)
  })
})
