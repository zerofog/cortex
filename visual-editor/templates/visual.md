# Visual Editing — Session Protocol

> **Distributable template.** Copy this file into your project's `.claude/commands/visual.md`
> to enable the `/visual` slash command for Claude Code sessions.

## Overview

This command starts the cortex visual editor sidecar, monitors for design changes made
in the browser, claims diffs, applies source edits, and reports completion.

## 1. Start the Sidecar

```bash
npx cortex-visual-editor --target $PORT
```

Where `$PORT` is your dev server's port (e.g., 3000).

The sidecar prints:
```
[cortex] Visual editor running at http://localhost:3100
[cortex] Proxying target on port 3000
```

The `startServer()` function returns an `AppContext` containing the `sessionId`. Use it in the
`X-Session-Id` header for authenticated API calls.

## 2. Monitor for Diffs

Watch sidecar output for:
```
[cortex] Diff received (N changes)
```

This means the designer finalized changes in the browser. Proceed to claim the diff.

## 3. Inspect the Diff (Optional)

You can inspect the pending diff without claiming it (read-only, no state change):

```bash
curl -s http://localhost:3100/__zerofog/api/diff
```

Returns the `AccumulatedDiff` JSON if a diff is pending, or `404` if idle.

## 4. Claim the Diff

```bash
curl -s -X POST http://localhost:3100/__zerofog/api/claim \
  -H "X-Session-Id: $SESSION_ID"
```

Returns an `AccumulatedDiff` JSON object with a `claimToken`:
```json
{
  "version": 1,
  "sessionId": "...",
  "claimToken": "uuid-claim-token",
  "elements": [{
    "elementSelector": "[data-testid=\"btn-submit\"]",
    "componentChain": ["Button", "Form"],
    "elementType": "button",
    "changes": [{
      "property": "padding",
      "token": "md",
      "previousToken": "sm",
      "cssProperty": "padding",
      "cssValue": "16px",
      "styleOrigin": { "origin": "mantine-prop", "propName": "p" }
    }]
  }],
  "metadata": { "createdAt": "..." }
}
```

**Important:** Save the `claimToken` — you must include it when reporting completion.

**Selector field:** The `elementSelector` is computed client-side. When the client provides an explicit
`selector` in the finalize payload, it is used directly. Otherwise, the server falls back to
`[data-testid="..."]` or `"unknown"` if no testId is present.

## 5. Apply Source Edits

Group changes by component (using `componentChain`). Dispatch by `styleOrigin.origin`:

| Origin | Strategy |
|--------|----------|
| `mantine-prop` | Update the JSX prop (e.g., `p="sm"` → `p="md"`) |
| `tailwind` | Swap Tailwind class (e.g., `p-2` → `p-4`) |
| `css-module` | Edit the CSS module file for the component |
| `mantine-default` | Add explicit prop override to the component |
| `unknown` | Add inline style or className as appropriate |

Use `elementSelector` to locate the element, `componentChain` to find the source file.

## 6. Report Completion

```bash
curl -s -X POST http://localhost:3100/__zerofog/api/complete \
  -H "X-Session-Id: $SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"applied": [0], "failed": [], "claimToken": "$CLAIM_TOKEN"}'
```

- `applied`: array of element indices successfully edited
- `failed`: array of `{ index, reason }` for elements that couldn't be edited
- `claimToken`: the token from the `/claim` response (required)

The pipeline resets to idle, ready for the next design iteration.

## 7. Shutdown

When done editing:

```bash
curl -s -X POST http://localhost:3100/__zerofog/api/shutdown \
  -H "X-Session-Id: $SESSION_ID"
```

Returns `202` and gracefully stops the sidecar.

## Error Handling

| Status | Cause | Recovery |
|--------|-------|----------|
| `409` from `/claim` | Another consumer already claimed the diff | Wait for completion or timeout (~120s), then retry |
| `409` from `/complete` | Claim token mismatch (expired or wrong token) | Re-claim the diff to get a fresh token |
| `400` from `/complete` | Missing `claimToken` or invalid report body | Check request includes `claimToken` and valid `applied`/`failed` arrays |
| `502` from proxy | Target dev server unreachable | Ensure your dev server is running on the `--target` port |

**Claim timeout:** If you don't call `/complete` within 120 seconds of `/claim`, the claim expires
and the pipeline reverts to `pending_diff`. Re-claim to get a new token.

## API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/__zerofog/api/health` | GET | No | Health check |
| `/__zerofog/api/status` | GET | No | Pipeline state + uptime |
| `/__zerofog/api/diff` | GET | No | Read-only: current diff or 404 |
| `/__zerofog/api/claim` | POST | Session | Claim pending diff |
| `/__zerofog/api/complete` | POST | Session | Report edit results |
| `/__zerofog/api/shutdown` | POST | Session | Graceful shutdown |

**Auth:** Mutating endpoints require `X-Session-Id` header matching the session UUID.
