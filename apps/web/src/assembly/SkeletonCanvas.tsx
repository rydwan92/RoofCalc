import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import type { MemberInstanceContext } from '@cieslacalc/calculator-core';
import {
  clampGablePitchDeg,
  clampRoofHalfRunMm,
  clampPurlinPlacement,
  gablePitchDegFromRidgeHeight,
  gableRidgeHeightMm,
  projectPlaneLocalToWorld,
  resolveBattenLayout,
  resolveRoofFeatureCollisions,
  resolveRoofPlaneBasis,
} from '@cieslacalc/roof-math';
import type {
  HipRoofSkeleton,
  ResolvedRafterSpacing,
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { MemberInstanceOverlay } from './MemberInstanceOverlay';
import { useAssembly } from './store';
import {
  deriveWorkbenchProjectionPolicy,
  initialWorkbenchViewState,
  resolveMemberVisualState,
} from './workbench';

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
  kind: HandleKind | 'roof-window' | 'pan';
  pointerId: number;
  startPointer: Point;
  startValue?: number;
  supportId?: string;
  viewport: ViewportState;
  axisStart?: Point;
  axisEnd?: Point;
  axisLengthMm?: number;
  featureId?: string;
  startPosition?: RoofWindowFeature['position'];
  uAxis?: Point;
  vAxis?: Point;
}
const handleRangeMm = 1000;

function memberLabel(member: SkeletonMember3D, t: (key: string) => string) {
  if (member.kind === 'hip-rafter')
    return `${t('assembly.hipRafter')} H1 · ${t(`assembly.${member.side}`)}`;
  if (member.kind === 'jack-rafter') {
    const match =
      /^instance:jack:(front-left|front-right|rear-left|rear-right):(left|right|front|rear):(\d+)$/.exec(
        member.id,
      );
    return match
      ? `${t('assembly.jackRafter')} J1/${match[3]} · ${t(`assembly.${match[2]}`)} · ${t(`assembly.${match[1]}`)}`
      : `${t('assembly.jackRafter')} J1`;
  }
  if (member.kind === 'rafter') {
    const hipCommon = /^instance:hip-common:(front|rear|left|right)$/.exec(
      member.id,
    );
    if (hipCommon) {
      return `${t('assembly.commonRafter')} K1 · ${t(`assembly.${hipCommon[1]}`)}`;
    }
    const number = /pair-(\d+)/.exec(member.id)?.[1] ?? '';
    return `${t('assembly.rafter')} #${number} - ${t(`assembly.${member.side}`)}`;
  }
  return t(`assembly.${member.kind}`);
}

