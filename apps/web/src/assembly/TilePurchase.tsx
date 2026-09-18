import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  CommercialPackaging,
  CoveringAssignmentSpec,
  RoofTileAccessoryRole,
  RoofTileAccessorySelection,
  RoofTileLayoutResult,
  RoofTilePurchaseDecision,
} from '@cieslacalc/covering-core';
import { roofTileAccessoryTechnicalSpecSchema } from '@cieslacalc/covering-core';
import type { AccessoryRequirement } from '@cieslacalc/tile-procurement';
import { catalogClient } from '../catalog/client';
import { parseDecimal } from '../format';
import { useAssembly } from './store';
import { materialText } from './material-copy';
import {
  defaultTilePurchaseDecision,
  type TilePurchasePlan,
} from './tile-purchase';
import type { TileHighlight } from './workbench';
import './tile-purchase.css';

const RESERVE_PRESETS = [0, 200, 500] as const;

const copy = {
  pl: {
    title: 'Plan zakupu dachówki',
    notPrepared: 'Plan zakupu nie jest przygotowany.',
    fromLayout: (total: number, full: number, cut: number) =>
      `Układ dachówek: ${total} pozycji — ${full} pełnych, ${cut} docinanych.`,
    policyHelp:
      'RoofCalc przyjmuje osobną dachówkę dla każdej pozycji docinanej.',
    prepare: 'Przygotuj plan zakupu',
    remove: 'Usuń plan zakupu',
    full: 'pełne',
    fullLabel: 'Pełne',
    cut: 'docinane',
    physical: 'Wymaganie fizyczne',
    fromGeometry: 'Wymaganie z geometrii',
    reserve: 'Zapas użytkownika',
    reserveCustom: 'Inny (%)',
    total: 'Razem',
    toBuy: 'Do zakupu',
    saleUnit: 'Jednostka sprzedaży',
    pieces: 'Sztuki',
    packs: (n: number) => `Minipakiety po ${n} szt.`,
    pallets: (n: number) => `Palety po ${n} szt.`,
    customPack: 'Własne opakowanie',
    piecesPerPack: 'Sztuk w opakowaniu',
    unitsOf: (units: number, per: number, unit: string) =>
      `${units} ${unit} × ${per} szt.`,
    packWord: 'opak.',
    palletWord: 'pal.',
    overage: 'Nadwyżka handlowa',
    overageHelp:
      'Sztuki kupione tylko dlatego, że produkt sprzedawany jest w całych opakowaniach. To nie jest odpad.',
    packagingSource: 'Dane opakowania z katalogu',
    packagingManual: 'Opakowanie wpisane ręcznie',
    noPackaging:
      'Źródło produktu nie podaje opakowania — sprzedaż na sztuki lub wpisz własne opakowanie.',
    loadPackaging: 'Pobierz opakowanie z katalogu',
    details: 'Szczegóły planu',
    breakdown: 'Klasyfikacja pozycji',
    edge: 'Docinane przy krawędzi',
    opening: 'Docinane przy otworach',
    split: 'Podzielone przez otwór',
    fragments: (n: number) => `${n} fragmentów`,
    policy: 'Docinki',
    policyNoReuse: 'Bez ponownego wykorzystania',
    check: 'Kontrola producenta',
    checkRoofCalc: 'RoofCalc',
    checkMaker: 'Producent',
    within: '✓ zgodne',
    outside: '⚠ poza zakresem producenta',
    checkHelp:
      'Porównanie, nie obliczenie: ilość fizyczna wynika z układu dachówek i nie jest do niej dopasowywana.',
    accessories: 'Akcesoria systemowe',
    noAccessoriesNeeded:
      'Ten dach nie wymaga akcesoriów kalenicy ani szczytów.',
    manualTile:
      'Akcesoria systemowe są dostępne dla dachówek wybranych z katalogu.',
    choose: 'Wybierz element',
    noCandidates: 'Katalog nie zawiera zgodnego elementu dla tej roli.',
    none: '— brak —',
    catalogueOffline: 'Katalog niedostępny — akcesoria można dobrać później.',
    confirmPerCourse: 'Przyjmij 1 szt. na rząd',
    perCourseConfirmed: 'Przyjęto 1 szt. na rząd (decyzja użytkownika)',
    showOnRoof: 'Pokaż na dachu',
    status: {
      exact: 'DOKŁADNY',
      conservative: 'KONSERWATYWNY',
      partial: 'CZĘŚCIOWY',
      unresolved: 'WYMAGA DANYCH',
    },
    accessoryStatus: {
      resolved: 'ROZWIĄZANE',
      'declared-approximate': 'WG PRODUCENTA (OK.)',
      'requires-decision': 'WYMAGA USTALENIA',
    },
    pcs: 'szt.',
  },
  en: {
    title: 'Roof tile purchase plan',
    notPrepared: 'No purchase plan prepared yet.',
    fromLayout: (total: number, full: number, cut: number) =>
      `Tile layout: ${total} positions — ${full} full, ${cut} cut.`,
    policyHelp: 'RoofCalc reserves a separate tile for every cut position.',
    prepare: 'Prepare purchase plan',
    remove: 'Remove purchase plan',
    full: 'full',
    fullLabel: 'Full',
    cut: 'cut',
    physical: 'Physical requirement',
    fromGeometry: 'Requirement from geometry',
    reserve: 'User reserve',
    reserveCustom: 'Other (%)',
    total: 'Total',
    toBuy: 'To buy',
    saleUnit: 'Sale unit',
    pieces: 'Pieces',
    packs: (n: number) => `Minipacks of ${n}`,
    pallets: (n: number) => `Pallets of ${n}`,
    customPack: 'Custom pack',
    piecesPerPack: 'Pieces per pack',
    unitsOf: (units: number, per: number, unit: string) =>
      `${units} ${unit} × ${per} pcs`,
    packWord: 'packs',
    palletWord: 'pallets',
    overage: 'Commercial overage',
    overageHelp:
      'Pieces bought only because the product is sold in whole packs. This is not waste.',
    packagingSource: 'Packaging from the catalogue',
    packagingManual: 'Packaging entered manually',
    noPackaging:
      'The product source states no packaging — buy per piece or enter a custom pack.',
    loadPackaging: 'Load packaging from the catalogue',
    details: 'Plan details',
    breakdown: 'Position classification',
    edge: 'Cut at roof edges',
    opening: 'Cut at openings',
    split: 'Split by an opening',
    fragments: (n: number) => `${n} fragments`,
    policy: 'Offcuts',
    policyNoReuse: 'Not reused',
    check: 'Manufacturer check',
    checkRoofCalc: 'RoofCalc',
    checkMaker: 'Manufacturer',
    within: '✓ consistent',
    outside: '⚠ outside the manufacturer range',
    checkHelp:
      'A comparison, not a calculation: the physical count comes from the tile layout and is never fitted to it.',
    accessories: 'System accessories',
    noAccessoriesNeeded: 'This roof needs no ridge or verge accessories.',
    manualTile: 'System accessories are available for catalogue tiles.',
    choose: 'Choose element',
    noCandidates: 'The catalogue has no compatible element for this role.',
    none: '— none —',
    catalogueOffline:
      'Catalogue unavailable — accessories can be chosen later.',
    confirmPerCourse: 'Accept 1 per course',
    perCourseConfirmed: 'Accepted 1 per course (user decision)',
    showOnRoof: 'Show on roof',
    status: {
      exact: 'EXACT',
      conservative: 'CONSERVATIVE',
      partial: 'PARTIAL',
      unresolved: 'NEEDS DATA',
    },
    accessoryStatus: {
      resolved: 'RESOLVED',
      'declared-approximate': 'MANUFACTURER (APPROX.)',
      'requires-decision': 'NEEDS A DECISION',
    },
    pcs: 'pcs',
  },
};

