import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  MemberInstanceOperationContext,
} from '@cieslacalc/calculator-core';
import type { Point } from '@cieslacalc/drawing-engine';
import { layoutOperationMarkers } from './workbench';

function operationLabel(
  operation: MemberInstanceOperationContext,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const purlin = /support:purlin-(\d+)$/.exec(
    operation.relatedSupportId ?? '',
  )?.[1];
  return `${operation.code} ${t(`assembly.${operation.labelKey}`)}${purlin ? ` P${purlin}` : ''}`;
}

export function MemberInstanceOverlay({
  instance,
  activeOperationId,
  project,
  narrow,
  onActivate,
}: {
  instance: MemberInstanceContext;
  activeOperationId?: string;
  project: (point: MemberInstanceOperationContext['worldPoint']) => Point;
  narrow: boolean;
  onActivate: (operation: MemberInstanceOperationContext) => void;
}) {
  const { t } = useTranslation();
  const anchors = instance.operations.map((operation) => ({
    id: operation.operationId,
    at: project(operation.worldPoint),
    active: operation.operationId === activeOperationId,
  }));
  const layouts = layoutOperationMarkers(anchors, narrow);
  const activateFromKeyboard = (
    event: KeyboardEvent<SVGGElement>,
    operation: MemberInstanceOperationContext,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onActivate(operation);
  };
  return (
    <g
      className="a-instance-operation-overlay"
      data-testid="member-instance-overlay"
      aria-label={t('assembly.instanceOperations')}
    >
      {instance.operations.map((operation, index) => {
        const layout = layouts[index]!;
        const label = operationLabel(operation, t);
        const active = operation.operationId === activeOperationId;
        const labelWidth = Math.min(176, Math.max(92, label.length * 6.7));
        return (
          <g
            key={operation.operationId}
            className={`a-operation-marker ${active ? 'is-active' : ''} ${operation.status === 'limited' ? 'is-limited' : ''}`}
            data-operation-id={operation.operationId}
            data-operation-status={operation.status}
            data-testid={`operation-marker-${operation.code}`}
            role="button"
            tabIndex={0}
            aria-label={`${label}. ${t(`assembly.${operation.status === 'resolved' ? 'operationResolved' : 'operationLimited'}`)}`}
            aria-pressed={active}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onActivate(operation);
            }}
            onKeyDown={(event) => activateFromKeyboard(event, operation)}
          >
            <line
              className="a-operation-leader"
              x1={layout.at.x}
              y1={layout.at.y}
              x2={layout.marker.x}
              y2={layout.marker.y}
            />
            <circle
              className="a-operation-anchor"
              cx={layout.at.x}
              cy={layout.at.y}
              r={4}
            />
            {layout.compact ? (
              <>
                <circle
                  className="a-operation-badge"
                  cx={layout.marker.x}
                  cy={layout.marker.y}
                  r={15}
                />
                <text
                  className="a-operation-code"
                  x={layout.marker.x}
                  y={layout.marker.y + 4}
                  textAnchor="middle"
                >
                  {operation.code}
                </text>
              </>
            ) : (
              <>
                <rect
                  className="a-operation-label-bg"
                  x={layout.marker.x - 16}
                  y={layout.marker.y - 16}
                  width={labelWidth}
                  height={32}
                  rx={8}
                />
                <text
                  className="a-operation-label"
                  x={layout.marker.x - 6}
                  y={layout.marker.y + 5}
                >
                  {label}
                </text>
              </>
            )}
            {operation.status === 'limited' && (
              <text
                className="a-operation-warning"
                x={layout.marker.x + (layout.compact ? 11 : labelWidth - 23)}
                y={layout.marker.y - 9}
                aria-hidden="true"
              >
                !
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
