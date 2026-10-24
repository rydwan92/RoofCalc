import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveConnectionSchedule,
  nodesOfKind,
  type RoofNodeKind,
} from '@cieslacalc/connection-core';
import {
  createRoofSkeleton,
  resolveOpeningFramingSet,
} from '@cieslacalc/roof-math';
import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import type {
  RidgedRoofTemplateSpec,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMember3D,
  SupportSpec,
} from '@cieslacalc/timber-model';
import { ridged } from '../test-templates';
import { roofConnectionModel } from './census';

type ProjectDocumentProject = RoofProjectDocumentV1['project'];

/**
 * VNext-3: counts come from where solved member axes meet. These run the
 * real roof solvers on the reference projects — no hand-made geometry — so
 * a regression in either the solver or the projection shows up here.
 */

function fixture(name: string): ProjectDocumentProject {
  const record = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../../fixtures/projects', name),
      'utf8',
    ),
  ) as { document: { project: ProjectDocumentProject } };
  return structuredClone(record.document.project);
}

function composed(
  project: ProjectDocumentProject,
  roof: RoofTemplateSpec = project.roof,
) {
  const skeleton = createRoofSkeleton(roof);
  const windows = project.features.filter(
    (feature): feature is RoofWindowFeature => feature.kind === 'roof-window',
  );
  return resolveOpeningFramingSet({
    template: roof,
    skeleton,
    features: windows,
    framingSpecs: project.openingFraming,
  }).composedSkeleton.members;
}

function model(
  project: ProjectDocumentProject,
  roof: RoofTemplateSpec = project.roof,
) {
  return roofConnectionModel({
    template: roof,
    members: composed(project, roof),
    buildUp: project.buildUp,
  });
}

const counts = (result: ReturnType<typeof model>) =>
  Object.fromEntries(
    result.census.nodes.map((node) => [node.kind, node.count]),
  ) as Record<RoofNodeKind, number>;

const kindCount = (members: readonly SkeletonMember3D[], kind: string) =>
  members.filter((member) => member.kind === kind).length;

function purlin(
  roof: RidgedRoofTemplateSpec,
  id: string,
  xMm: number,
): SupportSpec {
  return {
    ...structuredClone(roof.wallPlate),
    id,
    kind: 'purlin',
    section: { widthMm: 140, heightMm: 160 },
    placement: { mode: 'horizontal-from-wall', xMm },
  } as SupportSpec;
}

