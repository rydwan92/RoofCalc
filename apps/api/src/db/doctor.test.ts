import { describe, expect, it, vi } from 'vitest';
import { parseDatabaseUrl } from './config';
import { diagnoseDatabase, diagnoseNetwork, sanitizeGrant } from './doctor';

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

it('reports server, TLS, grants, migrations and catalogue/pricing counts', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([
      [{ version: '11.4.13-MariaDB', database_name: 'cieslacalc' }],
      [],
    ])
    .mockResolvedValueOnce([
      [{ Variable_name: 'Ssl_version', Value: 'TLSv1.3' }],
      [],
    ])
    .mockResolvedValueOnce([
      [
        {
          'Grants for u@%':
            "GRANT USAGE ON *.* TO `u`@`%` IDENTIFIED BY PASSWORD '*ABCDEF0123' REQUIRE SSL",
        },
      ],
      [],
    ])
    .mockResolvedValueOnce([[{ count: 9 }], []])
    .mockResolvedValueOnce([[{ count: 3 }], []])
    .mockResolvedValueOnce([[{ count: 12 }], []])
    .mockResolvedValueOnce([[{ count: 5 }], []])
    .mockResolvedValueOnce([[{ kind: 'roof-tile', count: 12 }], []])
    .mockResolvedValueOnce([[{ count: 6 }], []]);
  const lines = await diagnoseDatabase({ query }, 3);
  expect(lines).toEqual([
    'DATABASE_URL configured: yes',
    'Database: connected (authentication ok)',
    'Server: 11.4.13-MariaDB',
    'Database name: cieslacalc',
    'Session TLS: TLSv1.3',
    'Grant: GRANT USAGE ON *.* REQUIRE SSL',
    'Read access: ok (9 tables)',
    'Schema migrations: current (3/3)',
    'Catalogue: 12 products',
    'Manufacturers: 5',
    'Kind roof-tile: 12',
    'Prices: 6 entries',
  ]);
  expect(lines.join('\n')).not.toContain('ABCDEF');
});

it('only runs read statements', async () => {
  const query = vi.fn().mockResolvedValue([[{ count: 1 }], []]);
  await diagnoseDatabase({ query }, 3);
  for (const [sql] of query.mock.calls)
    expect(String(sql)).toMatch(/^(SELECT|SHOW)\b/);
});

it('directs an empty database to bootstrap', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[{ version: '11.4', database_name: 'new' }], []])
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[{ count: 0 }], []]);
  const output = (await diagnoseDatabase({ query }, 3)).join('\n');
  expect(output).toContain('Schema migrations: pending (0/3)');
  expect(output).toContain('pnpm db:bootstrap');
});

it('directs a partially created schema to bootstrap', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[{ version: '11.4', database_name: 'new' }], []])
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[], []])
    .mockResolvedValueOnce([[{ count: 2 }], []])
    .mockRejectedValueOnce({ code: 'ER_NO_SUCH_TABLE' });
  expect((await diagnoseDatabase({ query }, 3)).join('\n')).toContain(
    'pnpm db:bootstrap',
  );
});

it('removes password hashes and grantee from grants', () => {
  expect(
    sanitizeGrant(
      "GRANT USAGE ON *.* TO `u`@`%` IDENTIFIED BY PASSWORD '*0123456789' REQUIRE SSL",
    ),
  ).toBe('GRANT USAGE ON *.* REQUIRE SSL');
  expect(
    sanitizeGrant(
      'GRANT ALL PRIVILEGES ON `db`.* TO `u`@`%` WITH GRANT OPTION',
    ),
  ).toBe('GRANT ALL PRIVILEGES ON `db`.* WITH GRANT OPTION');
});

describe('network diagnostics', () => {
  const options = parseDatabaseUrl(
    'mysql://user:hunter2@mysql-example.alwaysdata.net/example_dev',
  );

  it('stops at DNS with an actionable, credential-free reason', async () => {
    const result = await diagnoseNetwork(options, {
      lookup: vi.fn().mockRejectedValue({ code: 'ENOTFOUND' }),
      connect: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('DNS: failed');
    expect(result.lines.join('\n')).not.toMatch(/user|hunter2/);
  });

  it('reports DNS and TCP success with the TLS policy', async () => {
    const result = await diagnoseNetwork(options, {
      lookup: vi.fn().mockResolvedValue(['192.0.2.10']),
      connect: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toEqual({
      ok: true,
      lines: [
        'Target: mysql-example.alwaysdata.net:3306/example_dev',
        'TLS: required (certificate verified)',
        'DNS: ok (192.0.2.10)',
        'TCP: ok',
      ],
    });
  });

  it('reports refused TCP connections', async () => {
    const result = await diagnoseNetwork(options, {
      lookup: vi.fn().mockResolvedValue(['192.0.2.10']),
      connect: vi.fn().mockRejectedValue({ code: 'ECONNREFUSED' }),
    });
    expect(result.ok).toBe(false);
    expect(result.lines).toContain('TCP: failed');
  });
});
