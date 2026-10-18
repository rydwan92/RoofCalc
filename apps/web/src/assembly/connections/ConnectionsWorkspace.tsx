import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Crosshair,
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
  type ConnectionNodeMember,
  type ConnectionScheduleRow,
  type ConnectorTypeId,
  type FastenerTypeId,
  type PlannedNodeConnection,
  type ResolvedRoofConnectionNode,
  type RoofConnectionCensus,
  type RoofConnectionPlan,
  type RoofJunctionKind,
  type RoofNodeKind,
  type RoofNodeProjection,
  type StandardReference,
} from '@cieslacalc/connection-core';
import {
  connectionsCopy,
  memberLabelText,
  type ConnectionsCopy,
  type NodeMissing,
} from './copy';
import type { MemberLabel } from './labels';
import './connections.css';

/**
 * VNext-2/3 connection plan: every kind of node the roof has (from where
 * the solved member axes actually meet), what the solvers model there, the
 * fastening the carpenter plans, a detailing check where EN 1995-1-1
 * defines one, and the standards behind it. VNext-3 ties each kind to the
 * drawing: its occurrences are markers, its members are highlighted, and
 * one occurrence opens its details. Editing writes the canonical
 * `project.connectionPlan` (one history entry per change); focus and the
 * chosen occurrence are view state.
 */
