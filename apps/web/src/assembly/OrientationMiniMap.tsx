import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MemberInstanceContext } from '@cieslacalc/calculator-core';
import {
  boundsFromPoints,
  fitDrawing,
  projectAxonometric,
  type Point,
} from '@cieslacalc/drawing-engine';
import type { RoofSkeleton } from '@cieslacalc/timber-model';

const mapWidth = 184;
const mapHeight = 112;

export function OrientationMiniMap({
  skeleton,
  instance,
}: {
  skeleton: RoofSkeleton;
  instance: MemberInstanceContext;
}) {
  const { t } = useTranslation();
  const scene = useMemo(() => {
    const members = skeleton.members.map((member) => ({
      ...member,
      from2d: projectAxonometric(member.from),
      to2d: projectAxonometric(member.to),
    }));
    const guides = (skeleton.guides ?? []).map((guide) => ({
      ...guide,
      points2d: guide.points.map((point) => projectAxonometric(point)),
    }));
    const points = [
      ...members.flatMap((member) => [member.from2d, member.to2d]),
      ...guides.flatMap((guide) => guide.points2d),
    ];
    const fit = fitDrawing(boundsFromPoints(points), {
      width: mapWidth,
      height: mapHeight,
      padding: 12,
    });
    const point = (value: Point) => fit.project(value);
    return { members, guides, point };
  }, [skeleton]);
  return (
    <figure className="a-orientation-map" data-testid="orientation-minimap">
      <figcaption>{t('assembly.orientationLocator')}</figcaption>
      <svg
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        role="img"
        aria-label={t('assembly.orientationLocatorFor', {
          code: instance.familyCode,
          current: instance.instanceIndex,
          total: instance.instanceCount,
        })}
      >
        {scene.guides.map((guide) => (
          <polygon
            key={guide.id}
            className="a-minimap-roof-plane"
            points={guide.points2d
              .map(scene.point)
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
          />
        ))}
        {scene.members.map((member) => {
          const from = scene.point(member.from2d);
          const to = scene.point(member.to2d);
          const selected = member.id === instance.instanceId;
          const related = member.prototypeId === instance.prototypeId;
          return (
            <line
              key={member.id}
              className={`a-minimap-member ${selected ? 'is-selected' : related ? 'is-related' : 'is-muted'}`}
              data-instance-id={member.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
      </svg>
      <span>
        {instance.roofPlaneRole
          ? t(`assembly.${instance.roofPlaneRole}`)
          : t(`assembly.${instance.side}`)}
        {instance.hipCorner ? ` · ${t(`assembly.${instance.hipCorner}`)}` : ''}
      </span>
    </figure>
  );
}
