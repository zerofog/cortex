import { describe, expect, it } from 'vitest';

describe('client scaffold', () => {
  it('runs in happy-dom environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});
