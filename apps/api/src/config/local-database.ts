import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { parseDatabaseUrl } from '../db/config';
import { databaseErrorCode } from '../db/errors';
import { readSchemaState, type SchemaState } from '../db/schema-readiness';
import { isSafeIdentifier, localDatabaseUrl } from './env-file';

/**
 * Local database helpers behind `pnpm configure:local`: a read-only
 * connection check and the provisioning of ONE database with ONE dedicated
 * application user that can access only that database. Loopback only — a
 * remote database is never created or altered from here.
 */

export type ConnectionCheck =
  | { status: 'connected'; version: string; schema: SchemaState }
  | { status: 'server-down' | 'access-denied' | 'database-missing' | 'failed' };

export async function checkLocalConnection(
  databaseUrl: string,
): Promise<ConnectionCheck> {
  let connection: mysql.Connection | undefined;
  try {
    connection = await mysql.createConnection({
      ...parseDatabaseUrl(databaseUrl),
      connectTimeout: 5000,
    });
    const [rows] = await connection.query('SELECT VERSION() AS version');
    const version = String(
      (rows as Array<{ version?: string }>)[0]?.version ?? 'unknown',
    );
    return {
      status: 'connected',
      version,
      schema: await readSchemaState(connection),
    };
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT')
      return { status: 'server-down' };
    if (
      code === 'ER_ACCESS_DENIED_ERROR' ||
      code === 'ER_DBACCESS_DENIED_ERROR'
    )
      return { status: 'access-denied' };
    if (code === 'ER_BAD_DB_ERROR') return { status: 'database-missing' };
    return { status: 'failed' };
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export interface ProvisionInput {
  admin: { user: string; password: string };
  database: string;
  user: string;
  /**
   * For an application user that already exists: its known password, or
   * `undefined` to set a newly generated one.
   */
  existingUserPassword?: string;
  port?: number;
}

export type ProvisionResult =
  | { status: 'ready'; databaseUrl: string; userExisted: boolean }
  | {
      status: 'invalid-name' | 'admin-denied' | 'server-down' | 'failed';
      code?: string;
    };

/** Which hosts the application user already exists on (admin read). */
export async function existingUserHosts(
  admin: mysql.Connection,
  user: string,
): Promise<string[]> {
  const [rows] = await admin.query(
    'SELECT Host FROM mysql.user WHERE User = ?',
    [user],
  );
  return (rows as Array<{ Host: string }>).map((row) => row.Host);
}

export async function provisionLocalDatabase(
  input: ProvisionInput,
): Promise<ProvisionResult> {
  if (![input.admin.user, input.database, input.user].every(isSafeIdentifier))
    return { status: 'invalid-name' };
  let admin: mysql.Connection | undefined;
  try {
    admin = await mysql.createConnection({
      host: '127.0.0.1',
      port: input.port ?? 3306,
      user: input.admin.user,
      password: input.admin.password,
      connectTimeout: 5000,
    });
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${input.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    const hosts = await existingUserHosts(admin, input.user);
    const password =
      hosts.length && input.existingUserPassword
        ? input.existingUserPassword
        : randomBytes(18).toString('base64url');
    if (hosts.length && !input.existingUserPassword)
      for (const host of hosts)
        await admin.query('ALTER USER ?@? IDENTIFIED BY ?', [
          input.user,
          host,
          password,
        ]);
    // TCP to 127.0.0.1 may authenticate as either host name; cover both.
    for (const host of ['localhost', '127.0.0.1']) {
      if (!hosts.includes(host))
        await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [
          input.user,
          host,
          password,
        ]);
      await admin.query(
        `GRANT ALL PRIVILEGES ON \`${input.database}\`.* TO ?@?`,
        [input.user, host],
      );
    }
    return {
      status: 'ready',
      userExisted: hosts.length > 0,
      databaseUrl: localDatabaseUrl({
        user: input.user,
        password,
        database: input.database,
        port: input.port,
      }),
    };
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === 'ER_ACCESS_DENIED_ERROR')
      return { status: 'admin-denied', code };
    if (code === 'ECONNREFUSED') return { status: 'server-down', code };
    return { status: 'failed', ...(code ? { code } : {}) };
  } finally {
    await admin?.end().catch(() => undefined);
  }
}
