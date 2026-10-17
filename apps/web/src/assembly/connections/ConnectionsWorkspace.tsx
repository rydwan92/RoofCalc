import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Info,
  Link2,
} from 'lucide-react';
import {
  CONNECTION_TYPES,
  deriveConnectionSchedule,
  ROOF_JUNCTIONS,
  scheduleDesignBasis,
  STANDARDS,
  summarizeConnectionSchedule,
  withPlannedConnection,
  type ConnectionScheduleRow,
  type ConnectorTypeId,
  type FastenerTypeId,
  type PlannedNodeConnection,
  type RoofConnectionCensus,
  type RoofConnectionPlan,
  type RoofJunctionKind,
  type StandardReference,
} from '@cieslacalc/connection-core';
import { connectionsCopy, type ConnectionsCopy } from './copy';
import './connections.css';

/**
 * VNext-2 connection plan: every kind of node the roof has, what the
 * solvers already model there, the fastening the carpenter plans, a
 * detailing check where EN 1995-1-1 defines one, and the standards behind
 * it. Editing writes the canonical `project.connectionPlan` through one
 * store action (one history entry per change).
 */
export function ConnectionsWorkspace({
  census,
  plan,
  onChange,
  onOpenStructure,
}: {
  census: RoofConnectionCensus;
  plan: RoofConnectionPlan | undefined;
  onChange: (plan: RoofConnectionPlan | undefined) => void;
  onOpenStructure: () => void;
}) {
  const { i18n } = useTranslation();
  const m = connectionsCopy(i18n.language);
  const rows = useMemo(
    () => deriveConnectionSchedule(census, plan),
    [census, plan],
  );
  const summary = summarizeConnectionSchedule(rows);
  const roles = [...new Set(rows.flatMap((row) => row.participants))];

  return (
    <section className="cn-workspace" data-testid="connection-plan">
      <header className="cn-header">
        <div>
          <h2>
            <Link2 size={20} aria-hidden="true" />
            {m.title}
          </h2>
          <p>{m.subtitle}</p>
        </div>
        <dl className="cn-summary">
          <div>
            <dt>{m.summary.nodeKinds}</dt>
            <dd>{summary.nodeKinds}</dd>
          </div>
          <div>
            <dt>{m.summary.occurrences}</dt>
            <dd>{summary.occurrences}</dd>
          </div>
          <div data-tone="ok">
            <dt>{m.summary.planned}</dt>
            <dd data-testid="connection-plan-planned">{summary.planned}</dd>
          </div>
          <div data-tone={summary.checkDetailing ? 'warn' : undefined}>
            <dt>{m.summary.checkDetailing}</dt>
            <dd>{summary.checkDetailing}</dd>
          </div>
        </dl>
      </header>
      <p className="cn-boundary" role="note">
        <Info size={16} aria-hidden="true" />
        {m.boundary}
      </p>
      <div className="cn-legend" aria-label={m.legend}>
        <span>{m.legend}:</span>
        {roles.map((role) => (
          <span key={role} className="cn-role" data-role={role}>
            {m.roles[role]}
          </span>
        ))}
      </div>
      <ol className="cn-nodes">
        {rows.map((row) => (
          <NodeCard
            key={row.kind}
            row={row}
            copy={m}
            onOpenStructure={onOpenStructure}
            onChange={(planned) =>
              onChange(withPlannedConnection(plan, row.kind, planned))
            }
          />
        ))}
      </ol>
      <section className="cn-basis" aria-labelledby="cn-basis-title">
        <h3 id="cn-basis-title">
          <BookOpen size={16} aria-hidden="true" />
          {m.basisTitle}
        </h3>
        <p>{m.basisHint}</p>
        <References references={scheduleDesignBasis()} copy={m} />
      </section>
      <details className="cn-junctions">
        <summary>{m.junctionsTitle}</summary>
        <p>{m.junctionsHint}</p>
        <ul>
          {(Object.keys(ROOF_JUNCTIONS) as RoofJunctionKind[]).map((kind) => (
            <li key={kind}>{m.junctions[kind]}</li>
          ))}
        </ul>
        <small>{m.junctionNeeds}</small>
      </details>
    </section>
  );
}