export function tilePurchaseCopy(locale: string) {
  return locale.startsWith('pl') ? copy.pl : copy.en;
}

function useCoveringEdit(assignmentId: string) {
  const setCoveringAssignments = useAssembly(
    (state) => state.setCoveringAssignments,
  );
  return (
    change: (assignment: CoveringAssignmentSpec) => CoveringAssignmentSpec,
  ) => {
    const coverings = useAssembly.getState().projectDocument.project.coverings;
    setCoveringAssignments(
      coverings.map((item) => (item.id === assignmentId ? change(item) : item)),
    );
  };
}

function withPurchase(
  assignment: CoveringAssignmentSpec,
  purchase: RoofTilePurchaseDecision | undefined,
): CoveringAssignmentSpec {
  const rest = { ...assignment };
  delete rest.purchase;
  return purchase ? { ...rest, purchase } : rest;
}

export function TilePurchasePanel({
  assignment,
  layout,
  plan,
  locale,
  onShowOnRoof,
}: {
  assignment: CoveringAssignmentSpec;
  layout?: RoofTileLayoutResult;
  plan?: TilePurchasePlan;
  locale: string;
  onShowOnRoof?: (highlight: TileHighlight) => void;
}) {
  const c = tilePurchaseCopy(locale);
  const edit = useCoveringEdit(assignment.id);
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  const setDecision = (decision: RoofTilePurchaseDecision | undefined) =>
    edit((item) => withPurchase(item, decision));

  if (!plan) {
    const cut = layout ? layout.totalPositions - layout.fullPositions : 0;
    return (
      <section className="tp-panel" data-testid="tile-purchase-panel">
        <header className="tp-head">
          <strong>{c.title}</strong>
          <span className="mp-badge" data-status="neutral">
            {c.notPrepared}
          </span>
        </header>
        {layout?.status === 'resolved' && (
          <p className="tp-muted">
            {c.fromLayout(layout.totalPositions, layout.fullPositions, cut)}
          </p>
        )}
        <p className="tp-muted">{c.policyHelp}</p>
        <button
          type="button"
          className="a-primary"
          data-testid="tile-purchase-prepare"
          disabled={layout?.status !== 'resolved'}
          onClick={() => setDecision(defaultTilePurchaseDecision())}
        >
          {c.prepare}
        </button>
      </section>
    );
  }

  const { requirement, decision } = plan;
  const purchase = requirement.purchase;
  const toBuy = purchase?.purchasedPieces ?? requirement.requiredPieces;
  const trusted =
    requirement.status === 'exact' || requirement.status === 'conservative';
  return (
    <section
      className="tp-panel"
      data-testid="tile-purchase-panel"
      data-status={requirement.status}
    >
      <header className="tp-head">
        <strong>{c.title}</strong>
        <span
          className="mp-badge"
          data-status={
            requirement.status === 'exact'
              ? 'success'
              : requirement.status === 'conservative'
                ? 'neutral'
                : 'warning'
          }
          data-testid="tile-purchase-status"
        >
          {c.status[requirement.status]}
        </span>
      </header>

      <div className="tp-flow">
        <button
          type="button"
          className="tp-figure"
          data-testid="tile-purchase-full"
          onClick={() => onShowOnRoof?.('full')}
          disabled={!onShowOnRoof}
          title={onShowOnRoof ? c.showOnRoof : undefined}
        >
          <strong>{number(requirement.fullPositionCount)}</strong>
          <small>{c.full}</small>
        </button>
        <button
          type="button"
          className="tp-figure"
          data-testid="tile-purchase-cut"
          onClick={() => onShowOnRoof?.('cut')}
          disabled={!onShowOnRoof}
          title={onShowOnRoof ? c.showOnRoof : undefined}
        >
          <strong>{number(requirement.cutPositionCount)}</strong>
          <small>{c.cut}</small>
        </button>
        <div className="tp-figure is-key" data-testid="tile-purchase-physical">
          <strong>
            {number(requirement.physicalBaseTileCount)} {c.pcs}
          </strong>
          <small>{c.physical}</small>
        </div>
      </div>
      {requirement.status === 'conservative' && (
        <p className="tp-muted">{c.policyHelp}</p>
      )}

      <fieldset className="tp-reserve">
        <legend>{c.reserve}</legend>
        {RESERVE_PRESETS.map((bps) => (
          <button
            key={bps}
            type="button"
            aria-pressed={decision.reserveBps === bps}
            data-testid={`tile-reserve-${bps / 100}`}
            onClick={() => setDecision({ ...decision, reserveBps: bps })}
          >
            {bps / 100}%
          </button>
        ))}
        <label>
          {c.reserveCustom}
          <input
            key={decision.reserveBps}
            inputMode="decimal"
            data-testid="tile-reserve-custom"
            defaultValue={
              RESERVE_PRESETS.includes(
                decision.reserveBps as (typeof RESERVE_PRESETS)[number],
              )
                ? ''
                : number(decision.reserveBps / 100, 1)
            }
            onBlur={(event) => {
              if (!event.target.value.trim()) return;
              const parsed = parseDecimal(event.target.value);
              if (parsed === null || parsed < 0 || parsed > 50) {
                event.target.value = '';
                return;
              }
              setDecision({
                ...decision,
                reserveBps: Math.round(parsed * 100),
              });
            }}
          />
        </label>
      </fieldset>

      <dl className="tp-sum">
        <div>
          <dt>{c.fromGeometry}</dt>
          <dd>
            {number(requirement.physicalBaseTileCount)} {c.pcs}
          </dd>
        </div>
        <div>
          <dt>{c.reserve}</dt>
          <dd data-testid="tile-purchase-reserve">
            +{number(requirement.reservePieces)} {c.pcs}
          </dd>
        </div>
        <div className="is-total">
          <dt>{c.total}</dt>
          <dd data-testid="tile-purchase-required">
            {number(requirement.requiredPieces)} {c.pcs}
          </dd>
        </div>
      </dl>

      <PackagingChoice plan={plan} locale={locale} onChange={setDecision} />

      <div className="tp-buy" data-testid="tile-purchase-to-buy">
        <small>{c.toBuy}</small>
        <strong>
          {trusted ? `${number(toBuy)} ${c.pcs}` : c.status.unresolved}
        </strong>
        {purchase && purchase.saleUnit !== 'piece' && (
          <span>
            {c.unitsOf(
              purchase.units,
              purchase.piecesPerUnit,
              purchase.saleUnit === 'pack' ? c.packWord : c.palletWord,
            )}
          </span>
        )}
        {purchase && purchase.commercialOveragePieces > 0 && (
          <span data-testid="tile-purchase-overage" title={c.overageHelp}>
            {c.overage}: {number(purchase.commercialOveragePieces)} {c.pcs}
          </span>
        )}
      </div>

      <AccessoryList plan={plan} locale={locale} onChange={setDecision} />

      <details className="tp-details">
        <summary>{c.details}</summary>
        <h5>{c.breakdown}</h5>
        <ul className="tp-breakdown">
          {(
            [
              ['full', c.fullLabel, requirement.fullPositionCount],
              ['edge', c.edge, requirement.edgeCutPositionCount],
              ['opening', c.opening, requirement.openingCutPositionCount],
              ['split', c.split, requirement.splitPositionCount],
            ] as const
          ).map(([key, label, value]) => (
            <li key={key}>
              <button
                type="button"
                disabled={!onShowOnRoof || value === 0}
                onClick={() => onShowOnRoof?.(key)}
              >
                {label}
              </button>
              <strong>{number(value)}</strong>
              {key === 'split' && value > 0 && (
                <small>{c.fragments(requirement.splitFragmentCount)}</small>
              )}
            </li>
          ))}
        </ul>
        <h5>{c.policy}</h5>
        <p>
          <span className="mp-badge" data-status="neutral">
            {c.policyNoReuse}
          </span>{' '}
          {c.policyHelp}
        </p>
        {requirement.manufacturerCheck && (
          <div className="tp-check" data-testid="tile-manufacturer-check">
            <h5>{c.check}</h5>
            <p>
              {c.checkRoofCalc}:{' '}
              <strong>
                {number(requirement.manufacturerCheck.resolvedPerM2, 2)} {c.pcs}
                /m²
              </strong>
              <br />
              {c.checkMaker}:{' '}
              {number(requirement.manufacturerCheck.declaredMinPerM2, 1)}–
              {number(requirement.manufacturerCheck.declaredMaxPerM2, 1)}{' '}
              {c.pcs}/m²
              <br />
              <strong
                data-verdict={requirement.manufacturerCheck.verdict}
                data-testid="tile-manufacturer-verdict"
              >
                {requirement.manufacturerCheck.verdict === 'within'
                  ? c.within
                  : c.outside}
              </strong>
            </p>
            <small>{c.checkHelp}</small>
          </div>
        )}
        {plan.requirement.limitations
          .filter((code) => code !== 'packaging-not-set')
          .map((code) => (
            <p key={code} className="tp-muted">
              {materialText(
                locale,
                code === 'cuts-without-offcut-reuse'
                  ? 'tile-plan-conservative-no-offcut-reuse'
                  : code === 'split-fragments-one-tile-each'
                    ? 'tile-plan-split-fragments'
                    : 'tile-plan-layout-unresolved',
              )}
            </p>
          ))}
      </details>

      <button
        type="button"
        className="tp-remove"
        data-testid="tile-purchase-remove"
        onClick={() => setDecision(undefined)}
      >
        {c.remove}
      </button>
    </section>
  );
}

