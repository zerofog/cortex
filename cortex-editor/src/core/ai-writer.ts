import { parse } from '@babel/parser'
import { basename, extname } from 'path'

// ── Types ──────────────────────────────────────────────────────────

export interface AIWriteRequest {
  /** Absolute path to the source file */
  filePath: string
  /** 1-based line number of the target JSX element */
  line: number
  /** 1-based column number of the target JSX element */
  col: number
  /** CSS property being changed, e.g. 'padding-top' */
  property: string
  /** Target CSS value, e.g. '16px' */
  value: string
  /** Why the deterministic path failed — passed to AI as context */
  failureReason: string
}

export type AIWriteResult =
  | { success: true; filePath: string; oldContent: string; newContent: string }
  | { success: false; filePath: string; reason: string }

export interface AIWriterOptions {
  apiKey: string
  readFile: (path: string) => Promise<string>
  /** Override model for testing. Default: claude-haiku-4-5-20251001 */
  model?: string
  /** Override timeout in ms. Default: 15000 */
  timeoutMs?: number
  /** Override API base URL. Default: https://api.anthropic.com */
  apiBaseUrl?: string
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_API_BASE = 'https://api.anthropic.com'
const CONTEXT_WINDOW = 25
const MAX_DIFF_LINES = 10
const MAX_LOCALITY_DISTANCE = 15
const MAX_NET_LINE_DELTA = 3
const MAX_LINE_LENGTH = 500
const MAX_TOKENS = 1024

const PARSE_PLUGINS = [
  'jsx',
  'typescript',
  ['decorators', { version: '2023-07' }],
  'importAttributes',
  'explicitResourceManagement',
] as import('@babel/parser').ParserPlugin[]

const SYSTEM_PROMPT = `You are a code editor. You modify source code files to change CSS styling properties.

RULES:
- Return ONLY the modified code lines, wrapped in a single code fence.
- Change the MINIMUM number of lines necessary to apply the requested CSS property change.
- Preserve exact indentation, formatting, and surrounding code.
- Do NOT add explanations, comments, or text outside the code fence.
- Do NOT add or remove imports.
- Do NOT modify any code outside the targeted element.`

// Matches instruction-like patterns commonly used in prompt injection
const INSTRUCTION_COMMENT_RE = /^\s*(IMPORTANT|INSTRUCTION|NOTE|AI|SYSTEM|IGNORE|OVERRIDE|FORGET|DISREGARD)\s*:/i

// ── AIWriter ───────────────────────────────────────────────────────

export class AIWriter {
  private readonly apiKey: string
  private readonly readFile: (path: string) => Promise<string>
  private readonly model: string
  private readonly timeoutMs: number
  private readonly apiBaseUrl: string

  constructor(options: AIWriterOptions) {
    this.apiKey = options.apiKey
    this.readFile = options.readFile
    this.model = options.model ?? DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE
  }

  async write(request: AIWriteRequest): Promise<AIWriteResult> {
    const { filePath } = request

    // Read current file content
    let oldContent: string
    try {
      oldContent = await this.readFile(filePath)
    } catch (err) {
      return { success: false, filePath, reason: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` }
    }

    const lines = oldContent.split('\n')

    // Extract context window around target line
    const { snippet, startLine, endLine } = extractContext(lines, request.line, CONTEXT_WINDOW)

    // Sanitize the snippet before sending to AI
    const sanitized = sanitizeForPrompt(snippet)

    // Build prompt
    const ext = extname(filePath).slice(1) || 'tsx'
    const filename = basename(filePath)
    const userPrompt = buildUserPrompt(request, sanitized, startLine, endLine, filename, ext)

    // Call Claude API
    let responseText: string
    try {
      responseText = await this.callClaude(userPrompt)
    } catch (err) {
      return { success: false, filePath, reason: `AI request failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    // Extract code from response
    const extractedCode = extractCodeFence(responseText)
    if (extractedCode === null) {
      return { success: false, filePath, reason: 'AI response did not contain a code block' }
    }

    // Reconstruct full file: replace the context window with AI output
    const newLines = [...lines]
    const aiLines = extractedCode.split('\n')
    newLines.splice(startLine - 1, endLine - startLine + 1, ...aiLines)
    const newContent = newLines.join('\n')

    // Validate the result
    const validation = validateResult(oldContent, newContent, filePath, request.line, startLine, endLine)
    if (!validation.valid) {
      return { success: false, filePath, reason: validation.reason! }
    }

    return { success: true, filePath, oldContent, newContent }
  }

  private async callClaude(userPrompt: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`API ${response.status}: ${body.slice(0, 200)}`)
      }

      const data = await response.json() as { content?: Array<{ type: string; text?: string }> }
      const textBlock = data.content?.find(b => b.type === 'text')
      if (!textBlock?.text) {
        throw new Error('Empty response from API')
      }
      return textBlock.text
    } finally {
      clearTimeout(timer)
    }
  }
}

