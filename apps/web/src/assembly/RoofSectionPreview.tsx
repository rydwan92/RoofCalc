import { useMemo } from 'react';
import { createTimberPrismFaces } from '@cieslacalc/drawing-engine';
import { roofTemplateFrameMm } from '@cieslacalc/roof-math';
import type {
  RoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import { workbenchProjectResolver } from './workbench-project';

/** Members that cross the building: one rafter station shows them. */
const ACROSS = new Set<SkeletonMember3D['kind']>([
  'rafter',
  'collar-tie',
  'rafter-segment',
]);
/** Members that run along the building: the section shows their ends. */
const ALONG = new Set<SkeletonMember3D['kind']>([
  'ridge',
  'wall-plate',
  'purlin',
]);
const TOLERANCE_MM = 1;

const near = (a: number, b: number) => Math.abs(a - b) < TOLERANCE_MM;

/**
 * VNext-12: the members a cross-section through the middle of the building
 * meets — the rafter station nearest the middle (a pair, a mono-pitch
 * rafter, a collar tie) and every member running along the building. A
 * roof with no common rafter (a square hip) is cut through its jack
 * rafters. Read from the resolved skeleton; nothing is computed here.
 */
export function roofSectionMembers(skeleton: RoofSkeleton): SkeletonMember3D[] {
  const across = skeleton.members.filter(
    (member) => ACROSS.has(member.kind) && near(member.from.y, member.to.y),
  );
  const pool = across.some((member) => member.kind === 'rafter')
    ? across
    : skeleton.members.filter(
        (member) =>
          member.kind === 'jack-rafter' && near(member.from.y, member.to.y),
      );
  const stations = [...new Set(pool.map((member) => member.from.y))].sort(
    (a, b) => a - b,
  );
  const station = stations[Math.floor(stations.length / 2)];
  return [
    ...skeleton.members.filter(
      (member) =>
        ALONG.has(member.kind) &&
        near(member.from.x, member.to.x) &&
        near(member.from.z, member.to.z),
    ),
    ...(station === undefined
      ? []
      : pool.filter((member) => near(member.from.y, station))),
  ];
}

/** Signed area of a drawn polygon (mm²). */
function polygonArea(points: readonly { x: number; y: number }[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

const orientationOf = (member: SkeletonMember3D) =>
  member.kind === 'rafter' ||
  member.kind === 'hip-rafter' ||
  member.kind === 'jack-rafter'
    ? ('along-roof' as const)
    : ('along-building' as const);

/**
 * VNext-12: the roof in cross-section — the same timber prisms the
 * workbench draws (drawing-engine), seen square-on across the building, so
 * pitch, overhang, collar tie and ridge read as they will be built.
 */
export function RoofSectionPreview({
  template,
  label,
  invalidLabel,
  widthLabel,
}: {
  template?: RoofTemplateSpec;
  label: string;
  invalidLabel: string;
  /** The building width as the user typed it, with its unit. */
  widthLabel: string;
}) {
  const drawing = useMemo(() => {
    if (!template) return undefined;
    try {
      const { skeleton } = workbenchProjectResolver.resolve(template);
      const members = roofSectionMembers(skeleton);
      // The lowest wall plate's level: the line the pitch is read from.
      const plates = members.filter((member) => member.kind === 'wall-plate');
      const plateLevelMm = plates.length
        ? Math.min(...plates.map((member) => member.from.z))
        : 0;
      const shapes = members.flatMap((member) => {
        try {
          return (
            createTimberPrismFaces(
              { from: member.from, to: member.to },
              member.section,
              orientationOf(member),
            )
              .map((face) => ({
                key: `${member.id}:${face.id}`,
                kind: member.kind,
                // Across the building to the right, up the page.
                points: face.points.map((point) => ({
                  x: point.x,
                  y: -point.z,
                })),
              }))
              // A face seen edge-on draws nothing.
              .filter((shape) => Math.abs(polygonArea(shape.points)) > 1)
          );
        } catch {
          return [];
        }
      });
      if (!shapes.length) return undefined;
      return { shapes, plateLevelMm, frame: roofTemplateFrameMm(template) };
    } catch {
      return undefined;
    }
  }, [template]);
  if (!template || !drawing)
    return (
      <div className="a-start-preview-empty" role="status">
        {invalidLabel}
      </div>
    );
  const points = drawing.shapes.flatMap((shape) => shape.points);
  const minX = Math.min(
    ...points.map((point) => point.x),
    drawing.frame.leftMm,
  );
  const maxX = Math.max(
    ...points.map((point) => point.x),
    drawing.frame.rightMm,
  );
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const size = Math.max(maxX - minX, maxY - minY);
  const pad = size * 0.08;
  const text = size * 0.045;
  const dimensionY = maxY + text * 1.6;
  const plateY = -drawing.plateLevelMm;
  // The pitch sits inside the roof, just above the wall-plate line.
  const left = drawing.frame.leftMm + size * 0.1;
  const right = drawing.frame.rightMm - size * 0.1;
  const pitches =
    template.type === 'asymmetric-gable'
      ? [
          { x: left, pitchDeg: template.pitchDeg, anchor: 'start' as const },
          {
            x: right,
            pitchDeg: template.rightPitchDeg,
            anchor: 'end' as const,
          },
        ]
      : template.type === 'mono-pitch'
        ? [{ x: left, pitchDeg: template.pitchDeg, anchor: 'start' as const }]
        : [
            { x: left, pitchDeg: template.pitchDeg, anchor: 'start' as const },
            { x: right, pitchDeg: template.pitchDeg, anchor: 'end' as const },
          ];
  return (
    <svg
      className="a-start-plan a-start-section"
      data-testid="project-start-section"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${dimensionY - minY + text + pad * 2}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {drawing.shapes.map((shape) => (
        <polygon
          key={shape.key}
          className={`section-member kind-${shape.kind}`}
          points={shape.points
            .map((point) => `${point.x},${point.y}`)
            .join(' ')}
        />
      ))}
      <line
        className="section-level"
        x1={drawing.frame.leftMm}
        x2={drawing.frame.rightMm}
        y1={plateY}
        y2={plateY}
      />
      {pitches.map((pitch) => (
        <text
          key={pitch.anchor}
          className="section-pitch"
          x={pitch.x}
          y={plateY - text * 0.45}
          fontSize={text}
          textAnchor={pitch.anchor}
        >
          {`${pitch.pitchDeg}°`}
        </text>
      ))}
      <line
        className="section-dimension"
        x1={drawing.frame.leftMm}
        x2={drawing.frame.rightMm}
        y1={dimensionY}
        y2={dimensionY}
      />
      {[drawing.frame.leftMm, drawing.frame.rightMm].map((x) => (
        <line
          key={x}
          className="section-dimension"
          x1={x}
          x2={x}
          y1={dimensionY - text * 0.5}
          y2={dimensionY + text * 0.5}
        />
      ))}
      <text
        className="section-dimension-label"
        x={(drawing.frame.leftMm + drawing.frame.rightMm) / 2}
        y={dimensionY - text * 0.35}
        fontSize={text}
        textAnchor="middle"
      >
        {widthLabel}
      </text>
    </svg>
  );
}