export function ConnectionsWorkspace({
  census,
  projection,
  plan,
  onChange,
  onOpenStructure,
  focus,
  onFocus,
  selectedNode,
  onSelectNode,
  onOpenMember,
  labels,
  formatLength,
  drawing,
}: {
  census: RoofConnectionCensus;
  projection: RoofNodeProjection;
  plan: RoofConnectionPlan | undefined;
  onChange: (plan: RoofConnectionPlan | undefined) => void;
  onOpenStructure: () => void;
  focus: RoofNodeKind | undefined;
  onFocus: (kind: RoofNodeKind | undefined) => void;
  selectedNode: ResolvedRoofConnectionNode | undefined;
  onSelectNode: (nodeId: string) => void;
  onOpenMember: (member: ConnectionNodeMember) => void;
  labels: ReadonlyMap<string, MemberLabel>;
  formatLength: (valueMm: number) => string;
  /** The shared roof drawing; it names each marker with this function. */
  drawing: (
    markerLabel: (node: ResolvedRoofConnectionNode, index: number) => string,
  ) => ReactNode;
}) {
  const { i18n } = useTranslation();
  const m = connectionsCopy(i18n.language);
  // Stable while language and labels are, so the drawing keeps its memo.
  const markerLabel = useCallback(
    (node: ResolvedRoofConnectionNode, index: number) =>
      m.markerLabel(
        m.nodes[node.kind],
        index + 1,
        node.members
          .map((member) => memberLabelText(m, labels.get(member.id)))
          .join(' + '),
      ),
    [labels, m],
  );
  const rows = useMemo(
    () => deriveConnectionSchedule(census, plan),
    [census, plan],
  );
  const summary = summarizeConnectionSchedule(rows);
  const roles = [...new Set(rows.flatMap((row) => row.participants))];
  const focusedRow = rows.find((row) => row.kind === focus);
  const focusedNodes = useMemo(
    () => projection.nodes.filter((node) => node.kind === focus),
    [focus, projection.nodes],
  );
  const panel = useRef<HTMLElement>(null);
  // The drawing panel comes first on phones; show it when a node is chosen.
  useEffect(() => {
    if (focus && window.matchMedia?.('(max-width: 900px)').matches)
      panel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus]);

  return (
    <section
      className="cn-workspace"
      data-testid="connection-plan"
      data-focused={focus ?? undefined}
    >
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
      {projection.limitations.includes('apex-without-ridge') && (
        <p
          className="cn-boundary"
          data-tone="warn"
          role="note"
          data-testid="connection-apex-limitation"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          {m.apexWithoutRidge}
        </p>
      )}
      <div className="cn-legend" aria-label={m.legend}>
        <span>{m.legend}:</span>
        {roles.map((role) => (
          <span key={role} className="cn-role" data-role={role}>
            {m.roles[role]}
          </span>
        ))}
      </div>
      <div className="cn-layout">
        <ol className="cn-nodes">
          {rows.map((row) => (
            <NodeCard
              key={row.kind}
              row={row}
              copy={m}
              focused={row.kind === focus}
              occurrences={
                projection.nodes.filter((node) => node.kind === row.kind).length
              }
              onFocus={() => onFocus(row.kind === focus ? undefined : row.kind)}
              onOpenStructure={onOpenStructure}
              onChange={(planned) =>
                onChange(withPlannedConnection(plan, row.kind, planned))
              }
            />
          ))}
        </ol>
        <aside
          ref={panel}
          className="cn-drawing"
          aria-label={m.drawingTitle}
          data-testid="connection-drawing"
        >
          <header className="cn-drawing-head">
            <div>
              <small>{m.drawingTitle}</small>
              <strong>
                {focusedRow ? m.nodes[focusedRow.kind] : m.legend}
              </strong>
            </div>
            {focus && (
              <button
                type="button"
                className="cn-link"
                data-testid="connection-drawing-close"
                onClick={() => onFocus(undefined)}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                {m.closeDrawing}
              </button>
            )}
          </header>
          <div className="cn-drawing-canvas">
            <Suspense fallback={<div className="a-loading-panel" />}>
              {drawing(markerLabel)}
            </Suspense>
          </div>
          {!focus ? (
            <p className="cn-muted">{m.drawingIdle}</p>
          ) : !focusedNodes.length ? (
            <p className="cn-muted" data-testid="connection-no-occurrences">
              {m.noOccurrences}
            </p>
          ) : selectedNode && selectedNode.kind === focus && focusedRow ? (
            <NodeDetail
              node={selectedNode}
              nodes={focusedNodes}
              row={focusedRow}
              copy={m}
              labels={labels}
              formatLength={formatLength}
              onSelectNode={onSelectNode}
              onOpenMember={onOpenMember}
              onOpenStructure={onOpenStructure}
            />
          ) : (
            <div className="cn-pick">
              <p className="cn-muted">{m.drawingPick}</p>
              <button
                type="button"
                className="cn-link"
                data-testid="connection-first-occurrence"
                onClick={() => onSelectNode(focusedNodes[0]!.id)}
              >
                {m.occurrence(1, focusedNodes.length)}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </aside>
      </div>
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

/** What is still open at a node: never a structural verdict. */
export function nodeMissing(row: ConnectionScheduleRow): NodeMissing[] {
  const missing: NodeMissing[] = [];
  if (row.modelled?.status === 'undecided') missing.push('joint-undecided');
  if (!row.modelled || row.modelled.status === 'named')
    missing.push('joint-not-modelled');
  if (!row.planned?.fastening && !row.planned?.connector)
    missing.push('no-fastening');
  if (
    row.detailing?.kind === 'not-computed' &&
    row.detailing.reason === 'diameter-missing'
  )
    missing.push('diameter-missing');
  if (row.detailing?.kind === 'row-fit' && row.detailing.fit.status !== 'fits')
    missing.push('spacing-too-tight');
  missing.push('capacity');
  return missing;
}

function NodeDetail({
  node,
  nodes,
  row,
  copy: m,
  labels,
  formatLength,
  onSelectNode,
  onOpenMember,
  onOpenStructure,
}: {
  node: ResolvedRoofConnectionNode;
  nodes: readonly ResolvedRoofConnectionNode[];
  row: ConnectionScheduleRow;
  copy: ConnectionsCopy;
  labels: ReadonlyMap<string, MemberLabel>;
  formatLength: (valueMm: number) => string;
  onSelectNode: (nodeId: string) => void;
  onOpenMember: (member: ConnectionNodeMember) => void;
  onOpenStructure: () => void;
}) {
  const index = nodes.findIndex((item) => item.id === node.id);
  const step = (delta: number) =>
    onSelectNode(nodes[(index + delta + nodes.length) % nodes.length]!.id);
  const planned = row.planned;
  // Members with an existing preparation sheet (K1, H1, J1).
  const prepared = node.members.filter((member) => {
    const code = labels.get(member.id)?.code;
    return code === 'K1' || code === 'H1' || code === 'J1';
  });
  return (
    <div
      className="cn-detail"
      data-testid="connection-node-detail"
      data-node-id={node.id}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') step(1);
        if (event.key === 'ArrowLeft') step(-1);
      }}
    >
      <div className="cn-stepper">
        <button
          type="button"
          className="cn-icon-button"
          aria-label={m.previous}
          title={m.previous}
          onClick={() => step(-1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <strong data-testid="connection-occurrence">
          {m.occurrence(index + 1, nodes.length)}
        </strong>
        <button
          type="button"
          className="cn-icon-button"
          aria-label={m.next}
          title={m.next}
          onClick={() => step(1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <dl className="cn-detail-grid">
        <div>
          <dt>{m.detail.where}</dt>
          <dd>
            <strong>{m.parts[node.part]}</strong>
            <span>
              {formatLength(node.location.y)} {m.detail.along} ·{' '}
              {formatLength(Math.abs(node.location.x))} {m.detail.fromRidge} ·{' '}
              {formatLength(node.location.z)} {m.detail.height}
            </span>
          </dd>
        </div>
        <div>
          <dt>{m.detail.members}</dt>
          <dd>
            <ul className="cn-detail-members">
              {node.members.map((member) => (
                <li key={member.id} data-role={member.role}>
                  <span className="cn-swatch" data-role={member.role} />
                  <span>{memberLabelText(m, labels.get(member.id))}</span>
                  <button
                    type="button"
                    className="cn-link"
                    data-testid="connection-open-member"
                    onClick={() => onOpenMember(member)}
                  >
                    <Crosshair size={13} aria-hidden="true" />
                    {m.detail.showMember}
                  </button>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>{m.detail.joint}</dt>
          <dd>
            {row.modelled ? (
              <>
                <strong>{m.types[row.modelled.type]}</strong>
                <span>{m.modelled[row.modelled.status]}</span>
              </>
            ) : (
              <span>{m.carpentryNone}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{m.detail.planned}</dt>
          <dd>
            {planned?.fastening || planned?.connector ? (
              <>
                {planned.fastening && (
                  <strong>
                    {m.types[planned.fastening.type]}
                    {planned.fastening.diameterMm
                      ? ` Ø${String(planned.fastening.diameterMm).replace('.', ',')} mm`
                      : ''}
                    {' · '}
                    {m.detail.perNode(planned.fastening.perNode ?? 1)}
                  </strong>
                )}
                {planned.connector && (
                  <strong>{m.types[planned.connector]}</strong>
                )}
                {planned.note && <span>{planned.note}</span>}
              </>
            ) : (
              <span>{m.detail.notPlanned}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{m.detail.missing}</dt>
          <dd>
            <ul className="cn-missing" data-testid="connection-node-missing">
              {nodeMissing(row).map((item) => (
                <li key={item} data-missing={item}>
                  {item === 'joint-undecided' ? (
                    <button
                      type="button"
                      className="cn-link"
                      onClick={onOpenStructure}
                    >
                      {m.missing[item]}
                    </button>
                  ) : (
                    m.missing[item]
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>{m.detail.drawings}</dt>
          <dd>
            {prepared.length ? (
              <div className="cn-detail-drawings">
                {prepared.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="cn-link"
                    onClick={() => onOpenMember(member)}
                  >
                    {m.detail.preparation(labels.get(member.id)?.code ?? '')}
                  </button>
                ))}
              </div>
            ) : (
              <span>{m.detail.noDrawing}</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
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

/**
 * VNext-3: the five separate questions of a node, never merged into one
 * verdict — it occurs (geometry), its joint type, planned fasteners, the
 * spacing check, and capacity (always the structural designer's).
 */
function NodeLadder({
  row,
  copy: m,
}: {
  row: ConnectionScheduleRow;
  copy: ConnectionsCopy;
}) {
  const joint = row.modelled?.status ?? 'none';
  const fasteners =
    row.planned?.fastening || row.planned?.connector ? 'planned' : 'none';
  const spacing =
    row.detailing?.kind === 'row-fit'
      ? row.detailing.fit.status === 'fits'
        ? 'fits'
        : 'too-tight'
      : row.detailing?.kind === 'not-computed'
        ? 'not-computed'
        : 'none';
  const countText =
    row.unit === 'axis'
      ? m.axes(row.count)
      : row.unit === 'member'
        ? m.members(row.count, row.extentMm)
        : m.count(row.count);
  const steps: { key: string; label: string; value: string; tone: string }[] = [
    { key: 'geometry', label: m.ladder.geometry, value: countText, tone: 'ok' },
    {
      key: 'joint',
      label: m.ladder.joint,
      value: m.ladder.jointState[joint],
      tone:
        joint === 'resolved' ? 'ok' : joint === 'undecided' ? 'warn' : 'muted',
    },
    {
      key: 'fasteners',
      label: m.ladder.fasteners,
      value: m.ladder.fastenerState[fasteners],
      tone: fasteners === 'planned' ? 'ok' : 'muted',
    },
    {
      key: 'spacing',
      label: m.ladder.spacing,
      value: m.ladder.spacingState[spacing],
      tone:
        spacing === 'fits' ? 'ok' : spacing === 'too-tight' ? 'warn' : 'muted',
    },
    {
      key: 'capacity',
      label: m.ladder.capacity,
      value: m.ladder.capacityState,
      tone: 'external',
    },
  ];
  return (
    <ol className="cn-ladder" aria-label={m.ladder.title}>
      {steps.map((item) => (
        <li key={item.key} data-step={item.key} data-tone={item.tone}>
          <small>{item.label}</small>
          <span>{item.value}</span>
        </li>
      ))}
    </ol>
  );
}

function NodeCard({
  row,
  copy: m,
  focused,
  occurrences,
  onFocus,
  onChange,
  onOpenStructure,
}: {
  row: ConnectionScheduleRow;
  copy: ConnectionsCopy;
  focused: boolean;
  /** Located occurrences (0 for member/axis rows: nothing to point at). */
  occurrences: number;
  onFocus: () => void;
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
    row.unit === 'axis'
      ? m.axes(row.count)
      : row.unit === 'member'
        ? m.members(row.count, row.extentMm)
        : m.count(row.count);
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
      data-focused={focused || undefined}
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
          {occurrences > 0 && (
            <button
              type="button"
              className="cn-show"
              aria-pressed={focused}
              data-testid={`connection-show-${row.kind}`}
              onClick={onFocus}
            >
              <Crosshair size={14} aria-hidden="true" />
              {focused ? m.shownOnDrawing : m.showOnDrawing(occurrences)}
            </button>
          )}
        </div>
      </header>
      <NodeLadder row={row} copy={m} />
      {row.unit === 'member' && (
        <p className="cn-muted cn-unit-note">{m.memberUnitNote}</p>
      )}

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