// ── Pure helpers (exported for testing) ────────────────────────────

/** Extract a window of lines centered on the target line. */
export function extractContext(
  lines: string[],
  targetLine: number,
  windowSize: number,
): { snippet: string; startLine: number; endLine: number } {
  const half = Math.floor(windowSize / 2)
  const startLine = Math.max(1, targetLine - half)
  const endLine = Math.min(lines.length, targetLine + half)
  const snippet = lines.slice(startLine - 1, endLine).join('\n')
  return { snippet, startLine, endLine }
}

/** Build the user prompt for the AI. */
export function buildUserPrompt(
  request: AIWriteRequest,
  snippet: string,
  startLine: number,
  endLine: number,
  filename: string,
  ext: string,
): string {
  return `TASK: Change the CSS property \`${request.property}\` to value \`${request.value}\` for the element at line ${request.line}, column ${request.col}.

CONTEXT: The deterministic editor failed because: ${request.failureReason}

CODE (lines ${startLine}-${endLine} of ${filename}):
\`\`\`${ext}
${snippet}
\`\`\``
}

/** Strip instruction-like comments and truncate long lines. */
export function sanitizeForPrompt(code: string): string {
  const lines = code.split('\n')
  const result: string[] = []
  let inBlockComment = false
  let blockHasInjection = false
  let blockLines: string[] = []

  for (const rawLine of lines) {
    // Truncate excessively long lines (base64, minified code)
    const line = rawLine.length > MAX_LINE_LENGTH
      ? rawLine.slice(0, MAX_LINE_LENGTH) + ' /* truncated */'
      : rawLine

    const stripped = line.trim()

    // ── Inside a multi-line block comment ──
    if (inBlockComment) {
      blockLines.push(line)
      if (INSTRUCTION_COMMENT_RE.test(stripped)) {
        blockHasInjection = true
      }
      if (stripped.includes('*/')) {
        inBlockComment = false
        if (!blockHasInjection) {
          result.push(...blockLines)
        }
        blockLines = []
        blockHasInjection = false
      }
      continue
    }

    // ── Single-line // comment ──
    if (stripped.startsWith('//') && INSTRUCTION_COMMENT_RE.test(stripped.slice(2))) {
      continue
    }

    // ── Single-line block comment: /* ... */ on one line ──
    if (stripped.startsWith('/*') && stripped.includes('*/')) {
      const inner = stripped.slice(2, stripped.indexOf('*/'))
      if (INSTRUCTION_COMMENT_RE.test(inner)) {
        continue
      }
      result.push(line)
      continue
    }

    // ── Single-line JSX comment: {/* ... */} on one line ──
    if (stripped.startsWith('{/*') && stripped.includes('*/}')) {
      const inner = stripped.slice(3, stripped.indexOf('*/}'))
      if (INSTRUCTION_COMMENT_RE.test(inner)) {
        continue
      }
      result.push(line)
      continue
    }

    // ── Start of multi-line block comment ──
    if (stripped.startsWith('/*') || stripped.startsWith('{/*')) {
      inBlockComment = true
      blockHasInjection = false
      blockLines = [line]
      const offset = stripped.startsWith('{/*') ? 3 : 2
      if (INSTRUCTION_COMMENT_RE.test(stripped.slice(offset))) {
        blockHasInjection = true
      }
      continue
    }

    result.push(line)
  }

  // If file ends mid-block-comment, flush buffered lines (non-injection only)
  if (inBlockComment && !blockHasInjection) {
    result.push(...blockLines)
  }

  return result.join('\n')
}

