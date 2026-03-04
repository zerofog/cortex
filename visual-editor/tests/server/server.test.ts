import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp, attachUpgradeHandler, startServer, checkPidFile, type AppContext } from '../../src/server.js';

// ─── Test helpers ────────────────────────────────────────────────

interface MockTarget {
  server: Server;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

function createMockTarget(): Promise<MockTarget> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('data: hello\n\n');
        setTimeout(() => res.end(), 100);
        return;
      }
      if (req.url === '/no-csp') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><p>no csp app</p></body></html>');
        return;
      }
      // Default: serve HTML with CSP and X-Frame-Options
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
        'X-Frame-Options': 'DENY',
      });
      res.end('<html><body><p>target app</p></body></html>');
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(`echo:${data.toString()}`));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        wss,
        port,
        close: () => new Promise<void>((r) => {
          wss.close();
          server.close(() => r());
        }),
      });
    });
  });
}

interface TestSidecar {
  context: AppContext;
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

function createTestSidecar(targetPort: number): Promise<TestSidecar> {
  return new Promise((resolve) => {
    const context = createApp({ targetPort, port: 0 });
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
          context.editorWss.close();
          server.close(() => r());
        }),
      });
    });
  });
}

/** Wait for a WS message, optionally filtering by type. Skips non-matching messages. */
function waitForWsMessage(ws: WebSocket, type?: string, timeoutMs = 3000): Promise<any> {
  return new Promise<any>((resolve, reject) => {
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
      let parsed: any;
      try { parsed = JSON.parse(data.toString()); } catch { return; }
      if (!type || parsed.type === type) {
        cleanup();
        resolve(type ? parsed : data.toString());
      }
    }
    function onError(err: Error) { cleanup(); reject(err); }
    ws.on('message', onMsg);
    ws.once('error', onError);
  });
}

/** Create an editor WebSocket with the required Origin header. */
function createEditorWs(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/__zerofog`, {
    headers: { Origin: `http://127.0.0.1:${port}` },
  });
}

/** POST to sidecar API with session auth headers. */
function apiPost(path: string, body?: unknown): Promise<Response> {
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

/** Complete the auth handshake on an editor WS connection. */
async function authenticateWs(ws: WebSocket, sessionId: string): Promise<void> {
  const hello = await waitForWsMessage(ws);
  const parsed = JSON.parse(hello);
  if (parsed.type !== 'hello') throw new Error(`Expected hello, got ${parsed.type}`);

  ws.send(JSON.stringify({ type: 'auth', sessionId }));

  const session = await waitForWsMessage(ws);
  const sessionMsg = JSON.parse(session);
  if (sessionMsg.type !== 'session' || !sessionMsg.authenticated) {
    throw new Error(`Auth failed: ${JSON.stringify(sessionMsg)}`);
  }
}

// ─── Tests ───────────────────────────────────────────────────────

let target: MockTarget;
let sidecar: TestSidecar;

beforeAll(async () => {
  target = await createMockTarget();
  sidecar = await createTestSidecar(target.port);
});

afterAll(async () => {
  await sidecar.close();
  await target.close();
});

describe('proxy', () => {
  it('proxies HTML from target and injects scripts', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<p>target app</p>');
    expect(html).toContain('__zerofog_injected__');
    expect(html).toContain('inspector.js');
  });

  it('rewrites CSP on HTML responses: adds self to script-src, removes frame-ancestors', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("'self'");
    expect(csp).not.toContain('frame-ancestors');
    expect(res.headers.get('x-frame-options')).toBeNull();
  });

  it('does not add CSP when target has none', async () => {
    const res = await fetch(sidecar.url + '/no-csp', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('passes SSE responses through without buffering', async () => {
    const res = await fetch(sidecar.url + '/events', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('data: hello');
    expect(body).not.toContain('__zerofog_injected__');
  });

  it('passes non-HTML responses through without injection', async () => {
    const res = await fetch(sidecar.url + '/api/data', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});

describe('Sec-Fetch-Dest redirect', () => {
  it('redirects document requests to shell', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/__zerofog/shell');
  });

  it('does not redirect iframe requests', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'iframe',
      },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<p>target app</p>');
  });
});

describe('API', () => {
  it('GET /health returns 200', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/health', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('GET /status returns uptime without sessionId', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/status', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBeUndefined();
    expect(typeof data.uptime).toBe('number');
    expect(data.targetPort).toBe(target.port);
  });

  it('POST /claim returns 409 when idle (no pending diff)', async () => {
    const res = await apiPost('/claim');
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('conflict');
  });

  it('POST /shutdown triggers callback', async () => {
    let shutdownCalled = false;
    sidecar.context.setShutdownHandler(() => { shutdownCalled = true; });

    const res = await fetch(sidecar.url + '/__zerofog/api/shutdown', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'X-Session-Id': sidecar.context.sessionId,
      },
    });
    expect(res.status).toBe(202);
    expect(shutdownCalled).toBe(true);
  });
});

