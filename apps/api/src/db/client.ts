import '../environment';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';
import * as catalogSchema from './schema';
import * as pricingSchema from './pricing-schema';

/** One shared schema/connection for both the catalogue and pricing tables. */
const schema = { ...catalogSchema, ...pricingSchema };

export type CatalogDatabase = MySql2Database<typeof schema>;
export type PricingDatabase = CatalogDatabase;

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
    connectTimeout: 5000,
  });
  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    pool,
    close: () => pool.end(),
  };
}
