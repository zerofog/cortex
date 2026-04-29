// src/browser/edit-command.ts
import type { CSSOverrideManager } from './override.js'
import { generateId } from './uuid.js'

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
  /** Whether undoing/redoing this command should also send {type:'undo'/'redo'}
   *  to the server. False for buffer-only commands (PropertyEditCommand after
   *  the ZF0-1210 pivot — staged edits have no server-side counterpart until
   *  Apply). True for compound edits that still channel.send (classOp). */
  readonly hasServerEntry: boolean
  execute(): void
  undo(): void
}

/** Shared init shape for both PropertyEditCommand and CompoundEditCommand —
 *  structurally identical so the inputs live in ONE type. */
export interface EditCommandInit {
  changes: PropertyChange[]
  overrideManager: CSSOverrideManager
  editId?: string
}

/** Back-compat aliases for the init type — preserved so existing
 *  callers referencing the specific names keep compiling. */
export type PropertyEditCommandInit = EditCommandInit
export type CompoundEditCommandInit = EditCommandInit

/** Shared base: constructor + undo() are identical across both command
 *  classes. Subclasses differ ONLY in execute() semantics:
 *    - PropertyEditCommand always sets (scrub-produced values are
 *      never empty).
 *    - CompoundEditCommand honors value === '' as "remove this
 *      override" because compound edits mix inlineSets (value set)
 *      and inlineRemoves (value empty) in one changes[] array.
 *
 *  Subclassing expresses the semantic difference declaratively — the
 *  alternative (a runtime executeMode flag) would hide two distinct
 *  behaviors behind a branch. */
abstract class BaseEditCommand implements EditCommand {
  readonly editId: string
  readonly changes: readonly PropertyChange[]
  abstract readonly hasServerEntry: boolean
  protected readonly overrideManager: CSSOverrideManager

  constructor(init: EditCommandInit) {
    this.editId = init.editId ?? generateId()
    this.changes = init.changes
    this.overrideManager = init.overrideManager
  }

  abstract execute(): void

  /** Revert each change: previousValue === '' removes the override;
   *  otherwise restores the prior value. Same logic for both subclasses
   *  because undo reads the captured previousValue, not the forward value. */
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

/**
 * Captures a user gesture (one or more CSS property changes) as a command.
 * execute() applies overrides; undo() reverts to previousValue.
 * Multi-property changes (e.g., fill type switch) are atomic — one command, one undo.
 */
export class PropertyEditCommand extends BaseEditCommand {
  // Staged in the browser-side buffer post-pivot; no server-side undo entry
  // exists until Apply (ZF0-1452) flushes the buffer to Claude Code.
  readonly hasServerEntry = false

  execute(): void {
    for (const c of this.changes) {
      this.overrideManager.set(c.source, c.property, c.value, c.pseudo)
    }
  }
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
export class CompoundEditCommand extends BaseEditCommand {
  // classOp dispatches at Panel.tsx still channel.send to the server, so the
  // server has a corresponding UndoFileChange entry that {type:'undo'} can pop.
  readonly hasServerEntry = true

  execute(): void {
    for (const c of this.changes) {
      if (c.value === '') {
        this.overrideManager.remove(c.source, c.property, c.pseudo)
      } else {
        this.overrideManager.set(c.source, c.property, c.value, c.pseudo)
      }
    }
  }
}
