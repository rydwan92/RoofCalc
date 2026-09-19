import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fromMillimetres,
  toMillimetres,
  type LengthUnit,
  type ResolvedRoofFeature,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  createManualDrainageSystem,
  roofDrainageComponentTechnicalSpecSchema,
  type DrainageComponentSnapshot,
  type DrainageIntent,
  type DrainageOutletIntent,
  type DrainagePlan,
  type DrainageSystemSnapshot,
} from '@cieslacalc/roof-system-core';
import { catalogClient } from '../catalog/client';
import { formatLength, formatNumber, parseDecimal } from '../format';
import { useAssembly } from './store';
import { materialText } from './material-copy';
import {
  eaveLabel,
  freezeAutoLayout,
  initialDrainageIntent,
  withDrainage,
  type RoofSystemFacts,
} from './roof-system';
import {
  gutterLine,
  planView,
  pointAtStation,
  roundStation,
  stationAtPoint,
  type PlanPoint,
} from './drainage-view';
import './drainage.css';

const copy = {
  pl: {
    title: 'Odwodnienie',
    empty: 'Odwodnienie nie jest skonfigurowane.',
    emptyHelp:
      'RoofCalc wykryje okapy dachu, zaproponuje rynny i policzy elementy wybranego systemu. Rynny są opcjonalne — nie blokują konstrukcji ani pokrycia.',
    add: 'Dodaj rynny',
    proposed: 'PROPONOWANY UKŁAD',
    manual: 'RĘCZNIE',
    auto: 'AUTO',
    limitation:
      'Rozmieszczenie elementów jest planem materiałowym. Dobór średnicy i wydajności systemu odwodnienia nie został jeszcze zweryfikowany hydraulicznie.',
    step1: '1. Wybierz system',
    catalogue: 'Z katalogu',
    catalogueOffline: 'Katalog niedostępny — wpisz system ręcznie.',
    catalogueEmpty: 'Brak systemów rynnowych w katalogu.',
    choose: 'Wybierz',
    components: (n: number) =>
      `${n} ${n === 1 ? 'element' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'elementy' : 'elementów'}`,
    manualSystem: 'Własny system (ręcznie)',
    systemName: 'Nazwa systemu',
    gutterLengths: 'Długości rynien (m, np. 3; 4)',
    pipeLengths: 'Długości rur (m, np. 3)',
    hookSpacing: 'Maks. rozstaw haków (cm, jeśli znany)',
    hookManual: 'Rozstaw haków (ręcznie)',
    clampSpacing: 'Maks. rozstaw obejm (cm, jeśli znany)',
    useManual: 'Użyj tego systemu',
    invalidLengths: 'Podaj co najmniej jedną długość rynny i rury.',
    system: 'System',
    change: 'Zmień',
    layout: '2. Okapy z rynną',
    useAll: 'Użyj wszystkich okapów',
    eaves: (n: number, total: number) => `${n} z ${total} okapów`,
    corners: 'Narożniki',
    connected: 'połączone narożnikiem',
    separate: 'osobne rynny',
    undecided: 'do decyzji',
    outlets: '3. Odpływy i piony',
    outletsCount: (n: number) =>
      `${n} ${n === 1 ? 'odpływ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'odpływy' : 'odpływów'}`,
    confirmProposed: (n: number) => `Potwierdź proponowane odpływy (${n})`,
    proposedHelp:
      'Położenie proponowane — nie sprawdzono wydajności. Potwierdź lub przesuń na rysunku.',
    hooks: 'Haki',
    hookMax: 'Rozstaw maksymalny producenta',
    hookRoofCalc: 'RoofCalc',
    hookNoMax: 'Producent nie podaje rozstawu — wpisz go ręcznie.',
    hookIncompatible: 'NIEZGODNE z producentem',
    pieces: 'szt.',
    bom: 'Elementy do zakupu',
    bomNone: 'Brak elementów — uzupełnij dane powyżej.',
    needsDecision: 'WYMAGA USTALENIA',
    openPlan: 'Otwórz plan materiałów',
    disable: 'Wyłącz odwodnienie',
    eave: 'OKAP',
    length: 'Długość',
    gutter: 'Rynna',
    on: 'włączona',
    off: 'wyłączona',
    addOutlet: '+ Dodaj odpływ',
    outlet: 'Odpływ',
    station: 'Od początku okapu',
    height: 'Wysokość pionu',
    heightHelp: 'Od odpływu do wylotu — RoofCalc nie zna poziomu terenu.',
    elbows: 'Kolana',
    confirm: 'POTWIERDŹ',
    clamps: 'Obejmy',
    afterHeight: 'po podaniu wysokości',
    clampsFromSpacing: (spacing: string) => `wg rozstawu producenta ${spacing}`,
    remove: 'Usuń',
    back: '← Cały układ',
    pipe: 'Rura',
    commercial: 'nadwyżka handlowa',
    run: 'Rynna',
    closedRun: 'obwód zamknięty',
    legendGutter: 'rynna',
    legendOutlet: 'odpływ',
    legendProposed: 'propozycja',
    selectEave: 'Kliknij okap na rysunku, aby go edytować.',
    detected: (n: number, total: string) =>
      `RoofCalc wykrył: ${n} ${n === 1 ? 'okap' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'okapy' : 'okapów'} · ${total}`,
    advanced: 'Ustawienia wykonawcze',
    route: 'Prowadzenie rury',
    routeStraight: 'PROSTY PION',
    routeOffset: 'Z ODSADZKĄ',
    routeOther: 'Inne (ręcznie)',
    offsetLength: 'Długość rury między kolanami odsadzki',
    offsetHelp:
      'Odpływ → kolano → rura odsadzki → kolano → pion. RoofCalc nie zna ściany — wpisz długość.',
    dischargeElbow: 'Kolano wylotowe na dole',
    elbowsDerived: (n: number) => `Kolana: ${n} (z wybranego prowadzenia)`,
    offsetPipe: 'Rura odsadzki',
    purchase: 'Końcówki rynien',
    purchaseNoReuse: 'Bez przenoszenia (KONSERWATYWNIE)',
    purchaseReuse: 'Przenoś proste końcówki',
    purchaseHelp:
      'Producent nie określa, czy docięta końcówka jednej rynny może być prostym odcinkiem innej. Domyślnie RoofCalc tego nie zakłada.',
    purchaseShared: (n: number) =>
      `${n} ${n === 1 ? 'odcinek' : 'odcinki'} z końcówek innych rynien`,
    hookSourceRule:
      'PRODUCENT: haki co max. rozstaw, nie w miejscu łączenia elementów.',
    hookStrategyRule: (cm: string) =>
      `STRATEGIA ROOFCALC: równe odstępy, hak min. ${cm} od łącznika; bez reguły odległości od końca (brak w źródle).`,
    showHooks: 'Pokaż haki i łączenia',
    hideHooks: 'Ukryj haki',
  },
  en: {
    title: 'Drainage',
    empty: 'Drainage is not configured.',
    emptyHelp:
      'RoofCalc detects the roof eaves, proposes gutters and counts the components of the chosen system. Gutters are optional — they never block structure or covering.',
    add: 'Add gutters',
    proposed: 'PROPOSED LAYOUT',
    manual: 'MANUAL',
    auto: 'AUTO',
    limitation:
      'Component placement is a material plan. The gutter size and capacity have not been verified hydraulically.',
    step1: '1. Choose a system',
    catalogue: 'From the catalogue',
    catalogueOffline: 'Catalogue unavailable — enter the system manually.',
    catalogueEmpty: 'No gutter systems in the catalogue.',
    choose: 'Choose',
    components: (n: number) => `${n} components`,
    manualSystem: 'Custom system (manual)',
    systemName: 'System name',
    gutterLengths: 'Gutter lengths (m, e.g. 3; 4)',
    pipeLengths: 'Pipe lengths (m, e.g. 3)',
    hookSpacing: 'Max hook spacing (cm, if known)',
    hookManual: 'Hook spacing (manual)',
    clampSpacing: 'Max clamp spacing (cm, if known)',
    useManual: 'Use this system',
    invalidLengths: 'Enter at least one gutter and one pipe length.',
    system: 'System',
    change: 'Change',
    layout: '2. Eaves with a gutter',
    useAll: 'Use all eaves',
    eaves: (n: number, total: number) => `${n} of ${total} eaves`,
    corners: 'Corners',
    connected: 'joined with a corner',
    separate: 'separate gutters',
    undecided: 'to decide',
    outlets: '3. Outlets and downpipes',
    outletsCount: (n: number) => `${n} outlets`,
    confirmProposed: (n: number) => `Confirm proposed outlets (${n})`,
    proposedHelp:
      'Proposed position — capacity not checked. Confirm or move it on the drawing.',
    hooks: 'Hooks',
    hookMax: 'Manufacturer maximum spacing',
    hookRoofCalc: 'RoofCalc',
    hookNoMax: 'No manufacturer spacing — enter one manually.',
    hookIncompatible: 'INCOMPATIBLE with the manufacturer',
    pieces: 'pcs',
    bom: 'Components to buy',
    bomNone: 'No components yet — complete the data above.',
    needsDecision: 'NEEDS A DECISION',
    openPlan: 'Open material plan',
    disable: 'Turn drainage off',
    eave: 'EAVE',
    length: 'Length',
    gutter: 'Gutter',
    on: 'on',
    off: 'off',
    addOutlet: '+ Add outlet',
    outlet: 'Outlet',
    station: 'From the eave start',
    height: 'Downpipe height',
    heightHelp:
      'Outlet to discharge — RoofCalc does not know the ground level.',
    elbows: 'Elbows',
    confirm: 'CONFIRM',
    clamps: 'Clamps',
    afterHeight: 'once the height is known',
    clampsFromSpacing: (spacing: string) =>
      `from the manufacturer spacing ${spacing}`,
    remove: 'Remove',
    back: '← Whole layout',
    pipe: 'Pipe',
    commercial: 'commercial overage',
    run: 'Gutter',
    closedRun: 'closed loop',
    legendGutter: 'gutter',
    legendOutlet: 'outlet',
    legendProposed: 'proposal',
    selectEave: 'Click an eave on the drawing to edit it.',
    detected: (n: number, total: string) =>
      `RoofCalc detected: ${n} ${n === 1 ? 'eave' : 'eaves'} · ${total}`,
    advanced: 'Execution settings',
    route: 'Downpipe route',
    routeStraight: 'STRAIGHT',
    routeOffset: 'WITH OFFSET',
    routeOther: 'Other (manual)',
    offsetLength: 'Pipe length between the offset elbows',
    offsetHelp:
      'Outlet → elbow → offset pipe → elbow → vertical pipe. RoofCalc does not know the wall — enter the length.',
    dischargeElbow: 'Discharge elbow at the bottom',
    elbowsDerived: (n: number) => `Elbows: ${n} (from the chosen route)`,
    offsetPipe: 'Offset pipe',
    purchase: 'Gutter remainders',
    purchaseNoReuse: 'No reuse (CONSERVATIVE)',
    purchaseReuse: 'Reuse straight remainders',
    purchaseHelp:
      'The manufacturer does not say whether a cut remainder of one gutter may be a straight piece of another. By default RoofCalc does not assume it.',
    purchaseShared: (n: number) =>
      `${n} piece(s) from other gutters' remainders`,
    hookSourceRule:
      'MANUFACTURER: hooks at most every max spacing, not where elements are joined.',
    hookStrategyRule: (cm: string) =>
      `ROOFCALC STRATEGY: even spacing, hooks at least ${cm} from a connector; no end-distance rule (none in the source).`,
    showHooks: 'Show hooks and joints',
    hideHooks: 'Hide hooks',
  },
};
type Copy = (typeof copy)['pl'];
export function drainageCopy(locale: string): Copy {
  return locale.startsWith('pl') ? copy.pl : (copy.en as Copy);
}

