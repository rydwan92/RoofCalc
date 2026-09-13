import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Grid3X3, Trash2 } from 'lucide-react';
import {
  type CoveringAssignmentSpec,
  type ModularSheetLayoutResult,
  type PrimaryCoveringPlaneConflict,
  type RoofTileLayoutResult,
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

type SupportedLayout = RoofTileLayoutResult | ModularSheetLayoutResult;

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
  const { t } = useTranslation();
  const [selectedPlaneId, setSelectedPlaneId] = useState<string>();
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
    const positions = selectedLayout
      ? 'courses' in selectedLayout
        ? selectedLayout.courses.flatMap((course) => course.positions)
        : selectedLayout.rows.flatMap((row) => row.positions)
      : [];
    return positions.flatMap((position) =>
      position.visibleFragments.map((fragment, index) => ({
        id: `${position.id}:${index}`,
        classification: position.classification,
        polygon: fragment.polygon,
      })),
    );
  }, [selectedLayout]);
  const simplified = fragments.length > 1200;
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

  const addAssignment = (kind: 'roof-tile' | 'modular-sheet') => {
    const next =
      kind === 'roof-tile'
        ? createManualTileAssignment({
            existing: assignments,
            roofPlaneIds: [surfaceGeometry.planes[0]!.roofPlaneId],
          })
        : createManualModularSheetAssignment({
            existing: assignments,
            roofPlaneIds: [surfaceGeometry.planes[0]!.roofPlaneId],
          });
    state.setCoveringAssignments([...assignments, next]);
    state.setSelectedCoveringAssignment(next.id);
  };

  if (!assignment)
    return (
      <section className="a-covering-empty" data-testid="covering-empty">
        <Grid3X3 size={38} />
        <h2>{t('assembly.coveringEmptyTitle')}</h2>
        <p>{t('assembly.coveringEmptyDescription')}</p>
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
        </div>
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
        </div>
      </div>
      <header>
        <div>
          <small>{t('assembly.manualParameters')}</small>
          <strong>
            {assignment.product.displaySnapshot?.familyName ??
              t(coveringKindLabelKey(assignment))}
          </strong>
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
        <div className="a-covering-counts" data-status={layout?.status}>
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
                    : plane.rows.length),
                0,
              ) ?? 0}
            </b>
          </span>
          <span>
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
      </header>
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
            {layout.issues.map((issue, index) => (
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
                    : selectedLayout.rows.reduce(
                        (total, row) => total + row.positions.length,
                        0,
                      )}
                </b>
              </span>
              <span>
                {t(
                  layout?.kind === 'modular-sheet'
                    ? 'assembly.fullSheets'
                    : 'assembly.fullTiles',
                )}{' '}
                <b>{selectedLayout.fullPositions}</b>
              </span>
              <span>
                {t(
                  layout?.kind === 'modular-sheet'
                    ? 'assembly.cutSheets'
                    : 'assembly.cutTiles',
                )}{' '}
                <b>{selectedLayout.cutPositions}</b>
              </span>
            </p>
          )}
          {selectedSurface && bounds && (
            <svg
              data-testid={`${layout?.kind === 'modular-sheet' ? 'sheet' : 'tile'}-layout-drawing`}
              viewBox={`${bounds.viewMinU} ${bounds.viewMinV} ${bounds.viewWidth} ${bounds.viewHeight}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                aspectRatio: `${bounds.viewWidth} / ${bounds.viewHeight}`,
              }}
            >
              <polygon
                className="a-covering-plane"
                points={polygonPoints(selectedSurface.polygon)}
              />
              {battens.battens
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
                    className={`a-covering-fragment a-tile-fragment is-${fragment.classification}`}
                    points={polygonPoints(fragment.polygon)}
                  />
                ))}
              {simplified &&
                (selectedLayout && 'courses' in selectedLayout
                  ? selectedLayout.courses.map((course) => ({
                      id: course.id,
                      stationVMm: course.stationVMm,
                    }))
                  : selectedLayout?.rows.map((row) => ({
                      id: row.id,
                      stationVMm: row.nominalFromVMm,
                    }))
                )?.map((course) => (
                  <line
                    key={course.id}
                    className="a-tile-course-line"
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
                layout?.kind === 'modular-sheet'
                  ? 'assembly.fullSheets'
                  : 'assembly.fullTiles',
              )}
            </span>
            <span className="cut">
              {t(
                layout?.kind === 'modular-sheet'
                  ? 'assembly.cutSheets'
                  : 'assembly.cutTiles',
              )}
            </span>
            <span className="opening">{t('assembly.openings')}</span>
          </div>
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
    replace(draft);
  };
  const spec = assignment.product.technicalSpecSnapshot;
  const intent =
    assignment.layoutIntent?.kind === 'modular-sheet'
      ? assignment.layoutIntent
      : {
          kind: 'modular-sheet' as const,
          horizontalAlignment: 'centered' as const,
        };
  return (
    <aside className="a-covering-editor">
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
        <p className="a-limit-note">{t('assembly.cutToLengthDeferred')}</p>
      )}
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
      <label className="a-field">
        <span>{t('assembly.horizontalAlignment')}</span>
        <select
          value={intent.horizontalAlignment}
          onChange={(event) =>
            update((draft) => {
              const horizontalAlignment = event.currentTarget.value as
                'centered' | 'from-u-min' | 'manual';
              draft.layoutIntent = {
                kind: 'modular-sheet',
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
                kind: 'modular-sheet',
                horizontalAlignment: 'manual',
                planeOffsetsMm: {
                  ...(draft.layoutIntent?.kind === 'modular-sheet'
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
  const { t, i18n } = useTranslation();
  const declared =
    layout?.kind === 'roof-tile'
      ? layout.declaredConsumptionReference
      : undefined;
  const selectedPlaneId = state.workbench.selectedId.startsWith(
    'surface:roof-plane:',
  )
    ? state.workbench.selectedId.replace('surface:', '')
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
          <dl className="a-properties">
            <div>
              <dt>{t('assembly.status')}</dt>
              <dd>
                {layout ? t(`assembly.coveringStatus.${layout.status}`) : '—'}
              </dd>
            </div>
            {declared && (
              <div>
                <dt>{t('assembly.declaredConsumption')}</dt>
                <dd>
                  {new Intl.NumberFormat(i18n.language, {
                    maximumFractionDigits: 1,
                  }).format(declared.minimumPieces)}
                  –
                  {new Intl.NumberFormat(i18n.language, {
                    maximumFractionDigits: 1,
                  }).format(declared.maximumPieces)}{' '}
                  {t('assembly.piecesShort')}
                </dd>
              </div>
            )}
          </dl>
          {conflicts.length > 0 && (
            <p className="a-limit-note" role="alert">
              {t('assembly.coveringPlaneConflict')}
            </p>
          )}
          {layout?.issues.map((issue, index) => (
            <p
              className="a-limit-note"
              key={`${issue.code}:${issue.roofPlaneId ?? ''}:${index}`}
            >
              {t(`assembly.coveringIssue.${issue.code}`)}
            </p>
          ))}
          <p className="a-help">{t('assembly.coveringQuantityBoundary')}</p>
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
        </div>
      )}
    </aside>
  );
}
