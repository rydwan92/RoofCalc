import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExpectedSeeds } from './seed-manifest-loader';
import { EXPECTED_MIGRATION_TIMES, EXPECTED_SEEDS } from './readiness-manifest';

describe('edge readiness manifest parity', () => {
  it('matches the current SQL journal and source seed checksums', async () => {
    const journal = JSON.parse(
      await readFile(
        resolve(process.cwd(), 'migrations/meta/_journal.json'),
        'utf8',
      ),
    ) as { entries: Array<{ when: number }> };
    expect(EXPECTED_MIGRATION_TIMES).toEqual(
      journal.entries.map((entry) => entry.when),
    );
    expect(EXPECTED_SEEDS).toEqual(await loadExpectedSeeds());
  });
});