function PackagingChoice({
  plan,
  locale,
  onChange,
}: {
  plan: TilePurchasePlan;
  locale: string;
  onChange: (decision: RoofTilePurchaseDecision) => void;
}) {
  const c = tilePurchaseCopy(locale);
  const facts = plan.packagingFacts;
  const packaging = plan.packagingStale ? undefined : plan.decision.packaging;
  const set = (next: CommercialPackaging) =>
    onChange({ ...plan.decision, packaging: next });
  const isCustom =
    packaging?.source === 'manual' && packaging.saleUnit !== 'piece';
  const [customOpen, setCustomOpen] = useState(isCustom);
  const edit = useCoveringEdit(plan.assignmentId);
  const loadPackaging = useQuery({
    queryKey: ['catalog', 'product', plan.productId],
    queryFn: ({ signal }) => catalogClient.getProduct(plan.productId!, signal),
    enabled: false,
    retry: false,
  });
  const option = (
    key: string,
    label: string,
    active: boolean,
    next: CommercialPackaging,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      data-testid={`tile-sale-unit-${key}`}
      onClick={() => {
        setCustomOpen(false);
        set(next);
      }}
    >
      {label}
    </button>
  );
  return (
    <fieldset className="tp-packaging">
      <legend>{c.saleUnit}</legend>
      {option('piece', c.pieces, !packaging || packaging.saleUnit === 'piece', {
        saleUnit: 'piece',
        piecesPerUnit: 1,
        source: 'manual',
      })}
      {facts?.piecesPerPack !== undefined &&
        option(
          'pack',
          c.packs(facts.piecesPerPack),
          packaging?.source === 'catalog' && packaging.saleUnit === 'pack',
          {
            saleUnit: 'pack',
            piecesPerUnit: facts.piecesPerPack,
            source: 'catalog',
          },
        )}
      {facts?.piecesPerPallet !== undefined &&
        option(
          'pallet',
          c.pallets(facts.piecesPerPallet),
          packaging?.source === 'catalog' && packaging.saleUnit === 'pallet',
          {
            saleUnit: 'pallet',
            piecesPerUnit: facts.piecesPerPallet,
            source: 'catalog',
          },
        )}
      <button
        type="button"
        aria-pressed={isCustom || customOpen}
        data-testid="tile-sale-unit-custom"
        onClick={() => setCustomOpen(true)}
      >
        {c.customPack}
      </button>
      {(customOpen || isCustom) && (
        <label>
          {c.piecesPerPack}
          <input
            inputMode="numeric"
            data-testid="tile-custom-pack"
            defaultValue={isCustom ? String(packaging!.piecesPerUnit) : ''}
            onBlur={(event) => {
              const parsed = Number(event.target.value.trim());
              if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100_000) {
                event.target.value = isCustom
                  ? String(packaging!.piecesPerUnit)
                  : '';
                return;
              }
              set({
                saleUnit: 'pack',
                piecesPerUnit: parsed,
                source: 'manual',
              });
            }}
          />
        </label>
      )}
      <small className="tp-muted">
        {facts
          ? `${c.packagingSource}${facts.sourceLabel ? ` · ${facts.sourceLabel}` : ''}`
          : c.noPackaging}
      </small>
      {!facts && plan.variantId && plan.productId && (
        <button
          type="button"
          className="tp-link"
          data-testid="tile-load-packaging"
          onClick={async () => {
            const result = await loadPackaging.refetch();
            const variant = result.data?.variants.find(
              (item) => item.id === plan.variantId,
            );
            const found = variant?.metadata?.packaging;
            if (!found) return;
            edit((assignment) => ({
              ...assignment,
              product: {
                ...assignment.product,
                commercialSnapshot: { packaging: found },
              },
            }));
          }}
        >
          {c.loadPackaging}
        </button>
      )}
    </fieldset>
  );
}

