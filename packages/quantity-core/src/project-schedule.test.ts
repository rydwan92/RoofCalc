import { describe, expect, it } from 'vitest';
import type { QuantitySection, QuantitySectionGroup } from './index';
import { summarizeProjectTimber, type TimberSchedulePart } from './index';

function group(
  section: QuantitySection,
  quantity: number,
  totalLengthMm: number,
): QuantitySectionGroup {
  return {
    id: `section:${section.widthMm}x${section.depthMm}`,
    section,
    rowIds: [],
    familyKeys: [],
    quantity,
    totalLengthMm,
    volumeStatus: 'unavailable',
  };
}

const exact = (widthMm: number, depthMm: number): QuantitySection => ({
  widthMm,
  depthMm,
  completeness: 'complete',
});

function part(key: string, groups: QuantitySectionGroup[]): TimberSchedulePart {
  return { key, schedule: { sectionGroups: groups, issues: [] } };
}

/** VNext-10E: the timber of several structures, added by exact section. */
describe('summarizeProjectTimber', () => {
  it('adds the same exact section across parts and keeps each share', () => {
    const summary = summarizeProjectTimber([
      part('house', [
        group(exact(140, 80), 2, 20_000),
        group(exact(80, 200), 10, 40_000),
      ]),
      part('garage', [group(exact(80, 200), 6, 18_000)]),
    ]);
    expect(summary.sections).toEqual([
      {
        section: exact(80, 200),
        quantity: 16,
        totalLengthMm: 58_000,
        // 80 × 200 × 58 000 mm³ = 0.928 m³, by hand.
        volumeMm3: 928_000_000,
        parts: [
          { key: 'house', quantity: 10, totalLengthMm: 40_000 },
          { key: 'garage', quantity: 6, totalLengthMm: 18_000 },
        ],
      },
      {
        section: exact(140, 80),
        quantity: 2,
        totalLengthMm: 20_000,
        volumeMm3: 224_000_000,
        parts: [{ key: 'house', quantity: 2, totalLengthMm: 20_000 }],
      },
    ]);
    expect(summary.quantity).toBe(18);
    expect(summary.totalLengthMm).toBe(78_000);
    expect(summary.volumeMm3).toBe(1_152_000_000);
    expect(summary.unsectioned).toEqual([]);
    expect(summary.issueKeys).toEqual([]);
  });

  it('counts a member without an exact section, never guessing it into one', () => {
    const summary = summarizeProjectTimber([
      part('house', [
        group(exact(80, 200), 10, 40_000),
        group({ widthMm: 40, completeness: 'partial' }, 1, 9_000),
      ]),
      part('garage', [group(exact(80, 200), 6, 18_000)]),
    ]);
    expect(summary.sections.map((row) => row.quantity)).toEqual([16]);
    expect(summary.quantity).toBe(17);
    expect(summary.totalLengthMm).toBe(67_000);
    // The volume is of the exact sections only, and says so.
    expect(summary.volumeMm3).toBe(928_000_000);
    expect(summary.unsectioned).toEqual([
      { key: 'house', quantity: 1, totalLengthMm: 9_000 },
    ]);
  });

  it('names a part whose schedule could not count a member', () => {
    const summary = summarizeProjectTimber([
      part('house', [group(exact(80, 200), 1, 4_000)]),
      {
        key: 'garage',
        schedule: {
          sectionGroups: [],
          issues: [{ sourceId: 'member:1', code: 'invalid-axis' }],
        },
      },
    ]);
    expect(summary.issueKeys).toEqual(['garage']);
    expect(summary.quantity).toBe(1);
  });

  it('is empty for no parts', () => {
    expect(summarizeProjectTimber([])).toEqual({
      sections: [],
      quantity: 0,
      totalLengthMm: 0,
      volumeMm3: 0,
      unsectioned: [],
      issueKeys: [],
    });
  });
});
