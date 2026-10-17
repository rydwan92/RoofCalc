import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExpectedSeeds } from './seed-manifest-loader';
import {
  EXPECTED_MIGRATION_HASHES,
  EXPECTED_MIGRATION_TIMES,
  EXPECTED_SEEDS,
} from './readiness-manifest';

describe('edge readiness manifest parity', () => {
  it('matches the current SQL journal and source seed checksums', async () => {
    const journal = JSON.parse(
      await readFile(
        resolve(process.cwd(), 'migrations/meta/_journal.json'),
        'utf8',
      ),
    ) as { entries: Array<{ when: number; tag: string }> };
    expect(EXPECTED_MIGRATION_HASHES).toEqual(
      await Promise.all(
        journal.entries.map(async (entry) =>
          createHash('sha256')
            .update(
              await readFile(
                resolve(process.cwd(), `migrations/${entry.tag}.sql`),
              ),
            )
            .digest('hex'),
        ),
      ),
    );
    expect(EXPECTED_MIGRATION_TIMES).toEqual(
      journal.entries.map((entry) => entry.when),
    );
    expect(EXPECTED_SEEDS).toEqual(await loadExpectedSeeds());
  });
});