describe('host validation', () => {
  it('rejects requests with invalid Host header', async () => {
    // fetch() overrides the Host header, so use raw http.request
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({
        hostname: '127.0.0.1',
        port: sidecar.port,
        path: '/__zerofog/api/health',
        headers: { Host: 'evil.com' },
      }, (res) => resolve(res.statusCode ?? 0));
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});

describe('shell', () => {
  it('serves shell.html with iframe, panel-mount, and deep-link script', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/shell', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('panel-mount');
    expect(html).toContain('shell-viewport');
    expect(html).toContain('URLSearchParams');
    expect(html).toContain("params.get('path')");
  });

  it('iframe has sandbox attribute with required permissions', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/shell', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const html = await res.text();
    expect(html).toContain('sandbox="allow-same-origin allow-scripts');
    expect(html).toMatch(/sandbox="[^"]*allow-downloads[^"]*"/);
    expect(html).toMatch(/sandbox="[^"]*allow-top-navigation-by-user-activation[^"]*"/);
  });

  it('validates path param to prevent javascript: and protocol-relative injection', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/shell', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const html = await res.text();
    expect(html).toContain("if (!path.startsWith('/') || path.startsWith('//')) path = '/';");
  });
});

describe('session auth', () => {
  it('rejects POST without X-Session-Id header', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/shutdown', {
      method: 'POST',
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('X-Session-Id');
  });

  it('rejects POST with wrong X-Session-Id', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/shutdown', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'X-Session-Id': 'wrong-session-id',
      },
    });
    expect(res.status).toBe(403);
  });

  it('allows GET endpoints without X-Session-Id', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/health', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
  });

  it('POST /complete returns 409 when idle', async () => {
    const res = await apiPost('/complete', { applied: [], failed: [] });
    expect(res.status).toBe(409);
  });
});

describe('deep-link preservation', () => {
  it('passes path as query param for non-root requests', async () => {
    const res = await fetch(sidecar.url + '/dashboard/settings', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/__zerofog/shell?path=%2Fdashboard%2Fsettings'
    );
  });

  it('does not add path param for root requests', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/__zerofog/shell');
  });

  it('preserves query string in redirect path param', async () => {
    const res = await fetch(sidecar.url + '/dashboard?tab=settings', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('path=');
    // Decode the path param and verify it contains the query string
    const url = new URL(location, sidecar.url);
    const pathParam = url.searchParams.get('path')!;
    expect(pathParam).toContain('/dashboard');
    expect(pathParam).toContain('tab=settings');
  });

  it('does not redirect /__zerofog paths (no redirect loop)', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/shell', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
    });
    expect(res.status).toBe(200);
  });
});

