import { useState } from 'react';
import type {
  RoofLineComponentIntent,
  RoofLineComponentRole,
} from '@cieslacalc/roof-system-core';
import { parseDecimal } from '../format';
import { useAssembly } from './store';
import { materialText } from './material-copy';
import type { ExportFacts } from './export-adapter';
import type { MaterialPlanRow } from './material-plan';
import { initialDrainageIntent, withDrainage } from './roof-system';
import './drainage.css';

/**
 * V51 roof-system pieces of the Material Plan: the whole-roof summary, the
 * drainage group head (one compact row when drainage is not configured) and
 * the manual line-component adder (ridge tape, eave elements).
 */
function plural(
  locale: string,
  n: number,
  one: string,
  few: string,
  many: string,
) {
  if (!locale.startsWith('pl')) return n === 1 ? one : few;
  if (n === 1) return one;
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? few : many;
}

const copy = {
  pl: {
    title: 'System dachu',
    covering: 'Pokrycie',
    ridge: 'Kalenica / grzbiety',
    verge: 'Skraje',
    eave: 'Okap',
    drainage: 'Odwodnienie',
    none: '—',
    notConfigured: 'Nie skonfigurowano',
    decisions: (n: number) =>
      `⚠ ${n} ${plural('pl', n, 'decyzja', 'decyzje', 'decyzji')}`,
    todo: (n: number) =>
      `${n} ${plural('pl', n, 'rzecz', 'rzeczy', 'rzeczy')} do uzupełnienia`,
    elements: (n: number) =>
      `✓ ${n} ${plural('pl', n, 'element', 'elementy', 'elementów')}`,
    ok: '✓',
    check: 'Sprawdź odwodnienie',
    addGutters: 'Dodaj rynny',
    drainageOptional: 'Rynny i rury spustowe — opcjonalne.',
    chooseSystem: 'Wybierz system rynnowy',
    edit: 'Edytuj odwodnienie',
    proposed: 'PROPONOWANY UKŁAD',
    manual: 'RĘCZNIE',
    hydraulic:
      'Rozmieszczenie elementów jest planem materiałowym. Dobór średnicy i wydajności systemu odwodnienia nie został jeszcze zweryfikowany hydraulicznie.',
    add: {
      'ridge-tape': '+ Dodaj taśmę kalenicową',
      eave: '+ Dodaj element okapu',
    },
    role: 'Element',
    name: 'Nazwa produktu',
    cover: 'Długość jednej sztuki / rolki (cm)',
    manualQty: 'albo ilość ręcznie (szt.)',
    save: 'Dodaj',
    cancel: 'Anuluj',
    remove: 'Usuń',
    invalid: 'Podaj nazwę oraz długość krycia albo ilość.',
    eaveEmpty: 'Nie skonfigurowano elementów okapu.',
  },
  en: {
    title: 'Roof system',
    covering: 'Covering',
    ridge: 'Ridge / hips',
    verge: 'Verges',
    eave: 'Eave',
    drainage: 'Drainage',
    none: '—',
    notConfigured: 'Not configured',
    decisions: (n: number) => `⚠ ${n} ${n === 1 ? 'decision' : 'decisions'}`,
    todo: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} to complete`,
    elements: (n: number) => `✓ ${n} ${n === 1 ? 'element' : 'elements'}`,
    ok: '✓',
    check: 'Check drainage',
    addGutters: 'Add gutters',
    drainageOptional: 'Gutters and downpipes — optional.',
    chooseSystem: 'Choose a gutter system',
    edit: 'Edit drainage',
    proposed: 'PROPOSED LAYOUT',
    manual: 'MANUAL',
    hydraulic:
      'Component placement is a material plan. The gutter size and capacity have not been verified hydraulically.',
    add: {
      'ridge-tape': '+ Add ridge tape',
      eave: '+ Add eave element',
    },
    role: 'Element',
    name: 'Product name',
    cover: 'Length of one piece / roll (cm)',
    manualQty: 'or a manual quantity (pcs)',
    save: 'Add',
    cancel: 'Cancel',
    remove: 'Remove',
    invalid: 'Enter a name and either a cover length or a quantity.',
    eaveEmpty: 'No eave elements configured.',
  },
};
const copyFor = (locale: string) =>
  locale.startsWith('pl') ? copy.pl : copy.en;

type SummaryState = 'ok' | 'attention' | 'none';

export function RoofSystemSummary({
  facts,
  rows,
  locale,
  onOpenDrainage,
}: {
  facts: ExportFacts;
  rows: readonly MaterialPlanRow[];
  locale: string;
  onOpenDrainage: () => void;
}) {
  const c = copyFor(locale);
  if (!facts.coverings.length && !facts.roofSystem) return null;
  const covering = rows.filter((row) => row.category === 'covering');
  const group = (subgroup: MaterialPlanRow['subgroup']) =>
    covering.filter((row) => (row.subgroup ?? 'tile') === subgroup);
  const status = (
    items: readonly MaterialPlanRow[],
  ): { state: SummaryState; text: string } => {
    if (!items.length) return { state: 'none', text: c.none };
    const open = items.filter((row) => row.partial).length;
    return open
      ? { state: 'attention', text: c.decisions(open) }
      : { state: 'ok', text: c.ok };
  };
  const eaveRows = rows.filter((row) => row.category === 'eave');
  const drainage = facts.roofSystem?.drainage;
  const drainageOpen = drainage
    ? drainage.issues.filter((issue) => issue.code !== 'stale-eave-reference')
        .length
    : 0;
  const drainageState: { state: SummaryState; text: string } =
    !drainage || drainage.status === 'disabled'
      ? { state: 'none', text: c.notConfigured }
      : drainageOpen
        ? { state: 'attention', text: c.todo(drainageOpen) }
        : { state: 'ok', text: c.ok };
  const lines: [string, { state: SummaryState; text: string }][] = [
    [c.covering, status(group('tile'))],
    [c.ridge, status([...group('ridge')])],
    [c.verge, status(group('verge'))],
    [
      c.eave,
      eaveRows.length
        ? { state: 'ok', text: c.elements(eaveRows.length) }
        : { state: 'none', text: c.none },
    ],
    [c.drainage, drainageState],
  ];
  return (
    <section className="mp-roof-system" data-testid="roof-system-summary">
      <h3>{c.title}</h3>
      <ul>
        {lines.map(([label, value]) => (
          <li key={label} data-state={value.state}>
            <span>{label}</span>
            <strong>{value.text}</strong>
          </li>
        ))}
      </ul>
      {drainageState.state === 'attention' && (
        <button type="button" onClick={onOpenDrainage}>
          {c.check}
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

export function LineComponentAdder({
  facts,
  locale,
  roles,
  empty,
}: {
  facts: ExportFacts;
  locale: string;
  roles: readonly RoofLineComponentRole[];
  /** The group has no rows: show one compact "not configured" row. */
  empty: boolean;
}) {
  const c = copyFor(locale);
  const state = useAssembly();
  const intent = facts.roofSystem?.intent;
  const existing = (intent?.lineComponents ?? []).filter((item) =>
    roles.includes(item.role as RoofLineComponentRole),
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    role: roles[0]!,
    name: '',
    cover: '',
    quantity: '',
  });
  const [invalid, setInvalid] = useState(false);
  const addLabel =
    roles.length === 1 && roles[0] === 'ridge-tape'
      ? c.add['ridge-tape']
      : c.add.eave;
  const save = () => {
    const cover = parseDecimal(draft.cover);
    const quantity = parseDecimal(draft.quantity);
    const rule: RoofLineComponentIntent['rule'] | undefined =
      cover !== null && cover > 0
        ? { kind: 'linear-effective-cover', effectiveCoverLengthMm: cover * 10 }
        : quantity !== null && quantity >= 0
          ? { kind: 'manual', quantity: Math.round(quantity) }
          : undefined;
    if (!draft.name.trim() || !rule) return setInvalid(true);
    const used = new Set((intent?.lineComponents ?? []).map((item) => item.id));
    let ordinal = used.size + 1;
    while (used.has(`line-component-${ordinal}`)) ordinal += 1;
    const id = `line-component-${ordinal}`;
    state.setRoofSystem({
      ...intent,
      lineComponents: [
        ...(intent?.lineComponents ?? []),
        { id, role: draft.role, name: draft.name.trim(), rule },
      ],
    });
    setInvalid(false);
    setOpen(false);
    setDraft({ role: roles[0]!, name: '', cover: '', quantity: '' });
  };
  const remove = (id: string) => {
    const lineComponents = (intent?.lineComponents ?? []).filter(
      (item) => item.id !== id,
    );
    state.setRoofSystem(
      lineComponents.length || intent?.drainage
        ? { ...intent, lineComponents }
        : undefined,
    );
  };
  return (
    <div className="mp-line-components" data-testid={`line-adder-${roles[0]}`}>
      {existing.length > 0 && (
        <ul className="dw-eave-list">
          {existing.map((item) => (
            <li key={item.id}>
              <span>
                {materialText(locale, `roofSystem.${item.role}`)} · {item.name}
              </span>
              <button
                type="button"
                className="dw-link is-danger"
                onClick={() => remove(item.id)}
              >
                {c.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        empty ? (
          <div className="mp-compact-row">
            <div>
              <strong>{c.notConfigured}</strong>
              <small>{c.eaveEmpty}</small>
            </div>
            <button type="button" onClick={() => setOpen(true)}>
              {addLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dw-link"
            data-testid={`line-adder-open-${roles[0]}`}
            onClick={() => setOpen(true)}
          >
            {addLabel}
          </button>
        )
      ) : (
        <div className="mp-line-form">
          {roles.length > 1 && (
            <label>
              {c.role}
              <select
                value={draft.role}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    role: event.target.value as RoofLineComponentRole,
                  })
                }
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {materialText(locale, `roofSystem.${role}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {c.name}
            <input
              value={draft.name}
              data-testid="line-component-name"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            {c.cover}
            <input
              inputMode="decimal"
              value={draft.cover}
              data-testid="line-component-cover"
              onChange={(event) =>
                setDraft({ ...draft, cover: event.target.value })
              }
            />
          </label>
          <label>
            {c.manualQty}
            <input
              inputMode="numeric"
              value={draft.quantity}
              onChange={(event) =>
                setDraft({ ...draft, quantity: event.target.value })
              }
            />
          </label>
          {invalid && <p className="dw-warning">{c.invalid}</p>}
          <div className="dw-chips">
            <button
              type="button"
              className="a-primary"
              data-testid="line-component-save"
              onClick={save}
            >
              {c.save}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              {c.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