/** Commits a length typed in the display unit; blank → undefined. */
function LengthField({
  label,
  valueMm,
  unit,
  onCommit,
  testId,
  help,
}: {
  label: string;
  valueMm?: number;
  unit: LengthUnit;
  onCommit: (valueMm: number | undefined) => void;
  testId?: string;
  help?: string;
}) {
  const [draft, setDraft] = useState<string>();
  const shown =
    draft ??
    (valueMm !== undefined
      ? String(Math.round(fromMillimetres(valueMm, unit) * 1000) / 1000)
      : '');
  const commit = () => {
    if (draft === undefined) return;
    const parsed = draft.trim() === '' ? undefined : parseDecimal(draft);
    setDraft(undefined);
    if (parsed === null) return;
    if (parsed === undefined) return onCommit(undefined);
    if (parsed > 0) onCommit(toMillimetres(parsed, unit));
  };
  return (
    <label className="dw-field">
      <span>{label}</span>
      <span className="dw-input">
        <input
          inputMode="decimal"
          value={shown}
          data-testid={testId}
          aria-invalid={draft !== undefined && parseDecimal(draft) === null}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(undefined);
          }}
        />
        <small>{unit}</small>
      </span>
      {help && <small className="dw-help">{help}</small>}
    </label>
  );
}