function SkeletonCanvasComponent({
  template,
  skeleton,
  spacing,
  relatedSupportId,
  relatedIds,
  activeInstance,
}: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  spacing: ResolvedRafterSpacing;
  relatedSupportId?: string;
  relatedIds?: ReadonlySet<string>;
  activeInstance?: MemberInstanceContext;
}) {
  const selectedStore = useAssembly(
    useShallow((store) => ({
      spec: store.spec,
      unit: store.unit,
      selectedId: store.workbench.selectedId,
      selectedPrototypeId: store.workbench.selectedPrototypeId,
      selectedInstanceId: store.workbench.selectedInstanceId,
      viewPreset: store.workbench.viewPreset,
      isolateSelection: store.workbench.isolateSelection,
      dimensionLevel: store.workbench.dimensionLevel,
      activeOperationId: store.workbench.activeOperationId,
      layerVisibility: store.workbench.layerVisibility,
      detailDrawerOpen: store.workbench.detailDrawer.open,
      features: store.projectDocument.project.features,
      battenLayout: store.projectDocument.project.buildUp.battenLayout,
      beginTransaction: store.beginTransaction,
      cancelTransaction: store.cancelTransaction,
      commitTransaction: store.commitTransaction,
      movePurlin: store.movePurlin,
      moveRoofWindow: store.moveRoofWindow,
      select: store.select,
      setCanonicalField: store.setCanonicalField,
      activateOperation: store.activateOperation,
    })),
  );
  const state = {
    ...selectedStore,
    workbench: {
      ...initialWorkbenchViewState,
      selectedId: selectedStore.selectedId,
      selectedPrototypeId: selectedStore.selectedPrototypeId,
      selectedInstanceId: selectedStore.selectedInstanceId,
      viewPreset: selectedStore.viewPreset,
      isolateSelection: selectedStore.isolateSelection,
      dimensionLevel: selectedStore.dimensionLevel,
      activeOperationId: selectedStore.activeOperationId,
      layerVisibility: selectedStore.layerVisibility,
    },
  };
  const { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(820);
  const [viewport, setViewport] = useState<ViewportState>(fittedViewport);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [hoveredPurlin, setHoveredPurlin] = useState<string | null>(null);
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

  const height = width < 550 ? 400 : 570;
  const policy = deriveWorkbenchProjectionPolicy(state.workbench, width < 550);
  const memberLayer = (member: SkeletonMember3D) =>
    member.kind === 'jack-rafter'
      ? 0
      : member.kind === 'rafter'
        ? 1
        : member.kind === 'wall-plate' || member.kind === 'purlin'
          ? 2
          : member.kind === 'ridge'
            ? 3
            : 4;
  const solids = [...skeleton.members]
    .sort((a, b) => memberLayer(a) - memberLayer(b))
    .map((member) => ({
      member,
      faces: projectTimberPrismFaces(
        createTimberPrismFaces(
          { from: member.from, to: member.to },
          member.section,
          member.kind === 'rafter' ||
            member.kind === 'hip-rafter' ||
            member.kind === 'jack-rafter'
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
  const spacingStationAxes =
    template.type === 'gable' && policy.effectiveDimensionLevel !== 'minimal'
      ? spacing.stations
          .slice(
            0,
            policy.effectiveDimensionLevel === 'full'
              ? spacing.stations.length
              : 5,
          )
          .map((station) => ({
            id: station.id,
            alongBuildingMm: station.alongBuildingMm,
            from: worldPoint({
              x: -template.halfRunMm,
              y: station.alongBuildingMm,
              z: 0,
            }),
            to: worldPoint({
              x: template.halfRunMm,
              y: station.alongBuildingMm,
              z: 0,
            }),
            dimensionPoint: worldPoint({
              x: template.halfRunMm + 320,
              y: station.alongBuildingMm,
              z: 0,
            }),
          }))
      : [];
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
  const roofWindows = selectedStore.features.filter(
    (feature): feature is RoofWindowFeature => feature.kind === 'roof-window',
  );
  const windowOverlays = roofWindows.map((feature) => {
    const basis = resolveRoofPlaneBasis(template, feature.roofPlaneId);
    const corners = [
      feature.position,
      { uMm: feature.position.uMm + feature.widthMm, vMm: feature.position.vMm },
      { uMm: feature.position.uMm + feature.widthMm, vMm: feature.position.vMm + feature.heightMm },
      { uMm: feature.position.uMm, vMm: feature.position.vMm + feature.heightMm },
    ].map((local) => worldPoint(projectPlaneLocalToWorld(basis, local)));
    const collisionIds = new Set(
      resolveRoofFeatureCollisions({ template, skeleton, feature }).map(
        (collision) => collision.memberInstanceId,
      ),
    );
    const origin = worldPoint(projectPlaneLocalToWorld(basis, feature.position));
    const uEnd = worldPoint(
      projectPlaneLocalToWorld(basis, {
        uMm: feature.position.uMm + 100,
        vMm: feature.position.vMm,
      }),
    );
    const vEnd = worldPoint(
      projectPlaneLocalToWorld(basis, {
        uMm: feature.position.uMm,
        vMm: feature.position.vMm + 100,
      }),
    );
    return { feature, corners, collisionIds, origin, uAxis: { x: uEnd.x - origin.x, y: uEnd.y - origin.y }, vAxis: { x: vEnd.x - origin.x, y: vEnd.y - origin.y } };
  });
  const battenLines =
    policy.showBattens && selectedStore.battenLayout?.enabled
      ? resolveBattenLayout({
          template,
          layout: selectedStore.battenLayout,
          features: selectedStore.features,
        }).battens.flatMap((batten) => {
          const basis = resolveRoofPlaneBasis(template, batten.roofPlaneId);
          return batten.segments.map((segment) => ({
            id: `${batten.id}:${segment.fromUMm}`,
            from: worldPoint(projectPlaneLocalToWorld(basis, { uMm: segment.fromUMm, vMm: batten.stationMm })),
            to: worldPoint(projectPlaneLocalToWorld(basis, { uMm: segment.toUMm, vMm: batten.stationMm })),
          }));
        })
      : [];
  const selectedMember = skeleton.members.find(
    (member) =>
      member.id === state.workbench.selectedInstanceId ||
      member.selectionId === state.workbench.selectedId,
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
  const startWindowDrag = (
    event: PointerEvent<SVGElement>,
    overlay: (typeof windowOverlays)[number],
  ) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    event.stopPropagation();
    state.beginTransaction();
    state.select(overlay.feature.id);
    drag.current = {
      kind: 'roof-window', pointerId: event.pointerId,
      startPointer: currentPointer(event), viewport,
      featureId: overlay.feature.id, startPosition: overlay.feature.position,
      uAxis: overlay.uAxis, vAxis: overlay.vAxis,
    };
    svg.current?.setPointerCapture(event.pointerId);
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
      active.kind === 'roof-window' &&
      active.featureId &&
      active.startPosition &&
      active.uAxis &&
      active.vAxis
    ) {
      const pointer = currentPointer(event);
      const deltaX = pointer.x - active.startPointer.x;
      const deltaY = pointer.y - active.startPointer.y;
      const determinant = active.uAxis.x * active.vAxis.y - active.uAxis.y * active.vAxis.x;
      if (Math.abs(determinant) < 0.001) return;
      const uDeltaMm = ((deltaX * active.vAxis.y - deltaY * active.vAxis.x) / determinant) * 100;
      const vDeltaMm = ((active.uAxis.x * deltaY - active.uAxis.y * deltaX) / determinant) * 100;
      state.moveRoofWindow(active.featureId, {
        uMm: active.startPosition.uMm + uDeltaMm,
        vMm: active.startPosition.vMm + vDeltaMm,
      });
      setPreview(t('assembly.roofWindow'));
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
    if (!state.workbench.activeOperationId && !selectedStore.detailDrawerOpen)
      state.select('roof');
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
  const activePurlinDrag = activeHandleData?.kind === 'purlin';
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
    <div
      className={`a-canvas a-skeleton preset-${state.workbench.viewPreset} ${state.workbench.isolateSelection ? 'is-isolating' : ''}`}
      ref={container}
    >
      <div className="a-canvas-toolbar">
        <span>{t('assembly.skeleton')}</span>
        <span aria-live="polite">
          {template.type === 'hip'
            ? t('assembly.hipSkeletonCount', {
                common: skeleton.members.filter(
                  (member) => member.kind === 'rafter',
                ).length,
                jacks: skeleton.members.filter(
                  (member) => member.kind === 'jack-rafter',
                ).length,
              })
            : t('assembly.rafterPairCount', {
                count:
                  skeleton.members.filter((member) => member.kind === 'rafter')
                    .length / 2,
              })}
        </span>
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
        {policy.showRoofPlanes && (
          <g className="a-roof-guides" aria-hidden="true">
            {guides.map((guide) => (
              <polygon key={guide.id} points={pointString(guide.projected)} />
            ))}
          </g>
        )}
        {policy.showBattens && (
          <g className="a-batten-layer" aria-label={t('assembly.battens')}>
            {battenLines.map((batten) => (
              <line key={batten.id} x1={batten.from.x} y1={batten.from.y} x2={batten.to.x} y2={batten.to.y} />
            ))}
          </g>
        )}
        {spacingStationAxes.length > 0 && (
          <g
            className={`a-spacing-guides ${state.workbench.selectedId === 'roof' ? 'is-active' : ''}`}
            aria-hidden="true"
          >
            {spacingStationAxes.map((station, index) => {
              const previous = spacingStationAxes[index - 1];
              return (
                <g key={station.id}>
                  <line
                    data-testid="spacing-station-axis"
                    className="a-spacing-station-axis"
                    x1={station.from.x}
                    y1={station.from.y}
                    x2={station.to.x}
                    y2={station.to.y}
                  />
                  {previous && (
                    <g data-testid="spacing-bay-dimension">
                      <line
                        className="a-spacing-dimension-line"
                        x1={previous.dimensionPoint.x}
                        y1={previous.dimensionPoint.y}
                        x2={station.dimensionPoint.x}
                        y2={station.dimensionPoint.y}
                      />
                      <circle
                        cx={previous.dimensionPoint.x}
                        cy={previous.dimensionPoint.y}
                        r={2.5}
                      />
                      <circle
                        cx={station.dimensionPoint.x}
                        cy={station.dimensionPoint.y}
                        r={2.5}
                      />
                      <text
                        x={
                          (previous.dimensionPoint.x +
                            station.dimensionPoint.x) /
                            2 +
                          7
                        }
                        y={
                          (previous.dimensionPoint.y +
                            station.dimensionPoint.y) /
                            2 -
                          5
                        }
                      >
                        {length(
                          station.alongBuildingMm - previous.alongBuildingMm,
                        )}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}
        <g className="a-skeleton-members">
          {solids
            .filter(({ member }) => {
              const secondary = member.kind === 'rafter' || member.kind === 'jack-rafter';
              return secondary
                ? policy.showSecondaryMembers || state.workbench.selectedId === member.id
                : policy.showPrimaryMembers || state.workbench.selectedId === member.id;
            })
            .map(({ member, faces }) => {
            const visualState = resolveMemberVisualState({
              member,
              view: state.workbench,
              relatedSupportId,
              relatedIds,
            });
            const selected = visualState === 'selected';
            const related = visualState === 'related';
            const muted = visualState === 'muted';
            const purlinHandle =
              member.kind === 'purlin'
                ? handles.find(
                    (handle) => handle.selectionId === member.selectionId,
                  )
                : undefined;
            const editablePurlin =
              policy.showDirectManipulation && !!purlinHandle;
            const activePurlin =
              activeHandle === purlinHandle?.id ||
              hoveredPurlin === member.selectionId;
            const axisFrom = editablePurlin
              ? viewPoint(projectAxonometric(member.from))
              : undefined;
            const axisTo = editablePurlin
              ? viewPoint(projectAxonometric(member.to))
              : undefined;
            return (
              <g
                key={member.id}
                data-entity={member.id}
                data-prototype={member.prototypeId}
                data-selection-state={
                  selected
                    ? 'selected'
                    : related
                      ? 'related'
                      : muted
                        ? 'muted'
                        : 'normal'
                }
                role="button"
                tabIndex={0}
                aria-label={memberLabel(member, t)}
                aria-pressed={selected}
                data-drag-state={
                  activeHandle === purlinHandle?.id ? 'dragging' : undefined
                }
                className={`a-skeleton-member kind-${member.kind} ${selected ? 'is-selected' : ''} ${related ? 'is-related' : ''} ${muted ? 'is-muted' : ''} ${editablePurlin ? 'is-editable-purlin' : ''} ${activePurlin ? 'is-hover-editable' : ''}`}
                onClick={() => select(member)}
                onKeyDown={(event) => keySelect(event, member)}
                onPointerEnter={() => {
                  if (editablePurlin) setHoveredPurlin(member.selectionId);
                }}
                onPointerLeave={() => {
                  if (hoveredPurlin === member.selectionId)
                    setHoveredPurlin(null);
                }}
                onPointerDown={(event) => {
                  if (purlinHandle) startDrag(event, purlinHandle);
                }}
              >
                {axisFrom && axisTo && (
                  <line
                    className="a-purlin-body-hit-target"
                    data-purlin-hit-target={member.selectionId}
                    x1={axisFrom.x}
                    y1={axisFrom.y}
                    x2={axisTo.x}
                    y2={axisTo.y}
                  />
                )}
                {faces.map((face) => (
                  <polygon
                    key={face.id}
                    className={`a-skeleton-face face-${face.id}`}
                    points={pointString(face.projected)}
                  />
                ))}
              </g>
            );
          })}
        </g>
        {policy.showRoofFeatures && (
          <g className="a-roof-feature-layer">
            {windowOverlays.map((overlay) => {
              const selected = state.workbench.selectedId === overlay.feature.id;
              const collides = overlay.collisionIds.size > 0;
              return (
                <g
                  key={overlay.feature.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t('assembly.roofWindow')} ${overlay.feature.id}`}
                  aria-pressed={selected}
                  data-roof-window={overlay.feature.id}
                  data-collision={collides || undefined}
                  className={`a-roof-window ${selected ? 'is-selected' : ''} ${collides ? 'is-collision' : ''}`}
                  onClick={(event) => { event.stopPropagation(); state.select(overlay.feature.id); }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      state.select(overlay.feature.id);
                    }
                  }}
                  onPointerDown={(event) => startWindowDrag(event, overlay)}
                >
                  <polygon points={overlay.corners.map((corner) => `${corner.x},${corner.y}`).join(' ')} />
                  {collides && <title>{t('assembly.windowCollision')}</title>}
                </g>
              );
            })}
          </g>
        )}
        {policy.showCutMarkers && activeInstance && (
          <MemberInstanceOverlay
            instance={activeInstance}
            activeOperationId={state.workbench.activeOperationId}
            project={worldPoint}
            narrow={width < 550}
            onActivate={(operation) =>
              state.activateOperation({
                operationId: operation.operationId,
                prototypeId: activeInstance.prototypeId,
                selectionId: operation.operationId,
                instanceId: activeInstance.instanceId,
                previewId: operation.detailPreviewId,
              })
            }
          />
        )}
        {policy.showDirectManipulation && (
          <g className="a-handle-layer">
            {handles.filter((handle) => handle.kind !== 'purlin').map((handle) => (
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
        )}
        {activePurlinDrag && activeHandleData && (
          <line
            data-testid="purlin-placement-guide"
            className="a-purlin-placement-guide"
            x1={activeHandleData.axisStart.x}
            y1={activeHandleData.axisStart.y}
            x2={activeHandleData.axisEnd.x}
            y2={activeHandleData.axisEnd.y}
            pointerEvents="none"
          />
        )}
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
        <div data-testid="skeleton-spacing-pattern">
          <dt>
            {t(
              `assembly.${template.type === 'hip' ? 'jackRafterRegionSpacing' : 'spacingPattern'}`,
            )}
          </dt>
          <dd>
            {spacing.bayCount} × {length(spacing.actualSpacingMm)}
          </dd>
        </div>
        <div>
          <dt>
            {t(
              `assembly.${template.type === 'hip' ? 'spacingAxes' : 'rafterPairs'}`,
            )}
          </dt>
          <dd>{spacing.stationCount}</dd>
        </div>
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

export const SkeletonCanvas = memo(SkeletonCanvasComponent);
