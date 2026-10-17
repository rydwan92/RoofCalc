import { describe, expect, it } from 'vitest';
import {
  fastenerRowFit,
  minimumSpacingsEc5,
  spacingEnvelopeEc5,
} from './spacing';

/**
 * Hand-checked vectors, EN 1995-1-1 Table 8.4 (bolts) and 8.5 (dowels).
 * Every expected value is worked out in the comment from the table row.
 */
describe('EN 1995-1-1 Table 8.4 — bolts', () => {
  const bolt = (diameterMm: number, angleDeg: number) =>
    minimumSpacingsEc5({ fastener: 'bolt', diameterMm, angleDeg });

  it('M12, force along the grain (α = 0°)', () => {
    const s = bolt(12, 0);
    expect(s.table).toBe('Tablica 8.4');
    expect(s.a1.mm).toBe(60); // (4 + |cos 0|)·12 = 5·12
    expect(s.a2.mm).toBe(48); // 4·12
    expect(s.a3).toMatchObject({ mm: 84, end: 'loaded' }); // max(7·12; 80)
    expect(s.a4).toMatchObject({ mm: 36, edge: 'loaded' }); // max(2·12; 3·12)
  });

  it('M12, force across the grain (α = 90°)', () => {
    const s = bolt(12, 90);
    expect(s.a1.mm).toBe(48); // (4 + 0)·12
    expect(s.a3).toMatchObject({ mm: 84, end: 'loaded' });
    expect(s.a4).toMatchObject({ mm: 48, edge: 'loaded' }); // (2 + 2)·12
  });

  it('M12 towards the unloaded end (α = 120°, 180°, 240°)', () => {
    // (1 + 6 sin 120°)·12 = (1 + 5.19615)·12 = 74.35 > 4·12
    expect(bolt(12, 120).a3).toMatchObject({ mm: 74.4, end: 'unloaded' });
    expect(bolt(12, 120).a1.mm).toBe(54); // (4 + 0.5)·12
    // 150° ≤ α < 210°: 4d
    expect(bolt(12, 180).a3).toMatchObject({ mm: 48, end: 'unloaded' });
    // 210° ≤ α ≤ 270°: (1 + 6|sin 240°|)·12 = 74.35; unloaded edge 3d
    expect(bolt(12, 240).a3.mm).toBe(74.4);
    expect(bolt(12, 240).a4).toMatchObject({ mm: 36, edge: 'unloaded' });
  });

  it('the 80 mm floor of the loaded end governs small bolts', () => {
    expect(bolt(10, 0).a3.mm).toBe(80); // max(70; 80)
    expect(bolt(16, 0).a3.mm).toBe(112); // max(112; 80)
  });

  it('α = −90° is the same direction as 270° (a loaded end)', () => {
    expect(bolt(12, -90).a3).toMatchObject({ mm: 84, end: 'loaded' });
    expect(bolt(12, -90).angleDeg).toBe(270);
  });

  it('refuses diameters outside 6–30 mm', () => {
    expect(() => bolt(5, 0)).toThrow(RangeError);
    expect(() => bolt(36, 0)).toThrow(RangeError);
  });
});

describe('EN 1995-1-1 Table 8.5 — dowels', () => {
  const dowel = (diameterMm: number, angleDeg: number) =>
    minimumSpacingsEc5({ fastener: 'dowel', diameterMm, angleDeg });

  it('Ø12 at α = 0° and 90°', () => {
    expect(dowel(12, 0).a1.mm).toBe(60); // (3 + 2·1)·12
    expect(dowel(12, 0).a2.mm).toBe(36); // 3·12
    expect(dowel(12, 0).a3.mm).toBe(84); // max(84; 80)
    expect(dowel(12, 90).a1.mm).toBe(36); // (3 + 0)·12
    expect(dowel(12, 90).a4.mm).toBe(48); // max((2 + 2)·12; 36)
  });

  it('Ø12 towards the unloaded end: a3,t·|sin α| or 3d', () => {
    // max(84·sin 120°; 36) = max(72.75; 36)
    expect(dowel(12, 120).a3).toMatchObject({ mm: 72.7, end: 'unloaded' });
    expect(dowel(12, 180).a3.mm).toBe(36);
  });
});

describe('detailing envelope and row fit', () => {
  it('takes the governing value over every force direction', () => {
    expect(spacingEnvelopeEc5({ fastener: 'bolt', diameterMm: 12 })).toEqual({
      a1: 60,
      a2: 48,
      a3: 84,
      a4: 48,
    });
  });

  it('two M12 bolts fit across an 18 cm rafter, three do not', () => {
    // 2·48 + 1·48 = 144 ≤ 180
    expect(
      fastenerRowFit({
        fastener: 'bolt',
        diameterMm: 12,
        count: 2,
        memberDepthMm: 180,
      }),
    ).toEqual({ status: 'fits', requiredDepthMm: 144, availableDepthMm: 180 });
    // 2·48 + 2·48 = 192 > 180; room 180 − 96 = 84 → 1 + ⌊84/48⌋ = 2
    expect(
      fastenerRowFit({
        fastener: 'bolt',
        diameterMm: 12,
        count: 3,
        memberDepthMm: 180,
      }),
    ).toEqual({
      status: 'too-shallow',
      requiredDepthMm: 192,
      availableDepthMm: 180,
      maxCount: 2,
    });
  });
});