interface CatalogSystemOption {
  systemKey: string;
  name: string;
  productIds: string[];
}

function commonPrefix(names: readonly string[]) {
  if (!names.length) return '';
  let prefix = names[0]!;
  for (const name of names)
    while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.trim();
}

function SystemPicker({
  c,
  onChoose,
}: {
  c: Copy;
  onChoose: (system: DrainageSystemSnapshot) => void;
}) {
  const products = useQuery({
    queryKey: ['catalog', 'products', 'roof-drainage-component'],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts(
        { kind: 'roof-drainage-component', limit: 50 },
        signal,
      ),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [loading, setLoading] = useState<string>();
  const [manual, setManual] = useState({
    name: '',
    gutters: '4',
    pipes: '3',
    hook: '',
    clamp: '',
  });
  const [manualError, setManualError] = useState(false);
  const systems: CatalogSystemOption[] = useMemo(() => {
    const groups = new Map<string, CatalogSystemOption & { names: string[] }>();
    for (const item of products.data?.items ?? []) {
      const key = item.technicalPreview.drainageSystemKey;
      if (!key) continue;
      const group = groups.get(key) ?? {
        systemKey: key,
        name: '',
        productIds: [],
        names: [],
      };
      group.productIds.push(item.id);
      group.names.push(item.name);
      group.name = [
        item.manufacturer.name,
        commonPrefix(group.names),
        item.technicalPreview.nominalSystemSize,
      ]
        .filter(Boolean)
        .join(' ');
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [products.data]);
  const chooseCatalog = async (option: CatalogSystemOption) => {
    setLoading(option.systemKey);
    try {
      const details = await Promise.all(
        option.productIds.map((id) => catalogClient.getProduct(id)),
      );
      const components: DrainageComponentSnapshot[] = details.flatMap(
        (detail) => {
          const spec = roofDrainageComponentTechnicalSpecSchema.safeParse(
            detail.currentRevision.technicalSpec,
          );
          return spec.success && spec.data.systemKey === option.systemKey
            ? [
                {
                  spec: spec.data,
                  name: detail.product.name,
                  catalogRef: {
                    productId: detail.product.id,
                    technicalRevisionId: detail.currentRevision.id,
                  },
                },
              ]
            : [];
        },
      );
      const first = details[0];
      onChoose({
        systemKey: option.systemKey,
        source: 'catalog',
        name: option.name,
        ...(first ? { manufacturer: first.manufacturer.name } : {}),
        ...(components[0]
          ? { nominalSystemSize: components[0].spec.nominalSystemSize }
          : {}),
        components,
      });
    } finally {
      setLoading(undefined);
    }
  };
  const lengths = (raw: string) =>
    raw
      .split(/[;\s]+/)
      .map((part) => parseDecimal(part))
      .filter((value): value is number => value !== null && value > 0)
      .map((value) => Math.round(value * 1000));
  const useManual = () => {
    const gutters = lengths(manual.gutters);
    const pipes = lengths(manual.pipes);
    if (!gutters.length || !pipes.length) return setManualError(true);
    const hook = parseDecimal(manual.hook);
    const clamp = parseDecimal(manual.clamp);
    setManualError(false);
    onChoose(
      createManualDrainageSystem({
        name: manual.name.trim() || c.manualSystem,
        gutterLengthsMm: gutters,
        downpipeLengthsMm: pipes,
        ...(hook && hook > 0 ? { hookMaxSpacingMm: hook * 10 } : {}),
        ...(clamp && clamp > 0 ? { clampMaxSpacingMm: clamp * 10 } : {}),
      }),
    );
  };
  return (
    <div className="dw-step" data-testid="drainage-system-picker">
      <h4>{c.step1}</h4>
      <strong className="dw-subhead">{c.catalogue}</strong>
      {products.isError && <p className="dw-muted">{c.catalogueOffline}</p>}
      {products.isSuccess && !systems.length && (
        <p className="dw-muted">{c.catalogueEmpty}</p>
      )}
      <ul className="dw-systems">
        {systems.map((option) => (
          <li key={option.systemKey}>
            <div>
              <strong>{option.name}</strong>
              <small>{c.components(option.productIds.length)}</small>
            </div>
            <button
              type="button"
              className="a-primary"
              disabled={loading !== undefined}
              data-testid={`drainage-system-${option.systemKey}`}
              onClick={() => void chooseCatalog(option)}
            >
              {c.choose}
            </button>
          </li>
        ))}
      </ul>
      <details className="dw-manual" open={products.isError || undefined}>
        <summary>{c.manualSystem}</summary>
        {(
          [
            ['name', c.systemName],
            ['gutters', c.gutterLengths],
            ['pipes', c.pipeLengths],
            ['hook', c.hookSpacing],
            ['clamp', c.clampSpacing],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="dw-field">
            <span>{label}</span>
            <input
              value={manual[key]}
              data-testid={`drainage-manual-${key}`}
              inputMode={key === 'name' ? 'text' : 'decimal'}
              onChange={(event) =>
                setManual({ ...manual, [key]: event.target.value })
              }
            />
          </label>
        ))}
        {manualError && <p className="dw-warning">{c.invalidLengths}</p>}
        <button
          type="button"
          className="a-primary"
          data-testid="drainage-manual-apply"
          onClick={useManual}
        >
          {c.useManual}
        </button>
      </details>
    </div>
  );
}

function nextOutletId(outlets: readonly DrainageOutletIntent[]) {
  const used = new Set(outlets.map((outlet) => outlet.id));
  let index = outlets.length + 1;
  while (used.has(`outlet-${index}`)) index += 1;
  return `outlet-${index}`;
}

export function DrainageWorkspace({
  surface,
  facts,
  onOpenPlan,
}: {
  surface: RoofSurfaceGeometryResult;
  facts: RoofSystemFacts;
  onOpenPlan?: () => void;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const c = drainageCopy(locale);
  const state = useAssembly();
  const unit = state.unit;
  const drainage = facts.intent?.drainage;
  const plan: DrainagePlan = facts.drainage;
  const [selectedEaveId, setSelectedEaveId] = useState<string>();
  const [changingSystem, setChangingSystem] = useState(false);
  const [showHooks, setShowHooks] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<
    { outletId: string; eave: ResolvedRoofFeature } | undefined
  >(undefined);
  const view = useMemo(() => planView(surface), [surface]);
  // Rendered scale (px per drawing mm), so labels stay readable at any size.
  const [pxPerMm, setPxPerMm] = useState(0);
  const enabled = !!drainage?.enabled;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      if (box.width > 0 && box.height > 0)
        setPxPerMm(Math.min(box.width / view.width, box.height / view.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [enabled, view.width, view.height]);
  const length = (mm: number) => `${formatLength(mm, unit, locale)} ${unit}`;

  const commit = (next: DrainageIntent | undefined) =>
    state.setRoofSystem(withDrainage(facts.intent, next));

  if (!drainage?.enabled)
    return (
      <section
        className="dw-workspace dw-empty"
        data-testid="drainage-workspace"
      >
        <h2>{c.title}</h2>
        <p>{c.empty}</p>
        {facts.eaves.length > 0 && (
          <p data-testid="drainage-detected">
            <strong>
              {c.detected(
                facts.eaves.length,
                length(
                  facts.eaves.reduce((sum, eave) => sum + eave.lengthMm, 0),
                ),
              )}
            </strong>
          </p>
        )}
        <p className="dw-muted">{c.emptyHelp}</p>
        <button
          type="button"
          className="a-primary"
          data-testid="drainage-enable"
          onClick={() =>
            commit(
              drainage
                ? { ...drainage, enabled: true }
                : initialDrainageIntent(),
            )
          }
        >
          {c.add}
        </button>
      </section>
    );

  const manualIntent = () => freezeAutoLayout(drainage, plan);
  const eaveById = new Map(facts.eaves.map((eave) => [eave.id, eave]));
  const lines = new Map(
    facts.eaves.map((eave) => [eave.id, gutterLine(eave, view.gutterOffsetMm)]),
  );
  const guttered = new Set(plan.gutteredEaveIds);
  const runOf = (eaveId: string) =>
    plan.runs.find((run) => run.segments.some((s) => s.eaveId === eaveId));
  const selectedRun = selectedEaveId ? runOf(selectedEaveId) : undefined;
  const outlets = drainage.outlets ?? [];
  const updateOutlet = (id: string, patch: Partial<DrainageOutletIntent>) =>
    commit({
      ...drainage,
      outlets: outlets.map((outlet) =>
        outlet.id === id ? { ...outlet, ...patch } : outlet,
      ),
    });
  const toggleEave = (eaveId: string) => {
    const base = manualIntent();
    const list = base.gutteredEaveIds ?? [];
    commit({
      ...base,
      gutteredEaveIds: list.includes(eaveId)
        ? list.filter((id) => id !== eaveId)
        : [...list, eaveId],
    });
  };
  const setCorner = (
    endingEaveId: string,
    startingEaveId: string,
    connection: 'connected' | 'separate',
  ) => {
    const base = manualIntent();
    commit({
      ...base,
      corners: [
        ...(base.corners ?? []).filter(
          (item) =>
            !(
              item.endingEaveId === endingEaveId &&
              item.startingEaveId === startingEaveId
            ),
        ),
        { endingEaveId, startingEaveId, connection },
      ],
    });
  };
  const addOutlet = (eaveId: string, station = 0.5) =>
    commit({
      ...drainage,
      outlets: [...outlets, { id: nextOutletId(outlets), eaveId, station }],
    });
  const confirmProposed = () => {
    let next = [...outlets];
    for (const proposed of plan.proposedOutlets)
      next = [
        ...next,
        {
          id: nextOutletId(next),
          eaveId: proposed.eaveId,
          station: roundStation(
            proposed.station,
            eaveById.get(proposed.eaveId)?.lengthMm ?? 1,
          ),
        },
      ];
    commit({ ...drainage, outlets: next });
  };

  // Direct manipulation: one transaction per drag, only the end in history.
  const svgPoint = (event: PointerEvent): PlanPoint | undefined => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };
  const startDrag = (event: PointerEvent, outlet: DrainageOutletIntent) => {
    const eave = eaveById.get(outlet.eaveId);
    if (!eave) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { outletId: outlet.id, eave };
    setSelectedEaveId(outlet.eaveId);
    state.beginTransaction();
  };
  const moveDrag = (event: PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const point = svgPoint(event);
    const line = lines.get(active.eave.id);
    if (!point || !line) return;
    const station = roundStation(
      stationAtPoint(line, point),
      active.eave.lengthMm,
    );
    const current = useAssembly.getState().projectDocument.project.roofSystem;
    const currentDrainage = current?.drainage;
    if (!currentDrainage) return;
    state.previewRoofSystem(
      withDrainage(current, {
        ...currentDrainage,
        outlets: (currentDrainage.outlets ?? []).map((outlet) =>
          outlet.id === active.outletId ? { ...outlet, station } : outlet,
        ),
      }),
    );
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = undefined;
    state.commitTransaction();
  };

  const labelScale =
    pxPerMm > 0 ? 12 / pxPerMm : Math.max(view.width, view.height) / 48;
  // Strokes in drawing millimetres, scaled to the roof so they read the same
  // on any building size.
  const stroke = Math.max(view.width, view.height) / 450;
  const system = drainage.system;
  const selectedEave = selectedEaveId
    ? eaveById.get(selectedEaveId)
    : undefined;
  const hookRow = plan.bom.find((row) => row.role === 'gutter-hook');
  const clampSpacing = system?.components.find(
    (item) => item.spec.role === 'downpipe-clamp',
  )?.spec.maxSpacingMm;

  const canvas = (
    <div className="dw-canvas">
      <svg
        ref={svgRef}
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
        role="img"
        aria-label={c.title}
        data-testid="drainage-plan-view"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          if (!drag.current) return;
          drag.current = undefined;
          state.cancelTransaction();
        }}
        onClick={() => setSelectedEaveId(undefined)}
      >
        {view.planes.map((plane) => (
          <polygon
            key={plane.roofPlaneId}
            className="dw-plane"
            strokeWidth={stroke}
            points={plane.points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}
        {facts.eaves.map((eave) => {
          const line = lines.get(eave.id)!;
          const on = guttered.has(eave.id);
          const inSelectedRun = selectedRun?.segments.some(
            (segment) => segment.eaveId === eave.id,
          );
          const mid = pointAtStation(line, 0.5);
          const out = eave.outwardPlan ?? { x: 0, y: 0 };
          return (
            <g
              key={eave.id}
              className={`dw-eave${on ? ' is-on' : ''}${
                selectedEaveId === eave.id ? ' is-selected' : ''
              }${inSelectedRun ? ' is-run' : ''}`}
              data-testid={`drainage-eave-${eave.ordinal}`}
              data-guttered={on}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedEaveId(eave.id);
              }}
            >
              <line
                className="dw-eave-hit"
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                strokeWidth={view.gutterOffsetMm * 3}
              />
              <line
                className="dw-gutter"
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                strokeWidth={view.gutterOffsetMm * 0.8}
                strokeDasharray={on ? undefined : `${stroke * 8} ${stroke * 5}`}
              />
              {showHooks &&
                on &&
                (() => {
                  const segment = plan.runs
                    .flatMap((run) => run.segments)
                    .find((item) => item.eaveId === eave.id);
                  if (!segment) return null;
                  return (
                    <g data-testid="drainage-hook-markers">
                      {segment.hookPositionsMm.map((position, index) => {
                        const at = pointAtStation(
                          line,
                          position / eave.lengthMm,
                        );
                        return (
                          <circle
                            key={index}
                            className="dw-hook"
                            data-testid="drainage-hook-marker"
                            cx={at.x}
                            cy={at.y}
                            r={view.gutterOffsetMm * 0.25}
                          />
                        );
                      })}
                      {segment.jointStationsMm.map((station, index) => {
                        const at = pointAtStation(
                          line,
                          station / eave.lengthMm,
                        );
                        return (
                          <rect
                            key={`joint:${index}`}
                            className="dw-joint"
                            data-testid="drainage-joint-marker"
                            x={at.x - view.gutterOffsetMm * 0.4}
                            y={at.y - view.gutterOffsetMm * 0.4}
                            width={view.gutterOffsetMm * 0.8}
                            height={view.gutterOffsetMm * 0.8}
                          />
                        );
                      })}
                    </g>
                  );
                })()}
              <text
                className="dw-label"
                x={mid.x + out.x * view.gutterOffsetMm * 1.8}
                y={mid.y - out.y * view.gutterOffsetMm * 1.8}
                fontSize={labelScale}
                textAnchor={
                  out.x < -0.5 ? 'end' : out.x > 0.5 ? 'start' : 'middle'
                }
                dominantBaseline="middle"
              >
                {eaveLabel(eave)} · {length(eave.lengthMm)}
              </text>
            </g>
          );
        })}
        {plan.corners
          .filter(
            (corner) =>
              corner.source !== 'none' || corner.state === 'undecided',
          )
          .map((corner) => {
            const ending = lines.get(corner.endingEaveId);
            if (!ending) return null;
            const at = ending.to;
            const next: 'connected' | 'separate' =
              corner.state === 'connected' ? 'separate' : 'connected';
            return (
              <g
                key={corner.id}
                className={`dw-corner is-${corner.state}`}
                data-testid="drainage-corner"
                data-state={corner.state}
                onClick={(event) => {
                  event.stopPropagation();
                  setCorner(corner.endingEaveId, corner.startingEaveId, next);
                }}
              >
                <rect
                  strokeWidth={stroke * 1.5}
                  x={at.x - view.gutterOffsetMm}
                  y={at.y - view.gutterOffsetMm}
                  width={view.gutterOffsetMm * 2}
                  height={view.gutterOffsetMm * 2}
                  rx={view.gutterOffsetMm * 0.4}
                />
                {corner.state === 'undecided' && (
                  <text
                    x={at.x}
                    y={at.y}
                    fontSize={labelScale}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    ?
                  </text>
                )}
              </g>
            );
          })}
        {plan.proposedOutlets.map((proposed, index) => {
          const line = lines.get(proposed.eaveId);
          if (!line) return null;
          const at = pointAtStation(line, proposed.station);
          return (
            <circle
              key={`proposed:${index}`}
              className="dw-outlet is-proposed"
              data-testid="drainage-proposed-outlet"
              cx={at.x}
              cy={at.y}
              r={view.gutterOffsetMm * 1.1}
              strokeWidth={stroke * 2}
              strokeDasharray={`${stroke * 4} ${stroke * 3}`}
            />
          );
        })}
        {plan.outlets.map((resolved, index) => {
          const outlet = outlets.find((item) => item.id === resolved.id);
          const line = lines.get(resolved.eaveId);
          const eave = eaveById.get(resolved.eaveId);
          if (!outlet || !line || !eave) return null;
          const at = pointAtStation(line, resolved.station);
          const out = eave.outwardPlan ?? { x: 0, y: 0 };
          // One text line below the outlet, so it never covers the eave label.
          const labelAt = {
            x: at.x + out.x * view.gutterOffsetMm * 2,
            y: at.y - out.y * view.gutterOffsetMm * 2 + labelScale * 1.2,
          };
          return (
            <g
              key={resolved.id}
              className="dw-outlet-group"
              data-testid="drainage-outlet"
            >
              <line
                className="dw-downpipe"
                x1={at.x}
                y1={at.y}
                x2={labelAt.x}
                y2={labelAt.y}
                strokeWidth={view.gutterOffsetMm * 0.35}
              />
              <circle
                className="dw-outlet"
                cx={at.x}
                cy={at.y}
                r={view.gutterOffsetMm * 1.1}
                strokeWidth={stroke * 2.5}
                onPointerDown={(event) => startDrag(event, outlet)}
                onClick={(event) => event.stopPropagation()}
              />
              <text
                className="dw-label is-pipe"
                x={labelAt.x}
                y={labelAt.y}
                fontSize={labelScale * 0.9}
                textAnchor={
                  out.x < -0.5 ? 'end' : out.x > 0.5 ? 'start' : 'middle'
                }
                dominantBaseline="middle"
              >
                ↓R{index + 1}
                {resolved.downpipe.heightMm !== undefined
                  ? ` ${length(resolved.downpipe.heightMm)}`
                  : ' ?'}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="dw-legend" aria-hidden="true">
        <span className="is-gutter">{c.legendGutter}</span>
        <span className="is-outlet">{c.legendOutlet}</span>
        <span className="is-proposed">{c.legendProposed}</span>
      </div>
    </div>
  );

  const eaveInspector = selectedEave && (
    <div className="dw-step" data-testid="drainage-eave-inspector">
      <button
        type="button"
        className="dw-link"
        onClick={() => setSelectedEaveId(undefined)}
      >
        {c.back}
      </button>
      <h4>
        {c.eave} {eaveLabel(selectedEave)}
      </h4>
      <dl className="dw-facts">
        <div>
          <dt>{c.length}</dt>
          <dd>{length(selectedEave.lengthMm)}</dd>
        </div>
        <div>
          <dt>{c.gutter}</dt>
          <dd>
            <label className="dw-toggle">
              <input
                type="checkbox"
                checked={guttered.has(selectedEave.id)}
                data-testid="drainage-eave-toggle"
                onChange={() => toggleEave(selectedEave.id)}
              />
              {guttered.has(selectedEave.id) ? c.on : c.off}
            </label>
          </dd>
        </div>
        {system && (
          <div>
            <dt>{c.system}</dt>
            <dd>{system.name}</dd>
          </div>
        )}
      </dl>
      {guttered.has(selectedEave.id) && (
        <>
          <ul className="dw-outlets">
            {outlets
              .filter((outlet) => outlet.eaveId === selectedEave.id)
              .map((outlet) => {
                const resolved = plan.outlets.find(
                  (item) => item.id === outlet.id,
                );
                const pipe = resolved?.downpipe;
                return (
                  <li key={outlet.id} data-testid="drainage-outlet-editor">
                    <strong>{c.outlet}</strong>
                    <LengthField
                      label={c.station}
                      unit={unit}
                      valueMm={outlet.station * selectedEave.lengthMm}
                      testId="drainage-outlet-station"
                      onCommit={(value) =>
                        value !== undefined &&
                        updateOutlet(outlet.id, {
                          station: roundStation(
                            value / selectedEave.lengthMm,
                            selectedEave.lengthMm,
                          ),
                        })
                      }
                    />
                    <LengthField
                      label={c.height}
                      unit={unit}
                      valueMm={outlet.downpipeHeightMm}
                      help={c.heightHelp}
                      testId="drainage-downpipe-height"
                      onCommit={(value) =>
                        updateOutlet(outlet.id, {
                          downpipeHeightMm: value,
                        })
                      }
                    />
                    {pipe?.assembly && (
                      <p className="dw-muted" data-testid="drainage-pipe-plan">
                        {c.pipe}:{' '}
                        {pipe.assembly.sectionsMm
                          .map(
                            (mm) => `${formatNumber(mm / 1000, locale, 2)} m`,
                          )
                          .join(' + ')}
                        {pipe.assembly.commercialOverageMm > 0 &&
                          ` · ${c.commercial} ${formatNumber(
                            pipe.assembly.commercialOverageMm / 1000,
                            locale,
                            2,
                          )} m`}
                      </p>
                    )}
                    <div className="dw-field" data-testid="drainage-route">
                      <span>{c.route}</span>
                      <div className="dw-chips" role="group">
                        {(['straight', 'offset', 'other'] as const).map(
                          (kind) => {
                            const current = outlet.route?.kind ?? 'other';
                            return (
                              <button
                                key={kind}
                                type="button"
                                aria-pressed={current === kind}
                                data-testid={`drainage-route-${kind}`}
                                onClick={() =>
                                  updateOutlet(outlet.id, {
                                    route:
                                      kind === 'straight'
                                        ? {
                                            kind,
                                            dischargeElbow:
                                              outlet.route?.dischargeElbow,
                                          }
                                        : kind === 'offset'
                                          ? {
                                              kind,
                                              offsetPipeLengthMm:
                                                outlet.route?.kind === 'offset'
                                                  ? outlet.route
                                                      .offsetPipeLengthMm
                                                  : 300,
                                              dischargeElbow:
                                                outlet.route?.dischargeElbow,
                                            }
                                          : undefined,
                                  })
                                }
                              >
                                {kind === 'straight'
                                  ? c.routeStraight
                                  : kind === 'offset'
                                    ? c.routeOffset
                                    : c.routeOther}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                    {outlet.route?.kind === 'offset' && (
                      <>
                        <LengthField
                          label={c.offsetLength}
                          unit={unit}
                          valueMm={outlet.route.offsetPipeLengthMm}
                          help={c.offsetHelp}
                          testId="drainage-offset-length"
                          onCommit={(value) =>
                            value !== undefined &&
                            outlet.route?.kind === 'offset' &&
                            updateOutlet(outlet.id, {
                              route: {
                                ...outlet.route,
                                offsetPipeLengthMm: value,
                              },
                            })
                          }
                        />
                        {pipe?.offsetAssembly && (
                          <p className="dw-muted">
                            {c.offsetPipe}:{' '}
                            {pipe.offsetAssembly.sectionsMm
                              .map(
                                (mm) =>
                                  `${formatNumber(mm / 1000, locale, 2)} m`,
                              )
                              .join(' + ')}
                          </p>
                        )}
                      </>
                    )}
                    {outlet.route ? (
                      <>
                        <label className="dw-toggle">
                          <input
                            type="checkbox"
                            checked={!!outlet.route.dischargeElbow}
                            data-testid="drainage-discharge-elbow"
                            onChange={(event) =>
                              outlet.route &&
                              updateOutlet(outlet.id, {
                                route: {
                                  ...outlet.route,
                                  dischargeElbow: event.target.checked,
                                },
                              })
                            }
                          />
                          {c.dischargeElbow}
                        </label>
                        <small data-testid="drainage-elbows-derived">
                          {c.elbowsDerived(pipe?.elbows ?? 0)}
                        </small>
                      </>
                    ) : (
                      <div className="dw-field">
                        <span>
                          {c.elbows}
                          {outlet.elbowCount === undefined && (
                            <em className="dw-badge is-warning">{c.confirm}</em>
                          )}
                        </span>
                        <div className="dw-chips" role="group">
                          {[0, 1, 2, 3].map((count) => (
                            <button
                              key={count}
                              type="button"
                              aria-pressed={outlet.elbowCount === count}
                              data-testid={`drainage-elbows-${count}`}
                              onClick={() =>
                                updateOutlet(outlet.id, { elbowCount: count })
                              }
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="dw-field">
                      <span>{c.clamps}</span>
                      {clampSpacing && outlet.clampCount === undefined ? (
                        <small data-testid="drainage-clamp-summary">
                          {pipe?.clamps !== undefined
                            ? `${pipe.clamps} ${c.pieces} · `
                            : `${c.afterHeight} · `}
                          {c.clampsFromSpacing(length(clampSpacing))}
                        </small>
                      ) : (
                        <input
                          inputMode="numeric"
                          defaultValue={outlet.clampCount ?? ''}
                          data-testid="drainage-clamp-count"
                          onBlur={(event) => {
                            const value = parseDecimal(event.target.value);
                            updateOutlet(outlet.id, {
                              clampCount:
                                value !== null && value >= 0
                                  ? Math.round(value)
                                  : undefined,
                            });
                          }}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="dw-link is-danger"
                      onClick={() =>
                        commit({
                          ...drainage,
                          outlets: outlets.filter(
                            (item) => item.id !== outlet.id,
                          ),
                        })
                      }
                    >
                      {c.remove}
                    </button>
                  </li>
                );
              })}
          </ul>
          <button
            type="button"
            className="a-primary"
            data-testid="drainage-add-outlet"
            onClick={() => addOutlet(selectedEave.id)}
          >
            {c.addOutlet}
          </button>
        </>
      )}
    </div>
  );

  const overview = system && (
    <>
      <div className="dw-step">
        <div className="dw-row">
          <div>
            <small>{c.system}</small>
            <strong data-testid="drainage-system-name">{system.name}</strong>
          </div>
          <button type="button" onClick={() => setChangingSystem(true)}>
            {c.change}
          </button>
        </div>
      </div>
      <div className="dw-step">
        <div className="dw-row">
          <h4>{c.layout}</h4>
          <span
            className={`dw-badge${drainage.mode === 'auto' ? ' is-proposed' : ''}`}
            data-testid="drainage-mode"
          >
            {drainage.mode === 'auto' ? c.proposed : c.manual}
          </span>
        </div>
        <p className="dw-muted">
          {c.eaves(plan.gutteredEaveIds.length, facts.eaves.length)}
        </p>
        <ul className="dw-eave-list">
          {facts.eaves.map((eave) => (
            <li key={eave.id}>
              <label className="dw-toggle">
                <input
                  type="checkbox"
                  checked={guttered.has(eave.id)}
                  data-testid={`drainage-eave-check-${eave.ordinal}`}
                  aria-label={`${eaveLabel(eave)} · ${c.gutter}`}
                  onChange={() => toggleEave(eave.id)}
                />
                <button
                  type="button"
                  className="dw-link"
                  data-testid={`drainage-eave-open-${eave.ordinal}`}
                  onClick={() => setSelectedEaveId(eave.id)}
                >
                  {eaveLabel(eave)} · {length(eave.lengthMm)}
                </button>
              </label>
            </li>
          ))}
        </ul>
        {drainage.mode === 'manual' && (
          <button
            type="button"
            data-testid="drainage-use-all"
            onClick={() =>
              commit({
                ...drainage,
                mode: 'auto',
                gutteredEaveIds: undefined,
                corners: undefined,
              })
            }
          >
            {c.useAll}
          </button>
        )}
        {plan.corners.some(
          (corner) => corner.source !== 'none' || corner.state === 'undecided',
        ) && (
          <>
            <strong className="dw-subhead">{c.corners}</strong>
            <ul className="dw-eave-list">
              {plan.corners
                .filter(
                  (corner) =>
                    corner.source !== 'none' || corner.state === 'undecided',
                )
                .map((corner) => {
                  const a = eaveById.get(corner.endingEaveId);
                  const b = eaveById.get(corner.startingEaveId);
                  return (
                    <li key={corner.id}>
                      <span>
                        {a && eaveLabel(a)}–{b && eaveLabel(b)}
                      </span>
                      <select
                        value={corner.state}
                        data-testid="drainage-corner-select"
                        onChange={(event) =>
                          setCorner(
                            corner.endingEaveId,
                            corner.startingEaveId,
                            event.target.value as 'connected' | 'separate',
                          )
                        }
                      >
                        {corner.state === 'undecided' && (
                          <option value="undecided">{c.undecided}</option>
                        )}
                        <option value="connected">{c.connected}</option>
                        <option value="separate">{c.separate}</option>
                      </select>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </div>
      <div className="dw-step">
        <h4>{c.outlets}</h4>
        <p className="dw-muted">{c.outletsCount(plan.outlets.length)}</p>
        {plan.proposedOutlets.length > 0 && (
          <>
            <p className="dw-muted">{c.proposedHelp}</p>
            <button
              type="button"
              className="a-primary"
              data-testid="drainage-confirm-proposed"
              onClick={confirmProposed}
            >
              {c.confirmProposed(plan.proposedOutlets.length)}
            </button>
          </>
        )}
        {!plan.proposedOutlets.length && (
          <p className="dw-muted">{c.selectEave}</p>
        )}
      </div>
      <div className="dw-step" data-testid="drainage-hooks">
        <div className="dw-row">
          <h4>{c.hooks}</h4>
          <div className="dw-chips" role="group">
            {(['auto', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={plan.hooks.mode === mode}
                data-testid={`drainage-hooks-${mode}`}
                onClick={() =>
                  commit({
                    ...drainage,
                    hookSpacing:
                      mode === 'auto'
                        ? { mode: 'auto' }
                        : {
                            mode: 'manual',
                            spacingMm: plan.hooks.appliedSpacingMm ?? 500,
                          },
                  })
                }
              >
                {mode === 'auto' ? c.auto : c.manual}
              </button>
            ))}
          </div>
        </div>
        <dl className="dw-facts">
          <div>
            <dt>{c.hookMax}</dt>
            <dd>
              {plan.hooks.maxSpacingMm !== undefined
                ? length(plan.hooks.maxSpacingMm)
                : '—'}
            </dd>
          </div>
          {plan.hooks.actualIntervalMm !== undefined && (
            <div>
              <dt>{c.hookRoofCalc}</dt>
              <dd data-testid="drainage-hook-spacing">
                {length(plan.hooks.actualIntervalMm)}
              </dd>
            </div>
          )}
          {hookRow?.quantity !== undefined && (
            <div>
              <dt>{materialText(locale, 'drainage.gutter-hook')}</dt>
              <dd data-testid="drainage-hook-count">
                {hookRow.quantity} {c.pieces}
              </dd>
            </div>
          )}
        </dl>
        {plan.hooks.mode === 'manual' && (
          <LengthField
            label={c.hookManual}
            unit={unit}
            valueMm={
              drainage.hookSpacing?.mode === 'manual'
                ? drainage.hookSpacing.spacingMm
                : undefined
            }
            testId="drainage-hook-manual"
            onCommit={(value) =>
              value !== undefined &&
              commit({
                ...drainage,
                hookSpacing: { mode: 'manual', spacingMm: value },
              })
            }
          />
        )}
        {plan.hooks.avoidsJoints && (
          <details className="dw-advanced">
            <summary>{c.advanced}</summary>
            <div className="dw-rule" data-testid="drainage-hook-rules">
              <small>{c.hookSourceRule}</small>
              <small>
                {c.hookStrategyRule(length(plan.hooks.jointClearanceMm ?? 0))}
              </small>
            </div>
          </details>
        )}
        <button
          type="button"
          aria-pressed={showHooks}
          data-testid="drainage-show-hooks"
          onClick={() => setShowHooks(!showHooks)}
        >
          {showHooks ? c.hideHooks : c.showHooks}
        </button>
        {plan.hooks.status === 'incompatible' && (
          <p className="dw-warning" data-testid="drainage-hook-incompatible">
            {c.hookIncompatible}
          </p>
        )}
        {plan.hooks.maxSpacingMm === undefined &&
          plan.hooks.mode === 'auto' && (
            <p className="dw-warning">{c.hookNoMax}</p>
          )}
      </div>
    </>
  );

  const policy = drainage.purchasePolicy ?? 'no-reuse-between-runs';
  const purchasePanel = system && plan.gutterPurchase && (
    <details
      className="dw-step dw-advanced"
      data-testid="drainage-purchase-policy"
    >
      <summary>
        {c.advanced} · {c.purchase}:{' '}
        {policy === 'no-reuse-between-runs'
          ? c.purchaseNoReuse
          : c.purchaseReuse}
      </summary>
      <div className="dw-chips" role="group">
        {(['no-reuse-between-runs', 'reuse-straight-remainders'] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={policy === value}
              data-testid={`drainage-policy-${value}`}
              onClick={() =>
                commit({
                  ...drainage,
                  purchasePolicy:
                    value === 'no-reuse-between-runs' ? undefined : value,
                })
              }
            >
              {value === 'no-reuse-between-runs'
                ? c.purchaseNoReuse
                : c.purchaseReuse}
            </button>
          ),
        )}
      </div>
      <p className="dw-muted">{c.purchaseHelp}</p>
      {policy === 'reuse-straight-remainders' &&
        plan.gutterPurchase.sharedStockPieces > 0 && (
          <p className="dw-muted" data-testid="drainage-shared-pieces">
            {c.purchaseShared(plan.gutterPurchase.sharedStockPieces)}
          </p>
        )}
    </details>
  );

  const bom = system && (
    <div className="dw-step" data-testid="drainage-bom">
      <h4>{c.bom}</h4>
      {!plan.bom.length && <p className="dw-muted">{c.bomNone}</p>}
      <ul className="dw-bom">
        {plan.bom.map((row) => (
          <li key={row.key} data-status={row.status}>
            <span>
              {materialText(
                locale,
                row.hand && row.hand !== 'universal'
                  ? `drainage.${row.role}.${row.hand}`
                  : `drainage.${row.role}`,
              )}
              {row.lengthMm !== undefined &&
                ` ${formatNumber(row.lengthMm / 1000, locale, 2)} m`}
            </span>
            <strong>
              {row.quantity !== undefined && row.status !== 'requires-decision'
                ? `${row.quantity} ${c.pieces}`
                : c.needsDecision}
            </strong>
          </li>
        ))}
      </ul>
      {onOpenPlan && (
        <button type="button" onClick={onOpenPlan}>
          {c.openPlan}
        </button>
      )}
    </div>
  );

  return (
    <section className="dw-workspace" data-testid="drainage-workspace">
      <header className="dw-header">
        <div>
          <h2>{c.title}</h2>
          <p className="dw-limitation" data-testid="drainage-limitation">
            {c.limitation}
          </p>
        </div>
        <button
          type="button"
          className="dw-link"
          data-testid="drainage-disable"
          onClick={() => commit({ ...drainage, enabled: false })}
        >
          {c.disable}
        </button>
      </header>
      <div className="dw-body">
        {canvas}
        <aside className="dw-inspector">
          {!system || changingSystem ? (
            <SystemPicker
              c={c}
              onChoose={(next) => {
                setChangingSystem(false);
                commit({ ...drainage, system: next });
              }}
            />
          ) : selectedEave ? (
            eaveInspector
          ) : (
            overview
          )}
          {system && !changingSystem && !selectedEave && purchasePanel}
          {system && !changingSystem && bom}
        </aside>
      </div>
    </section>
  );
}
