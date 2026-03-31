import { parse } from '@babel/parser'
import { basename, extname } from 'path'
import { PARSE_PLUGINS } from './parser-config.js'

// ── Types ──────────────────────────────────────────────────────────

export interface AIWriteRequest {
  /** Absolute path to the source file */
  filePath: string
  /** 1-based line number of the target JSX element */
  line: number
  /** 1-based column number of the target JSX element */
  col: number
  /** Single property change (legacy — used when changes[] is absent) */
  property: string
  /** Single value (legacy — used when changes[] is absent) */
  value: string
  /** Batched property changes. When present, property/value above are ignored. */
  changes?: Array<{ property: string; value: string }>
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
const CONTEXT_WINDOW = 50
const MAX_DIFF_LINES = 20
const MAX_LOCALITY_DISTANCE = 30
const MAX_NET_LINE_DELTA = 3
const MAX_LINE_LENGTH = 500
const MAX_TOKENS = 2048


const SYSTEM_PROMPT = `You are a code editor. You modify JSX/TSX source files to apply CSS property changes.

HOW TO APPLY THE CHANGE:
- If the element already has a \`style\` prop, add or update the property in the existing style object.
- If the element has no \`style\` prop, add one: \`style={{ camelCaseProperty: 'value' }}\`
- Use JSX camelCase for property names (e.g., paddingTop, backgroundColor, fontSize).
- Always quote string values. Use numbers only for unitless values (e.g., lineHeight, opacity).

RULES:
- Return the COMPLETE code section with your change applied, wrapped in a single code fence.
- Your output REPLACES the entire provided code section, so include ALL lines — not just the changed ones.
- Do NOT include line numbers in your output — only return the raw code.
- Change the MINIMUM number of lines necessary.
- Preserve exact indentation, formatting, and all surrounding code within the section.
- Do NOT add explanations, comments, or text outside the code fence.
- Do NOT add or remove imports.
- Do NOT modify any element other than the one marked with ←.`

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

