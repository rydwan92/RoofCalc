import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  layoutDimension,
  type DrawingModel,
  type Point,
} from '@cieslacalc/drawing-engine';
import type { WorkbenchObject } from '@cieslacalc/calculator-core';
import { useWorkbench } from '../store';
import { formatLength } from '../format';

const selectable = new Set<string>([
  'geometry',
  'rafter',
  'wall-plate',
  'ridge',
  'birdsmouth',
  'ridge-cut',
]);
export function DrawingLayers({
  model,
  project,
  selected,
  onSelect,
  dimensions,
  compact,
}: {
  model: DrawingModel;
  project: (point: Point) => Point;
  selected: WorkbenchObject;
  onSelect: (object: WorkbenchObject) => void;
  dimensions: boolean;
  compact: boolean;
}) {
  const { t, i18n } = useTranslation();
  const unit = useWorkbench((s) => s.unit);
  const points = (vertices: Point[]) =>
    vertices
      .map(project)
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  function interaction(selectionId?: string) {
    if (!selectionId || !selectable.has(selectionId)) return {};
    const activate = () => onSelect(selectionId as WorkbenchObject);
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': t(`objects.${selectionId}`),
      'aria-pressed': selected === selectionId,
      onClick: activate,
      onKeyDown: (event: KeyboardEvent<SVGElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      },
    };
  }
  return (
    <>
      <g className="profile-layer">
        {model.polygons?.map((shape) => (
          <polygon
            key={shape.id}
            data-object={shape.id}
            points={points(shape.points)}
            className={`shape shape-${shape.role} ${shape.selectionId === selected ? 'is-selected' : ''}`}
            {...interaction(shape.selectionId)}
          />
        ))}
      </g>
      <g className="cut-layer">
        {model.lines.map((line) => {
          const a = project(line.from),
            b = project(line.to);
          return (
            <g
              key={line.id}
              className={`cut-group ${line.selectionId === selected ? 'is-selected' : ''}`}
              {...interaction(line.selectionId)}
            >
              <line
                className={`technical-line ${line.role}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
              {line.selectionId && (
                <line
                  className="line-hit-target"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              )}
            </g>
          );
        })}
      </g>
      {dimensions && (
        <g className="dimension-layer" pointerEvents="none">
          {model.dimensions
            .filter((d) => !compact || !d.fromDatum || d.id === 'A-D')
            .map((dimension) => {
              const layout = layoutDimension(dimension, project);
              const { a, b, label, extensionA, extensionB, rotationDeg } =
                layout;
              const text = `${dimension.fromDatum ? `${dimension.fromDatum}→${dimension.toDatum}  ` : ''}${formatLength(dimension.valueMm, unit, i18n.language)} ${unit}`;
              return (
                <g key={dimension.id} className="technical-dimension">
                  <path
                    d={`M ${extensionA.x} ${extensionA.y} L ${a.x} ${a.y} L ${b.x} ${b.y} L ${extensionB.x} ${extensionB.y}`}
                  />
                  <circle cx={a.x} cy={a.y} r="2" />
                  <circle cx={b.x} cy={b.y} r="2" />
                  <text
                    transform={`translate(${label.x} ${label.y}) rotate(${rotationDeg})`}
                    textAnchor="middle"
                  >
                    {text}
                  </text>
                </g>
              );
            })}
        </g>
      )}
      <g className="datum-layer">
        {model.markers?.map((marker) => {
          const point = project(marker.at);
          const dx = marker.id === 'B' ? -14 : marker.id === 'C' ? 14 : 0;
          const dy = marker.id === 'B' ? 28 : -25;
          return (
            <g
              key={marker.id}
              className="datum-marker"
              aria-label={`${t('datum')} ${marker.id}: ${t(`datumLabels.${marker.id}`)}`}
            >
              <line
                x1={point.x}
                y1={point.y}
                x2={point.x + dx}
                y2={point.y + dy}
              />
              <circle cx={point.x} cy={point.y} r="3" />
              <rect
                x={point.x + dx - 11}
                y={point.y + dy - 11}
                width="22"
                height="22"
                rx="6"
              />
              <text x={point.x + dx} y={point.y + dy + 4} textAnchor="middle">
                {marker.id}
              </text>
            </g>
          );
        })}
      </g>
      {!compact && (
        <g className="object-labels" pointerEvents="none">
          {model.labels?.map((label) => {
            const p = project(label.at);
            return (
              <text key={label.id} x={p.x} y={p.y + 23} textAnchor="middle">
                {t(label.textKey)}
              </text>
            );
          })}
        </g>
      )}
    </>
  );
}
