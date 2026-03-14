/**
 * Request to rewrite a Tailwind class in a source file.
 * The source location comes from data-cortex-source="file:line:col".
 */
export interface RewriteRequest {
  /** Absolute path to the source file */
  filePath: string
  /** 1-based line number of the JSX element */
  line: number
  /** 1-based column number of the JSX element */
  col: number
  /** CSS property being edited, e.g. 'padding-top' */
  property: string
  /** Current Tailwind class to replace, e.g. 'pt-2' */
  oldToken: string
  /** New Tailwind class, e.g. 'pt-4' */
  newToken: string
}

/**
 * Result of an attempted rewrite. Discriminated on `success`.
 * - success=true: file was rewritten, oldContent preserved for undo
 * - success=false: deterministic rewrite not possible, route to AI
 */
export type RewriteResult =
  | { success: true; filePath: string; oldContent: string; newContent: string }
  | { success: false; filePath: string; reason: string }
