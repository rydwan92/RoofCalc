import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/mysql2';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { fromSqlDateTime, toSqlDateTime } from './sql-datetime';
import { catalogImportBatches } from './schema';
import { pricingImportBatches } from './pricing-schema';

/** MariaDB 10.4 strict mode only accepts this shape for a DATETIME literal. */
const MARIADB_DATETIME = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;

describe('V50 — SQL datetime boundary (MariaDB 10.4 strict mode)', () => {
  it('turns an ISO UTC instant into a plain SQL DATETIME', () => {
    expect(toSqlDateTime('2026-09-18T10:15:42.123Z')).toBe(
      '2026-09-18 10:15:42',
    );
    // An offset instant is normalised to UTC, never stored as local text.
    expect(toSqlDateTime('2026-09-18T12:15:42+02:00')).toBe(
      '2026-09-18 10:15:42',
    );
    expect(() => toSqlDateTime('not a date')).toThrow();
  });

  it('reads it back as ISO UTC', () => {
    expect(fromSqlDateTime('2026-09-18 10:15:42')).toBe(
      '2026-09-18T10:15:42.000Z',
    );
    expect(fromSqlDateTime(new Date('2026-09-18T10:15:42Z'))).toBe(
      '2026-09-18T10:15:42.000Z',
    );
  });

  it('keeps the audit columns as DATETIME, so no migration is implied', () => {
    for (const table of [catalogImportBatches, pricingImportBatches]) {
      const columns = getTableConfig(table).columns;
      for (const name of ['started_at', 'completed_at'])
        expect(
          columns.find((column) => column.name === name)?.getSQLType(),
        ).toBe('datetime');
    }
  });

  it('sends importer audit timestamps to the driver in the MariaDB shape', () => {
    // No connection: Drizzle only builds the statement and its parameters.
    const db = drizzle.mock();
    const audit = {
      id: 'batch-1',
      sourceId: 'src',
      sourceLabel: 'Source',
      checksum: 'x'.repeat(64),
      status: 'completed' as const,
      counts: {},
      startedAt: '2026-09-18T10:15:42.123Z',
      completedAt: '2026-09-18T10:15:43.999Z',
      schemaVersion: 1,
    };
    for (const table of [catalogImportBatches, pricingImportBatches]) {
      const { params } = db
        .insert(table)
        .values(audit as never)
        .toSQL();
      const stamps = params.filter(
        (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value),
      );
      expect(stamps).toEqual(['2026-09-18 10:15:42', '2026-09-18 10:15:43']);
      for (const stamp of stamps) expect(stamp).toMatch(MARIADB_DATETIME);
    }
  });
});