/** Extract content from the first code fence in the AI response. */
export function extractCodeFence(response: string): string | null {
  // Find the first opening fence (with optional language tag)
  const openMatch = response.match(/```(?:\w+)?\n/)
  if (!openMatch) return null

  const contentStart = openMatch.index! + openMatch[0].length
  const rest = response.slice(contentStart)

  // Find the last bare closing fence: a line that is ONLY ``` (with optional
  // whitespace). This skips nested fences that appear mid-line in comments
  // or string literals (e.g., `// Example: ```jsx`).
  const lines = rest.split('\n')
  let lastBareOffset = -1
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```\s*$/.test(lines[i]!)) {
      lastBareOffset = offset
    }
    offset += lines[i]!.length + 1 // +1 for the \n
  }

  if (lastBareOffset === -1) return null
  return rest.slice(0, lastBareOffset).replace(/\n$/, '')
}

/** Validate AI output: parse check, diff budget, localization. */
export function validateResult(
  oldContent: string,
  newContent: string,
  filePath: string,
  targetLine: number,
  contextStartLine: number,
  contextEndLine: number,
): { valid: boolean; reason?: string } {
  // Gate 1: Parse check — must produce valid JSX/TSX
  const ext = extname(filePath)
  if (/\.[jt]sx?$/.test(ext)) {
    try {
      parse(newContent, { sourceType: 'module', plugins: PARSE_PLUGINS })
    } catch (err) {
      return { valid: false, reason: `AI output has syntax errors: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // Gate 2 + 3: Diff budget and localization
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const netDelta = Math.abs(oldLines.length - newLines.length)

  if (netDelta > 0) {
    // Lines were added or removed — positional line-by-line diffing is unreliable
    // because all subsequent lines shift, inflating both diff count and locality
    // distance. Use net delta as the safety constraint instead.
    if (netDelta > MAX_NET_LINE_DELTA) {
      return { valid: false, reason: `AI added/removed ${netDelta} net lines (max ${MAX_NET_LINE_DELTA}). Edit rejected — net line delta too large.` }
    }
    // Verify the file actually changed (not just whitespace reformat)
    if (oldContent === newContent) {
      return { valid: false, reason: 'AI made no changes to the file' }
    }
  } else {
    // Same line count — value replacement. Positional diff is reliable.
    let diffCount = 0
    const changedLineNumbers: number[] = []
    for (let i = 0; i < oldLines.length; i++) {
      if (oldLines[i] !== newLines[i]) {
        diffCount++
        changedLineNumbers.push(i + 1)
      }
    }
    // Gate 2: Diff budget
    if (diffCount > MAX_DIFF_LINES) {
      return { valid: false, reason: `AI changed ${diffCount} lines (max ${MAX_DIFF_LINES}). Edit rejected as too broad.` }
    }
    if (diffCount === 0) {
      return { valid: false, reason: 'AI made no changes to the file' }
    }
    // Gate 3: Localization — per-line locality check
    for (const changedLine of changedLineNumbers) {
      if (Math.abs(changedLine - targetLine) > MAX_LOCALITY_DISTANCE) {
        return { valid: false, reason: `AI modified line ${changedLine}, which is too far from target line ${targetLine}. Edit rejected.` }
      }
    }
  }

  return { valid: true }
}
