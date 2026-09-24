import type { ProjectSummary } from '@cieslacalc/project-core';

// Device-local navigation preference, deliberately outside project records/history.
const KEY = 'cieslacalc.recentProjects.v1';
function visits(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function rememberProjectVisit(id: string): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [id, ...visits().filter((previous) => previous !== id)].slice(0, 20),
      ),
    );
  } catch {
    /* Local preferences are best effort. */
  }
}
export function recentProjects(
  projects: readonly ProjectSummary[],
): ProjectSummary[] {
  const ids = visits();
  const rank = (id: string) =>
    ids.includes(id) ? ids.indexOf(id) : ids.length;
  return [...projects].sort(
    (a, b) => rank(a.id) - rank(b.id) || b.updatedAt.localeCompare(a.updatedAt),
  );
}
