import { describe, expect, it } from 'vitest';
import { classifySeedStatus, type ExpectedSeed } from './seed-status';

const expected: ExpectedSeed[] = [
  {
    file: 'tiles.json',
    category: 'catalogue',
    sourceId: 'tiles',
    checksum: 'aaa',
  },
  {
    file: 'prices.json',
    category: 'pricing',
    sourceId: 'prices',
    checksum: 'bbb',
  },
  {
    file: 'demo.json',
    category: 'business',
    sourceId: 'org:demo',
    checksum: 'ccc',
  },
];

describe('seed status is read-only classification', () => {
  it('reports an empty database', () => {
    expect(classifySeedStatus(expected, [])).toEqual(
      expected.map((seed) => ({ ...seed, state: 'missing' })),
    );
  });

  it('reports a partially seeded database', () => {
    expect(
      classifySeedStatus(expected, [
        { category: 'catalogue', sourceId: 'tiles', checksum: 'aaa' },
      ]).map((item) => item.state),
    ).toEqual(['current', 'missing', 'missing']);
  });

  it('reports a fully seeded database', () => {
    expect(
      classifySeedStatus(
        expected,
        expected.map(({ category, sourceId, checksum }) => ({
          category,
          sourceId,
          checksum,
        })),
      ).every((item) => item.state === 'current'),
    ).toBe(true);
  });

  it('distinguishes an outdated checksum from a missing batch', () => {
    expect(
      classifySeedStatus(expected, [
        { category: 'catalogue', sourceId: 'tiles', checksum: 'old' },
      ]).map((item) => item.state),
    ).toEqual(['outdated', 'missing', 'missing']);
  });
});
