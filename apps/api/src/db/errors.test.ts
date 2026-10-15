import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { databaseFailureReason } from './doctor';
import { databaseErrorCode } from './errors';

function driverError(code: string) {
  return Object.assign(new Error(`driver ${code}`), { code });
}

describe('database error code', () => {
  it('reads a plain mysql2 error code', () => {
    expect(databaseErrorCode(driverError('ER_BAD_DB_ERROR'))).toBe(
      'ER_BAD_DB_ERROR',
    );
  });

  it('unwraps the cause of a drizzle query error', () => {
    // Regression: a partially migrated database made `pnpm db:status` and
    // the admin system status fail generically, because drizzle 0.45 wraps
    // ER_NO_SUCH_TABLE inside DrizzleQueryError.cause.
    const wrapped = new DrizzleQueryError(
      'select `source_id` from `pricing_import_batches`',
      [],
      driverError('ER_NO_SUCH_TABLE'),
    );
    expect(databaseErrorCode(wrapped)).toBe('ER_NO_SUCH_TABLE');
    expect(databaseFailureReason(wrapped)).toMatch(/schema is behind/);
  });

  it('stops on non-objects and bounded cyclic causes', () => {
    expect(databaseErrorCode(undefined)).toBeUndefined();
    expect(databaseErrorCode('ER_NO_SUCH_TABLE')).toBeUndefined();
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(databaseErrorCode(cyclic)).toBeUndefined();
  });
});
