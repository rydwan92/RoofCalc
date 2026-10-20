import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Hammer, Wrench, X } from 'lucide-react';
import {
  applyConnectionPractice,
  hasPlannedDecision,
  isFastenerType,
  PRACTICE_SOURCES,
  proposeConnectionPractice,
  type AnchorageChoice,
  type ConnectionTypeId,
  type JoiningStyle,
  type PlannedNodeConnection,
  type PracticeProposal,
  type PracticeSourceId,
  type RoofConnectionPlan,
  type RoofNodeKind,
} from '@cieslacalc/connection-core';
import type { ConnectionsCopy } from './copy';
import { practiceCopy } from './practice-copy';

/**
 * VNext-4: asks how the carpenter joins the timber and anchors the wall
 * plate, shows a per-node proposal with its reason and sources, and lets
 * the user accept, change or skip each node. Applying is ONE plan change
 * (one history entry). Nothing here proposes a number.
 */
export function ConnectionPractice({
  kinds,
  plan,
  copy: m,
  onApply,
  onClose,
}: {
  kinds: readonly RoofNodeKind[];
  plan: RoofConnectionPlan | undefined;
  copy: ConnectionsCopy;
  onApply: (plan: RoofConnectionPlan | undefined) => void;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const p = practiceCopy(i18n.language);
  const [style, setStyle] = useState<JoiningStyle>();
  const [anchorage, setAnchorage] = useState<AnchorageChoice>('undecided');
  /** Per style + node: another type the user picked instead. */
  const [choices, setChoices] = useState<Record<string, ConnectionTypeId>>({});
  /** Per node: the user's own tick, when it differs from the default. */
  const [ticks, setTicks] = useState<Partial<Record<RoofNodeKind, boolean>>>(
    {},
  );
  const proposals = useMemo(
    () => (style ? proposeConnectionPractice(kinds, { style, anchorage }) : []),
    [anchorage, kinds, style],
  );
  const plannedOf = (proposal: PracticeProposal) => {
    const chosen = choices[`${style}:${proposal.kind}`];
    if (!chosen) return proposal.planned;
    return isFastenerType(chosen)
      ? { fastening: { type: chosen } }
      : { connector: chosen as PlannedNodeConnection['connector'] };
  };
  const accepted = (proposal: PracticeProposal) =>
    !!plannedOf(proposal) &&
    (ticks[proposal.kind] ?? !hasPlannedDecision(plan, proposal.kind));
  const describe = (planned: PlannedNodeConnection | undefined) =>
    [planned?.connector, planned?.fastening?.type]
      .filter((id): id is NonNullable<typeof id> => !!id)
      .map((id) => m.types[id])
      .join(' + ');
  const acceptedProposals = proposals.filter(accepted);
  const sources = [
    ...new Set(proposals.flatMap((proposal) => proposal.sources)),
  ] as PracticeSourceId[];

  return (
    <section
      className="cn-practice"
      data-testid="connection-practice"
      aria-labelledby="cn-practice-title"
    >
      <header className="cn-practice-head">
        <div>
          <h3 id="cn-practice-title">
            <Hammer size={17} aria-hidden="true" />
            {p.title}
          </h3>
          <p>{p.intro}</p>
        </div>
        <button
          type="button"
          className="cn-icon-button"
          aria-label={p.cancel}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <p className="cn-practice-boundary" role="note">
        {p.boundary}
      </p>

      <fieldset className="cn-practice-question">
        <legend>{p.styleQuestion}</legend>
        <div className="cn-practice-options">
          {(['carpentry', 'connectors'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={style === option}
              data-testid={`connection-practice-style-${option}`}
              onClick={() => setStyle(option)}
            >
              {option === 'carpentry' ? (
                <Hammer size={18} aria-hidden="true" />
              ) : (
                <Wrench size={18} aria-hidden="true" />
              )}
              <strong>{p.style[option].title}</strong>
              <small>{p.style[option].help}</small>
            </button>
          ))}
        </div>
      </fieldset>

      {kinds.includes('wall-plate-anchorage') && (
        <fieldset className="cn-practice-question">
          <legend>{p.anchorageQuestion}</legend>
          <div className="cn-practice-chips">
            {(['anchor-rod', 'perforated-strap', 'undecided'] as const).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={anchorage === option}
                  data-testid={`connection-practice-anchorage-${option}`}
                  onClick={() => setAnchorage(option)}
                >
                  {p.anchorage[option]}
                </button>
              ),
            )}
          </div>
        </fieldset>
      )}

      {!style ? (
        <p className="cn-muted">{p.pickStyle}</p>
      ) : (
        <>
          <h4 className="cn-practice-subtitle">{p.proposalTitle}</h4>
          <ol className="cn-practice-list">
            {proposals.map((proposal) => {
              const planned = plannedOf(proposal);
              const decided = hasPlannedDecision(plan, proposal.kind);
              const options: ConnectionTypeId[] = [
                ...(proposal.planned?.connector
                  ? [proposal.planned.connector]
                  : []),
                ...(proposal.planned?.fastening
                  ? [proposal.planned.fastening.type]
                  : []),
                ...proposal.alternatives,
              ];
              return (
                <li
                  key={proposal.kind}
                  data-testid={`connection-practice-${proposal.kind}`}
                  data-accepted={accepted(proposal) || undefined}
                >
                  <label className="cn-practice-tick">
                    <input
                      type="checkbox"
                      checked={accepted(proposal)}
                      disabled={!planned}
                      onChange={(event) =>
                        setTicks((current) => ({
                          ...current,
                          [proposal.kind]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>{m.nodes[proposal.kind]}</strong>
                      <span className="cn-practice-proposal">
                        {planned ? describe(planned) : p.noProposal}
                      </span>
                    </span>
                  </label>
                  <small>{p.rationale[proposal.rationale]}</small>
                  {decided && (
                    <small className="cn-practice-decided">
                      {p.yourDecision(describe(plan?.nodes[proposal.kind]))}
                    </small>
                  )}
                  {options.length > (proposal.planned ? 1 : 0) && (
                    <label className="cn-practice-change">
                      {p.change}
                      <select
                        value={
                          choices[`${style}:${proposal.kind}`] ??
                          proposal.planned?.connector ??
                          proposal.planned?.fastening?.type ??
                          ''
                        }
                        onChange={(event) => {
                          const id = event.target.value as ConnectionTypeId;
                          setChoices((current) => {
                            const next = { ...current };
                            const proposed =
                              proposal.planned?.connector ??
                              proposal.planned?.fastening?.type;
                            if (!id || id === proposed)
                              delete next[`${style}:${proposal.kind}`];
                            else next[`${style}:${proposal.kind}`] = id;
                            return next;
                          });
                        }}
                      >
                        {!proposal.planned && (
                          <option value="">{m.choose}</option>
                        )}
                        {options.map((id, index) => (
                          <option key={id} value={id}>
                            {m.types[id]}
                            {index === 0 && proposal.planned
                              ? ` (${p.proposed})`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="cn-practice-actions">
            <button
              type="button"
              className="a-button a-primary"
              data-testid="connection-practice-apply"
              disabled={!acceptedProposals.length}
              onClick={() =>
                onApply(
                  applyConnectionPractice(
                    plan,
                    acceptedProposals.map((proposal) => ({
                      kind: proposal.kind,
                      planned: plannedOf(proposal),
                    })),
                    { replaceDecided: true },
                  ),
                )
              }
            >
              {p.apply(acceptedProposals.length)}
            </button>
            <button type="button" className="a-button" onClick={onClose}>
              {p.cancel}
            </button>
          </div>
          {sources.length > 0 && (
            <details className="cn-practice-sources">
              <summary>
                <BookOpen size={13} aria-hidden="true" />
                {p.sourcesTitle} ({sources.length})
              </summary>
              <ul>
                {sources.map((id) => {
                  const source = PRACTICE_SOURCES[id];
                  return (
                    <li key={id}>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}{' '}
                      <small>— {source.publisher}</small>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
