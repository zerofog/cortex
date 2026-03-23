# Cortex Agent Module: Embedded AI Chat

**Date:** 2026-03-23
**Status:** Design approved, pending spec review
**Predecessor:** `docs/superpowers/specs/2026-03-22-phase-7-ai-path-design.md`
**Scope:** Embedded Claude AI in the Cortex editor panel — users chat with Claude while visually editing, Claude responds in the panel thread and makes code changes directly.

---

## Problem

Phase 7 built MCP tools, comment UI, and annotation lifecycle assuming Claude Code would actively poll for pending annotations. But MCP is passive (client-initiated) — Claude Code never knows a comment arrived. The comment input works, the annotation is created, but no AI ever responds. The AI chat feature is architecturally broken.

## Solution

An agent module that calls the Anthropic API directly from the Vite server process. When the user types a comment in the panel, the Vite server passes it to the agent module, which calls Claude with element context + source files, streams the response back to the browser, and edits files directly. No MCP middleman for the primary chat experience.

---

## Architecture

```
Browser (Preact, Shadow DOM)
    |  Vite HMR custom events (existing transport)
    v
Vite Plugin (transport relay only)
    |  in-process function calls
    v
Agent Module (src/core/agent/)
    |  HTTP streaming
    v
Anthropic API

Persistence:
    .cortex/sessions/YYYY-MM-DD.md   -- conversation log + edit history
    ~/.cortex/config                  -- API key (0600 permissions)
```

### Separation of concerns

- **Vite plugin** (`src/adapters/vite.ts`): Injects editor, serves assets, relays messages. Does not know about Claude.
- **Agent module** (`src/core/agent/`): Plain Node.js module, no Vite dependency. Handles AI calls, file access, conversation state. Testable independently, reusable across frameworks.
- **Browser** (`src/browser/`): Renders chat UI, sends `chat` messages, displays streamed `chat-chunk` responses.

---

## Setup Flow

### Project setup (run by user or Claude Code)

```bash
npx cortex-editor install
```

Single command that:
1. Installs `cortex-editor` as a dev dependency
2. Adds `cortexEditor()` plugin to `vite.config.ts`
3. Writes `.mcp.json` for Claude Code integration

### API key setup (run by user only, in a regular terminal)

```bash
npx cortex-editor auth
```

- Reads key via hidden stdin (echo disabled, like `sudo` or `npm login`)
- Saves to `~/.cortex/config` with `0600` permissions (owner-read-only)
- Works across all projects (user-level, not project-level)
- Detects Claude Code session via environment variable and refuses to run inside it
- One-time setup per machine

### Key resolution chain

```
1. process.env.ANTHROPIC_API_KEY  (already in shell)
2. ~/.cortex/config               (set by cortex auth)
3. .env in project                (project-level fallback)
```

First match wins.

---

## User Experience

### Activation

`Cmd+Shift+E` toggles the editor. Toolbar appears, cursor enters selection mode.

### Direct CSS editing (no AI)

Click element -> panel opens -> change CSS values -> instant preview via CSS override -> source file updated via AST rewrite -> HMR applies.

### AI chat

User types in the input field at the bottom of the panel. One continuous conversation (not per-element threads).

```
+- Panel -----------------------------------+
| Card . CardGrid.tsx:22        ^ v eye X   |
| [CSS sections]                            |
| +- Chat ------------------------ Clear -+ |
| | You                          2:14 PM  | |
| | "Make spacing consistent"             | |
| |                                       | |
| | Claude                       2:14 PM  | |
| | Changed gap-2 -> gap-4               | |
| | CardGrid.tsx:15 checkmark             | |
| |                                       | |
| | You                          2:16 PM  | |
| | @Hero.tsx why is this gray?           | |
| |                                       | |
| | Claude              circle Thinking.. | |
| +---------------------------------------+ |
| [ Ask the AI agent...               RET ] |
+-------------------------------------------+
```

Selecting a different element continues the same conversation with updated element context. Claude sees what element the user is looking at.

### Without API key

The chat input area shows a static message:

```
Run `npx cortex-editor auth` in your terminal to enable AI chat
```

All non-AI features work: selection, CSS editing, live preview, source writing, activity log.

### @ references

`@Hero.tsx` in chat triggers autocomplete from Vite's module graph. Selected reference expands to include file contents in Claude's context.

### Clear chat

Button in chat header clears in-memory messages (fresh conversation). Session file retains full history.

---

## Agent Module Design

**Location:** `cortex-editor/src/core/agent/`

### Public interface