describe('client script serving', () => {
  it('rejects path traversal attempts', async () => {
    const res = await fetch(
      sidecar.url + '/__zerofog/client/..%2F..%2Fetc%2Fpasswd',
      { headers: { Host: `127.0.0.1:${sidecar.port}` } },
    );
    expect(res.status).toBe(400);
  });
});

describe('WebSocket', () => {
  it('editor WS sends hello without sessionId on connect', async () => {
    const ws = createEditorWs(sidecar.port);
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 3000);
    });
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('hello');
    expect(parsed.sessionId).toBeUndefined();
    ws.close();
  });

  it('editor WS authenticates and echoes ack for messages', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    // Send a message and expect ack
    ws.send(JSON.stringify({ id: 'test-123', type: 'ping' }));
    const ack = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('WS ack timeout')), 3000);
    });
    const parsed = JSON.parse(ack);
    expect(parsed.type).toBe('ack');
    expect(parsed.id).toBe('test-123');
    ws.close();
  });

  it('non-editor WS paths are proxied to target', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${sidecar.port}/ws`, {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS open timeout')), 3000);
    });
    ws.send('hello');
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('WS echo timeout')), 3000);
    });
    expect(msg).toBe('echo:hello');
    ws.close();
  });

  it('survives non-JSON messages after auth and still processes valid ones', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    // Send non-JSON — should be silently ignored after auth
    ws.send('not json at all');
    // Then send valid JSON (must include id post-validation)
    ws.send(JSON.stringify({ id: 'after-garbage', type: 'ping' }));
    const ack = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('WS ack timeout')), 3000);
    });
    const parsed = JSON.parse(ack);
    expect(parsed.type).toBe('ack');
    expect(parsed.id).toBe('after-garbage');
    ws.close();
  });

  it('rejects WS upgrade with invalid Host header', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${sidecar.port}/__zerofog`, {
      headers: { Host: 'evil.com' },
    });
    const result = await new Promise<string>((resolve) => {
      ws.on('error', (err) => resolve(err.message));
      ws.on('close', () => resolve('closed'));
      setTimeout(() => resolve('timeout'), 3000);
    });
    expect(result).not.toBe('timeout');
  });

  it('rejects connection with wrong sessionId', async () => {
    const ws = createEditorWs(sidecar.port);
    // Wait for hello
    await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 3000);
    });
    // Send wrong sessionId
    ws.send(JSON.stringify({ type: 'auth', sessionId: 'wrong-id' }));
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      setTimeout(() => resolve(0), 3000);
    });
    expect(closeCode).toBe(4001);
  });

  it('rejects messages with non-string type', async () => {
    const ws = createEditorWs(sidecar.port);
    // Wait for hello
    await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 3000);
    });
    // Send message with non-string type (invalid schema)
    ws.send(JSON.stringify({ type: 123 }));
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      setTimeout(() => resolve(0), 3000);
    });
    expect(closeCode).toBe(4001);
  });

  it('rejects messages without id after auth', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('WS error timeout')), 3000);
    });
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('error');
    expect(parsed.message).toBe('missing message id');
    ws.close();
  });

  it('rejects messages with non-string id after auth', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(JSON.stringify({ type: 'ping', id: 123 }));
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('WS error timeout')), 3000);
    });
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('error');
    expect(parsed.message).toBe('invalid message schema');
    ws.close();
  });

  it('rejects non-auth messages before authentication', async () => {
    const ws = createEditorWs(sidecar.port);
    // Wait for hello
    await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 3000);
    });
    // Send a non-auth message before authenticating
    ws.send(JSON.stringify({ type: 'ping', id: 'test' }));
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      setTimeout(() => resolve(0), 3000);
    });
    expect(closeCode).toBe(4001);
  });
});

