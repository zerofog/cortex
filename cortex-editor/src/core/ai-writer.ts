import { parse } from '@babel/parser'
import { basename, extname } from 'path'
import { PARSE_PLUGINS } from './parser-config.js'
import { ToolApplicator } from './tool-applicator.js'
import type { ToolAction } from './tool-applicator.js'

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
  /** Override timeout in ms. Default: 8000 */
  timeoutMs?: number
  /** Override API base URL. Default: https://api.anthropic.com */
  apiBaseUrl?: string
  /** Optional ToolApplicator for DI/testing. Created internally if not provided. */
  toolApplicator?: ToolApplicator
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_API_BASE = 'https://api.anthropic.com'
const CONTEXT_WINDOW = 50
const MAX_LINE_LENGTH = 500
const MAX_TOKENS = 512

const SYSTEM_PROMPT = `You are a code editor. You modify JSX/TSX source files using the provided tools.

The user provides a code snippet with the target element marked with \u2190. Apply the requested CSS changes using the most appropriate tool:

1. set_inline_style \u2014 preferred for CSS property changes. Adds or updates style prop properties.
2. replace_attribute \u2014 for className or other JSX attribute changes.
3. replace_line_content \u2014 last resort for changes the above tools cannot express.

RULES:
- Use kebab-case property names for set_inline_style (e.g., padding-top, background-color). The applicator handles camelCase conversion.
- Change only the target element (marked with \u2190).
- Do NOT modify imports or other elements.`

const TOOL_DEFINITIONS = [
  {
    name: 'set_inline_style',
    description: 'Set one or more CSS properties on the target element\'s inline style prop.',
    input_schema: {
      type: 'object' as const,
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              property: { type: 'string', description: 'CSS property in kebab-case (e.g., padding-top)' },
              value: { type: 'string', description: 'CSS value (e.g., 16px, #ff0000)' },
            },
            required: ['property', 'value'],
          },
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'replace_attribute',
    description: 'Replace or add a JSX attribute on the target element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        attribute: { type: 'string', description: 'JSX attribute name (e.g., className)' },
        value: { type: 'string', description: 'Complete attribute value including quotes/braces' },
      },
      required: ['attribute', 'value'],
    },
  },
  {
    name: 'replace_line_content',
    description: 'Replace a specific line of code. Use only when set_inline_style and replace_attribute cannot express the change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        line_number: { type: 'number', description: '1-based line number to modify' },
        old_content: { type: 'string', description: 'Expected current content (trimmed)' },
        new_content: { type: 'string', description: 'New line content' },
      },
      required: ['line_number', 'old_content', 'new_content'],
    },
  },
]

// Matches instruction-like patterns commonly used in prompt injection
const INSTRUCTION_COMMENT_RE = /^\s*(IMPORTANT|INSTRUCTION|NOTE|AI|SYSTEM|IGNORE|OVERRIDE|FORGET|DISREGARD)\s*:/i

// ── Internal types ────────────────────────────────────────────────

interface ToolCall {
  name: string
  input: Record<string, unknown>
}

/** Validate and convert a raw tool_use response into a typed ToolAction. Returns null if shape is invalid. */
function parseToolAction(call: ToolCall): ToolAction | null {
  const { name, input } = call
  if (name === 'set_inline_style') {
    if (!Array.isArray(input.changes) || input.changes.length === 0) return null
    for (const c of input.changes) {
      if (typeof c?.property !== 'string' || typeof c?.value !== 'string') return null
    }
    return { tool: 'set_inline_style', changes: input.changes as Array<{ property: string; value: string }> }
  }
  if (name === 'replace_attribute') {
    if (typeof input.attribute !== 'string' || typeof input.value !== 'string') return null
    return { tool: 'replace_attribute', attribute: input.attribute, value: input.value }
  }
  if (name === 'replace_line_content') {
    if (typeof input.line_number !== 'number' || !Number.isInteger(input.line_number) || typeof input.old_content !== 'string' || typeof input.new_content !== 'string') return null
    return { tool: 'replace_line_content', lineNumber: input.line_number, oldContent: input.old_content, newContent: input.new_content }
  }
  return null
}

// ── AIWriter ───────────────────────────────────────────────────────

