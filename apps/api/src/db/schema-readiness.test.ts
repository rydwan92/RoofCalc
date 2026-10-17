import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { schema } from './schema-bundle';
import { readSchemaState } from './schema-readiness';
import {
  EXPECTED_MIGRATION_HASHES,
  EXPECTED_MIGRATION_TIMES,
} from '../data/readiness-manifest';
import { createApp } from '../app';
import { createWorker } from '../edge/worker';

const rows = EXPECTED_MIGRATION_TIMES.map((created_at, index) => ({
  created_at,
  hash: EXPECTED_MIGRATION_HASHES[index],
}));
const columns = Object.values(schema).flatMap((table) =>
  Object.values(getTableColumns(table)).map((column) => ({
    table_name: getTableName(table),
    column_name: column.name,
  })),
);
describe('schema compatibility gate', () => {
  it('requires the exact journal hashes and all physical columns', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([rows, []])
      .mockResolvedValueOnce([columns, []]);
    expect(await readSchemaState({ query })).toBe('current');
    expect(
      await readSchemaState({
        query: vi.fn().mockResolvedValue([rows.slice(0, 5), []]),
      }),
    ).toBe('outdated');
    expect(
      await readSchemaState({
        query: vi
          .fn()
          .mockResolvedValue([
            rows.map((row) => ({ ...row, hash: 'wrong' })),
            [],
          ]),
      }),
    ).toBe('outdated');
    expect(
      await readSchemaState({
        query: vi
          .fn()
          .mockResolvedValueOnce([rows, []])
          .mockResolvedValueOnce([columns.slice(1), []]),
      }),
    ).toBe('outdated');
  });
  it('distinguishes missing history from an unreachable database without leaking errors', async () => {
    expect(
      await readSchemaState({
        query: vi.fn().mockRejectedValue({ code: 'ER_NO_SUCH_TABLE' }),
      }),
    ).toBe('outdated');
    expect(
      await readSchemaState({
        query: vi.fn().mockRejectedValue(Error('private credentials')),
      }),
    ).toBe('unavailable');
  });
  it('blocks Node Business/auth/bootstrap before executing writes; health stays available', async () => {
    const app = createApp(undefined, undefined, undefined, {
      runtime: 'node',
      probeSchema: async () => 'outdated',
    });
    for (const path of [
      '/api/business/organizations',
      '/api/auth/sign-in/email',
      '/api/setup/first-owner',
    ]) {
      const result = await request(app).post(path).send({});
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ error: { code: 'schema-not-ready' } });
    }
    expect((await request(app).get('/api/readiness')).body).toEqual({
      schema: 'outdated',
    });
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
  it('blocks Worker Business/auth, releases connections and never runs DDL', async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([rows.slice(0, 5), []]),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const worker = createWorker(async () => connection);
    const env = {
      ASSETS: { fetch: async () => new Response('spa') },
      HYPERDRIVE: {
        host: 'db',
        port: 3306,
        user: 'test',
        password: 'private',
        database: 'test',
      },
    };
    for (const path of [
      '/api/readiness',
      '/api/business/organizations',
      '/api/auth/get-session',
    ]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`),
        env,
      );
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private');
    }
    expect(connection.end).toHaveBeenCalledTimes(3);
    expect(
      connection.query.mock.calls.every(([sql]) => sql.startsWith('SELECT')),
    ).toBe(true);
  });
});
