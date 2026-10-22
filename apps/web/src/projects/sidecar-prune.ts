import { projectRecordKey } from './local-repository';

export type SidecarStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'key' | 'length'
>;

/**
 * Removes `<namespace>.<projectId>` sidecars (cost estimate, import
 * evidence) whose project RECORD no longer exists. Deliberately not driven
 * by the project index: an unreadable index lists no projects, and pruning
 * on that list would erase the cost estimate of every project (VNext-6.2
 * self-audit). Never throws; returns the keys it removed.
 */
export function pruneOrphanSidecars(
  storage: SidecarStorage | undefined,
  namespace: string,
): string[] {
  if (!storage) return [];
  const prefix = `${namespace}.`;
  try {
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (!name?.startsWith(prefix)) continue;
      const projectId = name.slice(prefix.length);
      if (projectId && storage.getItem(projectRecordKey(projectId)) === null)
        stale.push(name);
    }
    for (const name of stale) storage.removeItem(name);
    return stale;
  } catch {
    return [];
  }
}
