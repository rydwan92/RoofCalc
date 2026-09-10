import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  boundsFromPoints,
  fitDrawing,
  projectAxonometric,
} from '@cieslacalc/drawing-engine';
import { createGableRoofSkeleton } from '@cieslacalc/roof-math';
import type {
  GableRoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { useAssembly } from './store';

function memberLabel(
  member: SkeletonMember3D,
  t: (key: string) => string,
) {
  return t(
    `assembly.${member.kind === 'rafter' ? 'rafter' : member.kind}`,
  );
}

export function SkeletonCanvas({
  template,
}: {
  template: GableRoofTemplateSpec;
}) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(820);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const skeleton = createGableRoofSkeleton(template);
  const height = width < 550 ? 400 : 570;
  const projected = skeleton.members.map((member) => ({
    member,
    from: projectAxonometric(member.from),
    to: projectAxonometric(member.to),
  }));
  const projection = fitDrawing(
    boundsFromPoints(projected.flatMap(({ from, to }) => [from, to])),
    { width, height, padding: width < 550 ? 44 : 88 },
  );
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const select = (member: SkeletonMember3D) => state.select(member.selectionId);
  const keySelect = (event: KeyboardEvent<SVGGElement>, member: SkeletonMember3D) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(member);
    }
  };
  return (
    <div className="a-canvas a-skeleton" ref={container}>
      <div className="a-canvas-toolbar">
        <span>{t('assembly.skeleton')}</span>
        <output aria-live="polite">
          {t('assembly.rafterPairCount', {
            count: skeleton.members.filter((member) => member.kind === 'rafter').length / 2,
          })}
        </output>
      </div>
      <svg
        className="a-drawing"
        data-testid="skeleton-drawing"
        role="group"
        aria-label={t('assembly.skeletonDrawing')}
        style={{ height }}
      >
        <title>{t('assembly.skeletonDrawing')}</title>
        <g className="a-skeleton-members">
          {projected.map(({ member, from, to }) => {
            const a = projection.project(from),
              b = projection.project(to);
            return (
              <g
                key={member.id}
                data-entity={member.id}
                role="button"
                tabIndex={0}
                aria-label={memberLabel(member, t)}
                aria-pressed={state.selected === member.selectionId}
                className={`a-skeleton-member kind-${member.kind} ${state.selected === member.selectionId ? 'is-selected' : ''}`}
                onClick={() => select(member)}
                onKeyDown={(event) => keySelect(event, member)}
              >
                <line className="a-skeleton-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <line className="a-skeleton-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              </g>
            );
          })}
        </g>
      </svg>
      <dl className="a-skeleton-metrics">
        <div>
          <dt>{t('assembly.buildingLength')}</dt>
          <dd>{length(template.buildingLengthMm)}</dd>
        </div>
        <div>
          <dt>{t('assembly.span')}</dt>
          <dd>{length(template.halfRunMm * 2)}</dd>
        </div>
        <div>
          <dt>{t('assembly.ridgeHeight')}</dt>
          <dd>{length(skeleton.ridgeHeightMm)}</dd>
        </div>
      </dl>
      <p className="a-canvas-hint">{t('assembly.skeletonHint')}</p>
    </div>
  );
}