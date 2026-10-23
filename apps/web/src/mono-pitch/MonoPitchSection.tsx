import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAssemblyDrawing } from '@cieslacalc/calculator-core';
import {
  fitDimensionedDrawing,
  layoutDimensionLanes,
  type DrawingDimension,
  type Point,
} from '@cieslacalc/drawing-engine';
import type { LengthUnit } from '@cieslacalc/roof-math';
import type { ResolvedAssembly } from '@cieslacalc/timber-model';
import { formatLength } from '../format';

/**
 * VNext-7B-3: the rafter section of the mono-pitch roof — read-only and
 * drawn from the same `createAssemblyDrawing` model as the gable rafter, so
 * the picture cannot disagree with the numbers next to it.
 */
export function MonoPitchSection({
  assembly,
  unit,
}: {
  assembly: ResolvedAssembly;
  unit: LengthUnit;
}) {
  const { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const compact = width < 560;
  const height = Math.max(220, Math.round(width * (compact ? 0.62 : 0.42)));
  const model = createAssemblyDrawing(assembly);
  // On a phone only the overall length; the chain is in the marking list.
  const dimensions = model.dimensions.filter(
    (dimension) => !compact || dimension.group === 'primary',
  );
  const label = (d: DrawingDimension) =>
    `${d.fromLabel ? `${d.fromLabel}→${d.toLabel} · ` : ''}${formatLength(
      d.valueMm,
      unit,
      i18n.language,
    )} ${unit}`;
  const labelWidth = (d: DrawingDimension) => label(d).length * 6.5;
  const { project } = fitDimensionedDrawing(
    model.bounds,
    { width, height, padding: compact ? 36 : 64 },
    dimensions,
    labelWidth,
  );
  const lanes = layoutDimensionLanes(dimensions, project, labelWidth);
  const points = (vertices: readonly Point[]) =>
    vertices
      .map(project)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  return (
    <figure className="mono-section" ref={container}>
      <svg
        role="img"
        aria-label={t('assembly.monoPitch.drawing')}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        data-testid="mono-pitch-section"
      >
        {(model.polygons ?? []).map((polygon) => (
          <polygon
            key={polygon.id}
            className={`mono-${polygon.role}`}
            points={points(polygon.points)}
          />
        ))}
        {model.lines.map((line) => {
          const a = project(line.from),
            b = project(line.to);
          return (
            <line
              key={line.id}
              className={`mono-line-${line.role}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        {lanes.map(({ dimension, layout }) => (
          <g key={dimension.id} className="mono-dimension">
            <line
              className="mono-extension"
              x1={layout.extensionA.x}
              y1={layout.extensionA.y}
              x2={layout.a.x}
              y2={layout.a.y}
            />
            <line
              className="mono-extension"
              x1={layout.extensionB.x}
              y1={layout.extensionB.y}
              x2={layout.b.x}
              y2={layout.b.y}
            />
            <line
              x1={layout.a.x}
              y1={layout.a.y}
              x2={layout.b.x}
              y2={layout.b.y}
            />
            <text
              x={layout.label.x}
              y={layout.label.y}
              textAnchor="middle"
              transform={`rotate(${layout.rotationDeg} ${layout.label.x} ${layout.label.y})`}
            >
              {label(dimension)}
            </text>
          </g>
        ))}
        {(model.markers ?? []).map((marker) => {
          const at = project(marker.at);
          return marker.label ? (
            <g key={marker.id} className="mono-marker">
              <circle cx={at.x} cy={at.y} r={9} />
              <text x={at.x} y={at.y + 4} textAnchor="middle">
                {marker.label}
              </text>
            </g>
          ) : null;
        })}
      </svg>
      <figcaption>{t('assembly.monoPitch.drawing')}</figcaption>
    </figure>
  );
}
