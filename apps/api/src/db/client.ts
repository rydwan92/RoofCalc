import '../environment';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';
import { parseDatabaseUrl, type DatabaseConnectionOptions } from './config';
import { schema } from './schema-bundle';

/** One shared schema/connection for both the catalogue and pricing tables. */
export type CatalogDatabase = MySql2Database<typeof schema>;
export type PricingDatabase = CatalogDatabase;

export interface CatalogDatabaseConnection {
  db: CatalogDatabase;
  pool: Pool;
  options: DatabaseConnectionOptions;
  close(): Promise<void>;
}

export function createCatalogDatabase(
  databaseUrl = process.env.DATABASE_URL,
): CatalogDatabaseConnection | undefined {
  if (!databaseUrl?.trim()) return undefined;
  const options = parseDatabaseUrl(databaseUrl);
  const pool = mysql.createPool({
    ...options,
    connectionLimit: 10,
    enableKeepAlive: true,
    connectTimeout: 10000,
  });
  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    pool,
    options,
    close: () => pool.end(),
  };
}
