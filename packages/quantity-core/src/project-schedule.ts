import type { QuantitySection, RoofMemberSchedule } from './index';

/** One part of a project (a roof structure) and its own schedule. */
export interface TimberSchedulePart {
  key: string;
  schedule: Pick<RoofMemberSchedule, 'sectionGroups' | 'issues'>;
}

/** An exact section added across parts, with each part's share. */
export interface ProjectTimberSection {
  section: Required<Pick<QuantitySection, 'widthMm' | 'depthMm'>> & {
    completeness: 'complete';
  };
  quantity: number;
  totalLengthMm: number;
  volumeMm3: number;
  parts: { key: string; quantity: number; totalLengthMm: number }[];
}

export interface ProjectTimberSummary {
  /** Exact sections only, narrowest first: the identity timber is added by. */
  sections: ProjectTimberSection[];
  /** Every member of every part, exact section or not. */
  quantity: number;
  totalLengthMm: number;
  /**
   * The volume of the members with an exact section; it is the whole
   * timber volume only when `unsectioned` is empty.
   */
  volumeMm3: number;
  /**
   * Parts with members whose section is not stated exactly, and how many:
   * counted in the totals above, never added to a section row.
   */
  unsectioned: { key: string; quantity: number; totalLengthMm: number }[];
  /** Parts whose schedule reports an issue (a member it could not count). */
  issueKeys: string[];
}

function exactSection(
  section: QuantitySection,
): ProjectTimberSection['section'] | undefined {
  return section.completeness === 'complete' &&
    section.widthMm !== undefined &&
    section.depthMm !== undefined
    ? {
        widthMm: section.widthMm,
        depthMm: section.depthMm,
        completeness: 'complete',
      }
    : undefined;
}

/**
 * VNext-10E (ADR-017 §7): the structural timber of a project of several
 * parts. Each part's schedule is its own geometric schedule; this only adds
 * rows of the same exact section (width × depth) and keeps every part's
 * share. A member without an exact section is counted, named by its part
 * and never guessed into a section. Geometric evidence, not a purchase
 * quantity: no stock length, allowance or price enters here.
 */
export function summarizeProjectTimber(
  parts: readonly TimberSchedulePart[],
): ProjectTimberSummary {
  const sections = new Map<string, ProjectTimberSection>();
  const unsectioned: ProjectTimberSummary['unsectioned'] = [];
  let quantity = 0;
  let totalLengthMm = 0;
  let volumeMm3 = 0;
  for (const part of parts) {
    let missingQuantity = 0;
    let missingLengthMm = 0;
    for (const group of part.schedule.sectionGroups) {
      quantity += group.quantity;
      totalLengthMm += group.totalLengthMm;
      const section = exactSection(group.section);
      if (!section) {
        missingQuantity += group.quantity;
        missingLengthMm += group.totalLengthMm;
        continue;
      }
      const key = `${section.widthMm}x${section.depthMm}`;
      const row = sections.get(key) ?? {
        section,
        quantity: 0,
        totalLengthMm: 0,
        volumeMm3: 0,
        parts: [],
      };
      const groupVolume =
        section.widthMm * section.depthMm * group.totalLengthMm;
      row.quantity += group.quantity;
      row.totalLengthMm += group.totalLengthMm;
      row.volumeMm3 += groupVolume;
      volumeMm3 += groupVolume;
      const share = row.parts.find((candidate) => candidate.key === part.key);
      if (share) {
        share.quantity += group.quantity;
        share.totalLengthMm += group.totalLengthMm;
      } else
        row.parts.push({
          key: part.key,
          quantity: group.quantity,
          totalLengthMm: group.totalLengthMm,
        });
      sections.set(key, row);
    }
    if (missingQuantity > 0)
      unsectioned.push({
        key: part.key,
        quantity: missingQuantity,
        totalLengthMm: missingLengthMm,
      });
  }
  return {
    sections: [...sections.values()].sort(
      (a, b) =>
        a.section.widthMm - b.section.widthMm ||
        a.section.depthMm - b.section.depthMm,
    ),
    quantity,
    totalLengthMm,
    volumeMm3,
    unsectioned,
    issueKeys: parts
      .filter((part) => part.schedule.issues.length > 0)
      .map((part) => part.key),
  };
}
