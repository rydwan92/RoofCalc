import { describe, expect, it } from 'vitest';
import {
  EXPECTED_MIGRATION_TIMES,
  EXPECTED_SEEDS,
} from '../data/readiness-manifest';
import { projectSystemStatus } from './system-status';

describe('system readiness projection', () => {
  const observed = EXPECTED_SEEDS.map(({ category, sourceId, checksum }) => ({
    category,
    sourceId,
    checksum,
  }));
  it('requires matching database migration rows and completed seed checksums', () => {
    const current = projectSystemStatus(EXPECTED_MIGRATION_TIMES, observed);
    expect(current.migrations).toEqual({
      state: 'current',
      applied: 8,
      expected: 8,
    });
    expect(current.seeds.catalogue).toEqual({
      state: 'current',
      current: 10,
      expected: 10,
    });
    expect(current.seeds.pricing).toEqual({
      state: 'current',
      current: 4,
      expected: 4,
    });
    expect(current.seeds.business).toEqual({
      state: 'current',
      current: 1,
      expected: 1,
    });
  });
  it('reports missing and outdated state from actual observed rows', () => {
    const empty = projectSystemStatus([], []);
    expect(empty.migrations.state).toBe('missing');
    expect(empty.seeds.business.state).toBe('missing');
    const partial = projectSystemStatus(
      EXPECTED_MIGRATION_TIMES.slice(0, 7),
      observed
        .map((seed) =>
          seed.category === 'pricing' ? { ...seed, checksum: 'old' } : seed,
        )
        .slice(1),
    );
    expect(partial.migrations.state).toBe('outdated');
    expect(partial.seeds.catalogue.state).toBe('missing');
    expect(partial.seeds.pricing.state).toBe('outdated');
    expect(partial.seeds.business.state).toBe('current');
  });
});
