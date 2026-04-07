// src/browser/edit-command.ts
import type { CSSOverrideManager } from './override.js'

/** A single property change within an EditCommand. */
export interface PropertyChange {
  readonly source: string
  readonly property: string
  readonly value: string
  readonly previousValue: string
  readonly pseudo?: '::before' | '::after'
}

/** Interface for all edit commands. */
export interface EditCommand {
  readonly editId: string
  readonly changes: readonly PropertyChange[]
  execute(): void
  undo(): void
}

export interface PropertyEditCommandInit {
  changes: PropertyChange[]
  overrideManager: CSSOverrideManager
  editId?: string
}

/**
 * Captures a user gesture (one or more CSS property changes) as a command.
 * execute() applies overrides; undo() reverts to previousValue.
 * Multi-property changes (e.g., fill type switch) are atomic — one command, one undo.
 */
export class PropertyEditCommand implements EditCommand {
  readonly editId: string
  readonly changes: readonly PropertyChange[]
  private readonly overrideManager: CSSOverrideManager

  constructor(init: PropertyEditCommandInit) {
    this.editId = init.editId ?? crypto.randomUUID()
    this.changes = init.changes
    this.overrideManager = init.overrideManager
  }

  execute(): void {
    for (const c of this.changes) {
      this.overrideManager.set(c.source, c.property, c.value, c.pseudo)
    }
  }

  undo(): void {
    for (const c of this.changes) {
      if (c.previousValue === '') {
        this.overrideManager.remove(c.source, c.property, c.pseudo)
      } else {
        this.overrideManager.set(c.source, c.property, c.previousValue, c.pseudo)
      }
    }
  }
}