  async write(
    request: AIWriteRequest,
    options?: { fileContent?: string; signal?: AbortSignal },
  ): Promise<AIWriteResult> {
    const { filePath } = request
    const { fileContent, signal } = options ?? {}

    // Use provided content or read from disk
    let oldContent: string
    if (fileContent !== undefined) {
      oldContent = fileContent
    } else {
      try {
        oldContent = await this.readFile(filePath)
      } catch (err) {
        return { success: false, filePath, reason: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    // Check for early abort before making the AI call
    if (signal?.aborted) {
      return { success: false, filePath, reason: 'Aborted before AI call' }
    }

    const lines = oldContent.split('\n')
    const { snippet, startLine, endLine } = extractContext(lines, request.line, CONTEXT_WINDOW)
    const sanitized = sanitizeForPrompt(snippet)
    const ext = extname(filePath).slice(1) || 'tsx'
    const filename = basename(filePath)
    const userPrompt = buildUserPrompt(request, sanitized, startLine, endLine, filename, ext)

    let responseText: string
    try {
      responseText = await this.callClaude(userPrompt, signal)
    } catch (err) {
      return { success: false, filePath, reason: `AI request failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    // Check for abort after AI response returns
    if (signal?.aborted) {
      return { success: false, filePath, reason: 'Aborted after AI response' }
    }

    const extractedCode = extractCodeFence(responseText)
    if (extractedCode === null) {
      return { success: false, filePath, reason: 'AI response did not contain a code block' }
    }
    // Replace the context window with AI output
    const newLines = [...lines]
    const aiLines = extractedCode.split('\n')
    newLines.splice(startLine - 1, endLine - startLine + 1, ...aiLines)
    const newContent = newLines.join('\n')

    const validation = validateResult(oldContent, newContent, filePath, request.line)
    if (!validation.valid) {
      return { success: false, filePath, reason: validation.reason }
    }

    return { success: true, filePath, oldContent, newContent }
  }

  private async callClaude(userPrompt: string, externalSignal?: AbortSignal): Promise<string> {
    const startTime = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    // Link external abort signal to our internal controller
    const onAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onAbort)

    const requestOptions: RequestInit = {
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
    }

    try {
      let response = await fetch(`${this.apiBaseUrl}/v1/messages`, requestOptions)

      // Single retry for 429 rate limits
      if (response.status === 429) {
        const retryAfterSec = parseInt(response.headers.get('retry-after') ?? '', 10)
        const delay = Math.min(
          Number.isNaN(retryAfterSec) ? 1000 : retryAfterSec * 1000,
          5000,
        )
        await new Promise(resolve => setTimeout(resolve, delay))
        // Fresh AbortController for retry — use remaining time budget, not full timeout
        clearTimeout(timer)
        const elapsed = Date.now() - startTime
        const remaining = Math.max(this.timeoutMs - elapsed, 2000) // at least 2s for retry
        const retryController = new AbortController()
        const retryTimer = setTimeout(() => retryController.abort(), remaining)
        // Link external signal to retry controller too
        const onRetryAbort = () => retryController.abort()
        externalSignal?.addEventListener('abort', onRetryAbort)
        try {
          response = await fetch(`${this.apiBaseUrl}/v1/messages`, {
            ...requestOptions,
            signal: retryController.signal,
          })
        } finally {
          clearTimeout(retryTimer)
          externalSignal?.removeEventListener('abort', onRetryAbort)
        }
        if (!response.ok) {
          throw new Error(`API error ${response.status} (after retry)`)
        }
      } else if (!response.ok) {
        throw new Error(`API error ${response.status}`)
      }

      const data = await response.json() as { content?: Array<{ type: string; text?: string }> }
      const textBlock = data.content?.find(b => b.type === 'text')
      if (!textBlock?.text) {
        throw new Error('Empty response from API')
      }
      return textBlock.text
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
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
  if (lines.length <= windowSize) {
    return { snippet: lines.join('\n'), startLine: 1, endLine: lines.length }
  }
  const half = Math.floor(windowSize / 2)
  let startLine = targetLine - half
  let endLine = startLine + windowSize - 1
  if (startLine < 1) { startLine = 1; endLine = windowSize }
  if (endLine > lines.length) { endLine = lines.length; startLine = Math.max(1, endLine - windowSize + 1) }
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
  // Add line numbers so the AI can identify the target element precisely
  const numberedSnippet = snippet
    .split('\n')
    .map((line, i) => {
      const lineNum = startLine + i
      const marker = lineNum === request.line ? ' ←' : ''
      return `${lineNum}| ${line}${marker}`
    })
    .join('\n')

  const changesList = request.changes
    ? request.changes.map(c => `\`${c.property}: ${c.value}\``).join(', ')
    : `\`${request.property}: ${request.value}\``

  return `TASK: Set ${changesList} on the element at line ${request.line} (marked with ←).

CONTEXT: ${request.failureReason}

CODE (${filename}, lines ${startLine}-${endLine} — line numbers shown for reference, do NOT include them in your output):
\`\`\`${ext}
${numberedSnippet}
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
): { valid: true } | { valid: false; reason: string } {
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
  //
  // Design note: source annotations (data-cortex-source="file:line:col") are
  // determined at build time. After an AI edit modifies the file, line numbers
  // may shift. Subsequent edits still reference the ORIGINAL line number until
  // HMR re-renders the page. The validation gates must tolerate this drift:
  //
  // - Parse check: absolute, no line dependency
  // - Net line delta: absolute, limits structural changes
  // - Diff budget: counts changed lines (reliable for same-length files)
  // - Locality: ensures changes are within MAX_LOCALITY_DISTANCE of target
  //
  // We intentionally do NOT require changes to be exactly on the target line.
  // The ±30 line locality window accommodates typical line drift from prior edits.
  // The context window (50 lines) ensures the AI sees the element regardless of
  // small position shifts.

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const netDelta = Math.abs(oldLines.length - newLines.length)

  // Verify the file actually changed
  if (oldContent === newContent) {
    return { valid: false, reason: 'AI made no changes to the file' }
  }

  if (netDelta > 0) {
    // Lines were added or removed — positional line-by-line diffing is unreliable
    // because all subsequent lines shift. Use net delta as the safety constraint.
    if (netDelta > MAX_NET_LINE_DELTA) {
      return { valid: false, reason: `AI added/removed ${netDelta} net lines (max ${MAX_NET_LINE_DELTA}). Edit rejected — net line delta too large.` }
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
    // Gate 6: Target proximity — at least one change should be near the target.
    // Uses half the context window radius (not ±2) to accommodate line drift
    // from prior AI edits that shifted element positions before HMR updates
    // the source annotations.
    const TARGET_PROXIMITY = Math.floor(CONTEXT_WINDOW / 4) // ±12 for 50-line window
    const nearTarget = changedLineNumbers.some(ln => Math.abs(ln - targetLine) <= TARGET_PROXIMITY)
    if (!nearTarget) {
      return { valid: false, reason: `AI modified lines ${changedLineNumbers.join(', ')} but not near target line ${targetLine}. Edit rejected.` }
    }
  }

  return { valid: true }
}
