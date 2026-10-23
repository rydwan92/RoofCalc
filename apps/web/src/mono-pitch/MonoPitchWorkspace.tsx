import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, X } from 'lucide-react';
import {
  resolveMonoPitchRoofSystem,
  type MonoPitchRoofSystem,
} from '@cieslacalc/calculator-core';
import { datumDisplayLabel } from '@cieslacalc/drawing-engine';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  fromMillimetres,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import { formatLength, formatNumber, parseDecimal } from '../format';
import {
  defaultMonoPitchDraft,
  loadMonoPitchDraft,
  MONO_PITCH_ANGLE_FIELDS,
  monoPitchDraftIssues,
  monoPitchSystemInput,
  saveMonoPitchDraft,
  type MonoPitchDraft,
  type MonoPitchFieldIssue,
  type MonoPitchNumberField,
} from './mono-pitch-draft';
import { MonoPitchSection } from './MonoPitchSection';
import type { Scene3DController } from '../assembly/scene3d/TechnicalScene3D';
import { initialWorkbenchViewState } from '../assembly/workbench';
import './mono-pitch.css';

type Field = MonoPitchNumberField;

/** The same Three.js view as the workbench, loaded only when opened. */
const TechnicalScene3D = lazy(() =>
  import('../assembly/scene3d/TechnicalScene3D').then((module) => ({
    default: module.TechnicalScene3D,
  })),
);
type LayerToggle =
  'battensEnabled' | 'counterBattensEnabled' | 'membraneEnabled';

const GROUPS: { key: string; fields: readonly Field[] }[] = [
  { key: 'building', fields: ['buildingLengthMm', 'runMm', 'pitchDeg'] },
  {
    key: 'rafters',
    fields: ['rafterWidthMm', 'rafterDepthMm', 'rafterSpacingMm'],
  },
  {
    key: 'supports',
    fields: [
      'lowPlateWidthMm',
      'lowPlateHeightMm',
      'lowSeatMm',
      'highSupportWidthMm',
      'highSupportHeightMm',
      'highSeatMm',
    ],
  },
];
const LAYERS: { toggle: LayerToggle; key: string; fields: readonly Field[] }[] =
  [
    {
      toggle: 'battensEnabled',
      key: 'battens',
      fields: [
        'battenGaugeMm',
        'battenEaveOffsetMm',
        'battenWidthMm',
        'battenHeightMm',
      ],
    },
    {
      toggle: 'counterBattensEnabled',
      key: 'counterBattens',
      fields: ['counterBattenWidthMm', 'counterBattenHeightMm'],
    },
    {
      toggle: 'membraneEnabled',
      key: 'membrane',
      fields: [
        'membraneRollWidthMm',
        'membraneRollLengthMm',
        'membraneOverlapMm',
      ],
    },
  ];

/**
 * VNext-7B-3: the mono-pitch roof as a working calculation — every number
 * comes from `resolveMonoPitchRoofSystem` (the shared rafter solver, batten,
 * counter-batten, membrane engines) and the generic timber schedule. Inputs
 * are exact; nothing is saved as a project yet (ADR-015 V2 writer gate).
 */
