import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';
import * as schema from './schema';

export type CatalogDatabase = MySql2Database<typeof schema>;

export interface CatalogDatabaseConnection {
  db: CatalogDatabase;
  pool: Pool;
  close(): Promise<void>;
}

export function createCatalogDatabase(
  databaseUrl = process.env.DATABASE_URL,
): CatalogDatabaseConnection | undefined {
  if (!databaseUrl) return undefined;
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    enableKeepAlive: true,
  });
  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    pool,
    close: () => pool.end(),
  };
}
