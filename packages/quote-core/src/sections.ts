import type { QuoteDraft } from './index';

/**
 * VNext-10F: sections are all or nothing. With them, every line names one
 * of them and (section, id) is unique; without them, no line names a
 * section and ids are unique. Shared by the draft builder and the schema.
 */
export function quoteSectionsAreConsistent(
  draft: Pick<QuoteDraft, 'lines' | 'sections'>,
): boolean {
  const ids = draft.sections?.map((section) => section.id);
  if (ids && new Set(ids).size !== ids.length) return false;
  if (
    !draft.lines.every((line) =>
      ids
        ? line.sectionId !== undefined && ids.includes(line.sectionId)
        : line.sectionId === undefined,
    )
  )
    return false;
  const seen = new Set<string>();
  for (const line of draft.lines) {
    const key = JSON.stringify([line.sectionId ?? null, line.id]);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
