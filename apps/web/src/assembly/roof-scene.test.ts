import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectRecordV1Schema } from '@cieslacalc/project-core';
import {
  resolveMonoPitchRoof,
  resolveRoofFeatureTopology,
  resolveRoofSurfaceGeometry,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import {
  assessRoofScene,
  roofSceneFromResolvedRoof,
  roofSceneMetrics,
} from '@cieslacalc/roof-topology-core';
import { deriveProjectRoofScene } from './roof-scene';

/**
 * VNext-6.1 P0-B: every reference project (gable, hip, windows, opening
 * framing, every covering family) goes through the ONE production adapter
 * and comes out identical to the solver: same planes, areas, pitches,
 * lines, openings and source references — and the consistency gate passes.
 */
const directory = fileURLToPath(
  new URL('../../../../fixtures/projects/', import.meta.url),
);
const fixtures = readdirSync(directory)
  .filter((name) => name.endsWith('.cieslacalc.json'))
  .sort();

describe.each(fixtures)('reference project %s', (name) => {
  const record = projectRecordV1Schema.parse(
    JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')),
  );
  const { roof: template, features } = record.document.project;
  const surface = resolveRoofSurfaceGeometry({ template, features });
  const topology = resolveRoofFeatureTopology(surface);
  const { scene, assessment, gate } = deriveProjectRoofScene({
    template,
    surface,
    topology,
  });
  const metrics = roofSceneMetrics(scene);

  it('passes the consistency gate and is calculated by the solver', () => {
    expect(gate).toEqual({
      geometry: 'complete',
      calculation: 'supported',
      issueCodes: [],
    });
    expect(
      assessment.issues.filter((issue) => issue.severity === 'invalid'),
    ).toEqual([]);
  });

  it('keeps every plane, its area, plan area, pitch and source reference', () => {
    expect(scene.planes.map((plane) => plane.source.ref)).toEqual(
      roofPlaneIds(template),
    );
    surface.planes.forEach((plane, index) => {
      expect(metrics.planes[index]!.areaMm2).toBeCloseTo(plane.grossAreaMm2, 3);
      expect(metrics.planes[index]!.planAreaMm2).toBeCloseTo(
        plane.grossAreaMm2 * Math.cos((template.pitchDeg * Math.PI) / 180),
        3,
      );
      expect(scene.planes[index]!.pitchDeg).toBeCloseTo(template.pitchDeg, 9);
    });
  });

  it('keeps every roof line and every opening', () => {
    expect(scene.edges.map((edge) => [edge.kind, edge.source.ref])).toEqual(
      topology.features.map((feature) => [feature.kind, feature.id]),
    );
    expect(scene.openings.map((opening) => opening.source.ref)).toEqual(
      surface.planes.flatMap((plane) =>
        plane.openingPolygons.map((opening) => opening.featureId),
      ),
    );
    if (metrics.openingAreaExact)
      expect(metrics.totalOpeningAreaMm2).toBeCloseTo(
        surface.openingAreaMm2,
        3,
      );
  });
});

/**
 * VNext-7A: the mono-pitch solver goes through the SAME adapter and the same
 * assessment. The plane closes, but the roof is not calculated end to end,
 * so the gate keeps it `not-supported` (docs/domain/MONO_PITCH_ROOF.md §6).
 */
describe('mono-pitch 6 × 4 m at 15° through the roof graph', () => {
  const roof = resolveMonoPitchRoof({
    type: 'mono-pitch',
    id: 'template:mono-demo',
    buildingLengthMm: 6000,
    runMm: 4000,
    pitchDeg: 15,
    lowEaveOverhangMm: 0,
    topEdge: 'abutment',
    highOverhangMm: 0,
    vergeOverhangMm: 0,
  });
  const scene = roofSceneFromResolvedRoof({
    structureId: 'structure:lean-to',
    template: 'mono-pitch',
    planes: roof.planes,
    lines: roof.lines,
  });
  const metrics = roofSceneMetrics(scene);
  const assessment = assessRoofScene(scene);

  it('keeps the solver plane, area, pitch and lines without recomputing', () => {
    expect(scene.planes).toHaveLength(1);
    expect(scene.planes[0]!.pitchDeg).toBeCloseTo(15, 9);
    expect(metrics.totalAreaMm2).toBeCloseTo(roof.grossAreaMm2, 3);
    expect(metrics.totalAreaMm2).toBeCloseTo(
      24_000_000 / Math.cos((15 * Math.PI) / 180),
      3,
    );
    expect(metrics.totalPlanAreaMm2).toBeCloseTo(24_000_000, 3);
    expect(scene.edges.map((edge) => [edge.kind, edge.source.ref])).toEqual(
      roof.lines.map((line) => [line.kind, line.id]),
    );
  });

  it('is complete geometry and NOT a calculated roof', () => {
    expect(assessment.geometry).toBe('complete');
    expect(assessment.calculation).toBe('not-supported');
    expect(assessment.limits).toEqual([
      {
        code: 'template-not-calculated',
        structureId: 'structure:lean-to',
        template: 'mono-pitch',
      },
    ]);
  });

  it('a free top edge is accepted as a mono-pitch ridge', () => {
    const free = resolveMonoPitchRoof({
      ...roof.spec,
      topEdge: 'free',
      highOverhangMm: 300,
      lowEaveOverhangMm: 500,
      vergeOverhangMm: 200,
    });
    const graph = roofSceneFromResolvedRoof({
      structureId: 'structure:lean-to',
      template: 'mono-pitch',
      planes: free.planes,
      lines: free.lines,
    });
    expect(assessRoofScene(graph).geometry).toBe('complete');
  });
});
