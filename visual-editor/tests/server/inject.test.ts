import { describe, expect, it } from 'vitest';
import { injectScripts } from '../../src/inject.js';

describe('injectScripts', () => {
  it('injects nav-blocker before </head> and inspector before </body>', () => {
    const html = '<html><head><title>Test</title></head><body><p>hello</p></body></html>';
    const result = injectScripts(html);

    // Marker + nav-blocker should be in the head
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    expect(result).toContain('nav-blocker.js');
    expect(result).toContain('inspector.js');

    const markerIdx = result.indexOf('__zerofog_injected__');
    const navBlockerIdx = result.indexOf('nav-blocker.js');
    const headCloseIdx = result.toLowerCase().indexOf('</head>');
    const inspectorIdx = result.indexOf('inspector.js');
    const bodyCloseIdx = result.toLowerCase().indexOf('</body>');

    // Marker and nav-blocker appear before </head>
    expect(markerIdx).toBeLessThan(headCloseIdx);
    expect(navBlockerIdx).toBeLessThan(headCloseIdx);

    // Inspector appears before </body> but after </head>
    expect(inspectorIdx).toBeGreaterThan(headCloseIdx);
    expect(inspectorIdx).toBeLessThan(bodyCloseIdx);
  });

  it('inserts scripts in correct locations with head and body tags', () => {
    const html = '<html><head></head><body><p>hello</p></body></html>';
    const result = injectScripts(html);

    // nav-blocker should be before </head>
    const navBlockerIdx = result.indexOf('nav-blocker.js');
    const headCloseIdx = result.toLowerCase().indexOf('</head>');
    expect(navBlockerIdx).toBeLessThan(headCloseIdx);

    // inspector should be before </body>
    const inspectorIdx = result.indexOf('inspector.js');
    const bodyCloseIdx = result.toLowerCase().indexOf('</body>');
    expect(inspectorIdx).toBeLessThan(bodyCloseIdx);

    // inspector should NOT be in the head section
    expect(inspectorIdx).toBeGreaterThan(headCloseIdx);
  });

  it('falls back to appending when no </head> or </body> tags', () => {
    const html = '<html><body><p>hello</p>';
    const result = injectScripts(html);
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    expect(result).toContain('nav-blocker.js');
    expect(result).toContain('inspector.js');
    // Original content should still be there
    expect(result).toContain('<p>hello</p>');
    // Both scripts appended at the end
    expect(result).toContain(html);
    expect(result.indexOf('nav-blocker.js')).toBeGreaterThan(html.length - 1);
    expect(result.indexOf('inspector.js')).toBeGreaterThan(html.length - 1);
  });

  it('returns empty string with scripts appended', () => {
    const result = injectScripts('');
    // Even empty string gets scripts appended (fallback path)
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    expect(result).toContain('nav-blocker.js');
    expect(result).toContain('inspector.js');
  });

  it('handles case-insensitive </HEAD> and </BODY> tags', () => {
    const html = '<html><HEAD></HEAD><body><p>hi</p></BODY></html>';
    const result = injectScripts(html);
    expect(result).toContain('<!-- __zerofog_injected__ -->');

    const markerIdx = result.indexOf('__zerofog_injected__');
    const navBlockerIdx = result.indexOf('nav-blocker.js');
    const headCloseIdx = result.toLowerCase().indexOf('</head>');
    const inspectorIdx = result.indexOf('inspector.js');
    const bodyCloseIdx = result.toLowerCase().indexOf('</body>');

    // nav-blocker before </HEAD>
    expect(markerIdx).toBeLessThan(headCloseIdx);
    expect(navBlockerIdx).toBeLessThan(headCloseIdx);

    // inspector before </BODY>
    expect(inspectorIdx).toBeLessThan(bodyCloseIdx);
    expect(inspectorIdx).toBeGreaterThan(headCloseIdx);
  });

  it('handles </head> present but no </body> — nav-blocker in head, inspector appended', () => {
    const html = '<html><head><title>Test</title></head><body><p>content</p>';
    const result = injectScripts(html);

    // nav-blocker should be before </head>
    const navBlockerIdx = result.indexOf('nav-blocker.js');
    const headCloseIdx = result.toLowerCase().indexOf('</head>');
    expect(navBlockerIdx).toBeLessThan(headCloseIdx);

    // inspector should be appended (after the original html content)
    const inspectorIdx = result.indexOf('inspector.js');
    expect(inspectorIdx).toBeGreaterThan(headCloseIdx);
    // No </body> in original, so inspector is at the end
    expect(result.toLowerCase().indexOf('</body>')).toBe(-1);
  });

  it('is idempotent — does not double-inject', () => {
    const html = '<html><head></head><body><p>hello</p></body></html>';
    const once = injectScripts(html);
    const twice = injectScripts(once);
    expect(twice).toBe(once);
    // Count marker occurrences
    const count = (twice.match(/__zerofog_injected__/g) ?? []).length;
    expect(count).toBe(1);
  });

  // H3: nonce support
  it('adds nonce attribute to script tags when provided', () => {
    const html = '<html><head></head><body><p>hello</p></body></html>';
    const result = injectScripts(html, 'abc123');
    expect(result).toContain('nonce="abc123" src="/__zerofog/client/nav-blocker.js"');
    expect(result).toContain('nonce="abc123" src="/__zerofog/client/inspector.js"');
  });

  it('omits nonce attribute when not provided', () => {
    const html = '<html><head></head><body><p>hello</p></body></html>';
    const result = injectScripts(html);
    expect(result).not.toContain('nonce=');
    expect(result).toContain('<script src="/__zerofog/client/nav-blocker.js">');
    expect(result).toContain('<script src="/__zerofog/client/inspector.js">');
  });

  // Nonce format validation
  it('rejects nonce with unsafe characters', () => {
    const html = '<html><head></head><body></body></html>';
    expect(() => injectScripts(html, 'bad"nonce')).toThrow('Invalid nonce format');
    expect(() => injectScripts(html, 'has spaces')).toThrow('Invalid nonce format');
    expect(() => injectScripts(html, 'has<script>')).toThrow('Invalid nonce format');
  });

  it('accepts valid base64 nonce', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectScripts(html, 'YWJjMTIz');
    expect(result).toContain('nonce="YWJjMTIz"');
  });

  // T10: Nonce values differ across calls (uniqueness is actually at the server level,
  // but we verify inject itself doesn't memoize/cache nonce)
  it('different nonces produce different script tags', () => {
    const html = '<html><head></head><body></body></html>';
    const a = injectScripts(html, 'AAAA');
    const b = injectScripts(html, 'BBBB');
    expect(a).toContain('nonce="AAAA"');
    expect(b).toContain('nonce="BBBB"');
    expect(a).not.toEqual(b);
  });
});
