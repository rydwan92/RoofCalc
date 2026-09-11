import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize, Minus, Plus } from 'lucide-react';
import { createAssemblyDrawing } from '@cieslacalc/calculator-core';
import {
  fitDrawing,
  fitDimensionedDrawing,
  layoutDimensionLanes,
  screenToWorld,
  snapPosition,
  type AffineMatrix,
  type DrawingDimension,
  type Point,
} from '@cieslacalc/drawing-engine';
import { clampPurlinPlacement, purlinRange } from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import { useAssembly } from './store';
import { deriveWorkbenchProjectionPolicy, dimensionAllowed } from './workbench';
import type { Calculation } from './Inputs';

type Projection = ReturnType<typeof fitDrawing>;
interface Drag {
  id: string;
  pointerId: number;
  startMm: number;
  grabOffsetMm: number;
  matrix: AffineMatrix;
  projection: Projection;
  range: { min: number; max: number };
  mmPerPixel: number;
}
export function entityLabel(
  id: string,
  state: ReturnType<typeof useAssembly.getState>,
  t: (key: string) => string,
): string {
  if (id === 'roof') return t('assembly.roof');
  const hip =
    /^instance:hip:(front-left|front-right|rear-left|rear-right)$/.exec(id);
  if (hip) return `${t('assembly.hipRafter')} H1 · ${t(`assembly.${hip[1]}`)}`;
  if (id === 'member:hip-rafter-H1') return `${t('assembly.hipRafter')} H1`;
  const jack =
    /^instance:jack:(front-left|front-right|rear-left|rear-right):(left|right|front|rear):(\d+)$/.exec(
      id,
    );
  if (jack)
    return `${t('assembly.jackRafter')} J1/${jack[3]} · ${t(`assembly.${jack[2]}`)} · ${t(`assembly.${jack[1]}`)}`;
  if (id === 'member:jack-rafter-J1') return `${t('assembly.jackRafter')} J1`;
  const hipCommon = /^instance:hip-common:(front|rear|left|right)$/.exec(id);
  if (hipCommon)
    return `${t('assembly.commonRafter')} K1 · ${t(`assembly.${hipCommon[1]}`)}`;
  const instance =
    /^instance:(?:rafter-pair|hip-common-pair)-(\d+):(left|right)$/.exec(id);
  if (instance)
    return `${t('assembly.rafter')} #${instance[1]} - ${t(`assembly.${instance[2]}`)}`;
  if (id === state.spec.member.id) return t('assembly.rafter');
  if (id === state.spec.ridge.id) return t('assembly.ridge');
  if (id === 'cut:ridge') return t('assembly.ridgeCut');
  if (id === 'cut:hip-ridge-H1') return t('assembly.hipUpperCutDetail');
  if (id === 'cut:eave') return t('assembly.eaveCut');
  const support = state.spec.supports.find(
    (s) => s.id === id || `joint:${s.id}` === id,
  );
  if (!support) return '';
  const number = /^support:purlin-(\d+)$/.exec(support.id)?.[1];
  const label = number
    ? `${t('assembly.purlin')} P${number}`
    : t(`assembly.${support.kind}`);
  return `${id.startsWith('joint:') ? `${t('assembly.notch')} · ` : ''}${label}`;
}
export function AssemblyCanvas({
  result,
  compact = false,
  focusId,
  readOnly = false,
}: {
  result: Calculation;
  compact?: boolean;
  focusId?: string;
  readOnly?: boolean;
}) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(compact ? 420 : 820),
    [zoom, setZoom] = useState(1);
  const [frozenProjection, setFrozenProjection] = useState<Projection | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    id: string;
    xMm: number;
    kind: 'grid' | 'target';
    stepMm: number;
  } | null>(null);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setZoom(1);
  }, [focusId]);
  const model = createAssemblyDrawing(result.assembly, focusId);
  const height = compact ? (focusId ? 245 : 250) : width < 550 ? 400 : 570;
  const policy = deriveWorkbenchProjectionPolicy(state.workbench, width < 550);
  const length = (n: number) => formatLength(n, state.unit, i18n.language);
  const label = (d: DrawingDimension) =>
    `${d.fromLabel ? `${d.fromLabel}→${d.toLabel} · ` : ''}${length(d.valueMm)} ${state.unit}`;
  const visibleDimensions = model.dimensions.filter(
    (d) =>
      dimensionAllowed(
        d,
        policy,
        !!focusId || state.workbench.selectedId !== 'roof',
      ) &&
      (focusId || (!compact && width >= 550) || d.group === 'primary'),
  );
  const projection =
    frozenProjection ??
    fitDimensionedDrawing(
      model.bounds,
      { width, height, padding: compact || width < 550 ? 48 : 115 },
      visibleDimensions,
      (d) => label(d).length * 6.5,
    );
  const { project } = projection;
  const lanes = layoutDimensionLanes(
    visibleDimensions,
    project,
    (d) => label(d).length * 6.5,
  );
  const points = (vertices: Point[]) =>
    vertices
      .map(project)
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  function finish(cancel: boolean) {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (cancel) state.cancelTransaction();
    else state.commitTransaction();
    setFrozenProjection(null);
    setPreview(null);
    if (svg.current?.hasPointerCapture?.(active.pointerId))
      svg.current.releasePointerCapture(active.pointerId);
  }
  function start(event: PointerEvent<SVGElement>, id: string) {
    if (
      readOnly ||
      compact ||
      focusId ||
      (event.button !== 0 && event.pointerType !== 'touch') ||
      drag.current
    )
      return;
    const support = state.spec.supports.find(
      (s) => s.id === id && s.kind === 'purlin',
    );
    if (!support || !svg.current) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const position = screenToWorld(
      { x: event.clientX, y: event.clientY },
      matrix,
      projection.unproject,
    );
    event.preventDefault();
    state.select(id);
    state.beginTransaction();
    svg.current.focus();
    const mmPerPixel = 1 / (Math.hypot(matrix.a, matrix.b) * projection.scale);
    drag.current = {
      id,
      pointerId: event.pointerId,
      startMm: support.placement.xMm,
      grabOffsetMm: position.x - support.placement.xMm,
      matrix,
      projection,
      range: purlinRange(state.spec, support.section.widthMm),
      mmPerPixel,
    };
    setFrozenProjection(projection);
    svg.current.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const point = screenToWorld(
      { x: event.clientX, y: event.clientY },
      active.matrix,
      active.projection.unproject,
    );
    const snap = snapPosition(
      point.x - active.grabOffsetMm,
      active.range,
      active.mmPerPixel,
      [(active.range.min + active.range.max) / 2],
    );
    const xMm = clampPurlinPlacement(state.spec, active.id, snap.valueMm);
    state.movePurlin(active.id, xMm);
    setPreview({
      id: active.id,
      xMm,
      kind: snap.kind,
      stepMm: snap.stepMm,
    });
  }
  function keys(event: KeyboardEvent<SVGElement>, id: string) {
    if (readOnly) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      state.select(
        id,
        id.startsWith('joint:') || id.startsWith('cut:')
          ? state.spec.member.id
          : undefined,
      );
    }
    const support = state.spec.supports.find(
      (s) => s.id === id && s.kind === 'purlin',
    );
    if (
      support &&
      !compact &&
      !focusId &&
      ['ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      event.preventDefault();
      const range = purlinRange(state.spec, support.section.widthMm);
      state.movePurlin(
        id,
        clampPurlinPlacement(
          state.spec,
          id,
          Math.max(
            range.min,
            Math.min(
              range.max,
              support.placement.xMm +
                (event.key === 'ArrowRight' ? 1 : -1) *
                  (event.shiftKey ? 10 : 1),
            ),
          ),
        ),
      );
      state.select(id);
    }
  }
  const interaction = (id?: string) =>
    readOnly || !id
      ? {}
      : {
          role: 'button',
          tabIndex: 0,
          'aria-label': entityLabel(id, state, t),
          'aria-pressed':
            state.workbench.selectedId === id ||
            state.workbench.selectedPrototypeId === id,
          onClick: () =>
            state.select(
              id,
              id.startsWith('joint:') || id.startsWith('cut:')
                ? state.spec.member.id
                : undefined,
            ),
          onKeyDown: (e: KeyboardEvent<SVGElement>) => keys(e, id),
          onPointerDown: (e: PointerEvent<SVGElement>) => start(e, id),
        };
  const lineGroups = Array.from(
    new Set(model.lines.map((l) => l.selectionId ?? l.id)),
  );
  const relatedSupportId = result.assembly.joints.find(
    (joint) =>
      joint.id ===
      (state.workbench.activeOperationId ?? state.workbench.selectedId),
  )?.supportId;
  const visualState = (selectionId?: string) => {
    if (!selectionId) return 'normal';
    if (
      state.workbench.selectedId === selectionId ||
      state.workbench.selectedId === selectionId.replace(/^joint:/, 'support:')
    )
      return 'selected';
    if (
      state.workbench.selectedPrototypeId === selectionId ||
      relatedSupportId === selectionId ||
      (!state.workbench.activeOperationId &&
        state.workbench.selectedPrototypeId === state.spec.member.id &&
        (selectionId === state.spec.ridge.id ||
          state.spec.supports.some((support) => support.id === selectionId)))
    )
      return 'related';
    return state.workbench.selectedId !== 'roof' ? 'muted' : 'normal';
  };
  const guide = preview
    ? result.assembly.supports.find((s) => s.id === preview.id)?.topReference[0]
    : null;
  return (
    <div className={`a-canvas ${compact ? 'a-mini' : ''}`} ref={container}>
      {!compact && (
        <div className="a-canvas-toolbar">
          <span>{focusId ? t('assembly.detail') : t('assembly.drawing')}</span>
          <span aria-live="polite">
            {t(`assembly.${policy.effectiveDimensionLevel}Dimensions`)}
          </span>
        </div>
      )}
      <svg
        ref={svg}
        className="a-drawing"
        data-testid={focusId ? 'detail-drawing' : 'assembly-drawing'}
        role="group"
        aria-label={focusId ? t('assembly.detail') : t('assembly.drawing')}
        tabIndex={readOnly ? undefined : 0}
        style={{ height }}
        viewBox={`${width / 2 - width / zoom / 2} ${height / 2 - height / zoom / 2} ${width / zoom} ${height / zoom}`}
        onPointerMove={move}
        onPointerUp={(e) => {
          if (e.pointerId === drag.current?.pointerId) finish(false);
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === drag.current?.pointerId) finish(true);
        }}
        onLostPointerCapture={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') finish(true);
        }}
      >
        <title>{focusId ? t('assembly.detail') : t('assembly.drawing')}</title>
        {model.polygons?.map((shape) => (
          <g
            key={shape.id}
            data-entity={shape.id}
            data-selection-state={visualState(shape.selectionId)}
            {...interaction(shape.selectionId)}
            className={shape.id.includes('purlin') ? 'a-draggable' : ''}
          >
            <polygon
              data-profile={shape.id}
              points={points(shape.points)}
              className={`shape shape-${shape.role} ${state.workbench.selectedId === shape.selectionId || state.workbench.selectedPrototypeId === shape.selectionId ? 'is-selected' : ''}`}
            />
            {shape.id.includes('purlin') &&
              !compact &&
              !focusId &&
              (() => {
                const vertices = shape.points.map(project),
                  xs = vertices.map((p) => p.x),
                  ys = vertices.map((p) => p.y);
                const w = Math.max(44, Math.max(...xs) - Math.min(...xs)),
                  h = Math.max(44, Math.max(...ys) - Math.min(...ys));
                return (
                  <rect
                    x={(Math.max(...xs) + Math.min(...xs) - w) / 2}
                    y={(Math.max(...ys) + Math.min(...ys) - h) / 2}
                    width={w}
                    height={h}
                    fill="transparent"
                  />
                );
              })()}
          </g>
        ))}
        {lineGroups.map((id) => (
          <g
            key={id}
            data-entity={id}
            data-selection-state={
              state.workbench.selectedId === id
                ? 'selected'
                : state.workbench.selectedPrototypeId === state.spec.member.id
                  ? 'related'
                  : policy.muteUnrelated
                    ? 'muted'
                    : 'normal'
            }
            className={`cut-group ${state.workbench.selectedId === id || state.workbench.selectedPrototypeId === id ? 'is-selected' : ''}`}
            {...interaction(
              model.lines.find((l) => (l.selectionId ?? l.id) === id)
                ?.selectionId,
            )}
          >
            {model.lines
              .filter((l) => (l.selectionId ?? l.id) === id)
              .map((line) => {
                const a = project(line.from),
                  b = project(line.to);
                return (
                  <g key={line.id}>
                    <line
                      className={`technical-line ${line.role}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                    <line
                      className="line-hit-target"
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                  </g>
                );
              })}
          </g>
        ))}
        {visibleDimensions.length > 0 && (
          <g className="dimension-layer" pointerEvents="none">
            {lanes.map(
              ({
                dimension,
                layout: {
                  a,
                  b,
                  label: at,
                  extensionA,
                  extensionB,
                  rotationDeg,
                },
              }) => (
                <g key={dimension.id} className="technical-dimension">
                  <path
                    d={`M${extensionA.x} ${extensionA.y} L${a.x} ${a.y} L${b.x} ${b.y} L${extensionB.x} ${extensionB.y}`}
                  />
                  <circle cx={a.x} cy={a.y} r={2} />
                  <circle cx={b.x} cy={b.y} r={2} />
                  <text
                    textAnchor="middle"
                    transform={`translate(${at.x} ${at.y}) rotate(${rotationDeg})`}
                  >
                    {label(dimension)}
                  </text>
                </g>
              ),
            )}
          </g>
        )}
        {!focusId && (compact || policy.showDatums) && (
          <g className="a-markers" pointerEvents="none">
            {model.markers
              ?.filter(
                (m, i, all) =>
                  (!compact && width >= 550) || i === 0 || i === all.length - 1,
              )
              .map((m, i) => {
                const p = project(m.at);
                const y = p.y + 22 + (i % 2) * 25;
                return (
                  <g key={m.id} data-datum={m.id}>
                    <line x1={p.x} y1={p.y} x2={p.x} y2={y} />
                    <circle cx={p.x} cy={p.y} r={3} />
                    <rect
                      x={p.x - 10}
                      y={y - 10}
                      width={20}
                      height={20}
                      rx={5}
                    />
                    <text x={p.x} y={y + 4} textAnchor="middle">
                      {m.label}
                    </text>
                  </g>
                );
              })}
          </g>
        )}
        {guide && (
          <line
            className="a-guide"
            x1={project(guide).x}
            y1={20}
            x2={project(guide).x}
            y2={height - 20}
            pointerEvents="none"
          />
        )}
      </svg>
      {!compact && (
        <>
          <div className="a-canvas-controls">
            <button
              aria-label={t('assembly.zoomOut')}
              disabled={zoom <= 0.75}
              onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
            >
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label={t('assembly.zoomIn')}
              disabled={zoom >= 3}
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            >
              <Plus size={16} />
            </button>
            <button aria-label={t('assembly.fit')} onClick={() => setZoom(1)}>
              <Maximize size={16} />
            </button>
          </div>
          <p className="a-canvas-hint">
            {state.workbench.selectedId.includes('purlin')
              ? t('assembly.dragHint')
              : t('assembly.selectHint')}
          </p>
        </>
      )}
      {preview && (
        <output className="a-drag-preview" aria-live="polite">
          {t('assembly.dragging', {
            value: length(preview.xMm),
            unit: state.unit,
          })}
          <small>
            {preview.kind === 'target'
              ? t('assembly.snapped')
              : t('assembly.grid', { step: preview.stepMm })}
          </small>
        </output>
      )}
    </div>
  );
}
