import { useAssembly } from './store';
import type { ExportFacts } from './export-adapter';
import { initialDrainageIntent, withDrainage } from './roof-system';
import {
  resolveRoofSystemChecklist,
  type RoofSystemAreaKey,
} from './roof-system-checklist';
import { roofSystemCopy } from './roof-system-copy';
import './drainage.css';
import './roof-system.css';

/**
 * V51/V52 roof-system pieces of the Material Plan: the whole-roof summary and
 * the drainage group head (one compact row when drainage is not configured).
 * Line components are added in the roof-system workspace, not here.
 */
const copy = {
  pl: {
    notConfigured: 'Nie skonfigurowano',
    addGutters: 'Dodaj rynny',
    drainageOptional: 'Rynny i rury spustowe — opcjonalne.',
    chooseSystem: 'Wybierz system rynnowy',
    edit: 'Edytuj odwodnienie',
    proposed: 'PROPONOWANY UKŁAD',
    manual: 'RĘCZNIE',
    hydraulic:
      'Rozmieszczenie elementów jest planem materiałowym. Dobór średnicy i wydajności systemu odwodnienia nie został jeszcze zweryfikowany hydraulicznie.',
  },
  en: {
    notConfigured: 'Not configured',
    addGutters: 'Add gutters',
    drainageOptional: 'Gutters and downpipes — optional.',
    chooseSystem: 'Choose a gutter system',
    edit: 'Edit drainage',
    proposed: 'PROPOSED LAYOUT',
    manual: 'MANUAL',
    hydraulic:
      'Component placement is a material plan. The gutter size and capacity have not been verified hydraulically.',
  },
};
const copyFor = (locale: string) =>
  locale.startsWith('pl') ? copy.pl : copy.en;

/**
 * V52: the SYSTEM DACHU summary reads the one checklist projection. Counts,
 * never a percentage; every row opens that area of the roof-system
 * workspace.
 */
export function RoofSystemSummary({
  facts,
  locale,
  onOpenArea,
}: {
  facts: ExportFacts;
  locale: string;
  onOpenArea: (area?: RoofSystemAreaKey) => void;
}) {
  const r = roofSystemCopy(locale);
  if (!facts.coverings.length && !facts.roofSystem) return null;
  const checklist = resolveRoofSystemChecklist(facts);
  const visible = checklist.areas.filter(
    (area) => area.state !== 'not-applicable',
  );
  return (
    <section className="mp-roof-system" data-testid="roof-system-summary">
      <h3>{r.title}</h3>
      <p className="rs-counts" data-testid="roof-system-counts">
        {r.counts(
          checklist.counts.ready,
          checklist.counts.attention,
          checklist.counts.optional,
        )}
      </p>
      <ul>
        {visible.map((area) => (
          <li
            key={area.key}
            data-state={
              area.state === 'ready'
                ? 'ok'
                : area.state === 'needs-decision'
                  ? 'attention'
                  : 'none'
            }
          >
            <button
              type="button"
              data-testid={`roof-system-summary-${area.key}`}
              onClick={() => onOpenArea(area.key)}
            >
              <span>{r.area[area.key]}</span>
              <strong>{r.state[area.state]}</strong>
            </button>
          </li>
        ))}
      </ul>
      {checklist.hasBaseCovering && (
        <button
          type="button"
          className="a-primary"
          data-testid="roof-system-complete"
          onClick={() => onOpenArea()}
        >
          {r.complete}
        </button>
      )}
    </section>
  );
}

export function DrainageGroupHead({
  facts,
  locale,
  onOpen,
}: {
  facts: ExportFacts;
  locale: string;
  onOpen: () => void;
}) {
  const c = copyFor(locale);
  const state = useAssembly();
  const intent = facts.roofSystem?.intent;
  const drainage = intent?.drainage;
  const plan = facts.roofSystem?.drainage;
  if (!drainage?.enabled || !plan || plan.status === 'disabled')
    return (
      <div className="mp-compact-row" data-testid="drainage-not-configured">
        <div>
          <strong>{c.notConfigured}</strong>
          <small>{c.drainageOptional}</small>
        </div>
        <button
          type="button"
          className="a-primary"
          data-testid="material-add-gutters"
          onClick={() => {
            state.setRoofSystem(
              withDrainage(
                intent,
                drainage
                  ? { ...drainage, enabled: true }
                  : initialDrainageIntent(),
              ),
            );
            onOpen();
          }}
        >
          {c.addGutters}
        </button>
      </div>
    );
  return (
    <div className="mp-compact-row" data-testid="drainage-configured">
      <div>
        <strong>
          {drainage.system?.name ?? c.chooseSystem}{' '}
          <em className="dw-badge">
            {drainage.mode === 'auto' ? c.proposed : c.manual}
          </em>
        </strong>
        <small>{c.hydraulic}</small>
      </div>
      <button
        type="button"
        data-testid="material-edit-drainage"
        onClick={onOpen}
      >
        {c.edit}
      </button>
    </div>
  );
}
