import { describe, expect, it } from 'vitest';
import { assessRoofScene } from './assess';
import {
  classifyPlanOutline,
  outlineStructureCandidates,
  outlineSupport,
} from './outline';

const rotate = (points: { x: number; y: number }[], degrees: number) => {
  const r = (degrees * Math.PI) / 180;
  return points.map(({ x, y }) => ({
    x: x * Math.cos(r) - y * Math.sin(r) + 5000,
    y: x * Math.sin(r) + y * Math.cos(r) - 2000,
  }));
};

const RECTANGLE = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 0, y: 8000 },
];
/** 12 × 8 m main body with a 6 × 6 m wing at one end. */
const L = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 6000, y: 8000 },
  { x: 6000, y: 14000 },
  { x: 0, y: 14000 },
];
const T = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 9000, y: 8000 },
  { x: 9000, y: 14000 },
  { x: 3000, y: 14000 },
  { x: 3000, y: 8000 },
  { x: 0, y: 8000 },
];

describe('plan outline classification (ADR-015 layer a)', () => {
  it("a rectangle can start today's gable or hip", () => {
    const outline = classifyPlanOutline(RECTANGLE);
    expect(outline).toMatchObject({
      shape: 'rectangle',
      corners: 4,
      reflexCorners: 0,
      areaMm2: 96_000_000,
    });
    expect(outline.wings[0]).toMatchObject({ longMm: 12000, shortMm: 8000 });
    expect(outlineSupport(outline)).toEqual({
      status: 'template',
      templates: ['gable', 'hip'],
    });
  });

  it('an L is recognised, split into its wings and NOT supported', () => {
    const outline = classifyPlanOutline(L);
    expect(outline).toMatchObject({
      shape: 'l-shape',
      corners: 6,
      reflexCorners: 1,
      areaMm2: 132_000_000,
    });
    expect(outline.wings.map((wing) => [wing.longMm, wing.shortMm])).toEqual([
      [12000, 8000],
      [6000, 6000],
    ]);
    expect(outlineSupport(outline)).toEqual({
      status: 'not-supported',
      reason: 'compound-outline',
    });
  });

  it('a rotated L with an extra collinear point is still an L', () => {
    const withMidpoint = [L[0]!, { x: 6000, y: 0 }, ...L.slice(1)];
    const outline = classifyPlanOutline(rotate(withMidpoint, 33));
    expect(outline.shape).toBe('l-shape');
    expect(outline.corners).toBe(6);
    expect(outline.wings[0]!.longMm).toBeCloseTo(12000, 6);
    expect(outline.wings[1]!.longMm).toBeCloseTo(6000, 6);
  });

  it('a T (two inner corners) is a compound outline without a split', () => {
    const outline = classifyPlanOutline(T);
    expect(outline).toMatchObject({
      shape: 'compound-orthogonal',
      reflexCorners: 2,
      wings: [],
    });
    expect(outlineSupport(outline).status).toBe('not-supported');
  });

  it('a skewed quadrilateral is not orthogonal', () => {
    const outline = classifyPlanOutline([
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 11000, y: 6000 },
      { x: 0, y: 6000 },
    ]);
    expect(outline.shape).toBe('non-orthogonal');
    expect(outlineSupport(outline)).toEqual({
      status: 'not-supported',
      reason: 'non-orthogonal-outline',
    });
  });

  it('L candidates are structures without planes and an unresolved junction', () => {
    const graph = outlineStructureCandidates(classifyPlanOutline(L), {
      kind: 'cad',
    });
    expect(graph.structures).toHaveLength(2);
    expect(graph.planes).toEqual([]);
    expect(graph.connections[0]).toMatchObject({
      status: 'unresolved',
      edgeIds: [],
    });
    const assessment = assessRoofScene(graph);
    expect(assessment.geometry).toBe('partial');
    expect(assessment.calculation).toBe('not-supported');
  });
});
