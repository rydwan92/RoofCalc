import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  boundsFromPoints,
  clampViewport,
  createTimberPrismFaces,
  fittedViewport,
  fitDrawing,
  projectAxonometric,
  projectTimberPrismFaces,
  valueFromAxisDrag,
  viewportPoint,
  type Point,
  type ViewportState,
} from '@cieslacalc/drawing-engine';
import {
  clampGablePitchDeg,
  clampRoofHalfRunMm,
  clampPurlinPlacement,
  createRoofSkeleton,
  gablePitchDegFromRidgeHeight,
  gableRidgeHeightMm,
} from '@cieslacalc/roof-math';
import type {
  HipRoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { useAssembly } from './store';

type HandleKind = 'pitch' | 'span' | 'length' | 'purlin';
interface Handle {
  id: string;
  kind: HandleKind;
  at: Point;
  axisStart: Point;
  axisEnd: Point;
  axisLengthMm: number;
  selectionId?: string;
}
interface Drag {
  kind: HandleKind | 'pan';
  pointerId: number;
  startPointer: Point;
  startValue?: number;
  supportId?: string;
  viewport: ViewportState;
  axisStart?: Point;
  axisEnd?: Point;
  axisLengthMm?: number;
}
const handleRangeMm = 1000;

function memberLabel(member: SkeletonMember3D, t: (key: string) => string) {
  if (member.kind === 'hip-rafter')
    return `${t('assembly.hipRafter')} H1 · ${t(`assembly.${member.side}`)}`;
  if (member.kind === 'rafter') {
    const number = /pair-(\d+)/.exec(member.id)?.[1] ?? '';
    return `${t('assembly.rafter')} #${number} - ${t(`assembly.${member.side}`)}`;
  }
  return t(`assembly.${member.kind}`);
}

export function SkeletonCanvas({ template }: { template: RoofTemplateSpec }) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(820);
  const [viewport, setViewport] = useState<ViewportState>(fittedViewport);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      setViewport((current) =>
        clampViewport({
          ...current,
          zoom: current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
        }),
      );
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  }, []);

  const skeleton = createRoofSkeleton(template);
  const height = width < 550 ? 400 : 570;
  const solids = skeleton.members.map((member) => ({
    member,
    faces: projectTimberPrismFaces(
      createTimberPrismFaces(
        { from: member.from, to: member.to },
        member.section,
        member.kind === 'rafter' || member.kind === 'hip-rafter'
          ? 'along-roof'
          : 'along-building',
      ),
    ),
  }));
  const guides = (skeleton.guides ?? []).map((guide) => ({
    ...guide,
    projected: guide.points.map((point) => projectAxonometric(point)),
  }));
  const fit = fitDrawing(
    boundsFromPoints([
      ...solids.flatMap(({ faces }) => faces.flatMap((face) => face.projected)),
      ...guides.flatMap((guide) => guide.projected),
    ]),
    { width, height, padding: width < 550 ? 44 : 88 },
  );
  const viewPoint = (point: Point) =>
    viewportPoint(fit.project(point), viewport, { width, height });
  const worldPoint = (point: { x: number; y: number; z: number }) =>
    viewPoint(projectAxonometric(point));
  const pointString = (points: Point[]) =>
    points
      .map(viewPoint)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const slope = Math.tan((template.pitchDeg * Math.PI) / 180);
  const pitchHandleY = template.type === 'hip' ? template.halfRunMm : 0;
  const lengthHandleZ = template.type === 'gable' ? skeleton.ridgeHeightMm : 0;
  const handles: Handle[] = [
    {
      id: 'handle:pitch',
      kind: 'pitch',
      at: worldPoint({ x: 0, y: pitchHandleY, z: skeleton.ridgeHeightMm }),
      axisStart: worldPoint({ x: 0, y: pitchHandleY, z: 0 }),
      axisEnd: worldPoint({ x: 0, y: pitchHandleY, z: handleRangeMm }),
      axisLengthMm: handleRangeMm,
    },
    {
      id: 'handle:span',
      kind: 'span',
      at: worldPoint({ x: template.halfRunMm, y: 0, z: 0 }),
      axisStart: worldPoint({ x: template.halfRunMm, y: 0, z: 0 }),
      axisEnd: worldPoint({
        x: template.halfRunMm + handleRangeMm,
        y: 0,
        z: 0,
      }),
      axisLengthMm: handleRangeMm,
    },
    {
      id: 'handle:length',
      kind: 'length',
      at: worldPoint({
        x: 0,
        y: template.buildingLengthMm,
        z: lengthHandleZ,
      }),
      axisStart: worldPoint({
        x: 0,
        y: template.buildingLengthMm,
        z: lengthHandleZ,
      }),
      axisEnd: worldPoint({
        x: 0,
        y: template.buildingLengthMm + handleRangeMm,
        z: lengthHandleZ,
      }),
      axisLengthMm: handleRangeMm,
    },
    ...template.intermediateSupports.map((support) => ({
      id: `handle:${support.id}`,
      kind: 'purlin' as const,
      selectionId: support.id,
      at: worldPoint({
        x: -template.halfRunMm + support.placement.xMm,
        y: template.type === 'hip' ? support.placement.xMm : 0,
        z: support.placement.xMm * slope,
      }),
      axisStart: worldPoint({
        x: -template.halfRunMm + support.placement.xMm,
        y: template.type === 'hip' ? support.placement.xMm : 0,
        z: support.placement.xMm * slope,
      }),
      axisEnd: worldPoint({
        x: -template.halfRunMm + support.placement.xMm + handleRangeMm,
        y: template.type === 'hip' ? support.placement.xMm + handleRangeMm : 0,
        z: (support.placement.xMm + handleRangeMm) * slope,
      }),
      axisLengthMm: handleRangeMm,
    })),
  ];
  const selectedMember = skeleton.members.find(
    (member) => member.selectionId === state.selected,
  );
  const currentPointer = (event: PointerEvent<SVGElement>): Point => {
    const bounds = svg.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * width,
      y: ((event.clientY - bounds.top) / bounds.height) * height,
    };
  };
  const startDrag = (event: PointerEvent<SVGElement>, handle: Handle) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const parent = svg.current;
    if (!parent) return;
    event.preventDefault();
    event.stopPropagation();
    state.beginTransaction();
    if (handle.selectionId) state.select(handle.selectionId);
    drag.current = {
      kind: handle.kind,
      pointerId: event.pointerId,
      startPointer: currentPointer(event),
      startValue:
        handle.kind === 'pitch'
          ? skeleton.ridgeHeightMm
          : handle.kind === 'span'
            ? template.halfRunMm
            : handle.kind === 'length'
              ? template.buildingLengthMm
              : template.intermediateSupports.find(
                  (support) => support.id === handle.selectionId,
                )?.placement.xMm,
      supportId: handle.selectionId,
      viewport,
      axisStart: handle.axisStart,
      axisEnd: handle.axisEnd,
      axisLengthMm: handle.axisLengthMm,
    };
    setActiveHandle(handle.id);
    parent.setPointerCapture(event.pointerId);
  };
  const finishDrag = (cancel: boolean) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (cancel) state.cancelTransaction();
    else state.commitTransaction();
    setActiveHandle(null);
    setPreview(null);
    if (svg.current?.hasPointerCapture(active.pointerId))
      svg.current.releasePointerCapture(active.pointerId);
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'pan') {
      const pointer = currentPointer(event);
      setViewport(
        clampViewport({
          ...active.viewport,
          panX: active.viewport.panX + pointer.x - active.startPointer.x,
          panY: active.viewport.panY + pointer.y - active.startPointer.y,
        }),
      );
      return;
    }
    if (
      active.startValue === undefined ||
      !active.axisStart ||
      !active.axisEnd ||
      !active.axisLengthMm
    )
      return;
    const raw = valueFromAxisDrag({
      startValueMm: active.startValue,
      pointerStart: active.startPointer,
      pointerCurrent: currentPointer(event),
      axisStart: active.axisStart,
      axisEnd: active.axisEnd,
      axisLengthMm: active.axisLengthMm,
    });
    if (active.kind === 'pitch') {
      const pitch = clampGablePitchDeg(
        gablePitchDegFromRidgeHeight(template.halfRunMm, Math.max(0, raw)),
      );
      const snappedPitch = Math.round(pitch * 2) / 2;
      state.setCanonicalField('roof.pitchDeg', snappedPitch);
      setPreview(`${t('assembly.pitch')} ${snappedPitch.toFixed(1)}°`);
    } else if (active.kind === 'span') {
      const run = clampRoofHalfRunMm(template, Math.round(raw / 10) * 10);
      state.setCanonicalField('roof.runMm', run);
      setPreview(`${t('assembly.span')} ${length(run * 2)}`);
    } else if (active.kind === 'length') {
      const buildingLength = Math.max(
        template.type === 'hip' ? template.halfRunMm * 2 : 1,
        Math.round(raw / 10) * 10,
      );
      state.setCanonicalField('template.buildingLengthMm', buildingLength);
      setPreview(`${t('assembly.buildingLength')} ${length(buildingLength)}`);
    } else if (active.supportId) {
      const xMm = clampPurlinPlacement(
        state.spec,
        active.supportId,
        Math.round(raw / 10) * 10,
      );
      state.movePurlin(active.supportId, xMm);
      setPreview(`${t('assembly.purlin')} ${length(xMm)}`);
    }
  };
  const beginPan = (event: PointerEvent<SVGSVGElement>) => {
    if (
      event.button !== 0 &&
      event.button !== 1 &&
      event.pointerType !== 'touch'
    )
      return;
    if ((event.target as SVGElement).dataset.skeletonBackground !== 'true')
      return;
    drag.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startPointer: currentPointer(event),
      viewport,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const select = (member: SkeletonMember3D) =>
    state.select(member.selectionId, member.prototypeId);
  const keySelect = (
    event: KeyboardEvent<SVGGElement>,
    member: SkeletonMember3D,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(member);
    }
  };
  const adjustHandle = (event: KeyboardEvent<SVGGElement>, handle: Handle) => {
    if (event.key === 'Escape') {
      finishDrag(true);
      return;
    }
    const direction = ['ArrowUp', 'ArrowRight'].includes(event.key)
      ? 1
      : ['ArrowDown', 'ArrowLeft'].includes(event.key)
        ? -1
        : 0;
    if (!direction) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 10 : 1;
    state.beginTransaction();
    if (handle.kind === 'pitch') {
      state.setCanonicalField(
        'roof.pitchDeg',
        clampGablePitchDeg(template.pitchDeg + direction * 0.5 * multiplier),
      );
    } else if (handle.kind === 'span') {
      state.setCanonicalField(
        'roof.runMm',
        clampRoofHalfRunMm(
          template,
          template.halfRunMm + direction * 10 * multiplier,
        ),
      );
    } else if (handle.kind === 'length') {
      state.setCanonicalField(
        'template.buildingLengthMm',
        Math.max(
          template.type === 'hip' ? template.halfRunMm * 2 : 1,
          template.buildingLengthMm + direction * 10 * multiplier,
        ),
      );
    } else if (handle.selectionId) {
      const support = state.spec.supports.find(
        (candidate) => candidate.id === handle.selectionId,
      )!;
      state.select(handle.selectionId);
      state.movePurlin(
        handle.selectionId,
        clampPurlinPlacement(
          state.spec,
          handle.selectionId,
          support.placement.xMm + direction * 10 * multiplier,
        ),
      );
    }
    state.commitTransaction();
  };
  const handleValue = (handle: Handle) => {
    if (handle.kind === 'pitch') return template.pitchDeg;
    if (handle.kind === 'span') return template.halfRunMm * 2;
    if (handle.kind === 'length') return template.buildingLengthMm;
    return state.spec.supports.find(
      (support) => support.id === handle.selectionId,
    )?.placement.xMm;
  };
  const activeHandleData = handles.find((handle) => handle.id === activeHandle);
  const chipWidth = preview
    ? Math.min(240, Math.max(110, preview.length * 7.2))
    : 0;
  const chipPosition = activeHandleData
    ? {
        x: Math.max(
          8,
          Math.min(width - chipWidth - 8, activeHandleData.at.x + 16),
        ),
        y: Math.max(8, activeHandleData.at.y - 40),
      }
    : undefined;
  return (
    <div className="a-canvas a-skeleton" ref={container}>
      <div className="a-canvas-toolbar">
        <span>{t('assembly.skeleton')}</span>
        <output aria-live="polite">
          {template.type === 'hip'
            ? t('assembly.hipSkeletonCount', {
                common:
                  skeleton.members.filter((member) => member.kind === 'rafter')
                    .length / 2,
              })
            : t('assembly.rafterPairCount', {
                count:
                  skeleton.members.filter((member) => member.kind === 'rafter')
                    .length / 2,
              })}
        </output>
      </div>
      <svg
        ref={svg}
        className="a-drawing"
        data-testid="skeleton-drawing"
        role="group"
        aria-label={t(
          `assembly.${template.type === 'hip' ? 'hipSkeletonDrawing' : 'skeletonDrawing'}`,
        )}
        style={{ height }}
        onPointerDown={beginPan}
        onPointerMove={moveDrag}
        onPointerUp={(event) => {
          if (event.pointerId === drag.current?.pointerId) finishDrag(false);
        }}
        onPointerCancel={(event) => {
          if (event.pointerId === drag.current?.pointerId) finishDrag(true);
        }}
        onLostPointerCapture={() => finishDrag(true)}
      >
        <title>
          {t(
            `assembly.${template.type === 'hip' ? 'hipSkeletonDrawing' : 'skeletonDrawing'}`,
          )}
        </title>
        <rect
          className="a-skeleton-background"
          data-skeleton-background="true"
          width={width}
          height={height}
        />
        <g className="a-roof-guides" aria-hidden="true">
          {guides.map((guide) => (
            <polygon key={guide.id} points={pointString(guide.projected)} />
          ))}
        </g>
        <g className="a-skeleton-members">
          {solids.map(({ member, faces }) => (
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
              {faces.map((face) => (
                <polygon
                  key={face.id}
                  className={`a-skeleton-face face-${face.id}`}
                  points={pointString(face.projected)}
                />
              ))}
            </g>
          ))}
        </g>
        <g className="a-handle-layer">
          {handles.map((handle) => (
            <g
              key={handle.id}
              data-handle={handle.kind}
              className={`a-skeleton-handle ${activeHandle === handle.id ? 'is-active' : ''}`}
              role="slider"
              tabIndex={0}
              aria-label={t(
                `assembly.handle${handle.kind[0]!.toUpperCase()}${handle.kind.slice(1)}`,
              )}
              aria-valuenow={handleValue(handle)}
              onPointerDown={(event) => startDrag(event, handle)}
              onKeyDown={(event) => adjustHandle(event, handle)}
            >
              <line
                className="a-handle-axis"
                x1={handle.axisStart.x}
                y1={handle.axisStart.y}
                x2={handle.axisEnd.x}
                y2={handle.axisEnd.y}
              />
              <circle cx={handle.at.x} cy={handle.at.y} r={9} />
            </g>
          ))}
        </g>
        {preview && chipPosition && (
          <g className="a-handle-chip" pointerEvents="none">
            <rect
              x={chipPosition.x}
              y={chipPosition.y}
              width={chipWidth}
              height={28}
              rx={5}
            />
            <text x={chipPosition.x + 10} y={chipPosition.y + 18}>
              {preview}
            </text>
          </g>
        )}
      </svg>
      <div
        className="a-canvas-controls"
        role="group"
        aria-label={t('assembly.view')}
      >
        <button
          aria-label={t('assembly.zoomOut')}
          disabled={viewport.zoom <= 0.65}
          onClick={() =>
            setViewport((current) =>
              clampViewport({ ...current, zoom: current.zoom - 0.2 }),
            )
          }
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button
          aria-label={t('assembly.zoomIn')}
          disabled={viewport.zoom >= 3}
          onClick={() =>
            setViewport((current) =>
              clampViewport({ ...current, zoom: current.zoom + 0.2 }),
            )
          }
        >
          <Plus size={16} />
        </button>
        <button
          aria-label={t('assembly.fit')}
          onClick={() => setViewport(fittedViewport)}
        >
          <Maximize size={16} />
        </button>
      </div>
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
          <dd>
            {length(gableRidgeHeightMm(template.halfRunMm, template.pitchDeg))}
          </dd>
        </div>
        {template.type === 'hip' && (
          <div>
            <dt>{t('assembly.ridgeLength')}</dt>
            <dd>{length((skeleton as HipRoofSkeleton).ridgeLengthMm)}</dd>
          </div>
        )}
      </dl>
      <p className="a-canvas-hint">
        {selectedMember
          ? memberLabel(selectedMember, t)
          : t(
              `assembly.${template.type === 'hip' ? 'hipSkeletonHint' : 'skeletonHint'}`,
            )}
      </p>
    </div>
  );
}
