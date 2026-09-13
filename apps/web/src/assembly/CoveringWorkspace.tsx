import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Grid3X3, Trash2 } from 'lucide-react';
import {
  type CoveringAssignmentSpec,
  type RoofTileLayoutResult,
} from '@cieslacalc/covering-core';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type {
  BattenLayoutResult,
  RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import { parseDecimal } from '../format';
import { useAssembly } from './store';

type TileAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'roof-tile' }
    >;
  };
};

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
  assignment,
  layout,
  surfaceGeometry,
  battens,
}: {
  assignment?: TileAssignment;
  layout?: RoofTileLayoutResult;
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
  const fragments = useMemo(
    () =>
      selectedLayout?.courses.flatMap((course) =>
        course.positions.flatMap((position) =>
          position.visibleFragments.map((fragment, index) => ({
            id: `${position.id}:${index}`,
            classification: position.classification,
            polygon: fragment.polygon,
          })),
        ),
      ) ?? [],
    [selectedLayout],
  );
  const simplified = fragments.length > 1200;
  const bounds = selectedSurface
    ? {
        minU: Math.min(...selectedSurface.polygon.map((point) => point.uMm)),
        maxU: Math.max(...selectedSurface.polygon.map((point) => point.uMm)),
        minV: Math.min(...selectedSurface.polygon.map((point) => point.vMm)),
        maxV: Math.max(...selectedSurface.polygon.map((point) => point.vMm)),
      }
    : undefined;

  const mode = assignment?.product.technicalSpecSnapshot.installationModes.find(
    (candidate) => candidate.id === assignment.selectedInstallationModeId,
  );

  if (!assignment)
    return (
      <section className="a-covering-empty" data-testid="covering-empty">
        <Grid3X3 size={38} />
        <h2>{t('assembly.coveringEmptyTitle')}</h2>
        <p>{t('assembly.coveringEmptyDescription')}</p>
        <button
          className="a-button a-primary"
          onClick={() =>
            state.setCoveringAssignments([
              ...state.projectDocument.project.coverings,
              createManualTileAssignment({
                existing: state.projectDocument.project.coverings,
                roofPlaneIds: surfaceGeometry.planes.map(
                  (plane) => plane.roofPlaneId,
                ),
              }),
            ])
          }
        >
          {t('assembly.addManualRoofTile')}
        </button>
      </section>
    );

  return (
    <section className="a-covering-workspace" data-testid="covering-workspace">
      <header>
        <div>
          <small>{t('assembly.manualParameters')}</small>
          <strong>
            {assignment.product.displaySnapshot?.familyName ??
              t('assembly.manualRoofTile')}
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
            {t('assembly.tileCourses')}{' '}
            <b>
              {layout?.planes.reduce(
                (total, plane) => total + plane.courses.length,
                0,
              ) ?? 0}
            </b>
          </span>
          <span>
            {t('assembly.tilePositions')} <b>{layout?.totalPositions ?? 0}</b>
          </span>
          <span>
            {t('assembly.fullTiles')} <b>{layout?.fullPositions ?? 0}</b>
          </span>
          <span>
            {t('assembly.cutTiles')} <b>{layout?.cutPositions ?? 0}</b>
          </span>
          {mode && (
            <span>
              {t('assembly.coverWidth')}{' '}
              <b>
                {fromMillimetres(mode.coverWidthMm, state.unit)} {state.unit}
              </b>
            </span>
          )}
        </div>
      </header>
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
                    {fromMillimetres(issue.actual, state.unit)} {state.unit}
                    {issue.minimum !== undefined && issue.maximum !== undefined
                      ? ` · ${t('assembly.allowedRange')}: ${fromMillimetres(issue.minimum, state.unit)}–${fromMillimetres(issue.maximum, state.unit)} ${state.unit}`
                      : ''}
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
                {id.replace('roof-plane:', '')}
              </button>
            ))}
          </div>
          {selectedSurface && bounds && (
            <svg
              data-testid="tile-layout-drawing"
              viewBox={`${bounds.minU} ${bounds.minV} ${Math.max(1, bounds.maxU - bounds.minU)} ${Math.max(1, bounds.maxV - bounds.minV)}`}
              preserveAspectRatio="xMidYMid meet"
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
                    className={`a-tile-fragment is-${fragment.classification}`}
                    points={polygonPoints(fragment.polygon)}
                  />
                ))}
              {simplified &&
                selectedLayout?.courses.map((course) => (
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
            <span className="full">{t('assembly.fullTiles')}</span>
            <span className="cut">{t('assembly.cutTiles')}</span>
            <span className="opening">{t('assembly.openings')}</span>
          </div>
          <p className="a-help">{t('assembly.noWasteAccessories')}</p>
        </div>
      </div>
    </section>
  );
}

function CoveringEditor({
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
                {item.id}
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
            {plane.roofPlaneId.replace('roof-plane:', '')}
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
  surfaceGeometry,
}: {
  layout?: RoofTileLayoutResult;
  assignment?: TileAssignment;
  surfaceGeometry: RoofSurfaceGeometryResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const declared = layout?.declaredConsumptionReference;
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
            <div>
              <dt>{t('assembly.tilePositions')}</dt>
              <dd>{layout?.totalPositions ?? 0}</dd>
            </div>
            <div>
              <dt>{t('assembly.fullTiles')}</dt>
              <dd>{layout?.fullPositions ?? 0}</dd>
            </div>
            <div>
              <dt>{t('assembly.cutTiles')}</dt>
              <dd>{layout?.cutPositions ?? 0}</dd>
            </div>
            <div>
              <dt>{t('assembly.splitTiles')}</dt>
              <dd>{layout?.splitPositions ?? 0}</dd>
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
          <p className="a-help">{t('assembly.coveringQuantityBoundary')}</p>
          {assignment && (
            <CoveringEditor
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
