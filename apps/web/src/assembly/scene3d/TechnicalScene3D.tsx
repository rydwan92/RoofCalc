import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Boxes,
  Eye,
  EyeOff,
  Hammer,
  Layers,
  Maximize,
  ScanSearch,
  SlidersHorizontal,
} from 'lucide-react';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import {
  placeIfcRoofReference,
  type IfcRoofSource,
} from '@cieslacalc/bim-import-core';
import {
  DEFAULT_SCENE_VISIBILITY_POLICY,
  SCENE_VIEW_PRESETS,
  boundsOfEntities,
  createRoofTechnicalScene,
  resolveSceneEntityVisibility,
  type SceneCounterBattenInput,
  type SceneFinishedMemberInput,
  type SceneProjection,
  type SceneSemanticGroup,
  type SceneUnresolvedHipBoundaryInput,
  type SceneViewPreset,
} from '@cieslacalc/technical-scene';
import { formatLength } from '../../format';
import { useAssembly } from '../store';
import {
  sceneEntityEmphasis,
  sceneFamilyFacets,
  sceneSelectionFacts,
  selectedSceneEntity,
} from './scene-presentation';
import { TechnicalViewport, type EntityPresentation } from './viewport';

/**
 * The technical 3D workspace (V38).
 *
 * It is a *view* of the current task, not a new perspective: it draws the same
 * resolved project as the 2D canvas, drives the same canonical selection, and
 * edits nothing. Camera, projection, view preset, family filters and X-ray are
 * renderer-local transient state and never enter the project or its history.
 */

