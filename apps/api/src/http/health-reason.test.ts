import { describe, expect, it } from 'vitest';
import { classifyDatabaseError, healthResult } from './handler';

const driverError = (code: string, message = 'driver failure') =>
  Object.assign(new Error(message), { code });

describe('VNext-6.1 database health reason', () => {
  it('classifies driver failures into generic reasons only', () => {
    expect(classifyDatabaseError(driverError('ER_ACCESS_DENIED_ERROR'))).toBe(
      'access-denied',
    );
    expect(classifyDatabaseError(driverError('ER_DBACCESS_DENIED_ERROR'))).toBe(
      'access-denied',
    );
    expect(classifyDatabaseError(driverError('ER_BAD_DB_ERROR'))).toBe(
      'database-missing',
    );
    expect(classifyDatabaseError(driverError('ECONNREFUSED'))).toBe(
      'unreachable',
    );
    expect(classifyDatabaseError(driverError('ETIMEDOUT'))).toBe('timeout');
    expect(
      classifyDatabaseError(driverError('HANDSHAKE_SSL_ERROR', 'ssl failed')),
    ).toBe('tls');
    // Wrapped (drizzle / Hyperdrive) errors are unwrapped by cause.
    expect(
      classifyDatabaseError(
        new Error('query failed', {
          cause: driverError('ER_ACCESS_DENIED_ERROR'),
        }),
      ),
    ).toBe('access-denied');
    expect(classifyDatabaseError(new Error('something else'))).toBe('unknown');
  });

  it('the health body carries the reason, never the server message', async () => {
    const result = await healthResult({
      runtime: 'cloudflare-worker',
      auth: 'configured',
      probeDatabase: async () => {
        throw driverError(
          'ER_ACCESS_DENIED_ERROR',
          "Access denied for user 'secret-user'@'10.0.0.1' (using password: YES)",
        );
      },
    });
    expect(result.body).toMatchObject({
      status: 'degraded',
      database: 'unavailable',
      databaseReason: 'access-denied',
    });
    expect(JSON.stringify(result.body)).not.toContain('secret-user');
  });

  it('a connected database reports no reason', async () => {
    const result = await healthResult({
      runtime: 'node',
      probeDatabase: async () => undefined,
    });
    expect(result.body).toMatchObject({ database: 'connected' });
    expect(result.body).not.toHaveProperty('databaseReason');
  });
});