```typescript
interface AgentModule {
  chat(message: string, context: ElementContext): AsyncIterable<AgentChunk>
  startSession(projectRoot: string): void
  endSession(): void
  isAvailable(): boolean
}

type AgentChunk =
  | { type: 'text'; content: string }
  | { type: 'edit'; file: string; diff: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
```

### Internal modules

| File | Responsibility |
|------|---------------|
| `agent.ts` | Core class -- conversation history, Claude API calls, streaming, rate limiting, system prompt guardrails |
| `context-builder.ts` | Reads source files, builds structured prompt context, sanitizes untrusted element content |
| `file-access.ts` | Scoped read/write with path traversal prevention, deny patterns, write allowlist |
| `session-log.ts` | Append-only session file, daily rotation |
| `key-resolver.ts` | Lookup chain: env -> user config -> project .env. Key never serialized or logged |
| `prompts/system-v1.md` | Versioned system prompt |

### Claude's tools (exhaustive list -- no others exist)

| Tool | Scope |
|------|-------|
| `read_file` | Project root only. Deny: `.env*`, `.git/`, `*.key`, `*.pem`, `*.secret` |
| `edit_file` | Source files only: `.tsx`, `.jsx`, `.css`, `.vue`, `.svelte`, `.ts` |
| `list_files` | Project root only |

No shell access. No network access. No git operations. No package installs. These tools don't exist -- there is nothing to exploit.

### Conversation memory

In-memory array of messages, capped at ~50K token budget. Oldest messages dropped when exceeded. Session file retains full history for crash recovery and Claude Code handoff.

---

## Message Protocol

New types added to `BrowserToServer` / `ServerToBrowser` unions in `types.ts`:

```typescript
// Browser -> Server
| { type: 'chat'; text: string; elementSource: string; elementContext?: ElementContext }

// Server -> Browser
| { type: 'chat-chunk'; chunk: AgentChunk }
```

Vite plugin receives `chat`, calls `agent.chat()`, streams `chat-chunk` back via HMR. Minimal surface area.

---

## Browser Components

### New

| Component | Responsibility |
|-----------|---------------|
| `ChatPanel.tsx` | Scrollable message list, auto-scroll on new messages |
| `ChatMessage.tsx` | Single message -- text, streaming indicator, edit summary |

### Modified

| Component | Change |
|-----------|--------|
| `CommentInput.tsx` | Sends `{ type: 'chat' }` instead of `{ type: 'comment' }`. Spinner is brief send confirmation only (< 200ms), not 15s wait |
| `CortexApp.tsx` | New state: `chatMessages`, `chatStreaming`. Passes to ChatPanel |
| `Panel.tsx` | Renders ChatPanel between CSS sections and CommentInput |

### Data model

```typescript
interface ChatMessage {
  id: string
  from: 'user' | 'agent'
  text: string
  timestamp: number
  elementSource?: string
  edits?: FileEdit[]
  attachments?: Attachment[]  // V2 -- images, screenshots
}
```

Single conversation. Multi-thread (group by `elementSource`) is a future UI change with no data model changes.

---

## Security

### Trust boundary

The agent module is the trust boundary. Everything from the browser and user's app is untrusted input. Everything sent to Claude is sanitized. Everything sent back to the browser is sanitized.

### Threat model

| Vector | Risk | Mitigation |
|--------|------|-----------|
| Element text contains prompt injection | Medium | Structured JSON context with untrusted-data markers in system prompt. Text content truncated. Never mixed into prompt as prose |
| User tries off-topic requests | Low | System prompt constrains to visual editing scope. No tools for off-topic actions |
| Path traversal via file tools | High | `file-access.ts` resolves all paths, enforces project root boundary, deny patterns, write allowlist |
| API key exposure | Medium | Key never sent to browser, never logged, never serialized. `0600` file permissions. `auth` command refuses to run in Claude Code |
| Sensitive file content in Claude response | Medium | Response scanned before sending to browser. Sensitive patterns stripped |
| Cost runaway | Low | Rate limit: max 10 API calls/minute (configurable). Token budget on conversation history. Max response size |
| Malicious npm dependency injects DOM content | Medium | Only elements with `data-cortex-source` (from source transform) are visible to Cortex. Third-party elements invisible |

### Auth command security

`npx cortex-editor auth`:
- Hidden stdin input (echo disabled)
- Key displayed as `sk-ant-xxxxxxxxxxxx` (masked)
- Saved with `0600` permissions
- Detects `CLAUDE_CODE` env var, refuses to run inside Claude Code
- Key never appears in shell history (read from stdin, not command argument)

---

## Persistence & Crash Resilience

