import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { startServer, checkPidFile, rewriteCsp } from '../../src/server.js';
import {
  createTestSidecar,
  createEditorWs,
  waitForWsMessage,
  authenticateWs,
  apiPost,
  type MockTarget,
  type TestSidecar,
} from '../helpers/server-helpers.js';

// ─── Local mock target (server tests need multiple routes) ──────

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

  it('rewrites CSP on HTML responses: adds self + nonce to script-src, removes frame-ancestors', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("'self'");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain('frame-ancestors');
    expect(res.headers.get('x-frame-options')).toBeNull();
  });

  it('injected script nonce matches CSP nonce', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const csp = res.headers.get('content-security-policy')!;
    const html = await res.text();
    // Extract nonce from CSP
    const cspNonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    expect(cspNonce).toBeTruthy();
    // Verify injected scripts have that nonce
    expect(html).toContain(`nonce="${cspNonce}"`);
    expect(html).toContain(`nonce="${cspNonce}" src="/__zerofog/client/nav-blocker.js"`);
    expect(html).toContain(`nonce="${cspNonce}" src="/__zerofog/client/inspector.js"`);
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
    expect(data).toMatchObject({ status: 'ok' });
    expect(data).toHaveProperty('targetReachable');
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
    const res = await apiPost(sidecar, '/claim');
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('conflict');
  });

  // H9: GET /diff endpoint
  it('GET /diff returns 404 when idle', async () => {
    const res = await fetch(sidecar.url + '/__zerofog/api/diff', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('No pending diff');
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

  it('POST /complete without claimToken returns 400', async () => {
    const res = await apiPost(sidecar, '/complete', { applied: [], failed: [] });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing claimToken');
  });

  it('POST /complete with wrong claimToken returns 403 (not 409) for token mismatch', async () => {
    // First, get into processing state
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(JSON.stringify({
      type: 'finalize', id: 'auth-test',
      payload: {
        elementId: 1, testId: 'btn', componentChain: ['A'], elementType: 'button',
        changes: [{ property: 'padding', token: 'md', previousToken: 'sm', previousCssValue: '8px', cssProperty: 'padding', cssValue: '16px', styleOrigin: { origin: 'unknown' } }],
      },
    }));
    await waitForWsMessage(ws, 'finalize-result');
    await apiPost(sidecar, '/claim');
    // Complete with wrong token — should be 403 (auth failure), not 409 (state conflict)
    const res = await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken: 'wrong-token' });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('forbidden');
    ws.close();
    // Clean up: reset state machine so subsequent tests see idle state
    sidecar.context.stateManager.dispose();
  });

  it('POST /complete with claimToken returns 409 when idle', async () => {
    const res = await apiPost(sidecar, '/complete', { applied: [], failed: [], claimToken: 'fake' });
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

  it('server sends heartbeat pings to connected clients', async () => {
    // Create a sidecar with a short heartbeat interval for testing
    const hbSidecar = await createTestSidecar(target.port, { heartbeatIntervalMs: 200 });
    try {
      const ws = createEditorWs(hbSidecar.port);
      await authenticateWs(ws, hbSidecar.context.sessionId);
      const pingReceived = await new Promise<boolean>((resolve) => {
        ws.on('ping', () => resolve(true));
        setTimeout(() => resolve(false), 2000);
      });
      expect(pingReceived).toBe(true);
      ws.close();
    } finally {
      await hbSidecar.close();
    }
  }, 5000);

  it('terminates dead connections that do not respond to pings', async () => {
    const hbSidecar = await createTestSidecar(target.port, { heartbeatIntervalMs: 100 });
    try {
      // Connect raw TCP socket to perform WS upgrade but never send pong
      const net = await import('node:net');
      const crypto = await import('node:crypto');
      const key = crypto.randomBytes(16).toString('base64');
      const sock = net.createConnection(hbSidecar.port, '127.0.0.1');

      // Perform HTTP upgrade handshake manually
      await new Promise<void>((resolve) => {
        sock.once('connect', () => {
          sock.write(
            `GET /__zerofog HTTP/1.1\r\nHost: 127.0.0.1:${hbSidecar.port}\r\n` +
            `Origin: http://127.0.0.1:${hbSidecar.port}\r\n` +
            `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
          );
          sock.once('data', () => resolve()); // 101 Switching Protocols
        });
      });

      // Socket is now a WS connection but will never respond to pings
      // Wait for server to terminate us (after 2 heartbeat intervals = ~200ms)
      const closed = await new Promise<boolean>((resolve) => {
        sock.on('close', () => resolve(true));
        setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
      });
      expect(closed).toBe(true);
    } finally {
      await hbSidecar.close();
    }
  }, 5000);

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

  // H2: PID file cleaned up on listen failure (EADDRINUSE)
  it('cleans up PID file when listen fails with EADDRINUSE', async () => {
    const pidPath = join(tmpDir, '.cortex', 'sidecar.pid');
    // Occupy a port with a plain HTTP server (not a sidecar, so no PID conflict)
    const blocker = createServer();
    const blockerPort = await new Promise<number>((resolve) => {
      blocker.listen(0, '127.0.0.1', () => {
        const addr = blocker.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    try {
      // startServer will write PID file, then fail on listen
      await expect(startServer({ targetPort: 59999, port: blockerPort, host: '127.0.0.1' }))
        .rejects.toThrow(/already in use/);
      // H2: PID file should be cleaned up after listen failure
      expect(existsSync(pidPath)).toBe(false);
    } finally {
      blocker.close();
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
      expect(data).toMatchObject({ status: 'ok' });
      expect(data).toHaveProperty('targetReachable');
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

  // C2: Force-reset state machine after each pipeline test to prevent cascading failures.
  // Uses dispose() which resets all state including the C1 idempotency hash.
  afterEach(() => {
    const sm = sidecar.context.stateManager;
    if (sm.getState() !== 'idle') {
      sm.dispose();
    }
  });

  it('WS finalize returns finalize-result with changeCount', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    const parsed = await waitForWsMessage(ws, 'finalize-result');
    expect(parsed.ok).toBe(true);
    expect(parsed.changeCount).toBe(1);
    ws.close();
  });

  it('POST /api/claim after finalize returns AccumulatedDiff with claimToken', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws, 'finalize-result'); // consume

    const res = await apiPost(sidecar, '/claim');
    expect(res.status).toBe(200);
    const diff = await res.json();
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);
    expect(diff.elements[0].elementSelector).toBe('[data-testid="btn-submit"]');
    expect(typeof diff.claimToken).toBe('string');
    expect(diff.claimToken.length).toBeGreaterThan(0);
    ws.close();
  });

  it('POST /api/complete after claim returns 200 and resets to idle', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws, 'finalize-result');

    const claimRes = await apiPost(sidecar, '/claim');
    const { claimToken } = await claimRes.json();

    const res = await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken });
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.applied).toEqual([0]);

    // Verify state is idle -- POST /claim should return 409
    const check = await apiPost(sidecar, '/claim');
    expect(check.status).toBe(409);
    ws.close();
  });

  it('WS finalize rejected when processing (conflict)', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    // First finalize + claim (token captured for afterEach cleanup)
    ws.send(makeFinalize('fin-first'));
    await waitForWsMessage(ws, 'finalize-result');
    const claimRes = await apiPost(sidecar, '/claim');
    void claimRes.json(); // consume body

    // Second finalize should be rejected (state is processing)
    ws.send(makeFinalize('fin-second'));
    const parsed = await waitForWsMessage(ws, 'finalize-result');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('conflict');
    ws.close();
  });

  it('POST /api/complete sends edit-complete to connected WS clients', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);

    // Finalize + claim
    ws.send(makeFinalize());
    await waitForWsMessage(ws, 'finalize-result');
    const claimRes = await apiPost(sidecar, '/claim');
    const { claimToken } = await claimRes.json();

    // Set up typed WS listener BEFORE the HTTP call to avoid race condition
    const broadcastPromise = waitForWsMessage(ws, 'edit-complete');

    // Complete -- should broadcast edit-complete to WS
    await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken });

    const parsed = await broadcastPromise;
    expect(parsed.type).toBe('edit-complete');
    expect(parsed.payload.applied).toEqual([0]);
    ws.close();
  });

  // H9: GET /diff returns diff without claiming
  it('GET /diff returns pending diff without advancing state', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws, 'finalize-result');

    // GET /diff should return the diff
    const res = await fetch(sidecar.url + '/__zerofog/api/diff', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const diff = await res.json();
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);
    expect(diff.elements[0].elementSelector).toBe('[data-testid="btn-submit"]');

    // State should still be pending_diff (not processing)
    const statusRes = await fetch(sidecar.url + '/__zerofog/api/status', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    const status = await statusRes.json();
    expect(status.pipelineState).toBe('pending_diff');
    ws.close();
  });

  // Phase 6: GET /diff still returns diff during processing state
  it('GET /diff returns diff during processing state (after claim)', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(makeFinalize());
    await waitForWsMessage(ws, 'finalize-result');

    // Claim to enter processing state
    await apiPost(sidecar, '/claim');

    // GET /diff should still return the diff
    const res = await fetch(sidecar.url + '/__zerofog/api/diff', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const diff = await res.json();
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);
    ws.close();
  });

  // C5-server: selector field test
  it('WS finalize with selector uses it as elementSelector', async () => {
    const ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    ws.send(JSON.stringify({
      type: 'finalize',
      id: 'sel-1',
      payload: {
        elementId: 1,
        testId: 'btn-submit',
        selector: 'div.card > button:nth-child(2)',
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
    }));
    await waitForWsMessage(ws, 'finalize-result');

    // Claim and check the selector
    const claimRes = await apiPost(sidecar, '/claim');
    const diff = await claimRes.json();
    expect(diff.elements[0].elementSelector).toBe('div.card > button:nth-child(2)');
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

    const claimRes = await apiPost(sidecar, '/claim');
    const { claimToken } = await claimRes.json();

    // Set up listeners on both clients BEFORE complete
    const broadcast1 = waitForWsMessage(ws1, 'edit-complete');
    const broadcast2 = waitForWsMessage(ws2, 'edit-complete');

    await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken });

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

      const claimRes = await apiPost(sidecar, '/claim');
      const { claimToken } = await claimRes.json();
      await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken });
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
    const { diff: claimed, claimToken } = sm.claimDiff();
    expect(claimed.elements[0]!.elementSelector).toBe('[data-testid="recovered"]');

    const report = sm.complete({ applied: [0], failed: [] }, claimToken);
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

// ─── H3: rewriteCsp unit tests ───────────────────────────────────────

describe('rewriteCsp', () => {
  const nonce = 'test-nonce-123';

  it('adds nonce and self to script-src', () => {
    const result = rewriteCsp("script-src 'self'; default-src 'self'", nonce);
    expect(result).toContain(`'nonce-${nonce}'`);
    expect(result).toContain("'self'");
  });

  it('strips frame-ancestors', () => {
    const result = rewriteCsp("default-src 'self'; frame-ancestors 'none'", nonce);
    expect(result).not.toContain('frame-ancestors');
  });

  it('strips require-trusted-types-for', () => {
    const result = rewriteCsp("default-src 'self'; require-trusted-types-for 'script'", nonce);
    expect(result).not.toContain('require-trusted-types-for');
  });

  it('removes strict-dynamic from script-src', () => {
    const result = rewriteCsp("script-src 'self' 'strict-dynamic'", nonce);
    expect(result).not.toContain("'strict-dynamic'");
    expect(result).toContain(`'nonce-${nonce}'`);
  });

  it('handles script-src-elem directive', () => {
    const result = rewriteCsp("script-src-elem 'self'", nonce);
    expect(result).toContain('script-src-elem');
    expect(result).toContain(`'nonce-${nonce}'`);
  });

  it('derives script-src from default-src when not present', () => {
    const result = rewriteCsp("default-src 'self' https:", nonce);
    expect(result).toContain('script-src');
    expect(result).toContain(`'nonce-${nonce}'`);
    expect(result).toContain("'self'");
  });

  it('removes none from script-src when adding nonce', () => {
    const result = rewriteCsp("script-src 'none'", nonce);
    expect(result).not.toContain("'none'");
    expect(result).toContain(`'nonce-${nonce}'`);
  });

  it('adds script-src-elem fallback when script-src exists but script-src-elem does not', () => {
    const result = rewriteCsp("script-src 'self'", nonce);
    expect(result).toContain('script-src-elem');
    expect(result).toContain(`'nonce-${nonce}'`);
  });
});
