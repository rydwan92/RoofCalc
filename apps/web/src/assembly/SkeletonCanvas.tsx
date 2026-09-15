import {
  memo,
  useEffect,
  useMemo,
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
  createSpacingDimensionPresentation,
  createTimberPrismFaces,
  fittedViewport,
  fitDrawing,
  projectAxonometric,
  projectTimberPrismFaces,
  valueFromAxisDrag,
  visiblePriorityLabelIds,
  viewportPoint,
  type MeasurementSnapPoint,
  type Point,
  type ViewportState,
} from '@cieslacalc/drawing-engine';
import type { MemberInstanceContext } from '@cieslacalc/calculator-core';
import {
  clampGablePitchDeg,
  clampRoofHalfRunMm,
  clampPurlinPlacement,
  clampRoofWindow,
  createDefaultRoofWindow,
  gablePitchDegFromRidgeHeight,
  gableRidgeHeightMm,
  projectPlaneLocalToWorld,
  resolveRoofFeatureCollisions,
  resolveNearestRoofWindowBay,
  resolveRoofWindowAlignmentSnap,
  resolveRoofPlaneBasis,
  roofPlaneIntervalsAtV,
  roofPlaneIds as resolveRoofPlaneIds,
  type BattenLayoutResult,
  type CounterBattenLayoutResult,
  type RoofWindowAlignmentGuide,
  type RoofSurfaceGeometryResult,
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
import { roofPlaneShortLabelKey } from './covering-presentation';
import { useAssembly } from './store';
import { useMobileWorkbench } from './mobile-workbench';
import {
  pinchViewport,
  touchDragActivated,
  type PinchStart,
} from './touch-camera';
import {
  deriveWorkbenchProjectionPolicy,
  initialWorkbenchViewState,
  memberInstanceCode,
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
  activated: boolean;
  pointerType: string;
}
const handleRangeMm = 1000;

function clampCanvasViewport(
  viewport: ViewportState,
  size: { width: number; height: number },
) {
  const clamped = clampViewport(viewport);
  return {
    ...clamped,
    panX: Math.max(-size.width * 1.5, Math.min(size.width * 1.5, clamped.panX)),
    panY: Math.max(
      -size.height * 1.5,
      Math.min(size.height * 1.5, clamped.panY),
    ),
  };
}

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
  collisionSkeleton = skeleton,
  proposalMemberIds,
  spacing,
  relatedSupportId,
  relatedIds,
  activeInstance,
  surfaceGeometry,
  battens: battenResult,
  counterBattens,
  compact = false,
}: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  collisionSkeleton?: RoofSkeleton;
  proposalMemberIds?: ReadonlySet<string>;
  spacing: ResolvedRafterSpacing;
  relatedSupportId?: string;
  relatedIds?: ReadonlySet<string>;
  activeInstance?: MemberInstanceContext;
  surfaceGeometry: RoofSurfaceGeometryResult;
  battens: BattenLayoutResult;
  counterBattens: CounterBattenLayoutResult;
  compact?: boolean;
}) {
  const selectedStore = useAssembly(
    useShallow((store) => ({
      spec: store.spec,
      unit: store.unit,
      selectedId: store.workbench.selectedId,
      selectedPrototypeId: store.workbench.selectedPrototypeId,
      selectedInstanceId: store.workbench.selectedInstanceId,
      selectedFeatureIds: store.workbench.selectedFeatureIds,
      viewPreset: store.workbench.viewPreset,
      buildUpView: store.workbench.buildUpView,
      isolateSelection: store.workbench.isolateSelection,
      dimensionLevel: store.workbench.dimensionLevel,
      activeOperationId: store.workbench.activeOperationId,
      layerVisibility: store.workbench.layerVisibility,
      detailDrawerOpen: store.workbench.detailDrawer.open,
      placementTool: store.workbench.placementTool,
      measurement: store.workbench.measurement,
      fitRequestId: store.workbench.fitRequestId,
      features: store.projectDocument.project.features,
      battenLayout: store.projectDocument.project.buildUp.battenLayout,
      membrane: store.projectDocument.project.buildUp.membrane,
      counterBattenLayout: store.projectDocument.project.buildUp.counterBattens,
      beginTransaction: store.beginTransaction,
      cancelTransaction: store.cancelTransaction,
      commitTransaction: store.commitTransaction,
      movePurlin: store.movePurlin,
      moveRoofWindow: store.moveRoofWindow,
      setRoofWindowPlacementPlane: store.setRoofWindowPlacementPlane,
      placeRoofWindowAt: store.placeRoofWindowAt,
      selectRoofWindow: store.selectRoofWindow,
      select: store.select,
      setCanonicalField: store.setCanonicalField,
      activateOperation: store.activateOperation,
      chooseMeasurementPoint: store.chooseMeasurementPoint,
    })),
  );
  const state = {
    ...selectedStore,
    workbench: {
      ...initialWorkbenchViewState,
      selectedId: selectedStore.selectedId,
      selectedPrototypeId: selectedStore.selectedPrototypeId,
      selectedInstanceId: selectedStore.selectedInstanceId,
      selectedFeatureIds: selectedStore.selectedFeatureIds,
      viewPreset: selectedStore.viewPreset,
      buildUpView: selectedStore.buildUpView,
      isolateSelection: selectedStore.isolateSelection,
      dimensionLevel: selectedStore.dimensionLevel,
      activeOperationId: selectedStore.activeOperationId,
      placementTool: selectedStore.placementTool,
      measurement: selectedStore.measurement,
      fitRequestId: selectedStore.fitRequestId,
      layerVisibility: selectedStore.layerVisibility,
    },
  };
  const { t, i18n } = useTranslation();
  const mobile = useMobileWorkbench();
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const touchPointers = useRef(new Map<number, Point>());
  const pinch = useRef<PinchStart | null>(null);
  const finishDragRef = useRef<(cancel: boolean) => void>(() => undefined);
  const [width, setWidth] = useState(820);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const height = mobile
    ? Math.max(200, Math.min(620, viewportHeight - 250))
    : compact
      ? Math.max(300, Math.min(420, width * 0.78))
      : width < 550
        ? 400
        : width > 1000
          ? 640
          : 570;
  const [viewport, setViewport] = useState<ViewportState>(fittedViewport);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [hoveredPurlin, setHoveredPurlin] = useState<string | null>(null);
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null);
  const [hoveredMeasurePoint, setHoveredMeasurePoint] =
    useState<MeasurementSnapPoint>();
  const [preview, setPreview] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [placementGhost, setPlacementGhost] = useState<{
    roofPlaneId: string;
    feature: RoofWindowFeature;
  }>();
  const [alignmentGuide, setAlignmentGuide] =
    useState<RoofWindowAlignmentGuide>();
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable)
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePressed(true);
      }
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        finishDragRef.current(true);
      }
    };
    const keyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const pointer = {
        x: ((event.clientX - bounds.left) / bounds.width) * width,
        y: ((event.clientY - bounds.top) / bounds.height) * height,
      };
      setViewport((current) => {
        const nextZoom = clampCanvasViewport(
          {
            ...current,
            zoom: current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
          },
          { width, height },
        ).zoom;
        const centre = { x: width / 2, y: height / 2 };
        const ratio = nextZoom / current.zoom;
        return clampCanvasViewport(
          {
            zoom: nextZoom,
            panX:
              pointer.x -
              centre.x -
              (pointer.x - centre.x - current.panX) * ratio,
            panY:
              pointer.y -
              centre.y -
              (pointer.y - centre.y - current.panY) * ratio,
          },
          { width, height },
        );
      });
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  }, [height, width]);

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
  const candidateFit = fitDrawing(
    boundsFromPoints([
      ...solids.flatMap(({ faces }) => faces.flatMap((face) => face.projected)),
      ...guides.flatMap((guide) => guide.projected),
    ]),
    { width, height, padding: width < 550 ? 44 : 88 },
  );
  const candidateFitRef = useRef(candidateFit);
  candidateFitRef.current = candidateFit;
  const activeFitRef = useRef(candidateFit);
  useEffect(() => {
    activeFitRef.current = candidateFitRef.current;
    setViewport({ ...fittedViewport });
  }, [height, selectedStore.fitRequestId, width]);
  const fit = activeFitRef.current;
  const viewPoint = (point: Point) =>
    viewportPoint(fit.project(point), viewport, { width, height });
  const worldPoint = (point: { x: number; y: number; z: number }) =>
    viewPoint(projectAxonometric(point));
  const spacingStationAxes =
    template.type === 'gable' && policy.effectiveDimensionLevel !== 'minimal'
      ? spacing.stations.map((station) => ({
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
  const spacingDimensions = createSpacingDimensionPresentation(
    spacing.stations,
    template.type === 'gable' ? policy.effectiveDimensionLevel : 'minimal',
  );
  const spacingSummaryDimensions = createSpacingDimensionPresentation(
    spacing.stations,
    'working',
  );
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
  const roofWindows = useMemo(
    () =>
      selectedStore.features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window',
      ),
    [selectedStore.features],
  );
  const measurementCandidates = useMemo(() => {
    const candidates: MeasurementSnapPoint[] = [
      ...skeleton.members.flatMap((member) =>
        (['from', 'to'] as const).map((end) => ({
          id: `measure:${member.id}:${end}`,
          label: `${memberInstanceCode(member.id)} · ${end === 'from' ? 'A' : 'B'}`,
          point: member[end],
        })),
      ),
      ...surfaceGeometry.planes.flatMap((plane) =>
        plane.worldPolygon.map((point, index) => ({
          id: `measure:${plane.roofPlaneId}:vertex:${index + 1}`,
          label: `${t(roofPlaneShortLabelKey(plane.roofPlaneId), { id: plane.roofPlaneId })} · V${index + 1}`,
          point,
          roofPlaneId: plane.roofPlaneId,
        })),
      ),
      ...roofWindows.flatMap((feature) => {
        const basis = resolveRoofPlaneBasis(template, feature.roofPlaneId);
        const locals = [
          feature.position,
          {
            uMm: feature.position.uMm + feature.widthMm,
            vMm: feature.position.vMm,
          },
          {
            uMm: feature.position.uMm + feature.widthMm,
            vMm: feature.position.vMm + feature.heightMm,
          },
          {
            uMm: feature.position.uMm,
            vMm: feature.position.vMm + feature.heightMm,
          },
        ];
        return locals.map((local, index) => ({
          id: `measure:${feature.id}:corner:${index + 1}`,
          label: `${feature.id.replace('feature:roof-window-', 'O')} · ${String.fromCharCode(65 + index)}`,
          point: projectPlaneLocalToWorld(basis, local),
          roofPlaneId: feature.roofPlaneId,
        }));
      }),
    ].sort((a, b) => a.id.localeCompare(b.id));
    const unique = new Map<string, MeasurementSnapPoint>();
    for (const candidate of candidates) {
      const key = `${candidate.point.x}:${candidate.point.y}:${candidate.point.z}`;
      if (!unique.has(key)) unique.set(key, candidate);
    }
    return [...unique.values()];
  }, [roofWindows, skeleton.members, surfaceGeometry.planes, t, template]);
  const windowCollisionIds = useMemo(
    () =>
      new Map(
        roofWindows.map((feature) => [
          feature.id,
          new Set(
            resolveRoofFeatureCollisions({
              template,
              skeleton: collisionSkeleton,
              feature,
            }).map((collision) => collision.memberInstanceId),
          ),
        ]),
      ),
    [collisionSkeleton, roofWindows, template],
  );
  const windowOverlays = roofWindows.map((feature) => {
    const basis = resolveRoofPlaneBasis(template, feature.roofPlaneId);
    const corners = [
      feature.position,
      {
        uMm: feature.position.uMm + feature.widthMm,
        vMm: feature.position.vMm,
      },
      {
        uMm: feature.position.uMm + feature.widthMm,
        vMm: feature.position.vMm + feature.heightMm,
      },
      {
        uMm: feature.position.uMm,
        vMm: feature.position.vMm + feature.heightMm,
      },
    ].map((local) => worldPoint(projectPlaneLocalToWorld(basis, local)));
    const collisionIds =
      windowCollisionIds.get(feature.id) ?? new Set<string>();
    const origin = worldPoint(
      projectPlaneLocalToWorld(basis, feature.position),
    );
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
    return {
      feature,
      corners,
      collisionIds,
      origin,
      uAxis: { x: uEnd.x - origin.x, y: uEnd.y - origin.y },
      vAxis: { x: vEnd.x - origin.x, y: vEnd.y - origin.y },
    };
  });
  const selectedWindowOverlay = windowOverlays.find(
    (overlay) => overlay.feature.id === state.workbench.selectedId,
  );
  const selectedCollisionIds =
    selectedWindowOverlay?.collisionIds ?? new Set<string>();
  const visibleWindowLabelIds = visiblePriorityLabelIds(
    windowOverlays.map((overlay) => {
      const centre = {
        x: overlay.corners.reduce((sum, point) => sum + point.x, 0) / 4,
        y: overlay.corners.reduce((sum, point) => sum + point.y, 0) / 4,
      };
      const selected = state.workbench.selectedId === overlay.feature.id;
      const warning = overlay.collisionIds.size > 0;
      return {
        id: overlay.feature.id,
        priority: selected ? 110 : warning ? 100 : 10,
        protected: warning || selected,
        bounds: { x: centre.x - 24, y: centre.y - 9, width: 48, height: 18 },
      };
    }),
  );
  const selectedBay = selectedWindowOverlay
    ? resolveNearestRoofWindowBay({
        template,
        skeleton: collisionSkeleton,
        feature: selectedWindowOverlay.feature,
      })
    : undefined;
  const selectedBatten = battenResult.battens.find(
    (batten) => batten.id === state.workbench.selectedId,
  );
  const bayMemberIds = new Set(selectedBay?.memberInstanceIds ?? []);
  const placementPlanes = resolveRoofPlaneIds(template).map((roofPlaneId) => {
    const basis = resolveRoofPlaneBasis(template, roofPlaneId);
    const origin = worldPoint(
      projectPlaneLocalToWorld(basis, { uMm: 0, vMm: 0 }),
    );
    const uEnd = worldPoint(
      projectPlaneLocalToWorld(basis, { uMm: 100, vMm: 0 }),
    );
    const vEnd = worldPoint(
      projectPlaneLocalToWorld(basis, { uMm: 0, vMm: 100 }),
    );
    return {
      roofPlaneId,
      basis,
      corners: basis.polygon.map((local) =>
        worldPoint(projectPlaneLocalToWorld(basis, local)),
      ),
      origin,
      uAxis: { x: uEnd.x - origin.x, y: uEnd.y - origin.y },
      vAxis: { x: vEnd.x - origin.x, y: vEnd.y - origin.y },
    };
  });
  const battenLines = policy.showBattens
    ? battenResult.battens.flatMap((batten) => {
        const basis = resolveRoofPlaneBasis(template, batten.roofPlaneId);
        return batten.segments.map((segment) => ({
          id: `${batten.id}:${segment.fromUMm}`,
          rowId: batten.id,
          roofPlaneId: batten.roofPlaneId,
          stationMm: batten.stationMm,
          usableLengthMm: batten.usableLengthMm,
          segmentCount: batten.segments.length,
          from: worldPoint(
            projectPlaneLocalToWorld(basis, {
              uMm: segment.fromUMm,
              vMm: batten.stationMm,
            }),
          ),
          to: worldPoint(
            projectPlaneLocalToWorld(basis, {
              uMm: segment.toUMm,
              vMm: batten.stationMm,
            }),
          ),
        }));
      })
    : [];
  const counterBattenLines =
    policy.showCounterBattens && selectedStore.counterBattenLayout?.enabled
      ? counterBattens.rows.flatMap((row) =>
          row.segments.map((segment, index) => ({
            id: `${row.id}:${index}`,
            rowId: row.id,
            from: worldPoint(segment.from),
            to: worldPoint(segment.to),
          })),
        )
      : [];
  const selectedMember = skeleton.members.find(
    (member) =>
      member.id === state.workbench.selectedInstanceId ||
      member.selectionId === state.workbench.selectedId,
  );
  const currentPointer = (event: {
    clientX: number;
    clientY: number;
  }): Point => {
    const bounds = svg.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * width,
      y: ((event.clientY - bounds.top) / bounds.height) * height,
    };
  };
  const measurementPointAt = (event: { clientX: number; clientY: number }) => {
    const pointer = currentPointer(event);
    return measurementCandidates
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(
          worldPoint(candidate.point).x - pointer.x,
          worldPoint(candidate.point).y - pointer.y,
        ),
      }))
      .filter((item) => item.distance <= (width < 550 ? 28 : 20))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.candidate.id.localeCompare(b.candidate.id),
      )[0]?.candidate;
  };
  const planePositionFromPointer = (
    event: { clientX: number; clientY: number },
    plane: (typeof placementPlanes)[number],
  ) => {
    const pointer = currentPointer(event);
    const deltaX = pointer.x - plane.origin.x;
    const deltaY = pointer.y - plane.origin.y;
    const determinant =
      plane.uAxis.x * plane.vAxis.y - plane.uAxis.y * plane.vAxis.x;
    if (Math.abs(determinant) < 0.001) return undefined;
    return {
      uMm:
        ((deltaX * plane.vAxis.y - deltaY * plane.vAxis.x) / determinant) * 100,
      vMm:
        ((plane.uAxis.x * deltaY - plane.uAxis.y * deltaX) / determinant) * 100,
    };
  };
  const updatePlacementGhost = (
    event: PointerEvent<SVGElement>,
    plane: (typeof placementPlanes)[number],
  ) => {
    if (!selectedStore.placementTool) return;
    const position = planePositionFromPointer(event, plane);
    if (!position) return;
    const source = selectedStore.placementTool.sourceFeatureId
      ? roofWindows.find(
          (feature) =>
            feature.id === selectedStore.placementTool?.sourceFeatureId,
        )
      : undefined;
    const seed = source
      ? { ...source, roofPlaneId: plane.roofPlaneId }
      : createDefaultRoofWindow(template, plane.roofPlaneId);
    try {
      setPlacementGhost({
        roofPlaneId: plane.roofPlaneId,
        feature: clampRoofWindow(template, {
          ...seed,
          position: {
            uMm: position.uMm - seed.widthMm / 2,
            vMm: position.vMm - seed.heightMm / 2,
          },
        }),
      });
    } catch {
      setPlacementGhost(undefined);
    }
  };
  const startDrag = (event: PointerEvent<SVGElement>, handle: Handle) => {
    if (selectedStore.measurement) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const parent = svg.current;
    if (!parent) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.pointerType !== 'touch') state.beginTransaction();
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
      activated: event.pointerType !== 'touch',
      pointerType: event.pointerType,
    };
    setActiveHandle(handle.id);
    parent.setPointerCapture(event.pointerId);
  };
  const startWindowDrag = (
    event: PointerEvent<SVGElement>,
    overlay: (typeof windowOverlays)[number],
  ) => {
    if (selectedStore.measurement) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    if (event.shiftKey) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.pointerType !== 'touch') state.beginTransaction();
    state.selectRoofWindow(overlay.feature.id);
    drag.current = {
      kind: 'roof-window',
      pointerId: event.pointerId,
      startPointer: currentPointer(event),
      viewport,
      featureId: overlay.feature.id,
      startPosition: overlay.feature.position,
      uAxis: overlay.uAxis,
      vAxis: overlay.vAxis,
      activated: event.pointerType !== 'touch',
      pointerType: event.pointerType,
    };
    svg.current?.setPointerCapture(event.pointerId);
  };
  const finishDrag = (cancel: boolean) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (active.activated && active.kind !== 'pan') {
      if (cancel) state.cancelTransaction();
      else state.commitTransaction();
    }
    setActiveHandle(null);
    setPreview(null);
    setAlignmentGuide(undefined);
    if (svg.current?.hasPointerCapture(active.pointerId))
      svg.current.releasePointerCapture(active.pointerId);
  };
  finishDragRef.current = finishDrag;
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (
      event.pointerType === 'touch' &&
      touchPointers.current.has(event.pointerId)
    ) {
      touchPointers.current.set(event.pointerId, currentPointer(event));
      if (pinch.current && touchPointers.current.size >= 2) {
        const [first, second] = [...touchPointers.current.values()];
        if (first && second)
          setViewport(
            clampCanvasViewport(
              pinchViewport(pinch.current, first, second, { width, height }),
              { width, height },
            ),
          );
        return;
      }
    }
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'pan') {
      const pointer = currentPointer(event);
      setViewport(
        clampCanvasViewport(
          {
            ...active.viewport,
            panX: active.viewport.panX + pointer.x - active.startPointer.x,
            panY: active.viewport.panY + pointer.y - active.startPointer.y,
          },
          { width, height },
        ),
      );
      return;
    }
    if (!active.activated && active.pointerType === 'touch') {
      const point = currentPointer(event);
      if (!touchDragActivated(active.startPointer, point)) return;
      state.beginTransaction();
      active.activated = true;
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
      const determinant =
        active.uAxis.x * active.vAxis.y - active.uAxis.y * active.vAxis.x;
      if (Math.abs(determinant) < 0.001) return;
      const uDeltaMm =
        ((deltaX * active.vAxis.y - deltaY * active.vAxis.x) / determinant) *
        100;
      const vDeltaMm =
        ((active.uAxis.x * deltaY - active.uAxis.y * deltaX) / determinant) *
        100;
      const draggedWindow = roofWindows.find(
        (feature) => feature.id === active.featureId,
      );
      if (!draggedWindow) return;
      const desired = {
        uMm: active.startPosition.uMm + uDeltaMm,
        vMm: active.startPosition.vMm + vDeltaMm,
      };
      const pixelsPerMm = Math.hypot(active.vAxis.x, active.vAxis.y) / 100;
      const snapped = event.altKey
        ? { feature: { ...draggedWindow, position: desired } }
        : resolveRoofWindowAlignmentSnap({
            template,
            feature: { ...draggedWindow, position: desired },
            otherWindows: roofWindows,
            maxDistanceMm: pixelsPerMm > 0 ? 12 / pixelsPerMm : 0,
          });
      state.moveRoofWindow(active.featureId, snapped.feature.position);
      setAlignmentGuide(snapped.guide);
      const snapMode = snapped.guide
        ? t(
            `assembly.${
              snapped.guide.mode === 'lower-edge'
                ? 'alignmentModeLower'
                : snapped.guide.mode === 'centre'
                  ? 'alignmentModeCentre'
                  : 'alignmentModeUpper'
            }`,
          )
        : undefined;
      setPreview(
        draggedWindow
          ? `${draggedWindow.id.replace('feature:roof-window-', 'O')} · ${length(draggedWindow.widthMm)} × ${length(draggedWindow.heightMm)}${snapped.guide ? ` · ${t('assembly.alignmentSnapLabel', { id: snapped.guide.sourceFeatureId.replace('feature:roof-window-', 'O'), mode: snapMode })}` : ''}`
          : t('assembly.roofWindow'),
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
      event.button !== 1 &&
      event.pointerType !== 'touch' &&
      !(event.button === 0 && spacePressed) &&
      event.button !== 0
    )
      return;
    if ((event.target as SVGElement).dataset.skeletonBackground !== 'true')
      return;
    drag.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startPointer: currentPointer(event),
      viewport,
      activated: false,
      pointerType: event.pointerType,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const beginTouchCapture = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    touchPointers.current.set(event.pointerId, currentPointer(event));
    if (touchPointers.current.size !== 2) return;
    // A second finger always cancels an unfinished canonical edit before camera motion.
    if (drag.current) finishDrag(true);
    const [first, second] = [...touchPointers.current.values()];
    if (first && second) pinch.current = { first, second, viewport };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const endTouch = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return;
    touchPointers.current.delete(event.pointerId);
    if (!pinch.current) return;
    pinch.current = null;
    const remaining = [...touchPointers.current.entries()][0];
    if (remaining) {
      drag.current = {
        kind: 'pan',
        pointerId: remaining[0],
        startPointer: remaining[1],
        viewport,
        activated: false,
        pointerType: 'touch',
      };
      try {
        event.currentTarget.setPointerCapture(remaining[0]);
      } catch {
        /* pointer ended */
      }
    }
  };
  const select = (member: SkeletonMember3D) => {
    if (!selectedStore.measurement)
      state.select(member.selectionId, member.prototypeId);
  };
  const keySelect = (
    event: KeyboardEvent<SVGGElement>,
    member: SkeletonMember3D,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(member);
    }
  };
  const nudgeWindow = (
    event: KeyboardEvent<SVGGElement>,
    feature: RoofWindowFeature,
  ) => {
    const direction =
      event.key === 'ArrowLeft'
        ? { uMm: -1, vMm: 0 }
        : event.key === 'ArrowRight'
          ? { uMm: 1, vMm: 0 }
          : event.key === 'ArrowUp'
            ? { uMm: 0, vMm: 1 }
            : event.key === 'ArrowDown'
              ? { uMm: 0, vMm: -1 }
              : undefined;
    if (!direction) return false;
    event.preventDefault();
    const stepMm = event.altKey ? 1 : event.shiftKey ? 100 : 10;
    state.beginTransaction();
    state.moveRoofWindow(feature.id, {
      uMm: feature.position.uMm + direction.uMm * stepMm,
      vMm: feature.position.vMm + direction.vMm * stepMm,
    });
    state.commitTransaction();
    return true;
  };
  const focusScreenPoints = (points: Point[]) => {
    if (!points.length) return;
    const centre = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / points.length,
        y: sum.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    setViewport((current) =>
      clampCanvasViewport(
        {
          zoom: Math.max(current.zoom, 1.8),
          panX: current.panX + width / 2 - centre.x,
          panY: current.panY + height / 2 - centre.y,
        },
        { width, height },
      ),
    );
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
    : drag.current?.kind === 'roof-window' && selectedWindowOverlay
      ? {
          x: Math.max(
            8,
            Math.min(
              width - chipWidth - 8,
              selectedWindowOverlay.corners[1]!.x + 14,
            ),
          ),
          y: Math.max(8, selectedWindowOverlay.corners[1]!.y - 36),
        }
      : undefined;
  const placementGhostCorners = placementGhost
    ? (() => {
        const basis = resolveRoofPlaneBasis(
          template,
          placementGhost.roofPlaneId,
        );
        const feature = placementGhost.feature;
        return [
          feature.position,
          {
            uMm: feature.position.uMm + feature.widthMm,
            vMm: feature.position.vMm,
          },
          {
            uMm: feature.position.uMm + feature.widthMm,
            vMm: feature.position.vMm + feature.heightMm,
          },
          {
            uMm: feature.position.uMm,
            vMm: feature.position.vMm + feature.heightMm,
          },
        ].map((local) => worldPoint(projectPlaneLocalToWorld(basis, local)));
      })()
    : undefined;
  const hoveredMember = skeleton.members.find(
    (member) => member.id === hoveredMemberId,
  );
  const identityMember = selectedMember ?? hoveredMember;
  const identityMemberLengthMm = identityMember
    ? Math.hypot(
        identityMember.to.x - identityMember.from.x,
        identityMember.to.y - identityMember.from.y,
        identityMember.to.z - identityMember.from.z,
      )
    : undefined;
  const measurementFrom = selectedStore.measurement?.firstPoint;
  const measurementTo =
    selectedStore.measurement?.result?.to ?? hoveredMeasurePoint;
  const alignmentGuideLines = alignmentGuide
    ? (() => {
        const basis = resolveRoofPlaneBasis(
          template,
          alignmentGuide.roofPlaneId,
        );
        return roofPlaneIntervalsAtV(
          template,
          alignmentGuide.roofPlaneId,
          alignmentGuide.referenceVMm,
        ).map((segment) => ({
          from: worldPoint(
            projectPlaneLocalToWorld(basis, {
              uMm: segment.fromUMm,
              vMm: alignmentGuide.referenceVMm,
            }),
          ),
          to: worldPoint(
            projectPlaneLocalToWorld(basis, {
              uMm: segment.toUMm,
              vMm: alignmentGuide.referenceVMm,
            }),
          ),
        }));
      })()
    : [];
  return (
    <div
      className={`a-canvas a-skeleton preset-${state.workbench.viewPreset} layer-view-${state.workbench.buildUpView} ${state.workbench.isolateSelection ? 'is-isolating' : ''} ${spacePressed ? 'is-space-pan' : ''} ${selectedStore.placementTool ? 'is-placement-tool' : ''}`}
      ref={container}
    >
      <div className="a-canvas-toolbar">
        <span>
          {state.workbench.viewPreset === 'layers'
            ? t(`assembly.${state.workbench.buildUpView}LayerView`)
            : state.workbench.viewPreset === 'materials'
              ? t('assembly.scheduleCanvas')
              : t('assembly.skeleton')}
        </span>
        <span aria-live="polite">
          {state.workbench.viewPreset === 'layers' &&
          state.workbench.buildUpView === 'battens' &&
          selectedStore.battenLayout?.enabled
            ? `${battenResult.battens.length} ${t('assembly.battenRows').toLowerCase()} · ${battenResult.planes[0]?.actualGaugeMm ? length(battenResult.planes[0].actualGaugeMm) : '—'} · ${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(battenResult.totalLengthMm / 1000)} m`
            : template.type === 'hip'
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
                    skeleton.members.filter(
                      (member) => member.kind === 'rafter',
                    ).length / 2,
                })}
        </span>
      </div>
      {selectedStore.placementTool && (
        <div className="a-placement-banner" role="status">
          {t(
            `assembly.${
              selectedStore.placementTool.mode === 'duplicate'
                ? 'duplicatePlacementHint'
                : 'placementChoosePlane'
            }`,
          )}
        </div>
      )}
      <svg
        ref={svg}
        className="a-drawing"
        data-testid="skeleton-drawing"
        data-fit-scale={fit.scale}
        role="group"
        aria-label={t(
          `assembly.${template.type === 'hip' ? 'hipSkeletonDrawing' : 'skeletonDrawing'}`,
        )}
        style={{ height }}
        onPointerDownCapture={beginTouchCapture}
        onPointerDown={beginPan}
        onPointerMove={moveDrag}
        onPointerUp={(event) => {
          endTouch(event);
          if (event.pointerId === drag.current?.pointerId) finishDrag(false);
        }}
        onPointerCancel={(event) => {
          endTouch(event);
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
        {selectedStore.placementTool && (
          <g className="a-placement-planes">
            {placementPlanes.map((plane) => (
              <polygon
                key={plane.roofPlaneId}
                data-roof-plane={plane.roofPlaneId}
                data-active={
                  selectedStore.placementTool?.roofPlaneId ===
                    plane.roofPlaneId ||
                  placementGhost?.roofPlaneId === plane.roofPlaneId ||
                  undefined
                }
                points={plane.corners
                  .map((corner) => `${corner.x},${corner.y}`)
                  .join(' ')}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={() =>
                  selectedStore.setRoofWindowPlacementPlane(plane.roofPlaneId)
                }
                onPointerMove={(event) => updatePlacementGhost(event, plane)}
                onPointerLeave={() => {
                  setPlacementGhost(undefined);
                  selectedStore.setRoofWindowPlacementPlane(undefined);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  const position = planePositionFromPointer(event, plane);
                  if (position)
                    selectedStore.placeRoofWindowAt(
                      plane.roofPlaneId,
                      position,
                    );
                  setPlacementGhost(undefined);
                }}
              />
            ))}
          </g>
        )}
        {policy.showRoofPlanes && (
          <g className="a-roof-guides" aria-hidden="true">
            {guides.map((guide) => (
              <polygon
                key={guide.id}
                className={
                  selectedWindowOverlay?.feature.roofPlaneId === guide.id
                    ? 'is-selected-plane'
                    : undefined
                }
                points={pointString(guide.projected)}
              />
            ))}
          </g>
        )}
        {alignmentGuide && alignmentGuideLines.length > 0 && (
          <g className="a-window-alignment-guide" pointerEvents="none">
            {alignmentGuideLines.map((line, index) => (
              <line
                key={`${alignmentGuide.sourceFeatureId}:${index}`}
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
              />
            ))}
            <text
              x={alignmentGuideLines[0]!.from.x}
              y={alignmentGuideLines[0]!.from.y - 8}
            >
              {alignmentGuide.sourceFeatureId.replace(
                'feature:roof-window-',
                'O',
              )}
            </text>
          </g>
        )}
        {policy.showMembrane && (
          <g
            className={`a-membrane-layer ${selectedStore.membrane?.enabled ? '' : 'is-disabled'}`}
            aria-label={t('assembly.membrane')}
          >
            {placementPlanes.map((plane) => {
              const surfaceId = `surface:${plane.roofPlaneId}`;
              const selected = state.workbench.selectedId === surfaceId;
              const included =
                selectedStore.membrane?.roofPlaneIds === undefined ||
                selectedStore.membrane.roofPlaneIds.includes(plane.roofPlaneId);
              const holes = windowOverlays.filter(
                (overlay) => overlay.feature.roofPlaneId === plane.roofPlaneId,
              );
              const maskId = `surface-mask-${plane.roofPlaneId.replaceAll(':', '-')}`;
              const surface = surfaceGeometry.planes.find(
                (candidate) => candidate.roofPlaneId === plane.roofPlaneId,
              );
              return (
                <g key={surfaceId}>
                  <mask id={maskId}>
                    <polygon points={pointString(plane.corners)} fill="white" />
                    {holes.map((hole) => (
                      <polygon
                        key={hole.feature.id}
                        points={pointString(hole.corners)}
                        fill="black"
                      />
                    ))}
                  </mask>
                  <polygon
                    points={pointString(plane.corners)}
                    mask={`url(#${maskId})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`${t('assembly.roofPlane')} ${t(roofPlaneShortLabelKey(plane.roofPlaneId), { id: plane.roofPlaneId })} · ${surface ? new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(surface.netAreaMm2 / 1_000_000) : 0} m²`}
                    data-roof-surface={surfaceId}
                    className={`${selected ? 'is-selected' : ''} ${included ? '' : 'is-excluded'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      state.select(surfaceId);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      focusScreenPoints(plane.corners);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        state.select(surfaceId);
                      }
                    }}
                  />
                </g>
              );
            })}
          </g>
        )}
        {placementGhostCorners && (
          <g className="a-roof-window-ghost" pointerEvents="none">
            <polygon
              points={placementGhostCorners
                .map((corner) => `${corner.x},${corner.y}`)
                .join(' ')}
            />
            {policy.showLabels && (
              <text
                x={placementGhostCorners[0]!.x + 8}
                y={placementGhostCorners[0]!.y - 8}
              >
                {length(placementGhost!.feature.widthMm)} ×{' '}
                {length(placementGhost!.feature.heightMm)}
              </text>
            )}
          </g>
        )}
        {policy.showBattens && (
          <g className="a-batten-layer" aria-label={t('assembly.battens')}>
            {battenLines.map((batten) => (
              <g
                key={batten.id}
                role="button"
                tabIndex={0}
                data-batten-row={batten.rowId}
                aria-label={`${t('assembly.battenRow')} ${batten.rowId.split(':').at(-1)}`}
                aria-pressed={
                  state.workbench.selectedId === batten.rowId ||
                  relatedIds?.has(batten.rowId)
                }
                className={
                  state.workbench.selectedId === batten.rowId ||
                  relatedIds?.has(batten.rowId)
                    ? 'is-selected'
                    : ''
                }
                onClick={(event) => {
                  event.stopPropagation();
                  state.select(batten.rowId);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  focusScreenPoints([batten.from, batten.to]);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    state.select(batten.rowId);
                  }
                }}
              >
                <line
                  className="a-batten-hit-target"
                  x1={batten.from.x}
                  y1={batten.from.y}
                  x2={batten.to.x}
                  y2={batten.to.y}
                />
                <line
                  className="a-batten-segment"
                  x1={batten.from.x}
                  y1={batten.from.y}
                  x2={batten.to.x}
                  y2={batten.to.y}
                />
              </g>
            ))}
          </g>
        )}
        {policy.showCounterBattens && (
          <g
            className="a-counter-batten-layer"
            aria-label={t('assembly.counterBattens')}
          >
            {counterBattenLines.map((row) => {
              const selected = state.workbench.selectedId === row.rowId;
              return (
                <g
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  data-counter-batten-row={row.rowId}
                  className={selected ? 'is-selected' : ''}
                  onClick={(event) => {
                    event.stopPropagation();
                    state.select(row.rowId);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    focusScreenPoints([row.from, row.to]);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      state.select(row.rowId);
                    }
                  }}
                >
                  <line
                    className="a-counter-batten-hit-target"
                    x1={row.from.x}
                    y1={row.from.y}
                    x2={row.to.x}
                    y2={row.to.y}
                  />
                  <line
                    className="a-counter-batten-segment"
                    x1={row.from.x}
                    y1={row.from.y}
                    x2={row.to.x}
                    y2={row.to.y}
                  />
                </g>
              );
            })}
          </g>
        )}
        {spacingStationAxes.length > 0 && (
          <g
            className={`a-spacing-guides ${state.workbench.selectedId === 'roof' ? 'is-active' : ''}`}
            aria-hidden="true"
          >
            {spacingStationAxes.map((station) => (
              <line
                key={station.id}
                data-testid="spacing-station-axis"
                className="a-spacing-station-axis"
                x1={station.from.x}
                y1={station.from.y}
                x2={station.to.x}
                y2={station.to.y}
              />
            ))}
            {spacingDimensions.map((dimension) => {
              const from = spacingStationAxes[dimension.fromStationIndex]!;
              const to = spacingStationAxes[dimension.toStationIndex]!;
              const laneOffset = dimension.lane * 18;
              return (
                <g
                  key={dimension.id}
                  data-testid="spacing-bay-dimension"
                  data-spacing-presentation={
                    dimension.representative ? 'representative' : 'individual'
                  }
                >
                  <line
                    className="a-spacing-dimension-line"
                    x1={from.dimensionPoint.x + laneOffset}
                    y1={from.dimensionPoint.y}
                    x2={to.dimensionPoint.x + laneOffset}
                    y2={to.dimensionPoint.y}
                  />
                  <circle
                    cx={from.dimensionPoint.x + laneOffset}
                    cy={from.dimensionPoint.y}
                    r={2.5}
                  />
                  <circle
                    cx={to.dimensionPoint.x + laneOffset}
                    cy={to.dimensionPoint.y}
                    r={2.5}
                  />
                  <text
                    x={
                      (from.dimensionPoint.x + to.dimensionPoint.x) / 2 +
                      laneOffset +
                      7
                    }
                    y={(from.dimensionPoint.y + to.dimensionPoint.y) / 2 - 5}
                  >
                    {dimension.representative
                      ? `${dimension.count} × ${length(dimension.spacingMm)}`
                      : length(dimension.spacingMm)}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        <g className="a-skeleton-members">
          {solids
            .filter(({ member }) => {
              const secondary =
                member.kind === 'rafter' || member.kind === 'jack-rafter';
              return secondary
                ? policy.showSecondaryMembers ||
                    state.workbench.selectedId === member.id
                : policy.showPrimaryMembers ||
                    state.workbench.selectedId === member.id;
            })
            .map(({ member, faces }) => {
              const visualState = resolveMemberVisualState({
                member,
                view: state.workbench,
                relatedSupportId,
                relatedIds,
              });
              const selected = visualState === 'selected';
              const warning = selectedCollisionIds.has(member.id);
              const bayBoundary = bayMemberIds.has(member.id);
              const related = visualState === 'related' || bayBoundary;
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
              const axisFrom = viewPoint(projectAxonometric(member.from));
              const axisTo = viewPoint(projectAxonometric(member.to));
              return (
                <g
                  key={member.id}
                  data-entity={member.id}
                  data-prototype={member.prototypeId}
                  data-selection-state={
                    warning
                      ? 'warning'
                      : selected
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
                  className={`a-skeleton-member kind-${member.kind} ${proposalMemberIds?.has(member.id) ? 'is-framing-proposal' : ''} ${selected ? 'is-selected' : ''} ${related ? 'is-related' : ''} ${warning ? 'is-warning' : ''} ${muted && !warning && !bayBoundary ? 'is-muted' : ''} ${editablePurlin ? 'is-editable-purlin' : ''} ${activePurlin ? 'is-hover-editable' : ''}`}
                  onClick={() => select(member)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    focusScreenPoints(
                      faces.flatMap((face) => face.projected.map(viewPoint)),
                    );
                  }}
                  onKeyDown={(event) => {
                    if (
                      purlinHandle &&
                      [
                        'ArrowLeft',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowDown',
                      ].includes(event.key)
                    ) {
                      adjustHandle(event, purlinHandle);
                      return;
                    }
                    keySelect(event, member);
                  }}
                  onPointerEnter={() => {
                    setHoveredMemberId(member.id);
                    if (editablePurlin) setHoveredPurlin(member.selectionId);
                  }}
                  onPointerLeave={() => {
                    if (hoveredMemberId === member.id) setHoveredMemberId(null);
                    if (hoveredPurlin === member.selectionId)
                      setHoveredPurlin(null);
                  }}
                  onPointerDown={(event) => {
                    if (purlinHandle) startDrag(event, purlinHandle);
                  }}
                >
                  {axisFrom && axisTo && (
                    <line
                      className={
                        editablePurlin
                          ? 'a-purlin-body-hit-target'
                          : 'a-member-hit-target'
                      }
                      data-purlin-hit-target={
                        editablePurlin ? member.selectionId : undefined
                      }
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
              const selected =
                state.workbench.selectedId === overlay.feature.id;
              const groupSelected = state.workbench.selectedFeatureIds.includes(
                overlay.feature.id,
              );
              const collides = overlay.collisionIds.size > 0;
              return (
                <g
                  key={overlay.feature.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t('assembly.roofWindow')} ${overlay.feature.id}`}
                  aria-pressed={groupSelected}
                  data-roof-window={overlay.feature.id}
                  data-collision={collides || undefined}
                  className={`a-roof-window ${selected ? 'is-selected' : ''} ${groupSelected && !selected ? 'is-group-selected' : ''} ${collides ? 'is-collision' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    state.selectRoofWindow(overlay.feature.id, event.shiftKey);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    focusScreenPoints(overlay.corners);
                  }}
                  onKeyDown={(event) => {
                    if (nudgeWindow(event, overlay.feature)) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      state.selectRoofWindow(overlay.feature.id);
                    }
                  }}
                  onPointerDown={(event) => startWindowDrag(event, overlay)}
                >
                  <polygon
                    points={overlay.corners
                      .map((corner) => `${corner.x},${corner.y}`)
                      .join(' ')}
                  />
                  {policy.showLabels &&
                    visibleWindowLabelIds.has(overlay.feature.id) && (
                      <text
                        x={
                          overlay.corners.reduce(
                            (sum, point) => sum + point.x,
                            0,
                          ) / 4
                        }
                        y={
                          overlay.corners.reduce(
                            (sum, point) => sum + point.y,
                            0,
                          ) / 4
                        }
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {overlay.feature.id.replace(
                          'feature:roof-window-',
                          'O',
                        )}
                      </text>
                    )}
                  {collides && (
                    <title>
                      {t('assembly.windowCollision')}:{' '}
                      {[...overlay.collisionIds]
                        .map(memberInstanceCode)
                        .join(', ')}
                    </title>
                  )}
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
            {handles
              .filter((handle) => handle.kind !== 'purlin')
              .map((handle) => (
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
        {selectedStore.measurement && (
          <g className="a-measure-layer">
            {measurementFrom && measurementTo && (
              <line
                data-testid="measure-line"
                x1={worldPoint(measurementFrom.point).x}
                y1={worldPoint(measurementFrom.point).y}
                x2={worldPoint(measurementTo.point).x}
                y2={worldPoint(measurementTo.point).y}
              />
            )}
            {[measurementFrom, measurementTo]
              .filter((point): point is MeasurementSnapPoint => !!point)
              .map((point, index) => (
                <circle
                  key={`${point.id}:${index}`}
                  data-testid={
                    index === 0 ? 'measure-first-point' : 'measure-snap-point'
                  }
                  cx={worldPoint(point.point).x}
                  cy={worldPoint(point.point).y}
                  r={index === 0 ? 7 : 6}
                />
              ))}
            <rect
              className="a-measure-hit-layer"
              width={width}
              height={height}
              fill="transparent"
              role="button"
              aria-label={t('assembly.measurePickPoint')}
              onPointerMove={(event) =>
                setHoveredMeasurePoint(measurementPointAt(event))
              }
              onPointerLeave={() => setHoveredMeasurePoint(undefined)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const point = measurementPointAt(event);
                if (point) selectedStore.chooseMeasurementPoint(point);
              }}
            />
          </g>
        )}
      </svg>
      {selectedStore.measurement && (
        <div className="a-measure-hud" role="status" data-testid="measure-hud">
          <strong>{t('assembly.measure')}</strong>
          {selectedStore.measurement.result ? (
            <>
              <span>
                {selectedStore.measurement.result.from.label} →{' '}
                {selectedStore.measurement.result.to.label}
              </span>
              <b>{length(selectedStore.measurement.result.distanceMm)}</b>
            </>
          ) : measurementFrom ? (
            <span>
              {t('assembly.measurePickSecond', {
                point: measurementFrom.label,
              })}
            </span>
          ) : (
            <span>{t('assembly.measurePickFirst')}</span>
          )}
        </div>
      )}
      {identityMember &&
        identityMemberLengthMm !== undefined &&
        !selectedWindowOverlay && (
          <div
            className={`a-member-hud ${selectedMember ? 'is-selected' : 'is-hover'}`}
            role="status"
            data-testid="member-local-hud"
          >
            <strong>{memberInstanceCode(identityMember.id)}</strong>
            <span>{length(identityMemberLengthMm)}</span>
            <span>
              {length(identityMember.section.widthMm)} ×{' '}
              {length(identityMember.section.depthMm)}
            </span>
          </div>
        )}
      {selectedWindowOverlay && (
        <div
          className={`a-window-hud ${selectedWindowOverlay.collisionIds.size ? 'is-warning' : ''}`}
          role="status"
        >
          <strong>
            {selectedWindowOverlay.feature.id.replace(
              'feature:roof-window-',
              'O',
            )}{' '}
            · {length(selectedWindowOverlay.feature.widthMm)} ×{' '}
            {length(selectedWindowOverlay.feature.heightMm)}
          </strong>
          {selectedBay && (
            <span>
              {selectedBay.memberInstanceIds
                .map(memberInstanceCode)
                .join(' — ')}
            </span>
          )}
          {selectedWindowOverlay.collisionIds.size > 0 && (
            <span>
              ⚠ {t('assembly.windowCollision')}:{' '}
              {[...selectedWindowOverlay.collisionIds]
                .map(memberInstanceCode)
                .join(', ')}
            </span>
          )}
        </div>
      )}
      {selectedBatten && !selectedWindowOverlay && (
        <div className="a-window-hud a-batten-hud" role="status">
          <strong>
            L{selectedBatten.id.split(':').at(-1)} ·{' '}
            {length(selectedStore.battenLayout?.gaugeMm ?? 0)}
          </strong>
          <span>
            {length(selectedBatten.usableLengthMm)} ·{' '}
            {selectedBatten.segments.length}{' '}
            {t('assembly.battenSegments').toLowerCase()}
          </span>
        </div>
      )}
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
              clampCanvasViewport(
                { ...current, zoom: current.zoom - 0.2 },
                { width, height },
              ),
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
              clampCanvasViewport(
                { ...current, zoom: current.zoom + 0.2 },
                { width, height },
              ),
            )
          }
        >
          <Plus size={16} />
        </button>
        <button
          aria-label={t('assembly.fit')}
          onClick={() => {
            activeFitRef.current = candidateFitRef.current;
            setViewport({ ...fittedViewport });
          }}
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
            {spacingSummaryDimensions
              .map(
                (dimension) =>
                  `${dimension.count} × ${length(dimension.spacingMm)}`,
              )
              .join(' + ')}
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