export class AIWriter {
  private readonly apiKey: string
  private readonly readFile: (path: string) => Promise<string>
  private readonly model: string
  private readonly timeoutMs: number
  private readonly apiBaseUrl: string
  private readonly toolApplicator: ToolApplicator
  private readonly ownsApplicator: boolean

  constructor(options: AIWriterOptions) {
    this.apiKey = options.apiKey
    this.readFile = options.readFile
    this.model = options.model ?? DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE
    this.ownsApplicator = !options.toolApplicator
    this.toolApplicator = options.toolApplicator ?? new ToolApplicator()
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

    if (signal?.aborted) {
      return { success: false, filePath, reason: 'Aborted before AI call' }
    }

    let toolCall: ToolCall
    try {
      toolCall = await this.callClaude(userPrompt, signal)
    } catch (err) {
      return { success: false, filePath, reason: `AI request failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    if (signal?.aborted) {
      return { success: false, filePath, reason: 'Aborted after AI response' }
    }

    // Convert ToolCall to ToolAction — validate shape before applying
    const action = parseToolAction(toolCall)
    if (!action) {
      return { success: false, filePath, reason: `Malformed tool input from AI for tool '${toolCall.name}'` }
    }

    const applyResult = await this.toolApplicator.apply(oldContent, filePath, request.line, request.col, action)
    if (!applyResult.success) {
      return { success: false, filePath, reason: applyResult.reason }
    }

    const newContent = applyResult.content

    const validation = validateResult(oldContent, newContent, filePath)
    if (!validation.valid) {
      return { success: false, filePath, reason: validation.reason }
    }

    return { success: true, filePath, oldContent, newContent }
  }

  private async callClaude(userPrompt: string, externalSignal?: AbortSignal): Promise<ToolCall> {
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
        tools: TOOL_DEFINITIONS,
        tool_choice: { type: 'any' },
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
        await new Promise<void>((resolve, reject) => {
          if (externalSignal?.aborted) { reject(externalSignal.reason); return }
          const delayTimer = setTimeout(() => {
            externalSignal?.removeEventListener('abort', onDelayAbort)
            resolve()
          }, delay)
          const onDelayAbort = () => { clearTimeout(delayTimer); reject(externalSignal!.reason) }
          externalSignal?.addEventListener('abort', onDelayAbort, { once: true })
        })
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
          const errBody = await response.text().catch(() => '')
          throw new Error(`API error ${response.status} (after retry): ${errBody}`)
        }
      } else if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API error ${response.status}: ${errBody}`)
      }

      const data = await response.json() as {
        stop_reason?: string
        content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>
      }
      if (data.stop_reason === 'max_tokens') {
        throw new Error('AI response truncated (max_tokens reached)')
      }
      const toolUseBlock = data.content?.find(b => b.type === 'tool_use')
      if (!toolUseBlock?.name || !toolUseBlock.input) {
        throw new Error('AI did not call any tools')
      }
      return { name: toolUseBlock.name, input: toolUseBlock.input }
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
    }
  }

  dispose(): void {
    if (this.ownsApplicator) this.toolApplicator.dispose()
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
  const numberedSnippet = snippet
    .split('\n')
    .map((line, i) => {
      const lineNum = startLine + i
      const marker = lineNum === request.line ? ' \u2190' : ''
      return `${lineNum}| ${line}${marker}`
    })
    .join('\n')

  const changesList = request.changes
    ? request.changes.map(c => `${c.property}: ${c.value}`).join(', ')
    : `${request.property}: ${request.value}`

  return `Set ${changesList} on the element at line ${request.line} (marked with \u2190).

Context: ${request.failureReason}

File: ${filename} (lines ${startLine}-${endLine})
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

/** Validate tool-applied output: parse check and no-op detection. */
export function validateResult(
  oldContent: string,
  newContent: string,
  filePath: string,
): { valid: true } | { valid: false; reason: string } {
  if (oldContent === newContent) {
    return { valid: false, reason: 'AI made no changes to the file' }
  }

  const ext = extname(filePath)
  if (/\.[jt]sx?$/.test(ext)) {
    try {
      parse(newContent, { sourceType: 'module', plugins: PARSE_PLUGINS })
    } catch (err) {
      return { valid: false, reason: `Tool-applied output has syntax errors: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  return { valid: true }
}
