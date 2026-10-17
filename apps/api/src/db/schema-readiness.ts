import { getTableColumns, getTableName } from 'drizzle-orm';
import { schema } from './schema-bundle';
import {
  EXPECTED_MIGRATION_HASHES,
  EXPECTED_MIGRATION_TIMES,
} from '../data/readiness-manifest';

export type SchemaState = 'current' | 'outdated' | 'unavailable';
export interface SchemaReader {
  query(sql: string): Promise<[unknown, unknown]>;
}

/** No filesystem, writes or cached readiness: both runtimes inspect their own
 * database. Journal identity plus physical columns detects incomplete DDL. */
export async function readSchemaState(
  connection: SchemaReader,
): Promise<SchemaState> {
  try {
    const [result] = await connection.query(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY id',
    );
    const rows = result as Array<{ hash: string; created_at: number | string }>;
    if (
      rows.length !== EXPECTED_MIGRATION_TIMES.length ||
      rows.some(
        (row, index) =>
          Number(row.created_at) !== EXPECTED_MIGRATION_TIMES[index] ||
          row.hash !== EXPECTED_MIGRATION_HASHES[index],
      )
    )
      return 'outdated';
    const [columns] = await connection.query(
      'SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()',
    );
    const observed = new Set(
      (columns as Array<{ table_name: string; column_name: string }>).map(
        (row) => `${row.table_name}.${row.column_name}`,
      ),
    );
    return Object.values(schema).every((table) =>
      Object.values(getTableColumns(table)).every((column) =>
        observed.has(`${getTableName(table)}.${column.name}`),
      ),
    )
      ? 'current'
      : 'outdated';
  } catch (error) {
    return (error as { code?: string }).code === 'ER_NO_SUCH_TABLE'
      ? 'outdated'
      : 'unavailable';
  }
}
