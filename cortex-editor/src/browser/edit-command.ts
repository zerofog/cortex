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

export interface CompoundEditCommandInit {
  changes: PropertyChange[]
  overrideManager: CSSOverrideManager
  editId?: string
}

/**
 * Represents one compound edit (classOp + inlineSets + inlineRemoves) on the
 * browser's commandStack. The server writes the whole gesture as ONE
 * UndoFileChange; this command's job is to (a) exist on the local stack so
 * CortexApp's `const cmd = commandStack.undo()` / `if (cmd)` gate fires and
 * dispatches `{ type: 'undo' }` to the server, and (b) manage the local
 * !important overrides that applyClassChange set for immediate visual
 * feedback while HMR is in flight.
 *
 * Unlike PropertyEditCommand (which always sets), execute() here must also
 * honor value === '' as "remove this override" because compound edits mix
 * inlineSets (value='rgb(...)') and inlineRemoves (value=''). The classOp
 * (className add/remove) is NOT tracked by this command — it is reverted
 * purely via the server's compound UndoFileChange + HMR re-render.
 */
export class CompoundEditCommand implements EditCommand {
  readonly editId: string
  readonly changes: readonly PropertyChange[]
  private readonly overrideManager: CSSOverrideManager

  constructor(init: CompoundEditCommandInit) {
    this.editId = init.editId ?? crypto.randomUUID()
    this.changes = init.changes
    this.overrideManager = init.overrideManager
  }

  execute(): void {
    for (const c of this.changes) {
      if (c.value === '') {
        this.overrideManager.remove(c.source, c.property, c.pseudo)
      } else {
        this.overrideManager.set(c.source, c.property, c.value, c.pseudo)
      }
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