function References({
  references,
  copy: m,
}: {
  references: readonly StandardReference[];
  copy: ConnectionsCopy;
}) {
  return (
    <ul className="cn-references">
      {references.map((reference) => {
        const standard = STANDARDS[reference.standard];
        return (
          <li
            key={`${reference.standard}|${reference.clause ?? ''}|${reference.subject}`}
          >
            <strong>
              {standard.edition ?? reference.standard}
              {reference.clause ? ` · ${reference.clause}` : ''}
            </strong>{' '}
            — {m.subjects[reference.subject]}
            <small>
              {m.standards[reference.standard]}
              {standard.verifyEdition ? ` (${m.edition()})` : ''}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function NodeCard({
  row,
  copy: m,
  onChange,
  onOpenStructure,
}: {
  row: ConnectionScheduleRow;
  copy: ConnectionsCopy;
  onChange: (planned: PlannedNodeConnection | undefined) => void;
  onOpenStructure: () => void;
}) {
  const id = useId();
  const planned = row.planned ?? {};
  const [note, setNote] = useState(planned.note ?? '');
  // Undo/redo can change the stored note; the draft follows it.
  useEffect(() => setNote(row.planned?.note ?? ''), [row.planned?.note]);
  const fastenerType = planned.fastening?.type;
  const diameters = fastenerType
    ? (CONNECTION_TYPES[fastenerType].diameters ?? [])
    : [];
  const set = (next: PlannedNodeConnection) => onChange(next);
  const countText =
    row.unit === 'axis' ? m.axes(row.count) : m.count(row.count);
  const StatusIcon =
    row.status === 'planned'
      ? CheckCircle2
      : row.status === 'check-detailing'
        ? AlertTriangle
        : CircleDashed;

  return (
    <li
      className="cn-node"
      data-node={row.kind}
      data-status={row.status}
      data-testid={`connection-node-${row.kind}`}
    >
      <header className="cn-node-head">
        <div className="cn-participants" aria-hidden="true">
          {row.participants.map((role) => (
            <span key={role} className="cn-swatch" data-role={role} />
          ))}
        </div>
        <div>
          <h3>{m.nodes[row.kind]}</h3>
          <p>{m.nodeHelp[row.kind]}</p>
        </div>
        <div className="cn-node-meta">
          <span className="cn-count">{countText}</span>
          <span className="cn-status" data-status={row.status}>
            <StatusIcon size={13} aria-hidden="true" />
            {m.status[row.status]}
          </span>
        </div>
      </header>

      <div className="cn-node-body">
        <section className="cn-block" aria-label={m.carpentry}>
          <h4>{m.carpentry}</h4>
          {row.modelled ? (
            <p className="cn-modelled" data-state={row.modelled.status}>
              <strong>{m.types[row.modelled.type]}</strong>
              <span>{m.modelled[row.modelled.status]}</span>
            </p>
          ) : (
            <p className="cn-muted">{m.carpentryNone}</p>
          )}
          {row.modelled && (
            <button type="button" className="cn-link" onClick={onOpenStructure}>
              {m.changeInStructure}
            </button>
          )}
        </section>

        <section className="cn-block" aria-label={m.fastening}>
          <h4>{m.fastening}</h4>
          <div className="cn-fields">
            <label htmlFor={`${id}-fastener`}>
              {m.fastening}
              <select
                id={`${id}-fastener`}
                value={fastenerType ?? ''}
                data-testid={`connection-fastener-${row.kind}`}
                onChange={(event) => {
                  const type = event.target.value as FastenerTypeId | '';
                  // No diameter is preselected: a default would read as a
                  // recommendation, and sizing is the designer's decision.
                  set({
                    ...planned,
                    fastening: type
                      ? { type, perNode: planned.fastening?.perNode ?? 1 }
                      : undefined,
                  });
                }}
              >
                <option value="">{m.none}</option>
                {row.options.fasteners.map((type) => (
                  <option key={type} value={type}>
                    {m.types[type]}
                  </option>
                ))}
              </select>
            </label>
            {planned.fastening && diameters.length > 0 && (
              <label htmlFor={`${id}-diameter`}>
                {m.diameter}
                <select
                  id={`${id}-diameter`}
                  value={planned.fastening.diameterMm ?? ''}
                  data-testid={`connection-diameter-${row.kind}`}
                  onChange={(event) => {
                    const rest = { ...planned.fastening! };
                    delete rest.diameterMm;
                    set({
                      ...planned,
                      fastening: event.target.value
                        ? { ...rest, diameterMm: Number(event.target.value) }
                        : rest,
                    });
                  }}
                >
                  <option value="">{m.choose}</option>
                  {diameters.map((value) => (
                    <option key={value} value={value}>
                      Ø{String(value).replace('.', ',')} mm
                    </option>
                  ))}
                </select>
              </label>
            )}
            {planned.fastening && (
              <label htmlFor={`${id}-count`}>
                {m.perNode}
                <input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={planned.fastening.perNode ?? 1}
                  data-testid={`connection-count-${row.kind}`}
                  onChange={(event) => {
                    const value = Math.round(Number(event.target.value));
                    if (!(value >= 1 && value <= 50)) return;
                    set({
                      ...planned,
                      fastening: { ...planned.fastening!, perNode: value },
                    });
                  }}
                />
              </label>
            )}
          </div>
        </section>

        <section className="cn-block" aria-label={m.connector}>
          <h4>{m.connector}</h4>
          <div className="cn-fields">
            <label htmlFor={`${id}-connector`}>
              {m.connector}
              <select
                id={`${id}-connector`}
                value={planned.connector ?? ''}
                data-testid={`connection-connector-${row.kind}`}
                onChange={(event) => {
                  const connector = event.target.value as ConnectorTypeId | '';
                  set({ ...planned, connector: connector || undefined });
                }}
              >
                <option value="">{m.none}</option>
                {row.options.connectors.map((type) => (
                  <option key={type} value={type}>
                    {m.types[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      {row.detailing && <Detailing row={row} copy={m} />}
      {row.plannedQuantity && (
        <p className="cn-quantity">
          {m.plannedQuantity(
            row.plannedQuantity.fasteners,
            row.plannedQuantity.connectors,
          )}
          <small> — {m.quantityNote}</small>
        </p>
      )}

      <label className="cn-note" htmlFor={`${id}-note`}>
        {m.note}
        <input
          id={`${id}-note`}
          value={note}
          maxLength={240}
          placeholder={m.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if ((planned.note ?? '') !== note.trim())
              set({ ...planned, note: note.trim() || undefined });
          }}
        />
      </label>

      {row.references.length > 0 && (
        <details className="cn-node-references">
          <summary>
            <BookOpen size={13} aria-hidden="true" />
            {m.references} ({row.references.length})
          </summary>
          <References references={row.references} copy={m} />
        </details>
      )}
    </li>
  );
}

function Detailing({
  row,
  copy: m,
}: {
  row: ConnectionScheduleRow;
  copy: ConnectionsCopy;
}) {
  const check = row.detailing!;
  if (check.kind === 'not-computed')
    return (
      <p className="cn-detailing" data-state="info">
        <Info size={14} aria-hidden="true" />
        {m.reason[check.reason]}
      </p>
    );
  const member = m.roles[check.limitingRole];
  const fits = check.fit.status === 'fits';
  return (
    <div
      className="cn-detailing"
      data-state={fits ? 'ok' : 'warn'}
      data-testid={`connection-detailing-${row.kind}`}
    >
      <strong>{m.spacingTitle(check.table)}</strong>
      <dl className="cn-spacing">
        <div>
          <dt>a1</dt>
          <dd>{check.envelope.a1} mm</dd>
        </div>
        <div>
          <dt>a2</dt>
          <dd>{check.envelope.a2} mm</dd>
        </div>
        <div>
          <dt>a3</dt>
          <dd>{check.envelope.a3} mm</dd>
        </div>
        <div>
          <dt>a4</dt>
          <dd>{check.envelope.a4} mm</dd>
        </div>
      </dl>
      <small>{m.spacingValues}</small>
      <p>
        {fits ? (
          <CheckCircle2 size={14} aria-hidden="true" />
        ) : (
          <AlertTriangle size={14} aria-hidden="true" />
        )}
        {check.fit.status === 'fits'
          ? m.rowFits(
              check.perNode,
              check.diameterMm,
              member,
              check.fit.requiredDepthMm,
              check.fit.availableDepthMm,
            )
          : m.rowTooShallow(
              check.perNode,
              check.diameterMm,
              member,
              check.fit.requiredDepthMm,
              check.fit.availableDepthMm,
              check.fit.maxCount,
            )}{' '}
        <em>{m.detailingOnly}</em>
      </p>
    </div>
  );
}