export function TechnicalScene3D({
  skeleton,
  relatedIds,
  counterBattens,
  unresolvedHipBoundaries,
  finishedMembers,
  onReturnTo2D,
  onOpenPreparation,
  ifcReference,
}: {
  /** V62: the imported IFC roof, shown as a subdued reference only. */
  ifcReference?: IfcRoofSource;
  skeleton: RoofSkeleton;
  relatedIds?: ReadonlySet<string>;
  counterBattens?: readonly SceneCounterBattenInput[];
  unresolvedHipBoundaries?: readonly SceneUnresolvedHipBoundaryInput[];
  finishedMembers?: readonly SceneFinishedMemberInput[];
  onReturnTo2D: () => void;
  onOpenPreparation?: (instanceId: string, prototypeId: string) => void;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<TechnicalViewport>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);
  const [hovering, setHovering] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [projection, setProjection] = useState<SceneProjection>('perspective');
  const [preset, setPreset] = useState<SceneViewPreset>('isometric');
  const [xray, setXray] = useState(false);
  const [showPlanes, setShowPlanes] = useState(true);
  // V39: build-up context is off by default so the structure stays the
  // subject; the finished/reference toggle is a transient display choice.
  const [showBuildUp, setShowBuildUp] = useState(false);
  const [finishedGeometry, setFinishedGeometry] = useState(true);
  const [hiddenGroups, setHiddenGroups] = useState<SceneSemanticGroup[]>([]);
  const [showIfc, setShowIfc] = useState(true);

  const workbench = state.workbench;
  const isolate = workbench.isolateSelection;

  // The scene is rebuilt only when the resolved roof geometry changes. Camera
  // moves, hover, selection, filters and task switches all reuse this result.
  const scene = useMemo(
    () =>
      createRoofTechnicalScene({
        skeleton,
        counterBattens: showBuildUp ? counterBattens : [],
        unresolvedHipBoundaries: showBuildUp ? unresolvedHipBoundaries : [],
        finishedMembers: finishedGeometry ? finishedMembers : [],
      }),
    [
      counterBattens,
      finishedGeometry,
      finishedMembers,
      showBuildUp,
      skeleton,
      unresolvedHipBoundaries,
    ],
  );
  const families = useMemo(() => sceneFamilyFacets(scene), [scene]);
  // IFC reference: placed rigidly onto RoofCalc's own roof-plane ridge level.
  const roofPlanePoints = useMemo(
    () =>
      scene.entities.flatMap((entity) =>
        entity.kind === 'roof-plane' && entity.geometry.kind === 'polygon'
          ? entity.geometry.points
          : [],
      ),
    [scene],
  );
  const ifcPlaced = useMemo(() => {
    if (!ifcReference) return undefined;
    const ridgeLevelMm = roofPlanePoints.length
      ? Math.max(...roofPlanePoints.map((point) => point.z))
      : scene.bounds.max.z;
    return placeIfcRoofReference(ifcReference, ifcReference.analysis, {
      buildingLengthMm: state.template.buildingLengthMm,
      ridgeLevelMm,
    });
  }, [
    ifcReference,
    roofPlanePoints,
    scene.bounds,
    state.template.buildingLengthMm,
  ]);
  // Factual differences only where RoofCalc has explicit roof planes.
  const ifcComparison = useMemo(() => {
    if (!ifcPlaced || !roofPlanePoints.length) return undefined;
    const xs = roofPlanePoints.map((point) => point.x);
    const ys = roofPlanePoints.map((point) => point.y);
    const top = Math.max(...roofPlanePoints.map((point) => point.z));
    const ridgeYs = roofPlanePoints
      .filter((point) => Math.abs(point.z - top) < 1)
      .map((point) => point.y);
    return {
      ifc: {
        length: ifcPlaced.outline.lengthMm,
        width: ifcPlaced.outline.widthMm,
        ridge: ifcPlaced.ridgeLengthMm,
      },
      roofcalc: {
        length: Math.max(...ys) - Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        ridge: ridgeYs.length ? Math.max(...ridgeYs) - Math.min(...ridgeYs) : 0,
      },
    };
  }, [ifcPlaced, roofPlanePoints]);
  // Only hip skeletons carry roof-plane guides today, so the toggle appears
  // only where there is actually a plane to show.
  const hasRoofPlanes = useMemo(
    () => scene.entities.some((entity) => entity.kind === 'roof-plane'),
    [scene],
  );
  const selectedEntity = useMemo(
    () => selectedSceneEntity(scene, workbench),
    [scene, workbench],
  );
  const facts = selectedEntity
    ? sceneSelectionFacts(selectedEntity)
    : undefined;

  const presentation = useMemo(() => {
    const policy = {
      ...DEFAULT_SCENE_VISIBILITY_POLICY,
      hiddenGroups: new Set(hiddenGroups),
      isolate,
      xray,
      showRoofPlanes: showPlanes,
    };
    const map = new Map<string, EntityPresentation>();
    for (const entity of scene.entities) {
      const emphasis = sceneEntityEmphasis(entity, workbench, relatedIds);
      map.set(entity.id, {
        emphasis,
        visibility: resolveSceneEntityVisibility(entity, emphasis, policy),
      });
    }
    return map;
  }, [hiddenGroups, isolate, relatedIds, scene, showPlanes, workbench, xray]);

  // Renderer lifecycle. A device without a usable WebGL context must never
  // break the workbench: the 2D calculations stay fully available.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewport: TechnicalViewport;
    try {
      viewport = new TechnicalViewport(canvas);
    } catch {
      setFailed(true);
      return;
    }
    viewportRef.current = viewport;
    setReady(true);
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    const observer = new ResizeObserver(() => viewport.resize());
    observer.observe(canvas);
    viewport.resize();
    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      viewportRef.current = null;
      setReady(false);
      viewport.dispose();
    };
  }, []);

  // A new resolved scene reframes the whole roof automatically.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !ready) return;
    viewport.setScene(scene);
    viewport.fit(scene.bounds, preset);
    // `preset` is deliberately excluded: changing the preset must not rebuild
    // the scene, and the preset buttons frame the camera themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scene]);

  useEffect(() => {
    if (!ready) return;
    viewportRef.current?.setPresentation(presentation, showPlanes);
  }, [presentation, ready, showPlanes]);

  useEffect(() => {
    if (!ready) return;
    viewportRef.current?.setProjection(projection);
  }, [projection, ready]);

  useEffect(() => {
    if (!ready) return;
    viewportRef.current?.setReference(showIfc ? ifcPlaced : undefined);
  }, [ifcPlaced, ready, showIfc]);

  const applyPreset = useCallback(
    (next: SceneViewPreset) => {
      setPreset(next);
      viewportRef.current?.fit(scene.bounds, next);
    },
    [scene.bounds],
  );

  const fitAll = useCallback(() => {
    viewportRef.current?.fit(scene.bounds, preset);
  }, [preset, scene.bounds]);

  const fitSelected = useCallback(() => {
    if (!selectedEntity) return;
    // Framing never mutates the selection; it only moves the camera.
    viewportRef.current?.fitKeepingDirection(
      boundsOfEntities([selectedEntity]),
      2.6,
    );
  }, [selectedEntity]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerDown.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerDown.current;
    pointerDown.current = null;
    // A drag is a camera gesture, never a selection (UX contract §6).
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
    )
      return;
    const hit = viewportRef.current?.pick(event.clientX, event.clientY);
    const entity = hit ? viewportRef.current?.entity(hit.entityId) : undefined;
    if (!entity?.selectable || !entity.sourceRef.selectionId) {
      state.select('roof');
      return;
    }
    state.select(entity.sourceRef.selectionId, entity.sourceRef.prototypeId);
  };

  const onDoubleClick = () => {
    if (selectedEntity) fitSelected();
  };

  // Hover is renderer-local feedback only: one raycast per animation frame,
  // and never a canonical selection update on pointer move (§18).
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerDown.current) return;
    const { clientX, clientY } = event;
    if (hoverFrame.current) return;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = 0;
      setHovering(!!viewportRef.current?.hover(clientX, clientY));
    });
  };

  const onPointerLeave = () => {
    viewportRef.current?.clearHover();
    setHovering(false);
  };

  useEffect(
    () => () => {
      if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );

  const toggleGroup = (group: SceneSemanticGroup) =>
    setHiddenGroups((current) =>
      current.includes(group)
        ? current.filter((entry) => entry !== group)
        : [...current, group],
    );

  const length = (valueMm: number) =>
    formatLength(valueMm, state.unit, i18n.language);
  const signed = (valueMm: number) =>
    Math.abs(valueMm) < 0.5
      ? length(0)
      : `${valueMm > 0 ? '+' : ''}${length(valueMm)}`;

  if (failed)
    return (
      <div className="a-canvas a-scene3d is-unavailable" role="alert">
        <div className="a-scene3d-unavailable">
          <Box size={28} aria-hidden="true" />
          <p>{t('assembly.scene3d.unavailable')}</p>
          <button className="a-button a-primary" onClick={onReturnTo2D}>
            {t('assembly.scene3d.backTo2D')}
          </button>
        </div>
      </div>
    );

  return (
    <div className="a-canvas a-scene3d" data-testid="technical-scene-3d">
      <div className="a-canvas-toolbar a-scene3d-toolbar">
        <span>{t('assembly.scene3d.title')}</span>
        <span
          className="a-scene3d-reference"
          data-scene-geometry-mode={
            finishedGeometry && finishedMembers?.length
              ? 'finished'
              : 'reference'
          }
        >
          {t(
            finishedGeometry && finishedMembers?.length
              ? 'assembly.scene3d.mixedGeometryNote'
              : 'assembly.scene3d.referenceGeometry',
          )}
        </span>
      </div>
      <div className="a-scene3d-controls">
        <div
          className="a-scene3d-presets"
          role="group"
          aria-label={t('assembly.scene3d.viewPresets')}
        >
          {SCENE_VIEW_PRESETS.map((entry) => (
            <button
              key={entry}
              className="a-button a-ghost"
              data-scene-preset={entry}
              aria-pressed={preset === entry}
              onClick={() => applyPreset(entry)}
            >
              {t(`assembly.scene3d.preset.${entry}`)}
            </button>
          ))}
        </div>
        <div
          className="a-scene3d-projection"
          role="group"
          aria-label={t('assembly.scene3d.projection')}
        >
          {(['perspective', 'orthographic'] as SceneProjection[]).map(
            (entry) => (
              <button
                key={entry}
                className="a-button a-ghost"
                data-scene-projection={entry}
                aria-pressed={projection === entry}
                onClick={() => setProjection(entry)}
              >
                {t(`assembly.scene3d.projection.${entry}`)}
              </button>
            ),
          )}
        </div>
        <div className="a-scene3d-actions">
          <button
            className="a-button a-ghost"
            data-scene-action="fit"
            onClick={fitAll}
          >
            <Maximize size={15} aria-hidden="true" />
            {t('assembly.fit')}
          </button>
          <button
            className="a-button a-ghost"
            data-scene-action="fit-selected"
            disabled={!selectedEntity}
            onClick={fitSelected}
          >
            <ScanSearch size={15} aria-hidden="true" />
            {t('assembly.scene3d.fitSelected')}
          </button>
          <button
            className="a-button a-ghost"
            data-scene-action="isolate"
            aria-pressed={isolate}
            disabled={!selectedEntity && !isolate}
            onClick={() => state.setIsolation(!isolate)}
          >
            {isolate ? (
              <Eye size={15} aria-hidden="true" />
            ) : (
              <EyeOff size={15} aria-hidden="true" />
            )}
            {t(`assembly.${isolate ? 'showWholeRoof' : 'isolateElement'}`)}
          </button>
          <button
            className="a-button a-ghost"
            data-scene-action="build-up"
            aria-pressed={showBuildUp}
            onClick={() => setShowBuildUp((current) => !current)}
          >
            <Layers size={15} aria-hidden="true" />
            {t('assembly.counterBattens')}
          </button>
          <button
            className="a-button a-ghost"
            data-scene-action="finished"
            aria-pressed={finishedGeometry}
            disabled={!finishedMembers?.length}
            title={t('assembly.scene3d.finishedHint')}
            onClick={() => setFinishedGeometry((current) => !current)}
          >
            <Hammer size={15} aria-hidden="true" />
            {t(
              `assembly.scene3d.${finishedGeometry ? 'executionGeometry' : 'referenceGeometryShort'}`,
            )}
          </button>
          {ifcPlaced && (
            <button
              className="a-button a-ghost a-scene3d-ifc-toggle"
              data-scene-action="ifc-reference"
              aria-pressed={showIfc}
              title={t('assembly.scene3d.ifcModelHint')}
              onClick={() => setShowIfc((current) => !current)}
            >
              <Box size={15} aria-hidden="true" />
              {t('assembly.scene3d.ifcModel')}
            </button>
          )}
          <button
            className="a-button a-ghost"
            data-scene-action="xray"
            aria-pressed={xray}
            onClick={() => setXray((current) => !current)}
          >
            <Layers size={15} aria-hidden="true" />
            {t('assembly.scene3d.xray')}
          </button>
          <details className="a-view-options a-scene3d-families">
            <summary>
              <SlidersHorizontal size={15} aria-hidden="true" />
              {t('assembly.scene3d.families')}
            </summary>
            <div className="a-view-popover">
              {families.map((family) => (
                <label key={family.group} data-scene-family={family.group}>
                  <input
                    type="checkbox"
                    checked={!hiddenGroups.includes(family.group)}
                    onChange={() => toggleGroup(family.group)}
                  />
                  {family.code ? <strong>{family.code}</strong> : null}
                  {t(`assembly.${family.nameKey}`)}
                  <span className="a-scene3d-count">{family.count}</span>
                </label>
              ))}
              {hasRoofPlanes && (
                <label data-scene-family="roof-plane">
                  <input
                    type="checkbox"
                    checked={showPlanes}
                    onChange={(event) => setShowPlanes(event.target.checked)}
                  />
                  {t('assembly.scene3d.roofPlanes')}
                </label>
              )}
            </div>
          </details>
        </div>
      </div>
      <div className="a-scene3d-stage">
        <canvas
          ref={canvasRef}
          className={`a-scene3d-canvas ${hovering ? 'is-over-member' : ''}`}
          data-testid="technical-scene-3d-canvas"
          aria-label={t('assembly.scene3d.canvasLabel')}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
        />
        {ifcPlaced && showIfc && (
          <div className="a-scene3d-ifc" data-testid="scene-3d-ifc-compare">
            <strong>{t('assembly.scene3d.ifcCompare')}</strong>
            {ifcComparison ? (
              <>
                <span data-compare="outline">
                  <i>{t('assembly.scene3d.ifcOutline')}</i>
                  IFC {length(ifcComparison.ifc.length)} ×{' '}
                  {length(ifcComparison.ifc.width)} · RoofCalc{' '}
                  {length(ifcComparison.roofcalc.length)} ×{' '}
                  {length(ifcComparison.roofcalc.width)} {state.unit}
                  <em>
                    {t('assembly.scene3d.ifcDifference')}{' '}
                    {signed(
                      ifcComparison.roofcalc.length - ifcComparison.ifc.length,
                    )}{' '}
                    ×{' '}
                    {signed(
                      ifcComparison.roofcalc.width - ifcComparison.ifc.width,
                    )}{' '}
                    {state.unit}
                  </em>
                </span>
                <span data-compare="ridge">
                  <i>{t('assembly.scene3d.ifcRidge')}</i>
                  IFC {length(ifcComparison.ifc.ridge)} · RoofCalc{' '}
                  {length(ifcComparison.roofcalc.ridge)} {state.unit}
                  <em>
                    {t('assembly.scene3d.ifcDifference')}{' '}
                    {signed(
                      ifcComparison.roofcalc.ridge - ifcComparison.ifc.ridge,
                    )}{' '}
                    {state.unit}
                  </em>
                </span>
              </>
            ) : (
              <span>{t('assembly.scene3d.ifcNoPlanes')}</span>
            )}
          </div>
        )}
        {facts && (
          <div className="a-scene3d-hud" data-testid="scene-3d-hud">
            <strong>
              {facts.code ? `${facts.code} — ` : ''}
              {t(`assembly.${facts.nameKey}`)}
            </strong>
            {facts.sectionWidthMm !== undefined &&
              facts.sectionDepthMm !== undefined && (
                <span data-hud="section">
                  <i>{t('assembly.section')}</i>
                  {length(facts.sectionWidthMm)} ×{' '}
                  {length(facts.sectionDepthMm)} {state.unit}
                </span>
              )}
            {facts.lengthMm !== undefined && (
              // Named for the layer it comes from (UX contract §4): this is
              // the model's member axis, not a fabrication blank or a
              // commercial length. The Inspector owns those.
              <span data-hud="length">
                <i>{t('assembly.resultBasis.title.axisGeometric')}</i>
                {length(facts.lengthMm)} {state.unit}
              </span>
            )}
            {facts.limitations.includes('compound-connection-not-resolved') && (
              <em data-hud="limitation">
                {t('assembly.scene3d.connectionNotModelled')}
              </em>
            )}
            {onOpenPreparation &&
              selectedEntity?.sourceRef.memberId &&
              selectedEntity.sourceRef.prototypeId && (
                <button
                  className="a-button a-ghost"
                  data-scene-action="preparation"
                  onClick={() =>
                    onOpenPreparation(
                      selectedEntity.sourceRef.memberId!,
                      selectedEntity.sourceRef.prototypeId!,
                    )
                  }
                >
                  <Boxes size={14} aria-hidden="true" />
                  {t('assembly.scene3d.openPreparation')}
                </button>
              )}
          </div>
        )}
      </div>
      <p className="a-canvas-hint">{t('assembly.scene3d.hint')}</p>
    </div>
  );
}

export default TechnicalScene3D;
