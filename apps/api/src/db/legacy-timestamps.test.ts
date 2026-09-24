import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explicitTimestampDdl } from './legacy-timestamps';

describe('explicit timestamp DDL for MariaDB < 10.10', () => {
  it('keeps nullable columns nullable and gives NOT NULL ones a plain default', () => {
    expect(
      explicitTimestampDdl(
        [
          '`created_at` timestamp(3) NOT NULL,',
          '`expires_at` timestamp(3),',
          '`archived_at` timestamp(3)',
          '`seen_at` timestamp(3) NULL,',
          "`at` timestamp NOT NULL DEFAULT '2020-01-01',",
        ].join('\n'),
      ),
    ).toBe(
      [
        '`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),',
        '`expires_at` timestamp(3) NULL,',
        '`archived_at` timestamp(3) NULL',
        '`seen_at` timestamp(3) NULL,',
        "`at` timestamp NOT NULL DEFAULT '2020-01-01',",
      ].join('\n'),
    );
  });

  it('adds no ON UPDATE to any shipped migration', () => {
    const folder = resolve(__dirname, '../../../../migrations');
    for (const file of readdirSync(folder).filter((name) =>
      name.endsWith('.sql'),
    )) {
      const original = readFileSync(resolve(folder, file), 'utf8');
      const sql = explicitTimestampDdl(original);
      const onUpdate = (text: string) => text.match(/ON UPDATE/gi)?.length ?? 0;
      expect(onUpdate(sql)).toBe(onUpdate(original));
    }
  });
});