### Session file

**Location:** `.cortex/sessions/YYYY-MM-DD.md`
**Format:** Append-only Markdown, daily rotation, human-readable.

```markdown
# Cortex Session -- 2026-03-23

## 14:05 -- Direct edit
- Element: Button . Hero.tsx:14
- padding-top: 8px -> 16px

## 14:14 -- Chat
- Element: CardGrid . CardGrid.tsx:22
- **User:** Make the spacing between cards more consistent
- **Claude:** Changed gap-2 -> gap-4 in CardGrid.tsx:15
- Edit: `src/components/CardGrid.tsx:15` gap-2 -> gap-4

## 14:16 -- Chat (question only)
- Element: Heading . Hero.tsx:8
- **User:** Why is this gray?
- **Claude:** text-gray-500 inherited from globals.css base typography
- No edit
```

### Write strategy

1. User submits comment -> write user message to session file immediately (before API call)
2. Claude streams response -> hold in memory
3. Response complete -> append Claude's response to session file
4. File edit applied -> append edit record to session file

User input is never lost. Claude's response can only be lost if crash happens mid-stream.

### State across events

| Event | Chat state | Pins | Recovery |
|-------|-----------|------|----------|
| SPA navigation | Kept (Shadow DOM persists) | Show/hide per DOM | Automatic |
| Full page refresh | Reloads from session file | Reloads from session file | Automatic |
| Vite restart | Reloads from session file | Reloads from session file | Automatic |
| Mid-stream crash | User message saved, partial response lost | Unaffected | Re-send comment |
| Browser tab crash | Last complete interaction saved | Saved | Reopen tab |

---

## MCP Coexistence

Agent module and MCP server coexist with no configuration.

| | Agent Module | MCP Server |
|---|---|---|
| Used by | User via panel chat | Claude Code via terminal |
| Activates | Automatically on chat message | Claude Code calls tools |
| Session file | Writes to it | Reads from it |

### Scenario matrix

| Scenario | Panel chat | Claude Code | Notes |
|----------|-----------|-------------|-------|
| API key, no Claude Code | Works | N/A | Panel-only workflow |
| API key + Claude Code | Works | Works | Both independent. Session file bridges context |
| No API key, has Claude Code | Disabled (shows setup message) | Works via MCP | Claude Code can process annotations |
| Neither | Disabled | N/A | Direct CSS editing only |

### Handoff

User edits visually all morning. Session file accumulates history. User opens Claude Code: "Read `.cortex/sessions/2026-03-23.md` and clean up what I changed." Claude Code reads the session, understands full context, does proper refactoring.

---

## Evals

Test fixtures in `tests/core/agent/evals/`:

| Category | What it tests |
|----------|--------------|
| Edit correctness | Comment -> expected file change (e.g., "make this blue" -> `text-blue-500`) |
| No-edit correctness | Question -> conversational response, no file changes |
| Prompt injection resistance | Malicious element context -> safe, scoped response |
| Scope enforcement | Off-topic request -> polite decline, no action |
| File access boundaries | Path traversal attempts -> blocked by `file-access.ts` |

Run against recorded API responses locally (fast). Real API in CI (slow, periodic).

System prompt changes trigger the full eval suite. Regressions block the change.

---

## Performance

- **Claude API call:** 1-3s to start streaming, 3-8s for full response. Only latency that matters -- everything else is negligible.
- **Memory:** 100 messages ~ 30KB. Pins are tiny. Session file grows ~5KB/hour of active use. Daily rotation prevents unbounded growth.
- **Browser compute:** One scrollable text list in Shadow DOM. No re-renders from SPA navigation (Shadow DOM is outside app's React tree).
- **Vite impact:** Async HTTP call, same as any network I/O. Non-blocking. HMR, builds, and dev serving unaffected.
- **DOM queries for pins:** Single `querySelectorAll('[data-cortex-source]')` on navigation. Microseconds.

---

## What Changes for ZF0-913

The spinner behavior changes with this architecture:
- **Old:** Spinner waits 15s for `cortex_acknowledge` that never arrives
- **New:** Spinner is a brief send confirmation (< 200ms). Claude's "Thinking..." state appears in the chat thread, not the input field. Response streams directly into the thread.

---

## Future (V2, not in scope)

- Image uploads / attachments (screenshots, mockups)
- Auto-compaction with summarization (compress old messages before dropping)
- Multi-thread view (group messages by element -- same data model, different UI)
- Route-aware pin sidebar (pins across all pages)
- OAuth for seamless Max subscriber support (if Anthropic opens this to third parties)
