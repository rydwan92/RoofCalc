import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  type CoveringAssignmentSpec,
  type CoveringKind,
  type CoveringProductSelection,
  type CutToLengthSheetLayoutResult,
  type ModularSheetLayoutResult,
  type PrimaryCoveringPlaneConflict,
  type RoofTileLayoutResult,
  type StandingSeamLayoutResult,
} from '@cieslacalc/covering-core';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type {
  BattenLayoutResult,
  CounterBattenLayoutResult,
  RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import { parseDecimal } from '../format';
import { useAssembly } from './store';
import {
  coveringKindLabelKey,
  installationModeLabelKey,
  roofPlaneLabelKey,
} from './covering-presentation';
import { ResultBasis, ResultLayerProgress } from './ResultBasis';
import { CoveringAddAssistant } from './CoveringAddAssistant';

const CatalogProductPicker = lazy(() =>
  import('../catalog/CatalogProductPicker').then((module) => ({
    default: module.CatalogProductPicker,
  })),
);

type TileAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'roof-tile' }
    >;
  };
};

type ModularSheetAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'modular-sheet' }
    >;
  };
};

type StandingSeamAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'standing-seam' }
    >;
  };
};

type SupportedLayout =
  | RoofTileLayoutResult
  | ModularSheetLayoutResult
  | CutToLengthSheetLayoutResult
  | StandingSeamLayoutResult;

interface CoveringIssueSummary {
  code: string;
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
  roofPlaneIds: string[];
}

function groupedCoveringIssues(
  layout?: SupportedLayout,
): CoveringIssueSummary[] {
  if (!layout) return [];
  const issues =
    layout.kind === 'standing-seam' ||
    layout.kind === 'modular-sheet-cut-to-length'
      ? layout.issueCodes
          .map((code) => layout.issues.find((issue) => issue.code === code))
          .filter((issue): issue is NonNullable<typeof issue> => !!issue)
      : layout.issues;
  const grouped = new Map<string, CoveringIssueSummary>();
  for (const issue of issues) {
    const key = [
      issue.code,
      issue.actual,
      issue.required,
      issue.minimum,
      issue.maximum,
    ].join(':');
    const current = grouped.get(key) ?? {
      code: issue.code,
      actual: issue.actual,
      required: issue.required,
      minimum: issue.minimum,
      maximum: issue.maximum,
      roofPlaneIds: [],
    };
    if (issue.roofPlaneId && !current.roofPlaneIds.includes(issue.roofPlaneId))
      current.roofPlaneIds.push(issue.roofPlaneId);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function isTileAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is TileAssignment {
  return assignment.product.technicalSpecSnapshot.kind === 'roof-tile';
}

function isModularSheetAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is ModularSheetAssignment {
  return assignment.product.technicalSpecSnapshot.kind === 'modular-sheet';
}

function isStandingSeamAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is StandingSeamAssignment {
  return assignment.product.technicalSpecSnapshot.kind === 'standing-seam';
}

export function createManualTileAssignment(args: {
  existing: readonly CoveringAssignmentSpec[];
  roofPlaneIds: readonly string[];
}): CoveringAssignmentSpec {
  const next =
    Math.max(
      0,
      ...args.existing.map((item) =>
        Number(/covering:roof-tile-(\d+)$/.exec(item.id)?.[1] ?? 0),
      ),
    ) + 1;
  return {
    id: `covering:roof-tile-${next}`,
    roofPlaneIds: [...args.roofPlaneIds],
    selectedInstallationModeId: 'manual-standard',
    layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'centered' },
    product: {
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'roof-tile',
        physicalWidthMm: 330,
        physicalLengthMm: 420,
        material: 'other',
        salesUnit: 'piece',
        installationModes: [
          {
            id: 'manual-standard',
            coverWidthMm: 300,
            gaugeRangeMm: { min: 300, max: 380 },
            minPitchDeg: 19,
            declaredUnitsPerM2: { min: 9.8, max: 10.7 },
            coursePattern: {
              layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
              battenRowOffsetCycle: [0],
            },
          },
        ],
      },
    },
  };
}

export function createManualModularSheetAssignment(args: {
  existing: readonly CoveringAssignmentSpec[];
  roofPlaneIds: readonly string[];
}): CoveringAssignmentSpec {
  const next =
    Math.max(
      0,
      ...args.existing.map((item) =>
        Number(/covering:modular-sheet-(\d+)$/.exec(item.id)?.[1] ?? 0),
      ),
    ) + 1;
  return {
    id: `covering:modular-sheet-${next}`,
    roofPlaneIds: [...args.roofPlaneIds],
    layoutIntent: { kind: 'modular-sheet', horizontalAlignment: 'centered' },
    product: {
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 1145,
        totalWidthMm: 1200,
        lengthModel: {
          kind: 'fixed-sheet',
          effectiveLengthMm: 700,
          totalLengthMm: 725,
        },
        moduleLengthMm: 350,
        profileHeightMm: 47.5,
        minPitchDeg: 9,
        physicalThicknessMm: 0.5,
        material: 'steel',
        salesUnit: 'piece',
      },
    },
  };
}

export function createManualStandingSeamAssignment(args: {
  existing: readonly CoveringAssignmentSpec[];
  roofPlaneIds: readonly string[];
}): CoveringAssignmentSpec {
  const next =
    Math.max(
      0,
      ...args.existing.map((item) =>
        Number(/covering:standing-seam-(\d+)$/.exec(item.id)?.[1] ?? 0),
      ),
    ) + 1;
  return {
    id: `covering:standing-seam-${next}`,
    roofPlaneIds: [...args.roofPlaneIds],
    selectedInstallationModeId: 'manual-standard',
    layoutIntent: { kind: 'standing-seam', horizontalAlignment: 'centered' },
    product: {
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'standing-seam',
        installationModes: [{ id: 'manual-standard', effectiveWidthMm: 500 }],
        minPanelLengthMm: 500,
        maxPanelLengthMm: 8000,
        seamHeightMm: 25,
        minPitchDeg: 8,
        physicalThicknessMm: 0.5,
        material: 'steel',
        salesUnit: 'piece',
      },
    },
  };
}

function NumericField({
  label,
  value,
  onCommit,
  unit,
  minimum = 0,
}: {
  label: string;
  value?: number;
  onCommit: (value: number | undefined) => void;
  unit?: string;
  minimum?: number;
}) {
  const state = useAssembly();
  const display =
    value === undefined
      ? ''
      : unit
        ? fromMillimetres(value, state.unit)
        : value;
  return (
    <label className="a-field">
      <span>{label}</span>
      <span className="a-input-with-unit">
        <input
          key={`${display}:${state.unit}`}
          type="text"
          inputMode="decimal"
          defaultValue={display}
          onBlur={(event) => {
            if (!event.currentTarget.value.trim()) return onCommit(undefined);
            const parsed = parseDecimal(event.currentTarget.value);
            if (parsed === null) return;
            const canonical = unit ? toMillimetres(parsed, state.unit) : parsed;
            if (canonical >= minimum) onCommit(canonical);
          }}
        />
        {unit && <small>{state.unit}</small>}
      </span>
    </label>
  );
}

function patternName(assignment: TileAssignment) {
  const mode = assignment.product.technicalSpecSnapshot.installationModes.find(
    (candidate) => candidate.id === assignment.selectedInstallationModeId,
  );
  if ((mode?.coursePattern?.layers.length ?? 0) > 1) return 'crown';
  if ((mode?.coursePattern?.battenRowOffsetCycle.length ?? 0) > 1)
    return 'staggered';
  return 'straight';
}

function polygonPoints(points: readonly { uMm: number; vMm: number }[]) {
  return points.map((point) => `${point.uMm},${point.vMm}`).join(' ');
}

function detachCatalogRevisionAfterTechnicalEdit(
  original: CoveringAssignmentSpec,
  draft: CoveringAssignmentSpec,
) {
  if (
    original.product.catalogRef &&
    JSON.stringify(original.product.technicalSpecSnapshot) !==
      JSON.stringify(draft.product.technicalSpecSnapshot)
  ) {
    delete draft.product.catalogRef;
    if (draft.product.displaySnapshot) {
      delete draft.product.displaySnapshot.manufacturer;
      delete draft.product.displaySnapshot.variantName;
      delete draft.product.displaySnapshot.revisionCode;
    }
  }
}

