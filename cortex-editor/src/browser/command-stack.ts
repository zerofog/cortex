// src/browser/command-stack.ts
import type { EditCommand } from './edit-command.js'

/**
 * Single browser-side undo/redo stack for EditCommands.
 * Replaces the dual-stack architecture (CSSOverrideManager snapshot stack +
 * server UndoStack). Undo/redo is local-first — no server round-trip needed.
 */
export class CommandStack {
  private undoStack: EditCommand[] = []
  private redoStack: EditCommand[] = []
  private readonly maxDepth: number

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth
  }

  /** Push and execute a command. Clears redo stack. */
  push(command: EditCommand): void {
    command.execute()
    this.undoStack.push(command)
    this.redoStack.length = 0
    while (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
    }
  }

  /** Undo the most recent command. Returns the command (for server sync) or null. */
  undo(): EditCommand | null {
    const cmd = this.undoStack.pop()
    if (!cmd) return null
    cmd.undo()
    this.redoStack.push(cmd)
    return cmd
  }

  /** Redo the most recently undone command. Returns the command or null. */
  redo(): EditCommand | null {
    const cmd = this.redoStack.pop()
    if (!cmd) return null
    cmd.execute()
    this.undoStack.push(cmd)
    return cmd
  }

  peekUndo(): EditCommand | null {
    return this.undoStack[this.undoStack.length - 1] ?? null
  }

  peekRedo(): EditCommand | null {
    return this.redoStack[this.redoStack.length - 1] ?? null
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get undoCount(): number { return this.undoStack.length }
  get redoCount(): number { return this.redoStack.length }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
