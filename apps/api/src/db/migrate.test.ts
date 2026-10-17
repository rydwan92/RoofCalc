import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mysql2/promise';
import { resolve } from 'node:path';
import { migrateDatabase, migrationFailure } from './migrate';

const migrate = vi.hoisted(() => vi.fn());
vi.mock('drizzle-orm/mysql2/migrator', () => ({ migrate }));
describe('migration connection compatibility', () => {
  it('refuses unknown history before any DDL', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([[{ hash: 'unknown', created_at: 1 }], []]);
    await expect(
      migrateDatabase(
        { query } as unknown as Connection,
        resolve('migrations'),
      ),
    ).rejects.toThrow('history differs');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('explains the MariaDB 10.4 restart requirement without changing global settings', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ explicit_defaults: 0 }], []])
      .mockRejectedValue({ code: 'ER_INCORRECT_GLOBAL_LOCAL_VAR' });
    await expect(
      migrateDatabase(
        { query } as unknown as Connection,
        resolve('migrations'),
      ),
    ).rejects.toThrow('restart');
    expect(query.mock.calls.at(-1)?.[0]).toBe(
      'SET SESSION explicit_defaults_for_timestamp = 1',
    );
  });
  it('uses the normal Drizzle migrator when explicit defaults are already enabled', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ explicit_defaults: 1 }], []]);
    await migrateDatabase(
      { query } as unknown as Connection,
      resolve('migrations'),
    );
    expect(migrate).toHaveBeenCalledWith(expect.anything(), {
      migrationsFolder: resolve('migrations'),
    });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('prints SQL error codes without query parameters or credentials', () => {
    const result = migrationFailure({
      cause: {
        code: 'ER_INVALID_DEFAULT',
        errno: 1067,
        sqlState: '42000',
        sql: 'secret',
        message: 'password',
      },
    });
    expect(result).toContain('ER_INVALID_DEFAULT');
    expect(result).not.toMatch(/secret|password/);
    expect(migrationFailure(Error('private password'))).not.toContain(
      'private password',
    );
  });
});
