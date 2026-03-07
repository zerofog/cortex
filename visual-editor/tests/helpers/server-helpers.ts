/**
 * Shared test helpers for server and integration tests.
 *
 * Extracted to eliminate ~75 lines of duplicated helpers per test file
 * and resolve behavioral divergences between the two copies.
 */
import { createServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { createApp, attachUpgradeHandler, type AppContext, type ServerOptions } from '../../src/server.js';

// ─── Types ──────────────────────────────────────────────────────

export interface MockTarget {
  server: Server;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

export interface TestSidecar {
  context: AppContext;
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

// ─── Factory functions ──────────────────────────────────────────

/**
 * Create a test sidecar server using createApp (no PID file, no process handlers).
 * Calls stateManager.dispose() on close — fixes M: "dispose missing from test cleanup".
 */
export function createTestSidecar(
  targetPort: number,
  extraOpts?: Partial<ServerOptions>,
): Promise<TestSidecar> {
  return new Promise((resolve) => {
    const context = createApp({ targetPort, port: 0, ...extraOpts });
    const server = createServer(context.app);
    attachUpgradeHandler(server, context);

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        context,
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => {
          context.stateManager.dispose();
          context.editorWss.close();
          server.close(() => r());
        }),
      });
    });
  });
}

// ─── WebSocket helpers ──────────────────────────────────────────

/** Wait for a WS message, optionally filtering by type. Always returns parsed object. */
export function waitForWsMessage(ws: WebSocket, type?: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onError);
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(type ? `WS message type '${type}' timeout` : 'WS message timeout'));
    }, timeoutMs);
    function onMsg(data: Buffer) {
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); } catch { return; }
      if (!type || (parsed as Record<string, unknown>).type === type) {
        cleanup();
        resolve(parsed as Record<string, unknown>);
      }
    }
    function onError(err: Error) { cleanup(); reject(err); }
    ws.on('message', onMsg);
    ws.once('error', onError);
  });
}

/** Create an editor WebSocket with the required Origin header. */
export function createEditorWs(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/__zerofog`, {
    headers: { Origin: `http://127.0.0.1:${port}` },
  });
}

/** Complete the auth handshake on an editor WS connection. */
export async function authenticateWs(ws: WebSocket, sessionId: string): Promise<void> {
  await waitForWsMessage(ws, 'hello');
  ws.send(JSON.stringify({ type: 'auth', sessionId }));
  const session = await waitForWsMessage(ws, 'session');
  if (!session.authenticated) throw new Error('Auth failed');
}

// ─── HTTP helpers ───────────────────────────────────────────────

/** GET from sidecar API. */
export function apiGet(sidecar: TestSidecar, path: string): Promise<Response> {
  return fetch(sidecar.url + `/__zerofog/api${path}`, {
    headers: { Host: `127.0.0.1:${sidecar.port}` },
  });
}

/** POST to sidecar API with session auth headers. Requires explicit sidecar param. */
export function apiPost(sidecar: TestSidecar, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    Host: `127.0.0.1:${sidecar.port}`,
    'X-Session-Id': sidecar.context.sessionId,
  };
  const init: RequestInit = { method: 'POST', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return fetch(sidecar.url + `/__zerofog/api${path}`, init);
}
