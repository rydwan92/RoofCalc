import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Grid3X3, Trash2 } from 'lucide-react';
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
  RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import { parseDecimal } from '../format';
import { useAssembly } from './store';
import {
  coveringKindLabelKey,
  installationModeLabelKey,
  roofPlaneLabelKey,
} from './covering-presentation';

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
}: {
  assignments: readonly CoveringAssignmentSpec[];
  assignment?: CoveringAssignmentSpec;
  layout?: SupportedLayout;
  conflicts: readonly PrimaryCoveringPlaneConflict[];
  surfaceGeometry: RoofSurfaceGeometryResult;
  battens: BattenLayoutResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const [selectedPlaneId, setSelectedPlaneId] = useState<string>();
  const [catalogKind, setCatalogKind] = useState<CoveringKind>();
  const [drawingDetail, setDrawingDetail] = useState<
    'auto' | 'detailed' | 'simplified'
  >('auto');
  const planeIds =
    assignment?.roofPlaneIds ??
    surfaceGeometry.planes.map((plane) => plane.roofPlaneId);
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

  const openCatalog = (kind: CoveringKind) => {
    state.setMobilePanel('none');
    setCatalogKind(kind);
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
  };

  const catalogButtons = (
    <div className="a-covering-catalog-actions">
      <small>{t('assembly.fromCatalog')}</small>
      <button
        className="a-button a-primary"
        onClick={() => openCatalog('roof-tile')}
      >
        {t('assembly.roofTile')}
      </button>
      <button className="a-button" onClick={() => openCatalog('modular-sheet')}>
        {t('assembly.modularSheet')}
      </button>
      <button className="a-button" onClick={() => openCatalog('standing-seam')}>
        {t('assembly.standingSeam')}
      </button>
    </div>
  );

  const picker = catalogKind ? (
    <Suspense fallback={<div className="a-loading-panel" />}>
      <CatalogProductPicker
        kind={catalogKind}
        onClose={() => setCatalogKind(undefined)}
        onManual={() => addAssignment(catalogKind)}
        onApply={(product) => addAssignment(catalogKind, product)}
      />
    </Suspense>
  ) : null;

  if (!assignment)
    return (
      <section className="a-covering-empty" data-testid="covering-empty">
        <Grid3X3 size={38} />
        <h2>{t('assembly.coveringEmptyTitle')}</h2>
        <p>{t('assembly.coveringEmptyDescription')}</p>
        {catalogButtons}
        <small>{t('assembly.orManualParameters')}</small>
        <div className="a-covering-add-actions">
          <button
            className="a-button a-primary"
            onClick={() => addAssignment('roof-tile')}
          >
            {t('assembly.addManualRoofTile')}
          </button>
          <button
            className="a-button"
            onClick={() => addAssignment('modular-sheet')}
          >
            {t('assembly.addManualModularSheet')}
          </button>
          <button
            className="a-button"
            onClick={() => addAssignment('standing-seam')}
          >
            {t('assembly.addManualStandingSeam')}
          </button>
        </div>
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
          <button
            className="a-button a-add"
            onClick={() =>
              openCatalog(assignment.product.technicalSpecSnapshot.kind)
            }
          >
            + {t('assembly.fromCatalog')}
          </button>
          <button
            className="a-button a-add"
            onClick={() => addAssignment('roof-tile')}
          >
            + {t('assembly.roofTile')}
          </button>
          <button
            className="a-button a-add"
            onClick={() => addAssignment('modular-sheet')}
          >
            + {t('assembly.modularSheet')}
          </button>
          <button
            className="a-button a-add"
            onClick={() => addAssignment('standing-seam')}
          >
            + {t('assembly.standingSeam')}
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
            </small>
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
            {(layout.kind === 'standing-seam' ||
            layout.kind === 'modular-sheet-cut-to-length'
              ? layout.issueCodes.map((code) =>
                  layout.issues.find((issue) => issue.code === code)!,
                )
              : layout.issues
            ).map((issue, index) => (
              <p key={`${issue.code}:${issue.roofPlaneId ?? ''}:${index}`}>
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
              </p>
            ))}
          </div>
          {layout.issueCodes.some((code) => code.startsWith('batten-')) && (
            <button
              onClick={() => {
                state.setViewPreset('layers');
                state.setBuildUpView('battens');
              }}
            >
              {t('assembly.openBattenSettings')}
            </button>
          )}
        </div>
      )}
      <div className="a-covering-body">
        <div className="a-covering-canvas-panel">
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
                {t(roofPlaneLabelKey(id), { id })}
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
              {layout?.kind !== 'standing-seam' &&
                layout?.kind !== 'modular-sheet-cut-to-length' &&
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
              {!simplified &&
                fragments.map((fragment) => (
                  <polygon
                    key={fragment.id}
                    className={`a-covering-fragment ${layout?.kind === 'standing-seam' || layout?.kind === 'modular-sheet-cut-to-length' ? 'a-panel-fragment' : 'a-tile-fragment'} is-${fragment.classification}`}
                    points={polygonPoints(fragment.polygon)}
                  />
                ))}
              {simplified &&
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
              {simplified &&
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
            <span className="opening">{t('assembly.openings')}</span>
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
      <fieldset>
        <legend>{t('assembly.assignedRoofPlanes')}</legend>
        {surfaceGeometry.planes.map((plane) => (
          <label key={plane.roofPlaneId}>
            <input
              type="checkbox"
              checked={assignment.roofPlaneIds.includes(plane.roofPlaneId)}
              disabled={
                assignment.roofPlaneIds.length === 1 &&
                assignment.roofPlaneIds.includes(plane.roofPlaneId)
              }
              onChange={(event) =>
                update((draft) => {
                  draft.roofPlaneIds = event.currentTarget.checked
                    ? [...draft.roofPlaneIds, plane.roofPlaneId]
                    : draft.roofPlaneIds.filter(
                        (id) => id !== plane.roofPlaneId,
                      );
                })
              }
            />
            {t(roofPlaneLabelKey(plane.roofPlaneId), {
              id: plane.roofPlaneId,
            })}
          </label>
        ))}
      </fieldset>
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
      <fieldset>
        <legend>{t('assembly.assignedRoofPlanes')}</legend>
        {surfaceGeometry.planes.map((plane) => (
          <label key={plane.roofPlaneId}>
            <input
              type="checkbox"
              checked={assignment.roofPlaneIds.includes(plane.roofPlaneId)}
              disabled={
                assignment.roofPlaneIds.length === 1 &&
                assignment.roofPlaneIds.includes(plane.roofPlaneId)
              }
              onChange={(event) =>
                update((draft) => {
                  draft.roofPlaneIds = event.currentTarget.checked
                    ? [...draft.roofPlaneIds, plane.roofPlaneId]
                    : draft.roofPlaneIds.filter(
                        (id) => id !== plane.roofPlaneId,
                      );
                })
              }
            />
            {t(roofPlaneLabelKey(plane.roofPlaneId), { id: plane.roofPlaneId })}
          </label>
        ))}
      </fieldset>
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
      <fieldset>
        <legend>{t('assembly.assignedRoofPlanes')}</legend>
        {surfaceGeometry.planes.map((plane) => (
          <label key={plane.roofPlaneId}>
            <input
              type="checkbox"
              checked={assignment.roofPlaneIds.includes(plane.roofPlaneId)}
              disabled={
                assignment.roofPlaneIds.length === 1 &&
                assignment.roofPlaneIds.includes(plane.roofPlaneId)
              }
              onChange={(event) =>
                update((draft) => {
                  draft.roofPlaneIds = event.currentTarget.checked
                    ? [...draft.roofPlaneIds, plane.roofPlaneId]
                    : draft.roofPlaneIds.filter(
                        (id) => id !== plane.roofPlaneId,
                      );
                })
              }
            />
            {t(roofPlaneLabelKey(plane.roofPlaneId), { id: plane.roofPlaneId })}
          </label>
        ))}
      </fieldset>
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
          {(layout?.kind === 'standing-seam' ||
          layout?.kind === 'modular-sheet-cut-to-length'
            ? layout.issueCodes.map((code) =>
                layout.issues.find((issue) => issue.code === code)!,
              )
            : (layout?.issues ?? [])
          ).map((issue, index) => (
            <p
              className="a-limit-note"
              key={`${issue.code}:${issue.roofPlaneId ?? ''}:${index}`}
            >
              {t(`assembly.coveringIssue.${issue.code}`)}
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
