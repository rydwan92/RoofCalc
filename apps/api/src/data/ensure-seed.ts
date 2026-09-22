/** Automatic seed runs preserve every record present before the run. Explicit
 * import commands retain their normal update semantics. Fresh-run corrections
 * between ordered starter batches still apply to rows created by that run. */
export function preserveSeedRows<T extends { id: string }>(incoming: T[], existing: T[], protectedIds?: ReadonlySet<string>): T[] {
  if (!protectedIds) return incoming;
  const byId = new Map(existing.map((row) => [row.id, row]));
  return incoming.map((row) => protectedIds.has(row.id) ? byId.get(row.id) ?? row : row);
}
