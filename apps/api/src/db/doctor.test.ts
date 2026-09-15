import { expect, it, vi } from 'vitest';
import { diagnoseDatabase } from './doctor';

it('reports optional unconfigured database without connecting', async () => {
  expect((await diagnoseDatabase(undefined, 3)).join('\n')).toContain(
    'DATABASE_URL configured: no',
  );
});

it('never leaks driver messages or credentials on failure', async () => {
  const query = vi.fn().mockRejectedValue({
    code: 'ER_ACCESS_DENIED_ERROR',
    message: 'mysql://user:secret@host/db',
  });
  const output = (await diagnoseDatabase({ query }, 3)).join('\n');
  expect(output).toContain('Access denied');
  expect(output).not.toMatch(/secret|mysql:\/\//);
});

it('reports migration and catalogue/pricing counts', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[{ count: 3 }], []])
    .mockResolvedValueOnce([[{ count: 12 }], []])
    .mockResolvedValueOnce([[{ count: 6 }], []]);
  expect(await diagnoseDatabase({ query }, 3)).toEqual([
    'DATABASE_URL configured: yes',
    'Database: connected',
    'Schema migrations: current (3/3)',
    'Catalogue: 12 products',
    'Prices: 6 entries',
  ]);
});

it('directs a fresh database to bootstrap', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[], []])
    .mockRejectedValueOnce({ code: 'ER_NO_SUCH_TABLE' });
  expect((await diagnoseDatabase({ query }, 3)).join('\n')).toContain(
    'pnpm db:bootstrap',
  );
});