describe('WS upgrade security', () => {
  it('rejects /__zerofog WS without Origin header', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${sidecar.port}/__zerofog`);
    const result = await new Promise<string>((resolve) => {
      ws.on('error', (err) => resolve(err.message));
      ws.on('close', () => resolve('closed'));
      setTimeout(() => resolve('timeout'), 3000);
    });
    expect(result).not.toBe('timeout');
  });

  it('rejects WS upgrade with invalid Origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${sidecar.port}/__zerofog`, {
      headers: { Origin: 'https://evil.com' },
    });
    const error = await new Promise<string>((resolve) => {
      ws.on('error', (err) => resolve(err.message));
      ws.on('close', () => resolve('closed'));
      setTimeout(() => resolve('timeout'), 3000);
    });
    expect(error).not.toBe('timeout');
  });
});

describe('proxy error handling', () => {
  it('returns ECONNREFUSED page when target is down', async () => {
    // Point sidecar at a dead port
    const deadSidecar = await createTestSidecar(59999);
    try {
      const res = await fetch(deadSidecar.url + '/', {
        headers: { Host: `127.0.0.1:${deadSidecar.port}` },
      });
      expect(res.status).toBe(502);
      const html = await res.text();
      expect(html).toContain('Dev server restarting');
      expect(html).toContain('location.reload()');
    } finally {
      await deadSidecar.close();
    }
  });
});

describe('injection safety valve', () => {
  it('skips injection for responses exceeding 5MB', async () => {
    // Create a mock target that serves >5MB HTML
    const bigTarget = await new Promise<MockTarget>((resolve) => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const padding = 'x'.repeat(6 * 1024 * 1024); // 6MB
        res.end(`<html><body>${padding}</body></html>`);
      });
      const wss = new WebSocketServer({ server });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({
          server, wss, port,
          close: () => new Promise<void>((r) => { wss.close(); server.close(() => r()); }),
        });
      });
    });

    const bigSidecar = await createTestSidecar(bigTarget.port);
    try {
      const res = await fetch(bigSidecar.url + '/', {
        headers: { Host: `127.0.0.1:${bigSidecar.port}` },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain('__zerofog_injected__');
    } finally {
      await bigSidecar.close();
      await bigTarget.close();
    }
  }, 10000);
});

// ─── startServer lifecycle ──────────────────────────────────────

describe('startServer lifecycle', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-test-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('creates PID file on startup and removes on close', async () => {
    const pidPath = join(tmpDir, '.cortex', 'sidecar.pid');
    const ctx = await startServer({ targetPort: 59999, port: 0 });
    expect(existsSync(pidPath)).toBe(true);
    await ctx.close();
    expect(existsSync(pidPath)).toBe(false);
  });

  it('double close is idempotent', async () => {
    const ctx = await startServer({ targetPort: 59999, port: 0 });
    await ctx.close();
    // Second close should resolve immediately without error
    await ctx.close();
  });

  it('detects stale PID and overwrites', async () => {
    const pidDir = join(tmpDir, '.cortex');
    const pidPath = join(pidDir, 'sidecar.pid');
    // Write a stale PID (non-existent process)
    const { mkdirSync } = await import('node:fs');
    mkdirSync(pidDir, { recursive: true });
    writeFileSync(pidPath, '999999999');

    // Should start successfully despite stale PID
    const ctx = await startServer({ targetPort: 59999, port: 0 });
    expect(existsSync(pidPath)).toBe(true);
    await ctx.close();
  });

  it('throws if another instance is alive', async () => {
    const first = await startServer({ targetPort: 59999, port: 0 });
    try {
      await expect(startServer({ targetPort: 59999, port: 0 }))
        .rejects.toThrow('Another sidecar is already running');
    } finally {
      await first.close();
    }
  });

  it('server responds to health check', async () => {
    const ctx = await startServer({ targetPort: 59999, port: 0, host: '127.0.0.1' });
    try {
      const addr = ctx.server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/__zerofog/api/health`, {
        headers: { Host: `127.0.0.1:${port}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ok' });
    } finally {
      await ctx.close();
    }
  });
});

// ─── checkPidFile unit tests ────────────────────────────────────