function AccessoryList({
  plan,
  locale,
  onChange,
}: {
  plan: TilePurchasePlan;
  locale: string;
  onChange: (decision: RoofTilePurchaseDecision) => void;
}) {
  const c = tilePurchaseCopy(locale);
  const accessories = useQuery({
    queryKey: ['catalog', 'products', 'roof-tile-accessory'],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts(
        { kind: 'roof-tile-accessory', limit: 50 },
        signal,
      ),
    enabled: !!plan.productId && plan.accessories.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const decisionAccessories = plan.decision.accessories ?? [];
  const replace = (
    role: RoofTileAccessoryRole,
    selection: RoofTileAccessorySelection | undefined,
  ) =>
    onChange({
      ...plan.decision,
      accessories: [
        ...decisionAccessories.filter((item) => item.role !== role),
        ...(selection ? [selection] : []),
      ],
    });
  const choose = async (role: RoofTileAccessoryRole, productId: string) => {
    if (!productId) return replace(role, undefined);
    const detail = await catalogClient.getProduct(productId);
    const spec = roofTileAccessoryTechnicalSpecSchema.safeParse(
      detail.currentRevision.technicalSpec,
    );
    if (!spec.success) return;
    replace(role, {
      role,
      catalogRef: {
        productId: detail.product.id,
        technicalRevisionId: detail.currentRevision.id,
      },
      displaySnapshot: {
        manufacturer: detail.manufacturer.name,
        familyName: detail.product.name,
        revisionCode: detail.currentRevision.revisionCode,
      },
      technicalSpecSnapshot: spec.data,
    });
  };
  if (!plan.accessories.length)
    return (
      <div className="tp-accessories">
        <h5>{c.accessories}</h5>
        <p className="tp-muted">{c.noAccessoriesNeeded}</p>
      </div>
    );
  return (
    <div className="tp-accessories" data-testid="tile-accessories">
      <h5>{c.accessories}</h5>
      {!plan.productId && <p className="tp-muted">{c.manualTile}</p>}
      {accessories.isError && <p className="tp-muted">{c.catalogueOffline}</p>}
      <ul>
        {plan.accessories.map((item) => (
          <AccessoryItem
            key={item.role}
            item={item}
            locale={locale}
            candidatesLoaded={accessories.isSuccess}
            candidates={(accessories.data?.items ?? []).filter(
              (candidate) =>
                candidate.technicalPreview.accessoryRoles?.includes(
                  item.role,
                ) &&
                !!plan.productId &&
                candidate.technicalPreview.compatibleProductIds?.includes(
                  plan.productId,
                ),
            )}
            onChoose={(productId) => void choose(item.role, productId)}
            onConfirmPerCourse={() =>
              item.selection &&
              replace(item.role, {
                ...item.selection,
                userConfirmedRule: 'one-per-course',
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function AccessoryItem({
  item,
  locale,
  candidates,
  candidatesLoaded,
  onChoose,
  onConfirmPerCourse,
}: {
  item: AccessoryRequirement;
  candidatesLoaded: boolean;
  locale: string;
  candidates: { id: string; name: string; manufacturer: { name: string } }[];
  onChoose: (productId: string) => void;
  onConfirmPerCourse: () => void;
}) {
  const c = tilePurchaseCopy(locale);
  const label = materialText(locale, `tileAccessory.${item.role}`);
  return (
    <li data-testid={`tile-accessory-${item.role}`} data-status={item.status}>
      <div className="tp-accessory-head">
        <strong>{label}</strong>
        <span
          className="mp-badge"
          data-status={item.status === 'resolved' ? 'success' : 'warning'}
        >
          {c.accessoryStatus[item.status]}
        </span>
        {item.quantity !== undefined && (
          <strong className="tp-accessory-qty">
            {item.quantity} {c.pcs}
          </strong>
        )}
      </div>
      {(candidates.length > 0 || item.selection) && (
        <label>
          {c.choose}
          <select
            aria-label={`${c.choose} · ${label}`}
            value={item.selection?.catalogRef.productId ?? ''}
            onChange={(event) => onChoose(event.target.value)}
          >
            <option value="">{c.none}</option>
            {item.selection &&
              !candidates.some(
                (candidate) =>
                  candidate.id === item.selection!.catalogRef.productId,
              ) && (
                <option value={item.selection.catalogRef.productId}>
                  {item.selection.displaySnapshot?.familyName ??
                    item.selection.catalogRef.productId}
                </option>
              )}
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.manufacturer.name} · {candidate.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {candidatesLoaded && !candidates.length && !item.selection ? (
        <small className="tp-muted">{c.noCandidates}</small>
      ) : (
        item.reason && (
          <small className="tp-muted">
            {materialText(locale, `accessory-${item.reason}`)}
          </small>
        )
      )}
      {item.status === 'declared-approximate' && (
        <small className="tp-muted">
          {materialText(locale, 'accessory-declared-approximate')}
        </small>
      )}
      {item.reason === 'verge-rule-not-declared' &&
        item.selection &&
        item.courseCount !== undefined && (
          <button
            type="button"
            className="tp-link"
            data-testid={`tile-accessory-confirm-${item.role}`}
            onClick={onConfirmPerCourse}
          >
            {c.confirmPerCourse} ({item.courseCount})
          </button>
        )}
      {item.basis === 'one-per-course-user-confirmed' && (
        <small className="tp-muted">{c.perCourseConfirmed}</small>
      )}
    </li>
  );
}