export function CoveringWorkspace({
  assignments,
  assignment,
  layout,
  conflicts,
  surfaceGeometry,
  battens,
  counterBattens,
}: {
  assignments: readonly CoveringAssignmentSpec[];
  assignment?: CoveringAssignmentSpec;
  layout?: SupportedLayout;
  conflicts: readonly PrimaryCoveringPlaneConflict[];
  surfaceGeometry: RoofSurfaceGeometryResult;
  battens: BattenLayoutResult;
  counterBattens: CounterBattenLayoutResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const [selectedPlaneId, setSelectedPlaneId] = useState<string>();
  const [catalogKind, setCatalogKind] = useState<CoveringKind>();
  const [adding, setAdding] = useState(!assignment);
  const [manualFallbackKind, setManualFallbackKind] = useState<CoveringKind>();
  const [catalogDetached, setCatalogDetached] = useState(false);
  const previousCatalogRef = useRef(assignment?.product.catalogRef);
  const [drawingDetail, setDrawingDetail] = useState<
    'auto' | 'detailed' | 'simplified'
  >('auto');
  const [showCovering, setShowCovering] = useState(true);
  const [showBattens, setShowBattens] = useState(true);
  const [showCounterBattens, setShowCounterBattens] = useState(false);
  const issueSummaries = useMemo(() => groupedCoveringIssues(layout), [layout]);
  const planeIds = surfaceGeometry.planes.map((plane) => plane.roofPlaneId);
  useEffect(() => {
    if (!selectedPlaneId || !planeIds.includes(selectedPlaneId))
      setSelectedPlaneId(planeIds[0]);
  }, [planeIds, selectedPlaneId]);
  const selectedSurface = surfaceGeometry.planes.find(
    (plane) => plane.roofPlaneId === selectedPlaneId,
  );
  const selectedLayout = layout?.planes.find(
    (plane) => plane.roofPlaneId === selectedPlaneId,
  );
  const fragments = useMemo(() => {
    if (
      (layout?.kind === 'standing-seam' ||
        layout?.kind === 'modular-sheet-cut-to-length') &&
      selectedLayout &&
      'columns' in selectedLayout
    )
      return selectedLayout.columns.flatMap((column) =>
        column.runs.flatMap((run) =>
          run.polygons.map((polygon, index) => ({
            id: `${run.id}:${index}`,
            classification: run.issues.length
              ? 'invalid-panel'
              : run.openingIds.length
                ? 'opening-interrupted'
                : column.edgeClassification === 'edge-cut-width'
                  ? 'edge-cut-width'
                  : 'full',
            polygon,
          })),
        ),
      );
    const positions = selectedLayout
      ? 'courses' in selectedLayout
        ? selectedLayout.courses.flatMap((course) => course.positions)
        : 'rows' in selectedLayout
          ? selectedLayout.rows.flatMap((row) => row.positions)
          : []
      : [];
    return positions.flatMap((position) =>
      position.visibleFragments.map((fragment, index) => ({
        id: `${position.id}:${index}`,
        classification: position.classification,
        polygon: fragment.polygon,
      })),
    );
  }, [layout?.kind, selectedLayout]);
  const simplified =
    drawingDetail === 'simplified' ||
    (drawingDetail === 'auto' && fragments.length > 1200);
  const hasFullFragments = fragments.some(
    (fragment) => fragment.classification === 'full',
  );
  const hasCutFragments = fragments.some(
    (fragment) => fragment.classification !== 'full',
  );
  const hasVisualProblem =
    conflicts.length > 0 ||
    layout?.status === 'invalid' ||
    layout?.status === 'incompatible';
  const bounds = selectedSurface
    ? (() => {
        const minU = Math.min(
          ...selectedSurface.polygon.map((point) => point.uMm),
        );
        const maxU = Math.max(
          ...selectedSurface.polygon.map((point) => point.uMm),
        );
        const minV = Math.min(
          ...selectedSurface.polygon.map((point) => point.vMm),
        );
        const maxV = Math.max(
          ...selectedSurface.polygon.map((point) => point.vMm),
        );
        const width = Math.max(1, maxU - minU);
        const height = Math.max(1, maxV - minV);
        const padding = Math.max(width, height) * 0.025;
        return {
          minU,
          maxU,
          minV,
          maxV,
          viewMinU: minU - padding,
          viewMinV: minV - padding,
          viewWidth: width + padding * 2,
          viewHeight: height + padding * 2,
        };
      })()
    : undefined;

  const tileMode =
    assignment && isTileAssignment(assignment)
      ? assignment.product.technicalSpecSnapshot.installationModes.find(
          (candidate) => candidate.id === assignment.selectedInstallationModeId,
        )
      : undefined;
  const sheetSpec =
    assignment && isModularSheetAssignment(assignment)
      ? assignment.product.technicalSpecSnapshot
      : undefined;

  useEffect(() => {
    if (previousCatalogRef.current && !assignment?.product.catalogRef)
      setCatalogDetached(true);
    if (assignment?.product.catalogRef) setCatalogDetached(false);
    previousCatalogRef.current = assignment?.product.catalogRef;
  }, [assignment?.product.catalogRef]);

  const openCatalog = (kind: CoveringKind) => {
    state.setMobilePanel('none');
    setAdding(false);
    setCatalogKind(kind);
  };

  const fitBattensAutomatically = () => {
    if (!assignment || !isTileAssignment(assignment)) return;
    const current = state.projectDocument.project.buildUp.battenLayout ?? {
      enabled: true,
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 250,
      ridgeOffsetMm: 0,
    };
    state.setBattenLayout({
      ...current,
      enabled: true,
      mode: 'auto-from-covering',
      roofPlaneIds: [...assignment.roofPlaneIds],
    });
  };

  const addAssignment = (
    kind: 'roof-tile' | 'modular-sheet' | 'standing-seam',
    product?: CoveringProductSelection,
  ) => {
    const next =
      kind === 'roof-tile'
        ? createManualTileAssignment({
            existing: assignments,
            roofPlaneIds: [surfaceGeometry.planes[0]!.roofPlaneId],
          })
        : kind === 'modular-sheet'
          ? createManualModularSheetAssignment({
              existing: assignments,
              roofPlaneIds: [surfaceGeometry.planes[0]!.roofPlaneId],
            })
          : createManualStandingSeamAssignment({
              existing: assignments,
              roofPlaneIds: [surfaceGeometry.planes[0]!.roofPlaneId],
            });
    if (product) {
      next.product = product;
      const spec = product.technicalSpecSnapshot;
      if (
        spec.kind === 'modular-sheet' &&
        spec.lengthModel.kind === 'cut-to-length'
      )
        next.layoutIntent = {
          kind: 'modular-sheet-cut-to-length',
          horizontalAlignment: 'centered',
        };
      next.selectedInstallationModeId =
        spec.kind === 'roof-tile' || spec.kind === 'standing-seam'
          ? spec.installationModes[0]?.id
          : undefined;
    }
    state.setCoveringAssignments([...assignments, next]);
    state.setSelectedCoveringAssignment(next.id);
    setCatalogKind(undefined);
    setAdding(false);
    setManualFallbackKind(undefined);
  };

  const picker = catalogKind ? (
    <Suspense fallback={<div className="a-loading-panel" />}>
      <CatalogProductPicker
        kind={catalogKind}
        onClose={() => setCatalogKind(undefined)}
        onManual={() => {
          setCatalogKind(undefined);
          setManualFallbackKind(catalogKind);
          setAdding(true);
        }}
        onApply={(product) => addAssignment(catalogKind, product)}
      />
    </Suspense>
  ) : null;

  if (!assignment || adding)
    return (
      <section className="a-covering-empty" data-testid="covering-empty">
        <CoveringAddAssistant
          key={manualFallbackKind ?? 'new'}
          unit={state.unit}
          initialKind={manualFallbackKind}
          onCatalog={openCatalog}
          onConfirm={(kind, product) => addAssignment(kind, product)}
          onClose={assignment ? () => setAdding(false) : undefined}
        />
        {picker}
      </section>
    );

  return (
    <section className="a-covering-workspace" data-testid="covering-workspace">
      <div
        className="a-covering-assignments"
        aria-label={t('assembly.coveringAssignments')}
      >
        <strong>{t('assembly.coveringAssignments')}</strong>
        <div>
          {assignments.map((item) => (
            <button
              key={item.id}
              className="a-button"
              aria-pressed={item.id === assignment.id}
              onClick={() => state.setSelectedCoveringAssignment(item.id)}
            >
              {item.product.displaySnapshot?.familyName ??
                t(coveringKindLabelKey(item))}
              <small> · {item.roofPlaneIds.length}</small>
            </button>
          ))}
          <button className="a-button a-add" onClick={() => setAdding(true)}>
            + {t('assembly.coveringAdd.addAnother')}
          </button>
        </div>
      </div>
      <header>
        <div>
          <small>
            {assignment.product.catalogRef
              ? t('assembly.catalogSource')
              : t('assembly.manualParameters')}
          </small>
          <strong>
            {assignment.product.displaySnapshot?.familyName ??
              t(coveringKindLabelKey(assignment))}
          </strong>
          {assignment.product.catalogRef && (
            <small>
              {assignment.product.displaySnapshot?.manufacturer}
              {assignment.product.displaySnapshot?.variantName
                ? ` · ${assignment.product.displaySnapshot.variantName}`
                : ''}
              {assignment.product.displaySnapshot?.revisionCode
                ? ` · ${t('assembly.catalogRevision')} ${assignment.product.displaySnapshot.revisionCode}`
                : ''}
            </small>
          )}
          {catalogDetached && (
            <small className="a-catalog-detached" role="status">
              {t('assembly.coveringAdd.catalogDetached')}
            </small>
          )}
        </div>
        <button
          className="a-button a-covering-parameters"
          onClick={() => {
            state.setInspectorOpen(true);
            state.setMobilePanel('inspector');
          }}
        >
          {t('assembly.coveringParameters')}
        </button>
        <button
          className="a-button"
          onClick={() =>
            openCatalog(assignment.product.technicalSpecSnapshot.kind)
          }
        >
          {t('assembly.coveringAdd.changeProduct')}
        </button>
        {layout?.kind === 'modular-sheet-cut-to-length' ? (
          <div className="a-covering-counts" data-status={layout.status}>
            <small className="a-covering-scope">
              {t('assembly.wholeCovering')}
            </small>
            <span>
              {t('assembly.coveringStatusLabel')}{' '}
              <b>{t(`assembly.coveringStatus.${layout.status}`)}</b>
            </span>
            <span className="a-covering-count-primary">
              {t('assembly.sheetRuns')} <b>{layout.physicalRunCount}</b>
            </span>
            <span>
              {t('assembly.fullWidthColumns')} <b>{layout.fullWidthStrips}</b>
            </span>
            <span>
              {t('assembly.edgeCutColumns')} <b>{layout.edgeCutStrips}</b>
            </span>
            <span>
              {t('assembly.totalGeometricLength')}{' '}
              <b>
                {(layout.totalGeometricLengthMm / 1000).toLocaleString(
                  i18n.language,
                  { maximumFractionDigits: 2 },
                )}{' '}
                m
              </b>
            </span>
          </div>
        ) : layout?.kind === 'standing-seam' ? (
          <div className="a-covering-counts" data-status={layout.status}>
            <small className="a-covering-scope">
              {t('assembly.wholeCovering')}
            </small>
            <span>
              {t('assembly.coveringStatusLabel')}{' '}
              <b>{t(`assembly.coveringStatus.${layout.status}`)}</b>
            </span>
            <span>
              {t('assembly.panelColumns')} <b>{layout.columnCount}</b>
            </span>
            <span className="a-covering-count-primary">
              {t('assembly.panelRuns')} <b>{layout.panelRunCount}</b>
            </span>
            <span>
              {t('assembly.totalGeometricLength')}{' '}
              <b>
                {(layout.totalPanelLengthMm / 1000).toLocaleString(
                  i18n.language,
                  { maximumFractionDigits: 2 },
                )}{' '}
                m
              </b>
            </span>
          </div>
        ) : (
          <div className="a-covering-counts" data-status={layout?.status}>
            <small className="a-covering-scope">
              {t('assembly.wholeCovering')}
            </small>
            <span>
              {t('assembly.coveringStatusLabel')}{' '}
              <b>
                {layout ? t(`assembly.coveringStatus.${layout.status}`) : '—'}
              </b>
            </span>
            <span>
              {t(
                layout?.kind === 'modular-sheet'
                  ? 'assembly.sheetRows'
                  : 'assembly.tileCourses',
              )}{' '}
              <b>
                {layout?.planes.reduce(
                  (total, plane) =>
                    total +
                    ('courses' in plane
                      ? plane.courses.length
                      : 'rows' in plane
                        ? plane.rows.length
                        : 0),
                  0,
                ) ?? 0}
              </b>
            </span>
            <span className="a-covering-count-primary">
              {t(
                layout?.kind === 'modular-sheet'
                  ? 'assembly.sheetPositions'
                  : 'assembly.tilePositions',
              )}{' '}
              <b>{layout?.totalPositions ?? 0}</b>
            </span>
            <span>
              {t(
                layout?.kind === 'modular-sheet'
                  ? 'assembly.fullSheets'
                  : 'assembly.fullTiles',
              )}{' '}
              <b>{layout?.fullPositions ?? 0}</b>
            </span>
            <span>
              {t(
                layout?.kind === 'modular-sheet'
                  ? 'assembly.cutSheets'
                  : 'assembly.cutTiles',
              )}{' '}
              <b>{layout?.cutPositions ?? 0}</b>
            </span>
            {(tileMode || sheetSpec) && (
              <span>
                {t('assembly.coverWidth')}{' '}
                <b>
                  {fromMillimetres(
                    tileMode?.coverWidthMm ?? sheetSpec!.effectiveWidthMm,
                    state.unit,
                  )}{' '}
                  {state.unit}
                </b>
              </span>
            )}
          </div>
        )}
        {layout?.kind === 'roof-tile' &&
          layout.declaredConsumptionReference && (
            <small className="a-covering-reference">
              {t('assembly.declaredConsumption')}:{' '}
              {new Intl.NumberFormat(i18n.language, {
                maximumFractionDigits: 1,
              }).format(layout.declaredConsumptionReference.minimumPieces)}
              –
              {new Intl.NumberFormat(i18n.language, {
                maximumFractionDigits: 1,
              }).format(layout.declaredConsumptionReference.maximumPieces)}{' '}
              {t('assembly.piecesShort')}
              {' · '}
              {t('assembly.declaredConsumptionBoundary')}
            </small>
          )}
        {layout && (
          <div className="a-covering-result-semantics">
            <ResultBasis
              semantic={
                layout.kind === 'roof-tile' || layout.kind === 'modular-sheet'
                  ? 'effective-coverage-position'
                  : 'geometric-panel-run'
              }
              compact
            />
            <ResultLayerProgress scope="covering" />
          </div>
        )}
      </header>
      {picker}
      {conflicts.length > 0 && (
        <div className="a-covering-warning" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>{t('assembly.coveringPlaneConflict')}</strong>
          </div>
        </div>
      )}
      {layout && layout.status !== 'resolved' && (
        <div className="a-covering-warning" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>{t(`assembly.coveringStatus.${layout.status}`)}</strong>
            {issueSummaries.map((issue, index) => (
              <p key={`${issue.code}:${index}`}>
                {t(`assembly.coveringIssue.${issue.code}`)}
                {issue.actual !== undefined && (
                  <small>
                    {' '}
                    {issue.code === 'below-minimum-pitch'
                      ? `${issue.actual}°${issue.required !== undefined ? ` · ${t('assembly.requiredValue')}: ${issue.required}°` : ''}`
                      : `${fromMillimetres(issue.actual, state.unit)} ${state.unit}${
                          issue.required !== undefined
                            ? ` · ${t('assembly.requiredValue')}: ${fromMillimetres(issue.required, state.unit)} ${state.unit}`
                            : issue.minimum !== undefined &&
                                issue.maximum !== undefined
                              ? ` · ${t('assembly.allowedRange')}: ${fromMillimetres(issue.minimum, state.unit)}–${fromMillimetres(issue.maximum, state.unit)} ${state.unit}`
                              : ''
                        }`}
                  </small>
                )}
                {issue.roofPlaneIds.length > 1 && (
                  <small>
                    {' · '}
                    {t('assembly.affectedRoofPlanes', {
                      count: issue.roofPlaneIds.length,
                    })}
                  </small>
                )}
              </p>
            ))}
          </div>
          {layout.issueCodes.some((code) => code.startsWith('batten-')) &&
            isTileAssignment(assignment) && (
              <button onClick={fitBattensAutomatically}>
                {t('assembly.fitBattensAutomatically')}
              </button>
            )}
        </div>
      )}
      <div className="a-covering-body">
        <div className="a-covering-canvas-panel">
          <div className="a-covering-scheme-heading">
            <div>
              <small>{t('assembly.coveringAdd.scheme')}</small>
              <strong>{t(coveringKindLabelKey(assignment))}</strong>
            </div>
            {assignment.roofPlaneIds.length < planeIds.length &&
              !planeIds.some((id) =>
                assignments.some(
                  (candidate) =>
                    candidate.id !== assignment.id &&
                    candidate.roofPlaneIds.includes(id),
                ),
              ) && (
                <button
                  className="a-button"
                  onClick={() => {
                    const next = structuredClone(assignment);
                    next.roofPlaneIds = [...planeIds];
                    state.setCoveringAssignments(
                      assignments.map((item) =>
                        item.id === next.id ? next : item,
                      ),
                    );
                  }}
                >
                  {t('assembly.coveringAdd.assignAll')}
                </button>
              )}
          </div>
          <div
            className="a-covering-detail-controls"
            aria-label={t('assembly.drawingDetail')}
          >
            {(['auto', 'detailed', 'simplified'] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={drawingDetail === level}
                onClick={() => setDrawingDetail(level)}
              >
                {t(`assembly.drawingDetailLevel.${level}`)}
              </button>
            ))}
            <label>
              <input
                type="checkbox"
                checked={showCovering}
                onChange={(event) => setShowCovering(event.target.checked)}
              />
              {t('assembly.covering')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showBattens}
                onChange={(event) => setShowBattens(event.target.checked)}
              />
              {t('assembly.battens')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCounterBattens}
                onChange={(event) =>
                  setShowCounterBattens(event.target.checked)
                }
              />
              {t('assembly.counterBattens')}
            </label>
          </div>
          <div
            className="a-covering-plane-tabs"
            role="tablist"
            aria-label={t('assembly.roofPlane')}
          >
            {planeIds.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={selectedPlaneId === id}
                onClick={() => {
                  setSelectedPlaneId(id);
                  state.select(`surface:${id}`);
                }}
              >
                <strong>{t(roofPlaneLabelKey(id), { id })}</strong>
                <small>
                  {(
                    (surfaceGeometry.planes.find(
                      (plane) => plane.roofPlaneId === id,
                    )?.netAreaMm2 ?? 0) / 1_000_000
                  ).toLocaleString(i18n.language, {
                    maximumFractionDigits: 1,
                  })}{' '}
                  m² ·{' '}
                  {t(
                    assignment.roofPlaneIds.includes(id)
                      ? 'assembly.coveringAdd.assigned'
                      : 'assembly.coveringAdd.notAssigned',
                  )}
                </small>
              </button>
            ))}
          </div>
          {selectedPlaneId && selectedLayout && (
            <p className="a-covering-plane-result" role="status">
              <strong>
                {t(roofPlaneLabelKey(selectedPlaneId), { id: selectedPlaneId })}
              </strong>
              {layout?.kind === 'modular-sheet-cut-to-length' &&
              'physicalRunCount' in selectedLayout ? (
                <>
                  <span>
                    {t('assembly.sheetRuns')}{' '}
                    <b>{selectedLayout.physicalRunCount}</b>
                  </span>
                  <span>
                    {t('assembly.fullWidthColumns')}{' '}
                    <b>{selectedLayout.fullWidthStrips}</b>
                  </span>
                  <span>
                    {t('assembly.edgeCutColumns')}{' '}
                    <b>{selectedLayout.edgeCutStrips}</b>
                  </span>
                  <span>
                    {t('assembly.totalGeometricLength')}{' '}
                    <b>
                      {(
                        selectedLayout.totalGeometricLengthMm / 1000
                      ).toLocaleString(i18n.language, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      m
                    </b>
                  </span>
                </>
              ) : layout?.kind === 'standing-seam' &&
                'panelRunCount' in selectedLayout ? (
                <>
                  <span>
                    {t('assembly.panelColumns')}{' '}
                    <b>{selectedLayout.columnCount}</b>
                  </span>
                  <span>
                    {t('assembly.panelRuns')}{' '}
                    <b>{selectedLayout.panelRunCount}</b>
                  </span>
                  <span>
                    {t('assembly.totalGeometricLength')}{' '}
                    <b>
                      {(
                        selectedLayout.totalPanelLengthMm / 1000
                      ).toLocaleString(i18n.language, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      m
                    </b>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {t(
                      layout?.kind === 'modular-sheet'
                        ? 'assembly.sheetPositions'
                        : 'assembly.tilePositions',
                    )}{' '}
                    <b>
                      {'courses' in selectedLayout
                        ? selectedLayout.courses.reduce(
                            (total, course) => total + course.positions.length,
                            0,
                          )
                        : 'rows' in selectedLayout
                          ? selectedLayout.rows.reduce(
                              (total, row) => total + row.positions.length,
                              0,
                            )
                          : 0}
                    </b>
                  </span>
                  <span>
                    {t(
                      layout?.kind === 'modular-sheet'
                        ? 'assembly.fullSheets'
                        : 'assembly.fullTiles',
                    )}{' '}
                    <b>
                      {'fullPositions' in selectedLayout
                        ? selectedLayout.fullPositions
                        : 0}
                    </b>
                  </span>
                  <span>
                    {t(
                      layout?.kind === 'modular-sheet'
                        ? 'assembly.cutSheets'
                        : 'assembly.cutTiles',
                    )}{' '}
                    <b>
                      {'cutPositions' in selectedLayout
                        ? selectedLayout.cutPositions
                        : 0}
                    </b>
                  </span>
                </>
              )}
            </p>
          )}
          {selectedSurface && bounds && (
            <svg
              className={`a-covering-scheme is-${layout?.kind ?? assignment.product.technicalSpecSnapshot.kind}`}
              data-covering-visual={
                layout?.kind ?? assignment.product.technicalSpecSnapshot.kind
              }
              data-testid={`${layout?.kind === 'standing-seam' ? 'standing-seam' : layout?.kind === 'modular-sheet-cut-to-length' ? 'cut-to-length-sheet' : layout?.kind === 'modular-sheet' ? 'sheet' : 'tile'}-layout-drawing`}
              viewBox={`${bounds.viewMinU} ${bounds.viewMinV} ${bounds.viewWidth} ${bounds.viewHeight}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                aspectRatio: `${bounds.viewWidth} / ${bounds.viewHeight}`,
              }}
            >
              <defs>
                <clipPath id="covering-plane-detail-clip">
                  <polygon points={polygonPoints(selectedSurface.polygon)} />
                </clipPath>
              </defs>
              <polygon
                className="a-covering-plane"
                points={polygonPoints(selectedSurface.polygon)}
              />
              {showCovering &&
                !simplified &&
                fragments.map((fragment) => (
                  <polygon
                    key={fragment.id}
                    className={`a-covering-fragment ${layout?.kind === 'standing-seam' || layout?.kind === 'modular-sheet-cut-to-length' ? 'a-panel-fragment' : 'a-tile-fragment'} is-${fragment.classification}`}
                    points={polygonPoints(fragment.polygon)}
                  />
                ))}
              {showCovering &&
                simplified &&
                selectedLayout &&
                'columns' in selectedLayout &&
                selectedLayout.columns.flatMap((column) =>
                  column.runs.map((run) => (
                    <line
                      key={run.id}
                      className="a-panel-simplified-line"
                      clipPath="url(#covering-plane-detail-clip)"
                      x1={(column.nominalFromUMm + column.nominalToUMm) / 2}
                      x2={(column.nominalFromUMm + column.nominalToUMm) / 2}
                      y1={run.fromVMm}
                      y2={run.toVMm}
                    />
                  )),
                )}
              {showCovering &&
                simplified &&
                (selectedLayout && 'courses' in selectedLayout
                  ? selectedLayout.courses.map((course) => ({
                      id: course.id,
                      stationVMm: course.stationVMm,
                    }))
                  : selectedLayout && 'rows' in selectedLayout
                    ? selectedLayout.rows.map((row) => ({
                        id: row.id,
                        stationVMm: row.nominalFromVMm,
                      }))
                    : []
                )?.map((course) => (
                  <line
                    key={course.id}
                    className="a-tile-course-line"
                    clipPath="url(#covering-plane-detail-clip)"
                    x1={bounds.minU}
                    x2={bounds.maxU}
                    y1={course.stationVMm}
                    y2={course.stationVMm}
                  />
                ))}
              {layout?.kind !== 'standing-seam' &&
                layout?.kind !== 'modular-sheet-cut-to-length' &&
                showBattens &&
                battens.battens
                  .filter((row) => row.roofPlaneId === selectedPlaneId)
                  .flatMap((row) =>
                    row.segments.map((segment, index) => (
                      <line
                        key={`${row.id}:${index}`}
                        className="a-covering-batten"
                        x1={segment.fromUMm}
                        x2={segment.toUMm}
                        y1={row.stationMm}
                        y2={row.stationMm}
                      />
                    )),
                  )}
              {showCounterBattens &&
                counterBattens.rows
                  .filter((row) => row.roofPlaneId === selectedPlaneId)
                  .flatMap((row) =>
                    row.segments.map((segment, index) => (
                      <line
                        key={`${row.id}:counter:${index}`}
                        className="a-covering-counter-batten"
                        x1={segment.fromLocal.uMm}
                        x2={segment.toLocal.uMm}
                        y1={segment.fromLocal.vMm}
                        y2={segment.toLocal.vMm}
                      />
                    )),
                  )}
              {selectedSurface.openingPolygons.map((opening) => (
                <polygon
                  key={opening.featureId}
                  className="a-covering-opening"
                  points={polygonPoints(opening.polygon)}
                />
              ))}
            </svg>
          )}
          {simplified && (
            <p className="a-help">{t('assembly.simplifiedTilePreview')}</p>
          )}
          <div className="a-covering-legend">
            {hasFullFragments && (
              <span className="full">
                {t(
                  layout?.kind === 'standing-seam' ||
                    layout?.kind === 'modular-sheet-cut-to-length'
                    ? 'assembly.fullWidthColumns'
                    : layout?.kind === 'modular-sheet'
                      ? 'assembly.fullSheets'
                      : 'assembly.fullTiles',
                )}
              </span>
            )}
            {hasCutFragments && (
              <span className="cut">
                {t(
                  layout?.kind === 'standing-seam' ||
                    layout?.kind === 'modular-sheet-cut-to-length'
                    ? 'assembly.edgeCutColumns'
                    : layout?.kind === 'modular-sheet'
                      ? 'assembly.cutSheets'
                      : 'assembly.cutTiles',
                )}
              </span>
            )}
            {(selectedSurface?.openingPolygons.length ?? 0) > 0 && (
              <span className="opening">{t('assembly.openings')}</span>
            )}
            {hasVisualProblem && (
              <span className="problem">
                {t('assembly.coveringAdd.problem')}
              </span>
            )}
            <span className="selected">{t('assembly.selectedPlane')}</span>
          </div>
          {(layout?.kind === 'standing-seam' ||
            layout?.kind === 'modular-sheet-cut-to-length') && (
            <details className="a-panel-secondary-stats">
              <summary>{t('assembly.layoutDetails')}</summary>
              <div>
                <span>
                  {t('assembly.fullWidthColumns')}{' '}
                  <b>
                    {layout.kind === 'standing-seam'
                      ? layout.fullWidthColumns
                      : layout.fullWidthStrips}
                  </b>
                </span>
                <span>
                  {t('assembly.edgeCutColumns')}{' '}
                  <b>
                    {layout.kind === 'standing-seam'
                      ? layout.edgeCutColumns
                      : layout.edgeCutStrips}
                  </b>
                </span>
                <span>
                  {t('assembly.openingInterruptedRuns')}{' '}
                  <b>{layout.openingInterruptedRuns}</b>
                </span>
                {(layout.kind === 'standing-seam'
                  ? layout.minimumRunLengthMm
                  : layout.minRunLengthMm) !== undefined && (
                  <span>
                    {t('assembly.runLengthRange')}{' '}
                    <b>
                      {fromMillimetres(
                        layout.kind === 'standing-seam'
                          ? layout.minimumRunLengthMm!
                          : layout.minRunLengthMm!,
                        state.unit,
                      ).toLocaleString(i18n.language)}
                      –
                      {fromMillimetres(
                        layout.kind === 'standing-seam'
                          ? layout.maximumRunLengthMm!
                          : layout.maxRunLengthMm!,
                        state.unit,
                      ).toLocaleString(i18n.language)}{' '}
                      {state.unit}
                    </b>
                  </span>
                )}
              </div>
            </details>
          )}
          <p className="a-help">{t('assembly.noWasteAccessories')}</p>
        </div>
      </div>
    </section>
  );
}

function PlaneAssignmentCards({
  assignment,
  surfaceGeometry,
  onChange,
}: {
  assignment: CoveringAssignmentSpec;
  surfaceGeometry: RoofSurfaceGeometryResult;
  onChange: (roofPlaneIds: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="a-plane-assignment-editor">
      <strong>{t('assembly.assignedRoofPlanes')}</strong>
      <div>
        {surfaceGeometry.planes.map((plane) => {
          const assigned = assignment.roofPlaneIds.includes(plane.roofPlaneId);
          return (
            <button
              key={plane.roofPlaneId}
              type="button"
              role="checkbox"
              aria-checked={assigned}
              disabled={assigned && assignment.roofPlaneIds.length === 1}
              onClick={() =>
                onChange(
                  assigned
                    ? assignment.roofPlaneIds.filter(
                        (id) => id !== plane.roofPlaneId,
                      )
                    : [...assignment.roofPlaneIds, plane.roofPlaneId],
                )
              }
            >
              <span>
                <strong>
                  {t(roofPlaneLabelKey(plane.roofPlaneId), {
                    id: plane.roofPlaneId,
                  })}
                </strong>
                <small>
                  {(plane.netAreaMm2 / 1_000_000).toLocaleString(
                    i18n.language,
                    { maximumFractionDigits: 1 },
                  )}{' '}
                  m²
                </small>
              </span>
              <b>
                {t(
                  assigned
                    ? 'assembly.coveringAdd.assigned'
                    : 'assembly.coveringAdd.notAssigned',
                )}
              </b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TileCoveringEditor({
  assignment,
  surfaceGeometry,
  selectedPlaneId,
}: {
  assignment: TileAssignment;
  surfaceGeometry: RoofSurfaceGeometryResult;
  selectedPlaneId?: string;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const replace = (next: CoveringAssignmentSpec) =>
    state.setCoveringAssignments(
      state.projectDocument.project.coverings.map((item) =>
        item.id === next.id ? next : item,
      ),
    );
  const update = (mutate: (draft: TileAssignment) => void) => {
    if (!assignment) return;
    const draft = structuredClone(assignment);
    mutate(draft);
    detachCatalogRevisionAfterTechnicalEdit(assignment, draft);
    replace(draft);
  };
  const mode = assignment?.product.technicalSpecSnapshot.installationModes.find(
    (candidate) => candidate.id === assignment.selectedInstallationModeId,
  );
  const updateMode = (mutate: (draft: NonNullable<typeof mode>) => void) =>
    update((draft) => {
      const selected =
        draft.product.technicalSpecSnapshot.installationModes.find(
          (candidate) => candidate.id === draft.selectedInstallationModeId,
        );
      if (selected) mutate(selected);
    });

  return (
    <aside className="a-covering-editor">
      <h3>{t('assembly.productSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.productName')}</span>
        <input
          defaultValue={assignment.product.displaySnapshot?.familyName ?? ''}
          onBlur={(event) =>
            update((draft) => {
              draft.product.displaySnapshot = {
                ...draft.product.displaySnapshot,
                familyName: event.currentTarget.value.trim() || undefined,
              };
            })
          }
        />
      </label>
      <h3>{t('assembly.installationSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.installationMode')}</span>
        <select
          value={assignment.selectedInstallationModeId ?? ''}
          onChange={(event) =>
            update((draft) => {
              draft.selectedInstallationModeId =
                event.currentTarget.value || undefined;
            })
          }
        >
          <option value="">{t('assembly.selectInstallationMode')}</option>
          {assignment.product.technicalSpecSnapshot.installationModes.map(
            (item) => (
              <option key={item.id} value={item.id}>
                {t(installationModeLabelKey(item.id), { id: item.id })}
              </option>
            ),
          )}
        </select>
      </label>
      <h3>{t('assembly.coverageDimensionsSection')}</h3>
      <NumericField
        label={t('assembly.coverWidth')}
        value={mode?.coverWidthMm}
        unit="length"
        minimum={1}
        onCommit={(value) =>
          value !== undefined &&
          updateMode((draft) => {
            draft.coverWidthMm = value;
          })
        }
      />
      <div className="a-covering-field-pair">
        <NumericField
          label={t('assembly.minimumGauge')}
          value={mode?.gaugeRangeMm.min}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            updateMode((draft) => {
              draft.gaugeRangeMm.min = Math.min(value, draft.gaugeRangeMm.max);
            })
          }
        />
        <NumericField
          label={t('assembly.maximumGauge')}
          value={mode?.gaugeRangeMm.max}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            updateMode((draft) => {
              draft.gaugeRangeMm.max = Math.max(value, draft.gaugeRangeMm.min);
            })
          }
        />
      </div>
      <h3>{t('assembly.layoutSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.tileCoursePattern')}</span>
        <select
          value={patternName(assignment)}
          onChange={(event) =>
            updateMode((draft) => {
              draft.coursePattern =
                event.currentTarget.value === 'crown'
                  ? {
                      layers: [
                        { id: 'lower', horizontalOffsetFraction: 0 },
                        { id: 'upper', horizontalOffsetFraction: 0.5 },
                      ],
                      battenRowOffsetCycle: [0],
                    }
                  : {
                      layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
                      battenRowOffsetCycle:
                        event.currentTarget.value === 'staggered'
                          ? [0, 0.5]
                          : [0],
                    };
            })
          }
        >
          <option value="straight">{t('assembly.patternStraight')}</option>
          <option value="staggered">{t('assembly.patternStaggered')}</option>
          <option value="crown">{t('assembly.patternCrown')}</option>
        </select>
      </label>
      <label className="a-field">
        <span>{t('assembly.horizontalAlignment')}</span>
        <select
          value={assignment.layoutIntent?.horizontalAlignment ?? 'centered'}
          onChange={(event) =>
            update((draft) => {
              const alignment = event.currentTarget.value as
                'centered' | 'from-u-min' | 'manual';
              draft.layoutIntent = {
                kind: 'roof-tile',
                horizontalAlignment: alignment,
                ...(alignment === 'manual'
                  ? {
                      planeOffsetsMm: Object.fromEntries(
                        draft.roofPlaneIds.map((id) => [
                          id,
                          draft.layoutIntent?.planeOffsetsMm?.[id] ?? 0,
                        ]),
                      ),
                    }
                  : {}),
              };
            })
          }
        >
          <option value="centered">{t('assembly.alignmentCentered')}</option>
          <option value="from-u-min">{t('assembly.alignmentFromEdge')}</option>
          <option value="manual">{t('assembly.alignmentManual')}</option>
        </select>
      </label>
      {assignment.layoutIntent?.horizontalAlignment === 'manual' &&
        selectedPlaneId && (
          <NumericField
            label={t('assembly.planeOffset')}
            value={
              assignment.layoutIntent.planeOffsetsMm?.[selectedPlaneId] ?? 0
            }
            unit="length"
            minimum={Number.NEGATIVE_INFINITY}
            onCommit={(value) =>
              value !== undefined &&
              update((draft) => {
                draft.layoutIntent = {
                  kind: 'roof-tile',
                  horizontalAlignment: 'manual',
                  planeOffsetsMm: {
                    ...draft.layoutIntent?.planeOffsetsMm,
                    [selectedPlaneId]: value,
                  },
                };
              })
            }
          />
        )}
      <details>
        <summary>{t('assembly.additionalTileParameters')}</summary>
        <NumericField
          label={t('assembly.physicalWidth')}
          value={assignment.product.technicalSpecSnapshot.physicalWidthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.physicalWidthMm = value;
            })
          }
        />
        <NumericField
          label={t('assembly.physicalLength')}
          value={assignment.product.technicalSpecSnapshot.physicalLengthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.physicalLengthMm = value;
            })
          }
        />
        <NumericField
          label={t('assembly.minimumPitch')}
          value={mode?.minPitchDeg}
          minimum={Number.EPSILON}
          onCommit={(value) =>
            updateMode((draft) => {
              draft.minPitchDeg = value;
            })
          }
        />
        <NumericField
          label={t('assembly.weightPerPiece')}
          value={assignment.product.technicalSpecSnapshot.weightKgPerPiece}
          minimum={Number.EPSILON}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.weightKgPerPiece = value;
            })
          }
        />
        <div className="a-covering-field-pair">
          <NumericField
            label={t('assembly.minimumDeclaredUnits')}
            value={mode?.declaredUnitsPerM2?.min}
            minimum={Number.EPSILON}
            onCommit={(value) =>
              updateMode((draft) => {
                if (value === undefined) {
                  delete draft.declaredUnitsPerM2;
                  return;
                }
                const maximum = draft.declaredUnitsPerM2?.max ?? value;
                draft.declaredUnitsPerM2 = {
                  min: Math.min(value, maximum),
                  max: maximum,
                };
              })
            }
          />
          <NumericField
            label={t('assembly.maximumDeclaredUnits')}
            value={mode?.declaredUnitsPerM2?.max}
            minimum={Number.EPSILON}
            onCommit={(value) =>
              updateMode((draft) => {
                if (value === undefined) {
                  delete draft.declaredUnitsPerM2;
                  return;
                }
                const minimum = draft.declaredUnitsPerM2?.min ?? value;
                draft.declaredUnitsPerM2 = {
                  min: minimum,
                  max: Math.max(value, minimum),
                };
              })
            }
          />
        </div>
      </details>
      <PlaneAssignmentCards
        assignment={assignment}
        surfaceGeometry={surfaceGeometry}
        onChange={(roofPlaneIds) =>
          update((draft) => {
            draft.roofPlaneIds = roofPlaneIds;
          })
        }
      />
      <button
        className="a-button a-danger"
        onClick={() =>
          state.setCoveringAssignments(
            state.projectDocument.project.coverings.filter(
              (item) => item.id !== assignment.id,
            ),
          )
        }
      >
        <Trash2 size={16} /> {t('assembly.removeCovering')}
      </button>
    </aside>
  );
}

function ModularSheetEditor({
  assignment,
  surfaceGeometry,
  selectedPlaneId,
}: {
  assignment: ModularSheetAssignment;
  surfaceGeometry: RoofSurfaceGeometryResult;
  selectedPlaneId?: string;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const replace = (next: CoveringAssignmentSpec) =>
    state.setCoveringAssignments(
      state.projectDocument.project.coverings.map((item) =>
        item.id === next.id ? next : item,
      ),
    );
  const update = (mutate: (draft: ModularSheetAssignment) => void) => {
    const draft = structuredClone(assignment);
    mutate(draft);
    detachCatalogRevisionAfterTechnicalEdit(assignment, draft);
    replace(draft);
  };
  const spec = assignment.product.technicalSpecSnapshot;
  const intentKind =
    spec.lengthModel.kind === 'cut-to-length'
      ? 'modular-sheet-cut-to-length'
      : 'modular-sheet';
  const intent =
    assignment.layoutIntent?.kind === intentKind ||
    (intentKind === 'modular-sheet-cut-to-length' &&
      assignment.layoutIntent?.kind === 'modular-sheet')
      ? assignment.layoutIntent
      : {
          kind: intentKind,
          horizontalAlignment: 'centered' as const,
        };
  return (
    <aside className="a-covering-editor">
      <h3>{t('assembly.productSection')}</h3>
      {!assignment.product.catalogRef && (
        <label className="a-field">
          <span>{t('assembly.sheetFormat')}</span>
          <select
            value={spec.lengthModel.kind}
            onChange={(event) =>
              update((draft) => {
                const kind = event.currentTarget.value;
                draft.product.technicalSpecSnapshot.lengthModel =
                  kind === 'cut-to-length'
                    ? {
                        kind: 'cut-to-length',
                        minPanelLengthMm: 500,
                        maxPanelLengthMm: 6000,
                      }
                    : {
                        kind: 'fixed-sheet',
                        effectiveLengthMm: 700,
                        totalLengthMm: 725,
                      };
                draft.layoutIntent = {
                  kind:
                    kind === 'cut-to-length'
                      ? 'modular-sheet-cut-to-length'
                      : 'modular-sheet',
                  horizontalAlignment: 'centered',
                };
              })
            }
          >
            <option value="fixed-sheet">
              {t('assembly.fixedSheetFormat')}
            </option>
            <option value="cut-to-length">
              {t('assembly.cutToLengthFormat')}
            </option>
          </select>
        </label>
      )}
      <label className="a-field">
        <span>{t('assembly.productName')}</span>
        <input
          defaultValue={assignment.product.displaySnapshot?.familyName ?? ''}
          onBlur={(event) =>
            update((draft) => {
              draft.product.displaySnapshot = {
                ...draft.product.displaySnapshot,
                familyName: event.currentTarget.value.trim() || undefined,
              };
            })
          }
        />
      </label>
      <h3>{t('assembly.coverageDimensionsSection')}</h3>
      <NumericField
        label={t('assembly.effectiveWidth')}
        value={spec.effectiveWidthMm}
        unit="length"
        minimum={1}
        onCommit={(value) =>
          value !== undefined &&
          update((draft) => {
            draft.product.technicalSpecSnapshot.effectiveWidthMm = value;
          })
        }
      />
      {spec.lengthModel.kind === 'fixed-sheet' ? (
        <NumericField
          label={t('assembly.effectiveSheetLength')}
          value={spec.lengthModel.effectiveLengthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              if (
                draft.product.technicalSpecSnapshot.lengthModel.kind ===
                'fixed-sheet'
              )
                draft.product.technicalSpecSnapshot.lengthModel.effectiveLengthMm =
                  value;
            })
          }
        />
      ) : (
        <>
          <NumericField
            label={t('assembly.minimumSheetLength')}
            value={spec.lengthModel.minPanelLengthMm}
            unit="length"
            minimum={1}
            onCommit={(value) =>
              value !== undefined &&
              update((draft) => {
                if (
                  draft.product.technicalSpecSnapshot.lengthModel.kind ===
                  'cut-to-length'
                ) {
                  draft.product.technicalSpecSnapshot.lengthModel.minPanelLengthMm =
                    value;
                  draft.product.technicalSpecSnapshot.lengthModel.maxPanelLengthMm =
                    Math.max(
                      value,
                      draft.product.technicalSpecSnapshot.lengthModel
                        .maxPanelLengthMm,
                    );
                }
              })
            }
          />
          <NumericField
            label={t('assembly.maximumSheetLength')}
            value={spec.lengthModel.maxPanelLengthMm}
            unit="length"
            minimum={1}
            onCommit={(value) =>
              value !== undefined &&
              update((draft) => {
                if (
                  draft.product.technicalSpecSnapshot.lengthModel.kind ===
                  'cut-to-length'
                ) {
                  draft.product.technicalSpecSnapshot.lengthModel.maxPanelLengthMm =
                    value;
                  draft.product.technicalSpecSnapshot.lengthModel.minPanelLengthMm =
                    Math.min(
                      value,
                      draft.product.technicalSpecSnapshot.lengthModel
                        .minPanelLengthMm,
                    );
                }
              })
            }
          />
        </>
      )}
      <h3>{t('assembly.installationSection')}</h3>
      <NumericField
        label={t('assembly.moduleLength')}
        value={spec.moduleLengthMm}
        unit="length"
        minimum={1}
        onCommit={(value) =>
          value !== undefined &&
          update((draft) => {
            draft.product.technicalSpecSnapshot.moduleLengthMm = value;
          })
        }
      />
      <NumericField
        label={t('assembly.minimumPitch')}
        value={spec.minPitchDeg}
        minimum={Number.EPSILON}
        onCommit={(value) =>
          update((draft) => {
            draft.product.technicalSpecSnapshot.minPitchDeg = value;
          })
        }
      />
      <h3>{t('assembly.layoutSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.horizontalAlignment')}</span>
        <select
          value={intent.horizontalAlignment}
          onChange={(event) =>
            update((draft) => {
              const horizontalAlignment = event.currentTarget.value as
                'centered' | 'from-u-min' | 'manual';
              draft.layoutIntent = {
                kind: intentKind,
                horizontalAlignment,
                ...(horizontalAlignment === 'manual'
                  ? {
                      planeOffsetsMm: Object.fromEntries(
                        draft.roofPlaneIds.map((id) => [id, 0]),
                      ),
                    }
                  : {}),
              };
            })
          }
        >
          <option value="centered">{t('assembly.alignmentCentered')}</option>
          <option value="from-u-min">{t('assembly.alignmentFromEdge')}</option>
          <option value="manual">{t('assembly.alignmentManual')}</option>
        </select>
      </label>
      {intent.horizontalAlignment === 'manual' && selectedPlaneId && (
        <NumericField
          label={t('assembly.planeOffset')}
          value={intent.planeOffsetsMm?.[selectedPlaneId] ?? 0}
          unit="length"
          minimum={Number.NEGATIVE_INFINITY}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              draft.layoutIntent = {
                kind: intentKind,
                horizontalAlignment: 'manual',
                planeOffsetsMm: {
                  ...(draft.layoutIntent?.kind === intentKind
                    ? draft.layoutIntent.planeOffsetsMm
                    : {}),
                  [selectedPlaneId]: value,
                },
              };
            })
          }
        />
      )}
      <details>
        <summary>{t('assembly.additionalSheetParameters')}</summary>
        <NumericField
          label={t('assembly.totalWidth')}
          value={spec.totalWidthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.totalWidthMm = value;
            })
          }
        />
        {spec.lengthModel.kind === 'fixed-sheet' && (
          <NumericField
            label={t('assembly.totalLength')}
            value={spec.lengthModel.totalLengthMm}
            unit="length"
            minimum={1}
            onCommit={(value) =>
              update((draft) => {
                if (
                  draft.product.technicalSpecSnapshot.lengthModel.kind ===
                  'fixed-sheet'
                )
                  draft.product.technicalSpecSnapshot.lengthModel.totalLengthMm =
                    value;
              })
            }
          />
        )}
        <NumericField
          label={t('assembly.profileHeight')}
          value={spec.profileHeightMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.profileHeightMm = value;
            })
          }
        />
        <NumericField
          label={t('assembly.sheetThickness')}
          value={spec.physicalThicknessMm}
          unit="length"
          minimum={Number.EPSILON}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.physicalThicknessMm = value;
            })
          }
        />
      </details>
      <PlaneAssignmentCards
        assignment={assignment}
        surfaceGeometry={surfaceGeometry}
        onChange={(roofPlaneIds) =>
          update((draft) => {
            draft.roofPlaneIds = roofPlaneIds;
          })
        }
      />
      <button
        className="a-button a-danger"
        onClick={() =>
          state.setCoveringAssignments(
            state.projectDocument.project.coverings.filter(
              (item) => item.id !== assignment.id,
            ),
          )
        }
      >
        <Trash2 size={16} /> {t('assembly.removeCovering')}
      </button>
    </aside>
  );
}

function StandingSeamEditor({
  assignment,
  surfaceGeometry,
  selectedPlaneId,
}: {
  assignment: StandingSeamAssignment;
  surfaceGeometry: RoofSurfaceGeometryResult;
  selectedPlaneId?: string;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const spec = assignment.product.technicalSpecSnapshot;
  const mode = spec.installationModes.find(
    (candidate) => candidate.id === assignment.selectedInstallationModeId,
  );
  const intent =
    assignment.layoutIntent?.kind === 'standing-seam'
      ? assignment.layoutIntent
      : {
          kind: 'standing-seam' as const,
          horizontalAlignment: 'centered' as const,
        };
  const update = (mutate: (draft: StandingSeamAssignment) => void) => {
    const draft = structuredClone(assignment);
    mutate(draft);
    detachCatalogRevisionAfterTechnicalEdit(assignment, draft);
    state.setCoveringAssignments(
      state.projectDocument.project.coverings.map((item) =>
        item.id === draft.id ? draft : item,
      ),
    );
  };
  const updateMode = (mutate: (draft: NonNullable<typeof mode>) => void) =>
    update((draft) => {
      const selected =
        draft.product.technicalSpecSnapshot.installationModes.find(
          (candidate) => candidate.id === draft.selectedInstallationModeId,
        );
      if (selected) mutate(selected);
    });
  return (
    <aside className="a-covering-editor" data-testid="standing-seam-editor">
      <h3>{t('assembly.productSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.productName')}</span>
        <input
          key={assignment.product.displaySnapshot?.familyName ?? ''}
          defaultValue={assignment.product.displaySnapshot?.familyName ?? ''}
          onBlur={(event) =>
            update((draft) => {
              draft.product.displaySnapshot = {
                ...draft.product.displaySnapshot,
                familyName: event.currentTarget.value.trim() || undefined,
              };
            })
          }
        />
      </label>
      <h3>{t('assembly.installationSection')}</h3>
      <fieldset className="a-panel-modes">
        <legend>{t('assembly.coveringWidthMode')}</legend>
        {spec.installationModes.map((candidate) => (
          <label key={candidate.id}>
            <input
              type="radio"
              name={`standing-seam-mode:${assignment.id}`}
              checked={candidate.id === assignment.selectedInstallationModeId}
              onChange={() =>
                update((draft) => {
                  draft.selectedInstallationModeId = candidate.id;
                })
              }
            />
            {fromMillimetres(candidate.effectiveWidthMm, state.unit)}{' '}
            {state.unit}
          </label>
        ))}
        <button
          type="button"
          className="a-button"
          onClick={() =>
            update((draft) => {
              const ids = new Set(
                draft.product.technicalSpecSnapshot.installationModes.map(
                  (item) => item.id,
                ),
              );
              let number = 2;
              while (ids.has(`manual-width-${number}`)) number += 1;
              const id = `manual-width-${number}`;
              draft.product.technicalSpecSnapshot.installationModes.push({
                id,
                effectiveWidthMm: mode?.effectiveWidthMm ?? 500,
              });
              draft.selectedInstallationModeId = id;
            })
          }
        >
          {t('assembly.addCoverWidthMode')}
        </button>
      </fieldset>
      <h3>{t('assembly.coverageDimensionsSection')}</h3>
      <NumericField
        label={t('assembly.effectiveWidth')}
        value={mode?.effectiveWidthMm}
        unit="length"
        minimum={1}
        onCommit={(value) =>
          value !== undefined &&
          updateMode((draft) => {
            draft.effectiveWidthMm = value;
            if (draft.totalWidthMm !== undefined)
              draft.totalWidthMm = Math.max(value, draft.totalWidthMm);
          })
        }
      />
      <div className="a-covering-field-pair">
        <NumericField
          label={t('assembly.minimumPanelLength')}
          value={spec.minPanelLengthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              draft.product.technicalSpecSnapshot.minPanelLengthMm = value;
              draft.product.technicalSpecSnapshot.maxPanelLengthMm = Math.max(
                value,
                draft.product.technicalSpecSnapshot.maxPanelLengthMm,
              );
            })
          }
        />
        <NumericField
          label={t('assembly.maximumPanelLength')}
          value={spec.maxPanelLengthMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              draft.product.technicalSpecSnapshot.maxPanelLengthMm = Math.max(
                value,
                draft.product.technicalSpecSnapshot.minPanelLengthMm,
              );
            })
          }
        />
      </div>
      <NumericField
        label={t('assembly.minimumPitch')}
        value={mode?.minPitchDeg ?? spec.minPitchDeg}
        minimum={Number.EPSILON}
        onCommit={(value) =>
          updateMode((draft) => {
            draft.minPitchDeg = value;
          })
        }
      />
      <h3>{t('assembly.layoutSection')}</h3>
      <label className="a-field">
        <span>{t('assembly.horizontalAlignment')}</span>
        <select
          value={intent.horizontalAlignment}
          onChange={(event) =>
            update((draft) => {
              const horizontalAlignment = event.currentTarget.value as
                'centered' | 'from-u-min' | 'manual';
              draft.layoutIntent = {
                kind: 'standing-seam',
                horizontalAlignment,
                ...(horizontalAlignment === 'manual'
                  ? {
                      planeOffsetsMm: Object.fromEntries(
                        draft.roofPlaneIds.map((id) => [
                          id,
                          draft.layoutIntent?.planeOffsetsMm?.[id] ?? 0,
                        ]),
                      ),
                    }
                  : {}),
              };
            })
          }
        >
          <option value="centered">{t('assembly.alignmentCentered')}</option>
          <option value="from-u-min">{t('assembly.alignmentFromEdge')}</option>
          <option value="manual">{t('assembly.alignmentManual')}</option>
        </select>
      </label>
      {intent.horizontalAlignment === 'manual' && selectedPlaneId && (
        <NumericField
          label={t('assembly.planeOffset')}
          value={intent.planeOffsetsMm?.[selectedPlaneId] ?? 0}
          unit="length"
          minimum={Number.NEGATIVE_INFINITY}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              draft.layoutIntent = {
                kind: 'standing-seam',
                horizontalAlignment: 'manual',
                planeOffsetsMm: {
                  ...(draft.layoutIntent?.kind === 'standing-seam'
                    ? draft.layoutIntent.planeOffsetsMm
                    : {}),
                  [selectedPlaneId]: value,
                },
              };
            })
          }
        />
      )}
      <details>
        <summary>{t('assembly.additionalPanelParameters')}</summary>
        <NumericField
          label={t('assembly.totalWidth')}
          value={mode?.totalWidthMm}
          unit="length"
          minimum={mode?.effectiveWidthMm ?? 1}
          onCommit={(value) =>
            updateMode((draft) => {
              draft.totalWidthMm = value;
            })
          }
        />
        <NumericField
          label={t('assembly.seamHeight')}
          value={spec.seamHeightMm}
          unit="length"
          minimum={1}
          onCommit={(value) =>
            value !== undefined &&
            update((draft) => {
              draft.product.technicalSpecSnapshot.seamHeightMm = value;
            })
          }
        />
        <NumericField
          label={t('assembly.sheetThickness')}
          value={spec.physicalThicknessMm}
          unit="length"
          minimum={Number.EPSILON}
          onCommit={(value) =>
            update((draft) => {
              draft.product.technicalSpecSnapshot.physicalThicknessMm = value;
            })
          }
        />
        <label className="a-field">
          <span>{t('assembly.sheetMaterial')}</span>
          <select
            value={spec.material ?? 'other'}
            onChange={(event) =>
              update((draft) => {
                draft.product.technicalSpecSnapshot.material = event
                  .currentTarget.value as 'steel' | 'aluminium' | 'other';
              })
            }
          >
            <option value="steel">{t('assembly.materialSteel')}</option>
            <option value="aluminium">{t('assembly.materialAluminium')}</option>
            <option value="other">{t('assembly.materialOther')}</option>
          </select>
        </label>
      </details>
      <PlaneAssignmentCards
        assignment={assignment}
        surfaceGeometry={surfaceGeometry}
        onChange={(roofPlaneIds) =>
          update((draft) => {
            draft.roofPlaneIds = roofPlaneIds;
          })
        }
      />
      <button
        className="a-button a-danger"
        onClick={() =>
          state.setCoveringAssignments(
            state.projectDocument.project.coverings.filter(
              (item) => item.id !== assignment.id,
            ),
          )
        }
      >
        <Trash2 size={16} /> {t('assembly.removeCovering')}
      </button>
    </aside>
  );
}

export function CoveringInspector({
  layout,
  assignment,
  conflicts,
  surfaceGeometry,
}: {
  layout?: SupportedLayout;
  assignment?: CoveringAssignmentSpec;
  conflicts: readonly PrimaryCoveringPlaneConflict[];
  surfaceGeometry: RoofSurfaceGeometryResult;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const issueSummaries = useMemo(() => groupedCoveringIssues(layout), [layout]);
  const selectedSurfaceId = state.workbench.selectedId.startsWith('surface:')
    ? state.workbench.selectedId.slice('surface:'.length)
    : undefined;
  const selectedPlaneId =
    selectedSurfaceId && assignment?.roofPlaneIds.includes(selectedSurfaceId)
      ? selectedSurfaceId
      : assignment?.roofPlaneIds[0];
  return (
    <aside
      className={`a-inspector ${state.workbench.inspectorOpen ? 'is-open' : ''}`}
      data-testid="covering-inspector"
    >
      <button
        className="a-inspector-heading"
        aria-expanded={state.workbench.inspectorOpen}
        onClick={() => state.setInspectorOpen(!state.workbench.inspectorOpen)}
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>{t('assembly.covering')}</strong>
        </span>
      </button>
      {state.workbench.inspectorOpen && (
        <div className="a-inspector-content">
          <div className="a-covering-source-card">
            <small>
              {assignment?.product.catalogRef
                ? t('assembly.catalogSource')
                : t('assembly.manualParameters')}
            </small>
            {assignment?.product.catalogRef && (
              <>
                <strong>
                  {assignment.product.displaySnapshot?.manufacturer}
                  {assignment.product.displaySnapshot?.familyName
                    ? ` · ${assignment.product.displaySnapshot.familyName}`
                    : ''}
                </strong>
                <span>
                  {t('assembly.catalogRevision')}{' '}
                  {assignment.product.displaySnapshot?.revisionCode ??
                    assignment.product.catalogRef.technicalRevisionId}
                </span>
                {assignment.product.displaySnapshot?.variantName && (
                  <span>{assignment.product.displaySnapshot.variantName}</span>
                )}
              </>
            )}
          </div>
          {conflicts.length > 0 && (
            <p className="a-limit-note" role="alert">
              {t('assembly.coveringPlaneConflict')}
            </p>
          )}
          {issueSummaries.map((issue, index) => (
            <p className="a-limit-note" key={`${issue.code}:${index}`}>
              {t(`assembly.coveringIssue.${issue.code}`)}
              {issue.roofPlaneIds.length > 1 &&
                ` · ${t('assembly.affectedRoofPlanes', { count: issue.roofPlaneIds.length })}`}
            </p>
          ))}
          {assignment && isTileAssignment(assignment) && (
            <TileCoveringEditor
              assignment={assignment}
              surfaceGeometry={surfaceGeometry}
              selectedPlaneId={selectedPlaneId}
            />
          )}
          {assignment && isModularSheetAssignment(assignment) && (
            <ModularSheetEditor
              assignment={assignment}
              surfaceGeometry={surfaceGeometry}
              selectedPlaneId={selectedPlaneId}
            />
          )}
          {assignment && isStandingSeamAssignment(assignment) && (
            <StandingSeamEditor
              assignment={assignment}
              surfaceGeometry={surfaceGeometry}
              selectedPlaneId={selectedPlaneId}
            />
          )}
        </div>
      )}
    </aside>
  );
}
