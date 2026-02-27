import { describe, expect, it } from 'vitest';

describe('server scaffold', () => {
  it('runs in node environment', () => {
    expect(typeof globalThis.process).toBe('object');
    expect(typeof globalThis.document).toBe('undefined');
  });
});
