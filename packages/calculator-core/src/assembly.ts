import {
  assemblySpecSchema,
  calculateAssembly,
  memberToWorld,
} from '@cieslacalc/roof-math';
import {
  boundsFromPoints,
  clipPolygon,
  datumDisplayLabel,
  type DrawingModel,
  type Point,
} from '@cieslacalc/drawing-engine';
import type { AssemblySpec, ResolvedAssembly } from '@cieslacalc/timber-model';
import type { CalculatorDefinition } from './index';

export function createAssemblyDrawing(
  assembly: ResolvedAssembly,
  focusId?: string,
): DrawingModel {
  const { member } = assembly;
  const world = (p: Point) => memberToWorld(p, member.frame);
  const labels = new Map(
    member.datums.map((d, index) => [d.id, datumDisplayLabel(index)]),
  );
  const first = member.datums[0]!,
    last = member.datums[member.datums.length - 1]!;
  const focusJoint = assembly.joints.find((j) => j.id === focusId);
  const focusCut = assembly.endCuts.find((c) => c.id === focusId);
  const model: DrawingModel = {
    bounds: boundsFromPoints([
      ...member.profile.map(world),
      ...assembly.supports.flatMap((s) => s.worldProfile),
    ]),
    polygons: [
      ...assembly.supports
        .filter((s) => s.worldProfile.length)
        .map((s) => ({
          id: s.id,
          points: s.worldProfile,
          role: 'support' as const,
          selectionId: s.id,
        })),
      {
        id: member.id,
        points: member.profile.map(world),
        role: 'member',
        selectionId: member.id,
      },
    ],
    lines: [
      ...assembly.joints.flatMap((j) => [
        {
          id: `${j.id}:heel`,
          from: world(j.plumbLine[0]),
          to: world(j.plumbLine[1]),
          role: 'cut' as const,
          selectionId: j.id,
        },
        {
          id: `${j.id}:seat`,
          from: world(j.seatLine[0]),
          to: world(j.seatLine[1]),
          role: 'cut' as const,
          selectionId: j.id,
        },
      ]),
      ...assembly.endCuts.map((c) => ({
        id: c.id,
        from: world(c.line[0]),
        to: world(c.line[1]),
        role: 'cut' as const,
        selectionId: c.id,
      })),
      ...assembly.supports
        .filter((s) => s.kind === 'ridge' && !s.worldProfile.length)
        .map((s) => ({
          id: s.id,
          from: s.topReference[0],
          to: s.topReference[1],
          role: 'axis' as const,
          selectionId: s.id,
        })),
    ],
    dimensions: [
      {
        id: 'member-length',
        from: world(first.localPoint),
        to: world(last.localPoint),
        valueMm: member.referenceLengthMm,
        kind: 'aligned',
        fromDatum: first.id,
        toDatum: last.id,
        fromLabel: labels.get(first.id),
        toLabel: labels.get(last.id),
        group: 'primary',
        priority: 100,
      },
      ...member.datums
        .slice(1)
        .map((d, i) => {
          const from = member.datums[i]!;
          return {
            id: `${from.id}/${d.id}`,
            from: world(from.localPoint),
            to: world(d.localPoint),
            valueMm: d.localPoint.x - from.localPoint.x,
            kind: 'aligned' as const,
            fromDatum: from.id,
            toDatum: d.id,
            fromLabel: labels.get(from.id),
            toLabel: labels.get(d.id),
            group: 'support' as const,
            priority: 40,
          };
        })
        .filter((d) => d.valueMm > 1e-8),
    ],
    markers: member.datums.map((d) => ({
      id: d.id,
      at: world(d.localPoint),
      label: labels.get(d.id),
      selectionId: d.entityId,
    })),
    angles: [],
  };
  if (focusJoint || focusCut) {
    const points = focusJoint
      ? focusJoint.removedProfile.map(world)
      : focusCut!.line.map(world);
    const area = boundsFromPoints(points);
    const margin = Math.max(40, member.section.depthMm * 0.45);
    model.bounds = {
      minX: area.minX - margin,
      maxX: area.maxX + margin,
      minY: area.minY - margin,
      maxY:
        area.maxY +
        margin +
        member.section.depthMm /
          Math.cos((member.frame.angleDeg * Math.PI) / 180),
    };
    model.polygons = model.polygons
      ?.map((p) => ({ ...p, points: clipPolygon(p.points, model.bounds) }))
      .filter((p) => p.points.length >= 3);
    if (focusJoint) {
      const removed = clipPolygon(
        focusJoint.removedProfile.map(world),
        model.bounds,
      );
      if (removed.length >= 3)
        model.polygons?.push({
          id: `${focusJoint.id}:removed`,
          points: removed,
          role: 'removed',
          selectionId: focusJoint.id,
        });
    }
    model.lines = model.lines.filter((l) => l.selectionId === focusId);
    model.markers = [];
    model.dimensions = focusJoint
      ? [
          {
            id: `${focusId}:seat`,
            from: world(focusJoint.seatLine[0]),
            to: world(focusJoint.seatLine[1]),
            valueMm: focusJoint.seatLengthMm,
            kind: 'aligned',
            group: 'primary',
            priority: 100,
          },
          {
            id: `${focusId}:depth`,
            from: world(focusJoint.seatLine[0]),
            to: world({ x: focusJoint.seatLine[0].x, y: 0 }),
            valueMm: focusJoint.normalDepthMm,
            kind: 'aligned',
            group: 'joint',
            priority: 80,
          },
        ]
      : [];
  }
  return model;
}
export const assemblyWorkbench: CalculatorDefinition<
  AssemblySpec,
  ReturnType<typeof calculateAssembly>
> = {
  id: 'common-rafter',
  version: '3.0.0',
  category: 'rafters',
  titleKey: 'commonRafter',
  inputSchema: assemblySpecSchema,
  calculate: calculateAssembly,
  createDrawing: (_input, output) => createAssemblyDrawing(output.assembly),
  requiredEntitlement: 'calculator.common-rafter',
};
