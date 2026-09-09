import { describe, expect, it } from 'vitest';
import { formatLength, parseDecimal } from './format';

describe('decimal editing and presentation', () => {
  it.each([
    ['4,5', 4.5],
    ['4.5', 4.5],
    [' 400 ', 400],
    [',5', 0.5],
    ['0', 0],
    ['35,', 35],
  ] as const)('parses %s', (raw, value) => {
    expect(parseDecimal(raw)).toBe(value);
  });
  it.each(['', ' ', '1,2.3', '1e6', 'Infinity', '12abc', '4 000', '--2'])(
    'rejects %s',
    (raw) => {
      expect(parseDecimal(raw)).toBeNull();
    },
  );
  it('formats Polish decimals and the chosen length unit', () => {
    expect(formatLength(5249.374921, 'm', 'pl')).toBe('5,249');
    expect(formatLength(5249.374921, 'm', 'en')).toBe('5.249');
  });
});