export function MonoPitchWorkspace({
  unit,
  onClose,
}: {
  unit: LengthUnit;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [draft, setDraft] = useState<MonoPitchDraft>(() =>
    loadMonoPitchDraft(),
  );
  const [texts, setTexts] = useState<Partial<Record<Field, string>>>({});
  const [unparsable, setUnparsable] = useState<ReadonlySet<Field>>(new Set());
  useEffect(() => saveMonoPitchDraft(draft), [draft]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const issues = useMemo(() => monoPitchDraftIssues(draft), [draft]);
  const lastValid = useRef<MonoPitchRoofSystem | undefined>(undefined);
  const system = useMemo(() => {
    if (Object.keys(issues).length) return lastValid.current;
    try {
      return resolveMonoPitchRoofSystem(monoPitchSystemInput(draft));
    } catch {
      return lastValid.current;
    }
  }, [draft, issues]);
  if (system) lastValid.current = system;
  const schedule = useMemo(
    () =>
      system
        ? createRoofMemberSchedule({ skeleton: system.skeleton })
        : undefined,
    [system],
  );
  const invalid = Object.keys(issues).length > 0 || unparsable.size > 0;

  const length = (mm: number) => formatLength(mm, unit, locale);
  const angle = (deg: number) => formatNumber(deg, locale, 1);
  const shown = (field: Field) =>
    MONO_PITCH_ANGLE_FIELDS.has(field)
      ? String(Number(draft[field].toFixed(4)))
      : String(fromMillimetres(draft[field], unit));
  const setNumber = (field: Field, raw: string) => {
    setTexts((current) => ({ ...current, [field]: raw }));
    const value = parseDecimal(raw);
    setUnparsable((current) => {
      const next = new Set(current);
      if (value === null) next.add(field);
      else next.delete(field);
      return next;
    });
    if (value === null) return;
    setDraft((current) => ({
      ...current,
      [field]: MONO_PITCH_ANGLE_FIELDS.has(field)
        ? value
        : toMillimetres(value, unit),
    }));
  };
  const highSupport = t(
    `assembly.monoPitch.highSupport.${draft.topEdge === 'abutment' ? 'ledger' : 'wall-plate'}`,
  );
  const issueText = (field: Field): string | undefined => {
    if (unparsable.has(field)) return t('assembly.errors.invalid');
    const issue: MonoPitchFieldIssue | undefined = issues[field];
    return issue ? t(`assembly.monoPitch.issues.${issue}`) : undefined;
  };
  const input = (field: Field) => {
    const id = `mono-pitch.${field}`;
    const error = issueText(field);
    return (
      <label className="mono-field" htmlFor={id} key={field}>
        <span>{t(`assembly.monoPitch.fields.${field}`)}</span>
        <div>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={texts[field] ?? shown(field)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => setNumber(field, event.target.value)}
            onBlur={() =>
              setTexts((current) => {
                if (unparsable.has(field)) return current;
                const next = { ...current };
                delete next[field];
                return next;
              })
            }
          />
          <small>{MONO_PITCH_ANGLE_FIELDS.has(field) ? '°' : unit}</small>
        </div>
        {error && (
          <small className="mono-error" id={`${id}-error`} role="alert">
            {error}
          </small>
        )}
      </label>
    );
  };

  return (
    <div
      className="mono-layer"
      role="dialog"
      aria-modal="true"
      aria-label={t('assembly.monoPitch.title')}
      data-testid="mono-pitch-workspace"
    >
      <section className="mono-workspace">
        <header className="mono-header">
          <div>
            <h2>{t('assembly.monoPitch.title')}</h2>
            <p>{t('assembly.monoPitch.subtitle')}</p>
          </div>
          <div className="mono-header-actions">
            <button
              type="button"
              className="a-button"
              data-testid="mono-pitch-restore"
              onClick={() => {
                setDraft({ ...defaultMonoPitchDraft });
                setTexts({});
                setUnparsable(new Set());
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t('assembly.monoPitch.restore')}
            </button>
            <button
              type="button"
              className="mono-icon"
              aria-label={t('assembly.monoPitch.close')}
              title={t('assembly.monoPitch.close')}
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p className="mono-draft-note">{t('assembly.monoPitch.draftNote')}</p>
        {system && (
          // Phones: the key numbers stay in view while the inputs scroll; the
          // full result (same values) follows the form.
          <div
            className="mono-key"
            aria-hidden="true"
            data-testid="mono-pitch-key"
          >
            <span>
              <small>{t('assembly.monoPitch.results.rafters')}</small>
              <strong>
                {system.framing.rafterSpacing.stationCount} ×{' '}
                {length(system.framing.calculation.plan.minimumStockLengthMm)}{' '}
                {unit}
              </strong>
            </span>
            <span>
              <small>{t('assembly.monoPitch.results.plates')}</small>
              <strong>
                {length(system.framing.plates.differenceMm)} {unit}
              </strong>
            </span>
          </div>
        )}
        <div className="mono-body">
          <form
            className="mono-inputs"
            onSubmit={(event) => event.preventDefault()}
            data-testid="mono-pitch-inputs"
          >
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.building')}</legend>
              {GROUPS[0]!.fields.map(input)}
            </fieldset>
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.eaves')}</legend>
              {input('lowEaveOverhangMm')}
              <div
                className="mono-choice"
                role="radiogroup"
                aria-label={t('assembly.monoPitch.topEdge.label')}
              >
                <span>{t('assembly.monoPitch.topEdge.label')}</span>
                {(['free', 'abutment'] as const).map((edge) => (
                  <label key={edge}>
                    <input
                      type="radio"
                      name="mono-pitch-top-edge"
                      value={edge}
                      data-testid={`mono-pitch-top-${edge}`}
                      checked={draft.topEdge === edge}
                      onChange={() =>
                        setDraft((current) => ({ ...current, topEdge: edge }))
                      }
                    />
                    {t(`assembly.monoPitch.topEdge.${edge}`)}
                  </label>
                ))}
              </div>
              {draft.topEdge === 'free' && input('highOverhangMm')}
              {input('vergeOverhangMm')}
            </fieldset>
            {GROUPS.slice(1).map((group) => (
              <fieldset key={group.key}>
                <legend>
                  {t(`assembly.monoPitch.groups.${group.key}`)}
                  {group.key === 'supports' ? ` · ${highSupport}` : ''}
                </legend>
                {group.fields.map(input)}
              </fieldset>
            ))}
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.layers')}</legend>
              {LAYERS.map((layer) => (
                <div className="mono-layer-group" key={layer.key}>
                  <label className="mono-toggle">
                    <input
                      type="checkbox"
                      data-testid={`mono-pitch-layer-${layer.key}`}
                      checked={draft[layer.toggle]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [layer.toggle]: event.target.checked,
                        }))
                      }
                    />
                    {t(`assembly.monoPitch.layers.${layer.key}`)}
                  </label>
                  {draft[layer.toggle] && layer.fields.map(input)}
                </div>
              ))}
            </fieldset>
          </form>

          <div className="mono-results" aria-live="polite">
            {invalid && (
              <p
                className="mono-invalid"
                role="status"
                data-testid="mono-pitch-invalid"
              >
                {t('assembly.monoPitch.invalidResult')}
              </p>
            )}
            {system && schedule && (
              <MonoPitchResults
                draft={draft}
                system={system}
                schedule={schedule}
                unit={unit}
                highSupport={highSupport}
                length={length}
                angle={angle}
              />
            )}
            <section className="mono-limits">
              <h3>{t('assembly.monoPitch.limits.heading')}</h3>
              <p>{t('assembly.monoPitch.limits.text')}</p>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function MonoPitchView({
  system,
  unit,
}: {
  system: MonoPitchRoofSystem;
  unit: LengthUnit;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'section' | '3d'>('section');
  // A local selection: the 3D view must not select anything in the open
  // project, which this roof is not part of (Scene3DController).
  const [selected, setSelected] = useState<{
    id: string;
    prototypeId?: string;
  }>({ id: 'roof' });
  const [isolate, setIsolate] = useState(false);
  const controller = useMemo<Scene3DController>(
    () => ({
      view: {
        ...initialWorkbenchViewState,
        selectedId: selected.id,
        selectedPrototypeId: selected.prototypeId,
        isolateSelection: isolate,
      },
      unit,
      select: (id, prototypeId) => setSelected({ id, prototypeId }),
      clear: () => {
        setSelected({ id: 'roof' });
        setIsolate(false);
      },
      setIsolation: setIsolate,
    }),
    [isolate, selected, unit],
  );
  const counterBattens = useMemo(
    () =>
      (system.counterBattens?.rows ?? []).map((row) => ({
        rowId: row.id,
        roofPlaneId: row.roofPlaneId,
        sourceMemberId: row.sourceMemberId,
        section: row.section,
        segments: row.segments.map(({ from, to }) => ({ from, to })),
      })),
    [system.counterBattens],
  );
  return (
    <section className="mono-view">
      <div
        className="mono-view-switch"
        role="group"
        aria-label={t('assembly.monoPitch.view.label')}
      >
        <button
          type="button"
          aria-pressed={view === 'section'}
          onClick={() => setView('section')}
        >
          {t('assembly.monoPitch.view.section')}
        </button>
        <button
          type="button"
          aria-pressed={view === '3d'}
          data-testid="mono-pitch-view-3d"
          onClick={() => setView('3d')}
        >
          {t('assembly.monoPitch.view.threeD')}
        </button>
      </div>
      {view === 'section' ? (
        <MonoPitchSection
          assembly={system.framing.calculation.assembly}
          unit={unit}
        />
      ) : (
        <div className="mono-scene" data-testid="mono-pitch-scene">
          <Suspense fallback={<div className="a-loading-panel" />}>
            <TechnicalScene3D
              skeleton={system.skeleton}
              counterBattens={counterBattens}
              controller={controller}
              onReturnTo2D={() => setView('section')}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}

function MonoPitchResults({
  draft,
  system,
  schedule,
  unit,
  highSupport,
  length,
  angle,
}: {
  draft: MonoPitchDraft;
  system: MonoPitchRoofSystem;
  schedule: ReturnType<typeof createRoofMemberSchedule>;
  unit: LengthUnit;
  highSupport: string;
  length: (mm: number) => string;
  angle: (deg: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { framing } = system;
  const { assembly, plan } = framing.calculation;
  const [lowJoint, highJoint] = assembly.joints;
  const eaveCut = assembly.endCuts.find((cut) => cut.end === 'eave')!;
  const topCut = assembly.endCuts.find((cut) => cut.end === 'top')!;
  const [plane] = framing.surface.planes;
  const section = (widthMm: number, depthMm: number) =>
    `${length(widthMm)} × ${length(depthMm)} ${unit}`;
  const labels = new Map(
    plan.datums.map((datum, index) => [datum.id, datumDisplayLabel(index)]),
  );
  const rows = schedule.timberRows;
  const rafterRow = rows.find((row) => row.memberKind === 'rafter');
  const plateRow = (prototypeId: string) =>
    rows.find((row) => row.prototypeId === prototypeId);
  const lowPlate = plateRow(framing.supportIds.low);
  const highPlate = plateRow(framing.supportIds.high);
  const metres = (mm: number) => formatNumber(mm / 1000, locale, 2);
  const squareMetres = (mm2: number) => formatNumber(mm2 / 1e6, locale, 2);
  const card = (
    testId: string,
    label: string,
    value: string,
    note?: string,
  ) => (
    <div className="mono-card" data-testid={`mono-pitch-result-${testId}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
  return (
    <>
      <section className="mono-summary">
        <h3>{t('assembly.monoPitch.results.heading')}</h3>
        <div className="mono-cards">
          {card(
            'rafters',
            t('assembly.monoPitch.results.rafters'),
            t('assembly.monoPitch.results.rafterCount', {
              count: framing.rafterSpacing.stationCount,
              spacing: length(framing.rafterSpacing.actualSpacingMm),
              unit,
            }),
          )}
          {card(
            'stock',
            t('assembly.monoPitch.results.stock'),
            `${length(plan.minimumStockLengthMm)} ${unit}`,
            t('assembly.monoPitch.results.stockNote'),
          )}
          {card(
            'top-edge',
            t('assembly.monoPitch.results.topEdge'),
            `${length(assembly.member.referenceLengthMm)} ${unit}`,
          )}
          {card(
            'plates',
            t('assembly.monoPitch.results.plates'),
            `${length(framing.plates.differenceMm)} ${unit}`,
            t('assembly.monoPitch.results.platesNote', {
              support: highSupport,
            }),
          )}
          {card(
            'rise',
            t('assembly.monoPitch.results.rise'),
            `${length(framing.surface.riseMm)} ${unit}`,
          )}
          {card(
            'area',
            t('assembly.monoPitch.results.area'),
            t('assembly.monoPitch.results.areaValue', {
              area: squareMetres(plane.grossAreaMm2),
              plan: squareMetres(plane.planAreaMm2),
            }),
          )}
        </div>
      </section>

      <MonoPitchView system={system} unit={unit} />

      <section className="mono-cuts" data-testid="mono-pitch-cuts">
        <h3>{t('assembly.monoPitch.cuts.heading')}</h3>
        <dl>
          <div>
            <dt>{t('assembly.monoPitch.cuts.eave')}</dt>
            <dd>
              {t('assembly.monoPitch.cuts.plumb', {
                angle: angle(eaveCut.angleToMemberDeg),
              })}
            </dd>
          </div>
          {(
            [
              [t('assembly.monoPitch.cuts.lowNotch'), lowJoint],
              [
                t('assembly.monoPitch.cuts.highNotch', {
                  support: highSupport,
                }),
                highJoint,
              ],
            ] as const
          ).map(([label, joint]) =>
            joint ? (
              <div key={joint.id}>
                <dt>{label}</dt>
                <dd>
                  {t('assembly.monoPitch.cuts.notch', {
                    seat: length(joint.seatLengthMm),
                    depth: length(joint.normalDepthMm),
                    remaining: length(joint.remainingDepthMm),
                    unit,
                  })}
                  <br />
                  {t('assembly.monoPitch.cuts.station', {
                    distance: length(joint.stationMm),
                    unit,
                  })}
                </dd>
              </div>
            ) : null,
          )}
          <div>
            <dt>{t('assembly.monoPitch.cuts.top')}</dt>
            <dd>
              {t('assembly.monoPitch.cuts.plumb', {
                angle: angle(topCut.angleToMemberDeg),
              })}
              <br />
              {t('assembly.monoPitch.cuts.station', {
                distance: length(topCut.stationMm),
                unit,
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mono-marking" data-testid="mono-pitch-marking">
        <h3>{t('assembly.monoPitch.marking.heading')}</h3>
        <p>{t('assembly.monoPitch.marking.note')}</p>
        <ol>
          {plan.steps.map((step) => (
            <li key={`${step.operationId}/${step.action}`}>
              {step.action === 'check-depth'
                ? t('assembly.checkDepth', {
                    depth: length(step.normalDepthMm),
                    remaining: length(step.remainingDepthMm),
                    unit,
                  })
                : t(
                    step.action === 'mark-plumb'
                      ? 'assembly.markPlumb'
                      : 'assembly.markSeat',
                    {
                      from: labels.get(step.from),
                      to: labels.get(step.target),
                      distance: length(step.distanceMm),
                      seat:
                        step.seatLengthMm === undefined
                          ? ''
                          : length(step.seatLengthMm),
                      angle: angle(step.angleDeg),
                      unit,
                    },
                  )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mono-list" data-testid="mono-pitch-list">
        <h3>{t('assembly.monoPitch.list.heading')}</h3>
        <p>{t('assembly.monoPitch.list.note')}</p>
        <table>
          <tbody>
            {rafterRow && (
              <tr data-row="rafter">
                <th scope="row">
                  {t('assembly.monoPitch.list.rafter', {
                    section: section(
                      rafterRow.section.widthMm ?? 0,
                      rafterRow.section.depthMm ?? 0,
                    ),
                  })}
                </th>
                <td>
                  {t('assembly.monoPitch.list.pieces', {
                    count: rafterRow.quantity,
                    length: length(rafterRow.lengthMm),
                    unit,
                  })}
                </td>
              </tr>
            )}
            {(
              [
                ['low-plate', lowPlate, 'assembly.monoPitch.list.lowPlate'],
                [
                  'high-support',
                  highPlate,
                  'assembly.monoPitch.list.highSupport',
                ],
              ] as const
            ).map(([key, row, labelKey]) =>
              row ? (
                <tr key={key} data-row={key}>
                  <th scope="row">
                    {t(labelKey, {
                      support: highSupport,
                      section: section(
                        row.section.widthMm ?? 0,
                        row.section.depthMm ?? 0,
                      ),
                    })}
                  </th>
                  <td>
                    {t('assembly.monoPitch.list.pieces', {
                      count: row.quantity,
                      length: length(row.lengthMm),
                      unit,
                    })}
                  </td>
                </tr>
              ) : null,
            )}
            {system.battens && (
              <tr data-row="battens">
                <th scope="row">
                  {t('assembly.monoPitch.list.battens', {
                    section: section(draft.battenWidthMm, draft.battenHeightMm),
                  })}
                </th>
                <td>
                  {system.battens.status === 'resolved'
                    ? t('assembly.monoPitch.list.length', {
                        length: metres(system.battens.totalLengthMm),
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
            {system.counterBattens && (
              <tr data-row="counter-battens">
                <th scope="row">
                  {t('assembly.monoPitch.list.counterBattens', {
                    section: section(
                      draft.counterBattenWidthMm,
                      draft.counterBattenHeightMm,
                    ),
                  })}
                </th>
                <td>
                  {system.counterBattens.status === 'resolved'
                    ? t('assembly.monoPitch.list.length', {
                        length: metres(
                          system.counterBattens.totalVisibleLengthMm,
                        ),
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
            {system.membrane && (
              <tr data-row="membrane">
                <th scope="row">{t('assembly.monoPitch.list.membrane')}</th>
                <td>
                  {system.membrane.status === 'resolved'
                    ? t('assembly.monoPitch.list.membraneValue', {
                        area: squareMetres(system.membrane.grossAreaMm2),
                        courses: system.membrane.courseCount,
                        rolls: system.membrane.rollCount,
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