describe('checkPidFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-pid-'));
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('returns none when file does not exist', () => {
    expect(checkPidFile(join(tmpDir, 'nonexistent.pid'))).toBe('none');
  });

  it('returns stale for invalid PID content', () => {
    const pidPath = join(tmpDir, 'bad.pid');
    writeFileSync(pidPath, 'not-a-number');
    expect(checkPidFile(pidPath)).toBe('stale');
  });

  it('returns stale for non-existent PID', () => {
    const pidPath = join(tmpDir, 'gone.pid');
    writeFileSync(pidPath, '999999999');
    expect(checkPidFile(pidPath)).toBe('stale');
  });

  it('returns alive for current process PID', () => {
    const pidPath = join(tmpDir, 'self.pid');
    writeFileSync(pidPath, String(process.pid));
    expect(checkPidFile(pidPath)).toBe('alive');
  });
});

// ─── Finalize pipeline integration ──────────────────────────────

describe('finalize pipeline', () => {
  const makeFinalize = (id = 'fin-1') => JSON.stringify({
    type: 'finalize',
    id,
    payload: {
      elementId: 1,
      testId: 'btn-submit',
      componentChain: ['Button', 'Form'],
      elementType: 'button',
      changes: [{
        property: 'padding',
        token: 'md',
        previousToken: 'sm',
        previousCssValue: '8px',
        cssProperty: 'padding',
        cssValue: '16px',
        styleOrigin: { origin: 'unknown' },
      }],
    },
  });

  // C2: Force-reset state machine after each pipeline test to prevent cascading failures
  afterEach(() => {
    const sm = sidecar.context.stateManager;
    const state = sm.getState();
    if (state === 'pending_diff') {
      sm.claimDiff();
      sm.complete({ applied: [], failed: [] });
    } else if (state === 'processing') {
      sm.complete({ applied: [], failed: [] });
    }
  });

  it('WS finalize returns finalize-result with changeCount', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    const msg = await waitForWsMessage(ws);
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('finalize-result');
    expect(parsed.ok).toBe(true);
    expect(parsed.changeCount).toBe(1);
    ws.close();
  });

  it('POST /api/claim after finalize returns AccumulatedDiff', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws); // consume finalize-result

    const res = await apiPost('/claim');
    expect(res.status).toBe(200);
    const diff = await res.json();
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);
    expect(diff.elements[0].elementSelector).toBe('[data-testid="btn-submit"]');
    ws.close();
  });

  it('POST /api/complete after claim returns 200 and resets to idle', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws);

    await apiPost('/claim');

    const res = await apiPost('/complete', { applied: [0], failed: [] });
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.applied).toEqual([0]);

    // Verify state is idle -- POST /claim should return 409
    const check = await apiPost('/claim');
    expect(check.status).toBe(409);
    ws.close();
  });

  it('WS finalize rejected when processing (conflict)', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    // First finalize + claim
    ws.send(makeFinalize('fin-first'));
    await waitForWsMessage(ws);
    await apiPost('/claim');

    // Second finalize should be rejected (state is processing)
    ws.send(makeFinalize('fin-second'));
    const msg = await waitForWsMessage(ws);
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('finalize-result');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('conflict');
    ws.close();
  });

  it('POST /api/complete sends edit-complete to connected WS clients', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    // Finalize + claim
    ws.send(makeFinalize());
    await waitForWsMessage(ws);
    await apiPost('/claim');

    // Set up typed WS listener BEFORE the HTTP call to avoid race condition
    const broadcastPromise = waitForWsMessage(ws, 'edit-complete');

    // Complete -- should broadcast edit-complete to WS
    await apiPost('/complete', { applied: [0], failed: [] });

    const parsed = await broadcastPromise;
    expect(parsed.type).toBe('edit-complete');
    expect(parsed.payload.applied).toEqual([0]);
    ws.close();
  });

  it('GET /status includes pipelineState', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/status', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const data = await res.json();
    expect(data.pipelineState).toBe('idle');
  });

  // M14: POST /claim auth test — middleware now gates it as a POST endpoint
  it('POST /claim without X-Session-Id returns 403', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/claim', {
      method: 'POST',
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(403);
  });

  // H7: Multi-client broadcast test
  it('edit-complete broadcasts to multiple WS clients', async () => {
    // Authenticate each client immediately after creation to avoid losing
    // the 'hello' message while the other client authenticates.
    const ws1 = createEditorWs(sidecar.port);
    await authenticateWs(ws1, sidecar.context.sessionId);
    const ws2 = createEditorWs(sidecar.port);
    await authenticateWs(ws2, sidecar.context.sessionId);

    // Finalize via ws1
    ws1.send(makeFinalize());
    await waitForWsMessage(ws1); // consume finalize-result

    await apiPost('/claim');

    // Set up listeners on both clients BEFORE complete
    const broadcast1 = waitForWsMessage(ws1, 'edit-complete');
    const broadcast2 = waitForWsMessage(ws2, 'edit-complete');

    await apiPost('/complete', { applied: [0], failed: [] });

    const [msg1, msg2] = await Promise.all([broadcast1, broadcast2]);
    expect(msg1.type).toBe('edit-complete');
    expect(msg2.type).toBe('edit-complete');
    ws1.close();
    ws2.close();
  });

  // M11: Sequential finalize cycle test
  it('supports 3 sequential finalize -> claim -> complete cycles', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    for (let i = 0; i < 3; i++) {
      ws.send(makeFinalize(`cycle-${i}`));
      const result = await waitForWsMessage(ws, 'finalize-result');
      expect(result.ok).toBe(true);

      await apiPost('/claim');
      await apiPost('/complete', { applied: [i], failed: [] });
    }

    // Verify final state is idle
    const status = await fetch(sidecar.url + '/__zerofog/api/status', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const data = await status.json();
    expect(data.pipelineState).toBe('idle');
    ws.close();
  });

  // M13: WAL recovery integration test
  it('recovers from WAL and completes full cycle', async () => {
    // Create a fresh sidecar with a writable WAL directory
    const walDir = mkdtempSync(join(tmpdir(), 'cortex-wal-'));
    const walPath = join(walDir, 'pending-diff.json');

    // Write a WAL file manually
    writeFileSync(walPath, JSON.stringify({
      version: 1,
      sessionId: 'old-session',
      elements: [{
        elementSelector: '[data-testid="recovered"]',
        componentChain: ['RecoveredComponent'],
        elementType: 'div',
        changes: [],
      }],
      metadata: { createdAt: new Date().toISOString() },
    }));

    // Create a StateManager that will discover the WAL
    const { StateManager } = await import('../../src/state.js');
    const sm = new StateManager({ sessionId: 'new-session', walDir });
    sm.recover();

    expect(sm.getState()).toBe('pending_diff');
    expect(sm.getDiff()!.sessionId).toBe('new-session');

    // Full cycle on recovered diff
    const claimed = sm.claimDiff();
    expect(claimed.elements[0]!.elementSelector).toBe('[data-testid="recovered"]');

    const report = sm.complete({ applied: [0], failed: [] });
    expect(report.applied).toEqual([0]);
    expect(sm.getState()).toBe('idle');

    sm.dispose();
    try { rmSync(walDir, { recursive: true }); } catch { /* ignore */ }
  });

  // WS finalize with invalid payload returns error
  it('WS finalize with invalid payload returns error', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    // Send finalize with string elementId (should fail validation)
    ws.send(JSON.stringify({
      type: 'finalize',
      id: 'bad-fin',
      payload: {
        elementId: 'not-a-number',
        testId: 'btn',
        componentChain: ['A'],
        elementType: 'button',
        changes: [],
      },
    }));

    const result = await waitForWsMessage(ws, 'finalize-result');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid payload');
    ws.close();
  });
});
