import { customType } from 'drizzle-orm/mysql-core';

/**
 * The one place an application timestamp crosses into SQL.
 *
 * The domain and the importers speak ISO-8601 UTC (`2026-09-18T10:15:00.000Z`).
 * MariaDB 10.4 in strict mode (XAMPP) rejects that literal for a DATETIME
 * column, and MySQL 8 only accepts it with a warning. Every supported server
 * accepts `YYYY-MM-DD HH:MM:SS`, so the column type converts at the driver
 * boundary instead of each importer formatting strings.
 *
 * Values are stored as UTC wall-clock time, second precision (the columns are
 * DATETIME with fsp 0). Reading converts back to ISO with `Z`.
 */
export function toSqlDateTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time))
    throw new Error(`Not a valid timestamp for SQL persistence: ${value}`);
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ');
}

export function fromSqlDateTime(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : value;
}

/** A DATETIME column holding a UTC instant, exposed to the app as ISO text. */
export const utcDateTime = customType<{
  data: string;
  driverData: string | Date;
}>({
  dataType: () => 'datetime',
  toDriver: (value) => toSqlDateTime(value),
  fromDriver: (value) => fromSqlDateTime(value),
});