describe('connection nodes on real roofs', () => {
  it('gable: one bearing and one ridge node per rafter, no invented purlin nodes', () => {
    const project = fixture('01-basic-gable.cieslacalc.json');
    const members = composed(project);
    const result = model(project);
    const rafters = kindCount(members, 'rafter');
    expect(rafters).toBeGreaterThan(0);
    expect(counts(result)).toMatchObject({
      'rafter-wall-plate': rafters,
      'rafter-ridge': rafters,
      'rafter-purlin': 0,
      'wall-plate-anchorage': 2,
    });
    // Wall plates: members and length, never an anchor count.
    const anchorage = deriveConnectionSchedule(result.census).find(
      (row) => row.kind === 'wall-plate-anchorage',
    )!;
    expect(anchorage.unit).toBe('member');
    expect(anchorage.extentMm).toBe(2 * ridged(project.roof).buildingLengthMm);
    // Zero occurrences never become a schedule row.
    expect(
      deriveConnectionSchedule(result.census).map((row) => row.kind),
    ).not.toContain('rafter-purlin');
  });

  it('gable: every purlin at its own position crosses every rafter of its side', () => {
    const project = fixture('01-basic-gable.cieslacalc.json');
    const roof: RidgedRoofTemplateSpec = {
      ...ridged(project.roof),
      intermediateSupports: [
        purlin(ridged(project.roof), 'support:purlin-1', 1200),
        purlin(ridged(project.roof), 'support:purlin-2', 2600),
      ],
    } as RidgedRoofTemplateSpec;
    const members = composed(project, roof);
    const result = model(project, roof);
    const rafters = kindCount(members, 'rafter');
    // Two purlins on each side, each under every rafter of that side.
    expect(counts(result)['rafter-purlin']).toBe(2 * rafters);
    const nodes = nodesOfKind(result.projection, 'rafter-purlin');
    // Each node sits where the purlin axis meets the rafter axis.
    for (const node of nodes)
      expect(
        [1200, 2600].some(
          (xMm) =>
            Math.abs(Math.abs(node.location.x) - (roof.halfRunMm - xMm)) < 1,
        ),
      ).toBe(true);
  });

  it('hip: hips on the plate corners, jacks on hips, purlins only where they really cross', () => {
    const project = fixture('02-basic-hip.cieslacalc.json');
    const roof = {
      ...ridged(project.roof),
      intermediateSupports: [
        purlin(ridged(project.roof), 'support:purlin-1', 1500),
      ],
    } as RidgedRoofTemplateSpec;
    const members = composed(project, roof);
    const result = model(project, roof);
    const jacks = members.filter((member) => member.kind === 'jack-rafter');
    const c = counts(result);
    expect(c['hip-rafter-wall-plate']).toBe(4);
    for (const node of nodesOfKind(result.projection, 'hip-rafter-wall-plate'))
      expect(node.members.map((item) => item.role)).toEqual([
        'hip-rafter',
        'wall-plate',
        'wall-plate',
      ]);
    expect(c['hip-rafter-ridge']).toBe(4);
    expect(c['jack-rafter-hip-rafter']).toBe(jacks.length);
    expect(c['jack-rafter-wall-plate']).toBe(jacks.length);
    // Purlins run on the long sides between the hips: a jack bears on one
    // only if it reaches past the purlin line (station beyond 1500 mm).
    const reaching = jacks.filter(
      (jack) =>
        (jack.side === 'left' || jack.side === 'right') &&
        (jack.stationMm ?? 0) > 1500,
    );
    expect(c['jack-rafter-purlin']).toBe(reaching.length);
    expect(c['jack-rafter-purlin']).toBeLessThan(jacks.length);
    // Each purlin ends on two hips: two purlin members, four ends.
    expect(c['purlin-hip-rafter']).toBe(4);
    const sideCommons = members.filter(
      (member) =>
        member.kind === 'rafter' &&
        (member.side === 'left' || member.side === 'right'),
    ).length;
    expect(c['rafter-purlin']).toBe(sideCommons);
  });

  it('hip without a ridge (pyramid) reports the apex instead of hip–ridge nodes', () => {
    const project = fixture('02-basic-hip.cieslacalc.json');
    const roof = {
      ...ridged(project.roof),
      buildingLengthMm: 2 * ridged(project.roof).halfRunMm,
    } as RidgedRoofTemplateSpec;
    const result = model(project, roof);
    expect(counts(result)['hip-rafter-ridge']).toBe(0);
    expect(result.projection.limitations).toContain('apex-without-ridge');
  });

  it('an accepted opening: segments end on headers, headers on trimmers, axes stay', () => {
    const project = fixture('04-hip-opening-framing.cieslacalc.json');
    const framed = composed(project);
    const base = createRoofSkeleton(ridged(project.roof)).members;
    const segments = framed.filter(
      (member) => member.kind === 'rafter-segment',
    );
    expect(segments.length).toBeGreaterThan(0);
    const result = model(project);
    const plain = roofConnectionModel({
      template: ridged(project.roof),
      members: base,
      buildUp: project.buildUp,
    });
    const c = counts(result);
    expect(c['interrupted-rafter-header']).toBe(segments.length);
    expect(c['opening-header-rafter']).toBe(4);
    // The lower pieces still bear on the plate, the upper ones reach the
    // ridge: the opening changes the nodes, not the rafter axes.
    expect(result.projection.axes).toEqual(plain.projection.axes);
    expect(c['rafter-wall-plate']).toBe(counts(plain)['rafter-wall-plate']);
    expect(c['rafter-ridge']).toBe(counts(plain)['rafter-ridge']);
    // A proposal is not part of the accepted composition.
    expect(counts(plain)['interrupted-rafter-header']).toBe(0);
  });

  it('collar ties meet both rafters; a direct ridge joint is one node per pair', () => {
    const project = fixture(
      '10-gable-collar-tie-direct-meeting.cieslacalc.json',
    );
    const members = composed(project);
    const result = model(project);
    const c = counts(result);
    expect(c['collar-tie-rafter']).toBe(2 * kindCount(members, 'collar-tie'));
    expect(c['rafter-ridge']).toBe(kindCount(members, 'rafter') / 2);
  });

  it('recounts after a geometry change and keeps node IDs stable across pitch', () => {
    const project = fixture('01-basic-gable.cieslacalc.json');
    const steeper = model(project, { ...ridged(project.roof), pitchDeg: 45 });
    const base = model(project);
    expect(steeper.projection.nodes.map((node) => node.id)).toEqual(
      base.projection.nodes.map((node) => node.id),
    );
    // Same joints, new places: a ridge node rises with the pitch.
    const ridgeNode = nodesOfKind(base.projection, 'rafter-ridge')[0]!;
    const raised = steeper.projection.nodes.find(
      (node) => node.id === ridgeNode.id,
    )!;
    expect(raised.location.z).toBeGreaterThan(ridgeNode.location.z);
    const denser = model(project, {
      ...ridged(project.roof),
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 400 },
    } as RoofTemplateSpec);
    expect(counts(denser)['rafter-wall-plate']).toBeGreaterThan(
      counts(base)['rafter-wall-plate'],
    );
  });
});
