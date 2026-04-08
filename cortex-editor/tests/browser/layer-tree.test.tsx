import { describe, it, expect } from 'vitest'
import { buildScopedTree } from '../../src/browser/components/LayerTree.js'
import type { TreeNode } from '../../src/browser/components/LayerTree.js'

describe('buildScopedTree', () => {
  it('returns null for null element', () => {
    expect(buildScopedTree(null)).toBeNull()
  })

  it('returns null for detached element', () => {
    const el = document.createElement('div')
    expect(buildScopedTree(el)).toBeNull()
  })

  it('builds ancestor chain from body to selected', () => {
    const container = document.createElement('div')
    const child = document.createElement('span')
    container.appendChild(child)
    document.body.appendChild(container)

    const tree = buildScopedTree(child)
    expect(tree).not.toBeNull()
    expect(tree!.element).toBe(document.body)
    const containerNode = tree!.children.find(n => n.element === container)
    expect(containerNode).toBeDefined()
    const spanNode = containerNode!.children.find(n => n.element === child)
    expect(spanNode).toBeDefined()
    expect(spanNode!.selected).toBe(true)

    document.body.removeChild(container)
  })

  it('includes siblings at each ancestor level', () => {
    const parent = document.createElement('div')
    const sibling1 = document.createElement('p')
    const sibling2 = document.createElement('p')
    const selected = document.createElement('span')
    parent.appendChild(sibling1)
    parent.appendChild(selected)
    parent.appendChild(sibling2)
    document.body.appendChild(parent)

    const tree = buildScopedTree(selected)
    const parentNode = tree!.children.find(n => n.element === parent)!
    expect(parentNode.children).toHaveLength(3)
    expect(parentNode.children.map(n => n.element)).toEqual([sibling1, selected, sibling2])

    document.body.removeChild(parent)
  })

  it('includes direct children of selected element', () => {
    const parent = document.createElement('div')
    const child1 = document.createElement('h1')
    const child2 = document.createElement('p')
    parent.appendChild(child1)
    parent.appendChild(child2)
    document.body.appendChild(parent)

    const tree = buildScopedTree(parent)
    const parentNode = tree!.children.find(n => n.element === parent)!
    expect(parentNode.selected).toBe(true)
    expect(parentNode.children).toHaveLength(2)
    expect(parentNode.children[0].element).toBe(child1)
    expect(parentNode.children[1].element).toBe(child2)

    document.body.removeChild(parent)
  })

  it('returns tree with just body + children when body is selected', () => {
    const child = document.createElement('div')
    document.body.appendChild(child)

    const tree = buildScopedTree(document.body)
    expect(tree!.element).toBe(document.body)
    expect(tree!.selected).toBe(true)
    expect(tree!.children.length).toBeGreaterThanOrEqual(1)

    document.body.removeChild(child)
  })
})
