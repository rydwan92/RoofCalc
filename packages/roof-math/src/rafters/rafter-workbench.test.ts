import { describe, expect, it } from 'vitest';
import type { Point2D } from '@cieslacalc/timber-model';
import {
  calculateRafterWorkbench,
  workbenchDefaults,
} from './rafter-workbench';
import { memberToWorld } from '../geometry/frame2d';

function area(points: Point2D[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length]!;
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
const input = {
  ...workbenchDefaults,
  geometry: { runMm: 4000, pitchDeg: 30, overhangMm: 500 },
};
describe('fabrication profile', () => {
  it('has a real notch, with removed area equal to the specified triangle', () => {
    const r = calculateRafterWorkbench(input);
    const unnotchedArea = r.member.referenceLengthMm * input.timber.depthMm;
    const removed =
      (input.wallPlate.seatLengthMm * r.notch.verticalRiseAcrossSeatMm) / 2;
    expect(unnotchedArea - area(r.member.profile)).toBeCloseTo(removed, 7);
    expect(area(r.seatNotch.removedProfile)).toBeCloseTo(removed, 8);
    expect(r.member.profile.length).toBe(7);
  });
  it('places seat at y=0 from x=0 to x=s, with heel cut at x=0', () => {
    const r = calculateRafterWorkbench(input);
    const toWorld = (p: Point2D) => memberToWorld(p, r.member.frame);
    const [heel, toe] = r.seatNotch.seatLine.map(toWorld);
    expect(heel!.x).toBeCloseTo(0, 10);
    expect(heel!.y).toBeCloseTo(0, 10);
    expect(toe!.x).toBeCloseTo(100, 10);
    expect(toe!.y).toBeCloseTo(0, 10);
    const heelBottom = toWorld(r.seatNotch.plumbLine[0]);
    expect(heelBottom.x).toBeCloseTo(0, 10);
    expect(heelBottom.y).toBeCloseTo(-57.735026918963, 10);
    expect(r.supports[0]!.topReference[1].x).toBe(140);
  });
  it('ends the actual top and bottom edges at the near ridge face', () => {
    const r = calculateRafterWorkbench(input);
    for (const point of r.ridgeEnd.line)
      expect(memberToWorld(point, r.member.frame).x).toBeCloseTo(3980, 9);
    const [bottom, top] = r.ridgeEnd.line;
    expect(top.x - bottom.x).toBeCloseTo(200 / Math.sqrt(3), 9);
    expect(r.member.datums.find((d) => d.id === 'D')!.point).toEqual(top);
  });
  it('provides an additive dimension chain on one explicitly named edge', () => {
    const r = calculateRafterWorkbench(input);
    expect(
      r.stations.slice(0, 3).reduce((sum, d) => sum + d.distanceMm, 0),
    ).toBeCloseTo(r.member.referenceLengthMm, 10);
    expect(r.stations.every((d) => d.edge === 'top')).toBe(true);
    for (const station of r.stations) {
      const from = r.member.datums.find((d) => d.id === station.from)!;
      const to = r.member.datums.find((d) => d.id === station.to)!;
      expect(to.point.x - from.point.x).toBeCloseTo(station.distanceMm, 10);
    }
    expect(r.member.minimumStockLengthMm).toBeGreaterThan(
      r.member.referenceLengthMm,
    );
  });
  it('changes width without changing a side elevation and depth changes the profile', () => {
    const r = calculateRafterWorkbench(input);
    const wider = calculateRafterWorkbench({
      ...input,
      timber: { ...input.timber, widthMm: 100 },
    });
    expect(wider.member.profile).toEqual(r.member.profile);
    const deeper = calculateRafterWorkbench({
      ...input,
      timber: { ...input.timber, depthMm: 250 },
    });
    expect(deeper.member.profile).not.toEqual(r.member.profile);
    expect(deeper.notch.normalDepthMm).toBe(r.notch.normalDepthMm);
  });
  it('handles zero overhang without a backtracking profile edge', () => {
    const r = calculateRafterWorkbench({
      ...input,
      geometry: { ...input.geometry, overhangMm: 0 },
      ridge: { thicknessMm: 0 },
    });
    expect(r.member.profile.length).toBe(5);
    expect(r.member.profile[0]).toEqual(r.seatNotch.seatLine[0]);
    expect(r.stations[0]!.distanceMm).toBe(0);
    expect(r.supports[1]!.worldProfile).toEqual([]);
  });
  it.each([1, 80])('returns finite physical geometry at %s°', (pitchDeg) => {
    const r = calculateRafterWorkbench({
      ...input,
      geometry: { ...input.geometry, pitchDeg },
    });
    expect(
      r.member.profile.flatMap((p) => [p.x, p.y]).every(Number.isFinite),
    ).toBe(true);
    expect(r.notch.remainingDepthMm).toBeGreaterThan(0);
  });
  it('rejects overlapping supports, overwide seats and through-depth notches', () => {
    expect(() =>
      calculateRafterWorkbench({
        ...input,
        geometry: { ...input.geometry, runMm: 100 },
      }),
    ).toThrow();
    expect(() =>
      calculateRafterWorkbench({
        ...input,
        wallPlate: { widthMm: 140, seatLengthMm: 141 },
      }),
    ).toThrow();
    expect(() =>
      calculateRafterWorkbench({
        ...input,
        timber: { widthMm: 80, depthMm: 30 },
      }),
    ).toThrow();
    expect(() =>
      calculateRafterWorkbench({ ...input, ridge: { thicknessMm: NaN } }),
    ).toThrow();
  });
});
