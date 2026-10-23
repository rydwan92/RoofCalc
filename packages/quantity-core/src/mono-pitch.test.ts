import { describe, expect, it } from 'vitest';
import {
  createMonoPitchSkeleton,
  resolveMonoPitchFraming,
} from '@cieslacalc/roof-math';
import { createRoofMemberSchedule } from './index';

/**
 * VNext-7B-2: the timber schedule of a mono-pitch roof comes from the same
 * `createRoofMemberSchedule` as a gable — it reads skeleton members, not
 * roof types. Lengths are axis-geometric (the reference line), as for K1 of
 * a gable; the straight stock per rafter is fabrication data, not here.
 */
const framing = resolveMonoPitchFraming({
  roof: {
    type: 'mono-pitch',
    id: 'template:lean-to',
    buildingLengthMm: 6000,
    runMm: 4000,
    pitchDeg: 15,
    lowEaveOverhangMm: 500,
    topEdge: 'free',
    highOverhangMm: 300,
    vergeOverhangMm: 300,
  },
  rafter: {
    section: { widthMm: 80, depthMm: 200 },
    spacing: { mode: 'max-even-spacing', spacingMm: 900 },
  },
  lowSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
  highSupport: { kind: 'wall-plate', widthMm: 160, heightMm: 120, seatMm: 100 },
});

describe('mono-pitch timber schedule', () => {
  const schedule = createRoofMemberSchedule({
    skeleton: createMonoPitchSkeleton(framing),
  });

  it('lists 8 identical K1 rafters and the two plates', () => {
    expect(schedule.issues).toEqual([]);
    const rows = schedule.timberRows.map((row) => ({
      family: row.familyKey,
      kind: row.memberKind,
      quantity: row.quantity,
      lengthMm: row.lengthMm,
      section: [row.section.widthMm, row.section.depthMm],
    }));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          family: 'K1',
          kind: 'rafter',
          quantity: 8,
          lengthMm: expect.closeTo(4800 / Math.cos((15 * Math.PI) / 180), 6),
          section: [80, 200],
        },
        {
          family: 'M',
          kind: 'wall-plate',
          quantity: 1,
          lengthMm: 6000,
          section: [140, 140],
        },
        {
          family: 'M',
          kind: 'wall-plate',
          quantity: 1,
          lengthMm: 6000,
          section: [160, 120],
        },
      ]),
    );
    expect(rows).toHaveLength(3);
  });

  it('sums the timber exactly', () => {
    const k1 = schedule.timberRows.find((row) => row.familyKey === 'K1')!;
    expect(k1.totalLengthMm).toBeCloseTo(8 * k1.lengthMm, 6);
    expect(k1.volumeMm3).toBeCloseTo(8 * k1.lengthMm * 80 * 200, 0);
  });
});
