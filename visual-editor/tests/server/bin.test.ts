import { describe, it, expect } from 'vitest';
import { parseTargetPort } from '../../src/bin.js';

describe('parseTargetPort', () => {
  it.each([
    ['3000', 3000],
    ['1', 1],
    ['65535', 65535],
    ['http://localhost:3000', 3000],
    ['https://app.local:4000', 4000],
    ['127.0.0.1:8080', 8080],
  ])('parses "%s" → %d', (input, expected) => {
    expect(parseTargetPort(input)).toBe(expected);
  });

  it.each([
    ['0', 'out of range'],
    ['65536', 'out of range'],
    ['notaport', 'non-numeric'],
    ['', 'empty string'],
    ['3000abc', 'trailing garbage'],
  ])('rejects "%s" (%s)', (input) => {
    expect(() => parseTargetPort(input)).toThrow();
  });
});
