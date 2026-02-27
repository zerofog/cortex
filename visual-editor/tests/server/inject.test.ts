import { describe, expect, it } from 'vitest';
import { injectScripts } from '../../src/inject.js';

describe('injectScripts', () => {
  it('inserts scripts before </body>', () => {
    const html = '<html><body><p>hello</p></body></html>';
    const result = injectScripts(html);
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    expect(result).toContain('inspector.js');
    expect(result).toContain('nav-blocker.js');
    // Scripts should appear before </body>
    const scriptsIdx = result.indexOf('__zerofog_injected__');
    const bodyIdx = result.indexOf('</body>');
    expect(scriptsIdx).toBeLessThan(bodyIdx);
  });

  it('falls back to appending when no </body> tag', () => {
    const html = '<html><body><p>hello</p>';
    const result = injectScripts(html);
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    expect(result).toContain('inspector.js');
    // Original content should still be there
    expect(result).toContain('<p>hello</p>');
    // Scripts appended at the end
    expect(result.endsWith('</script>\n')).toBe(true);
  });

  it('returns empty string unchanged (with scripts appended)', () => {
    const result = injectScripts('');
    // Even empty string gets scripts appended (fallback path)
    expect(result).toContain('<!-- __zerofog_injected__ -->');
  });

  it('handles case-insensitive </BODY> tag', () => {
    const html = '<html><body><p>hi</p></BODY></html>';
    const result = injectScripts(html);
    expect(result).toContain('<!-- __zerofog_injected__ -->');
    const scriptsIdx = result.indexOf('__zerofog_injected__');
    const bodyIdx = result.toLowerCase().indexOf('</body>');
    expect(scriptsIdx).toBeLessThan(bodyIdx);
  });

  it('is idempotent — does not double-inject', () => {
    const html = '<html><body><p>hello</p></body></html>';
    const once = injectScripts(html);
    const twice = injectScripts(once);
    expect(twice).toBe(once);
    // Count marker occurrences
    const count = (twice.match(/__zerofog_injected__/g) ?? []).length;
    expect(count).toBe(1);
  });
});
