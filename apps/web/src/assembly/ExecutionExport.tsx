import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { boundsFromPoints, fitDrawing } from '@cieslacalc/drawing-engine';
import {
  buildExecutionDocument,
  defaultSectionSelection,
  sectionOrder,
  type DocumentDrawing,
  type DocumentSource,
  type ExecutionDocument,
  type ExecutionSection,
  type Point2D,
  type SectionCandidate,
  type SectionKind,
} from '@cieslacalc/document-core';
import { formatLength } from '../format';
import type { LengthUnit } from '@cieslacalc/roof-math';
import { MobileSheet } from './MobileSheet';
import { detailStepText } from './DetailPreview';
import { roofPlaneShortLabelKey } from './covering-presentation';
import { createExportCandidates, type ExportFacts } from './export-adapter';
import './execution-export.css';

const copy = {
  pl: {
    export: 'Eksport',
    title: 'Pakiet wykonawczy',
    sections: 'Sekcje dokumentu',
    preview: 'Podgląd dokumentu',
    print: 'Drukuj / Zapisz PDF',
    back: 'Wróć do wyboru',
    close: 'Zamknij',
    available: 'Gotowe',
    warning: 'Wymaga uwagi',
    unavailable: 'Niedostępne',
    noSelection: 'Wybierz co najmniej jedną dostępną sekcję.',
    planFirst: 'Najpierw zaplanuj rozkrój K1',
    planAction: 'Zaplanuj rozkrój K1',
    'project-summary': 'Podsumowanie projektu',
    'roof-overview': 'Schemat konstrukcji',
    'member-schedule': 'Zestawienie elementów',
    'member-fabrication': 'K1 - przygotowanie elementu',
    'cutting-plan': 'Rozkrój K1',
    layers: 'Warstwy dachu',
    covering: 'Pokrycie',
    assumptions: 'Założenia i ograniczenia',
    source: 'Stan projektu',
    generated: 'Wygenerowano',
    schema: 'Schemat',
    roof: 'Dach',
    gable: 'dwuspadowy',
    hip: 'czterospadowy',
    length: 'Długość budynku',
    halfRun: 'Połowa rozpiętości',
    pitch: 'Nachylenie',
    netArea: 'Powierzchnia netto',
    openings: 'Otwory',
    timber: 'Rodziny drewna',
    layersCount: 'Włączone warstwy',
    coveringsCount: 'Pokrycia',
    resolved: 'rozwiązane',
    diagramNote:
      'Schemat - nie w skali. Wymiary odczytuj z wartości liczbowych.',
    family: 'Rodzina',
    count: 'Liczba',
    section: 'Przekrój',
    lengthRange: 'Długość',
    basis: 'Podstawa',
    axis: 'oś geometryczna',
    visible: 'długość widoczna',
    automatic: 'automatycznie z pokrycia',
    manual: 'ręcznie',
    actualGauge: 'rzeczywisty rozstaw',
    allowedGauge: 'dopuszczalny zakres',
    courses: 'rzędy',
    axesSegments: 'osie / odcinki',
    partial: 'częściowo',
    blank: 'Wymagany blank K1',
    blankNote:
      'Długość blanku dla zamodelowanych cięć; bez dodatkowego naddatku obróbki.',
    ridgeNote:
      'K1 jest docięta do bliskiej płaszczyzny pionowej deski kalenicowej osadzonej centralnie.',
    ridgeNoteDirect:
      'K1 dochodzi bezpośrednio do osi kalenicy - przeciwległe krokwie stykają się bez deski kalenicowej.',
    structure: 'Konstrukcja więźby',
    structureRafter: 'Więźba krokwiowa',
    structureCollarTie: 'Więźba krokwiowo-jętkowa',
    datum:
      'Punkt odniesienia: zewnętrzny okap. Oznacz górną i dolną krawędź oraz kierunek okap → kalenica.',
    birdsmouth: 'Zacios przy podporze',
    ridgeCut: 'Cięcie przy kalenicy',
    dimensions: 'Wymiary kontrolne',
    marking: 'Trasowanie',
    stock: 'Długość handlowa',
    stockCount: 'Sztuki',
    assigned: 'Przypisane blanki',
    unassigned: 'Nieprzypisane',
    kerf: 'Rzaz',
    kerfLoss: 'Strata na rzaz',
    endTrim: 'Przycięcie końców',
    minimumRemnant: 'Próg resztki',
    waste: 'Odpad',
    remnant: 'Resztki do ponownego użycia',
    layout: 'Układ cięcia',
    remainder: 'Pozostałość',
    membrane: 'Membrana',
    counter: 'Kontrłaty',
    battens: 'Łaty',
    netGeometric: 'powierzchnia netto geometryczna',
    positions: 'pozycje krycia',
    runs: 'przebiegi geometryczne',
    planes: 'Połacie',
    tile: 'Dachówka',
    modular: 'Blacha modułowa',
    cutSheet: 'Blacha cięta na długość',
    seam: 'Rąbek stojący',
    reusable: 'do ponownego użycia',
    noReuse: 'odpad',
    notPurchase: 'To wynik geometryczny układu, nie ilość do zamówienia.',
    unresolved: 'Wynik nierozwiązany - sprawdź pokrycie w projekcie.',
    assumptionsText: {
      'ridge-board':
        'K1: zamodelowano połączenie z centralną deską kalenicową; brak wariantu belki konstrukcyjnej, wieszaka i nakładki.',
      'ridge-direct-meeting':
        'K1: zamodelowano bezpośredni styk przeciwległych krokwi w osi kalenicy, bez deski kalenicowej.',
      'ridge-half-lap-unresolved':
        'K1: wybrano połączenie na nakładkę w kalenicy; geometria tego połączenia nie jest jeszcze opracowana, więc przygotowanie elementu i rozkrój K1 są niedostępne.',
      'collar-tie-geometric':
        'Jętka: długość i położenie to wynik geometryczny względem osi krokwi, bez cięć wykonawczych ani doboru przekroju konstrukcyjnego.',
      'geometric-covering':
        'Pokrycie: pozycje krycia i przebiegi są wynikami geometrycznymi, bez liczby do zakupu.',
      'net-membrane':
        'Membrana: podana powierzchnia netto nie obejmuje zakładów, wywinięć ani odpadu.',
      'no-structural-check':
        'Geometria i cięcia nie stanowią weryfikacji nośności ani doboru łączników.',
      'unresolved-execution':
        'Nieopracowane szczegóły wykonawcze, w tym H1/J1, pominięto w instrukcjach cięcia.',
    },
    reason: {
      'plan-k1-first': 'Najpierw zaplanuj rozkrój K1.',
      'k1-unresolved': 'Brak dowiedzionego blanku K1.',
      'no-layers': 'Nie włączono warstw.',
      'no-covering': 'Nie dodano pokrycia.',
      'no-members': 'Brak elementów.',
      'invalid-roof-surface': 'Sprawdź otwory i powierzchnię dachu.',
      'cutting-incomplete': 'Część blanków pozostaje nieprzypisana.',
    },
  },
  en: {
    export: 'Export',
    title: 'Execution package',
    sections: 'Document sections',
    preview: 'Preview document',
    print: 'Print / Save PDF',
    back: 'Back to sections',
    close: 'Close',
    available: 'Ready',
    warning: 'Needs review',
    unavailable: 'Unavailable',
    noSelection: 'Select at least one available section.',
    planFirst: 'Plan the K1 cutting first',
    planAction: 'Plan K1 cutting',
    'project-summary': 'Project summary',
    'roof-overview': 'Roof overview',
    'member-schedule': 'Member schedule',
    'member-fabrication': 'K1 - member preparation',
    'cutting-plan': 'K1 cutting plan',
    layers: 'Roof layers',
    covering: 'Covering',
    assumptions: 'Assumptions and limits',
    source: 'Project state',
    generated: 'Generated',
    schema: 'Schema',
    roof: 'Roof',
    gable: 'gable',
    hip: 'hip',
    length: 'Building length',
    halfRun: 'Half run',
    pitch: 'Pitch',
    netArea: 'Net area',
    openings: 'Openings',
    timber: 'Timber families',
    layersCount: 'Enabled layers',
    coveringsCount: 'Coverings',
    resolved: 'resolved',
    diagramNote: 'Diagram - not to scale. Use the stated dimensions.',
    family: 'Family',
    count: 'Count',
    section: 'Section',
    lengthRange: 'Length',
    basis: 'Basis',
    axis: 'geometric axis',
    visible: 'visible length',
    automatic: 'automatic from covering',
    manual: 'manual',
    actualGauge: 'actual gauge',
    allowedGauge: 'allowed range',
    courses: 'courses',
    axesSegments: 'axes / segments',
    partial: 'partial',
    blank: 'Required K1 blank',
    blankNote:
      'Blank length for modeled cuts; no additional machining allowance.',
    ridgeNote:
      'K1 terminates at the near face of a centered vertical ridge board.',
    ridgeNoteDirect:
      'K1 reaches the ridge axis directly - opposing rafters meet with no ridge board.',
    structure: 'Roof structural system',
    structureRafter: 'Rafter roof',
    structureCollarTie: 'Rafter and collar-tie roof',
    datum:
      'Datum: outer eave. Mark top and bottom edges and the direction eave → ridge.',
    birdsmouth: 'Support birdsmouth',
    ridgeCut: 'Ridge cut',
    dimensions: 'Control dimensions',
    marking: 'Marking',
    stock: 'Stock length',
    stockCount: 'Items',
    assigned: 'Assigned blanks',
    unassigned: 'Unassigned',
    kerf: 'Kerf',
    kerfLoss: 'Kerf loss',
    endTrim: 'End trim',
    minimumRemnant: 'Remnant threshold',
    waste: 'Waste',
    remnant: 'Reusable remnants',
    layout: 'Cut layout',
    remainder: 'Remainder',
    membrane: 'Membrane',
    counter: 'Counter battens',
    battens: 'Battens',
    netGeometric: 'net geometric area',
    positions: 'coverage positions',
    runs: 'geometric runs',
    planes: 'Planes',
    tile: 'Roof tile',
    modular: 'Modular sheet',
    cutSheet: 'Cut-to-length sheet',
    seam: 'Standing seam',
    reusable: 'reusable',
    noReuse: 'waste',
    notPurchase: 'This is a geometric layout result, not an order quantity.',
    unresolved: 'Unresolved result - review covering in the project.',
    assumptionsText: {
      'ridge-board':
        'K1: modeled against a centered ridge board; structural beam, hanger and half-lap variants are absent.',
      'ridge-direct-meeting':
        'K1: modeled as a direct meeting of opposing rafters on the ridge axis, with no ridge board.',
      'ridge-half-lap-unresolved':
        'K1: a half-lap ridge connection is selected; its cut geometry is not modeled yet, so member preparation and K1 cutting are unavailable.',
      'collar-tie-geometric':
        'Collar tie: length and position are a geometric result referenced to the rafter axis, with no fabrication cuts or structural section sizing.',
      'geometric-covering':
        'Covering: positions and runs are geometric results, not quantities to purchase.',
      'net-membrane': 'Membrane: net area excludes laps, upstands and waste.',
      'no-structural-check':
        'Geometry and cuts are not a structural capacity or connector check.',
      'unresolved-execution':
        'Unresolved fabrication details, including H1/J1, are omitted from cutting instructions.',
    },
    reason: {
      'plan-k1-first': 'Plan K1 cutting first.',
      'k1-unresolved': 'K1 blank is not proved.',
      'no-layers': 'No enabled layers.',
      'no-covering': 'No covering assigned.',
      'no-members': 'No members.',
      'invalid-roof-surface': 'Review openings and roof surface.',
      'cutting-incomplete': 'Some blanks are unassigned.',
    },
  },
} as const;

type Copy = typeof copy.pl | typeof copy.en;

function Diagram({
  model,
  label,
  height = 225,
}: {
  model: DocumentDrawing;
  label: string;
  height?: number;
}) {
  const width = 640;
  const fit = fitDrawing(model.bounds, { width, height, padding: 24 });
  const points = (values: Point2D[]) =>
    values
      .map(fit.project)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  return (
    <svg
      className="doc-diagram"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {model.polygons.map((polygon) => (
        <polygon
          key={polygon.id}
          points={points(polygon.points)}
          className={`doc-shape doc-${polygon.role}`}
        />
      ))}
      {model.lines.map((line) => {
        const a = fit.project(line.from),
          b = fit.project(line.to);
        return (
          <line
            key={line.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={`doc-line doc-${line.role}`}
          />
        );
      })}
    </svg>
  );
}

function RoofDiagram({
  section,
  m,
}: {
  section: Extract<ExecutionSection, { kind: 'roof-overview' }>;
  m: Copy;
}) {
  const points = [
    ...section.outlines.flatMap((outline) => outline.points),
    ...section.members.flatMap((member) => [member.from, member.to]),
    ...section.openings.flatMap((opening) => opening.points),
  ];
  if (!points.length) return null;
  const bounds = boundsFromPoints(points);
  const fit = fitDrawing(bounds, { width: 640, height: 390, padding: 30 });
  const polygon = (values: Point2D[]) =>
    values
      .map(fit.project)
      .map(({ x, y }) => `${x},${y}`)
      .join(' ');
  const labeled = new Set<string>();
  return (
    <>
      <svg
        className="doc-roof-diagram"
        viewBox="0 0 640 390"
        role="img"
        aria-label={m['roof-overview']}
      >
        <title>{m['roof-overview']}</title>
        {section.outlines.map((outline) => (
          <polygon
            key={outline.id}
            points={polygon(outline.points)}
            className="doc-roof-outline"
          />
        ))}
        {section.members.map((member) => {
          const a = fit.project(member.from),
            b = fit.project(member.to);
          const label =
            !labeled.has(member.code) &&
            ['K1', 'H1', 'J1', 'KR'].includes(member.code);
          if (label) labeled.add(member.code);
          return (
            <g key={member.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`doc-roof-member doc-${member.role}`}
              />
              {label && (
                <text x={(a.x + b.x) / 2 + 3} y={(a.y + b.y) / 2 - 3}>
                  {member.code}
                </text>
              )}
            </g>
          );
        })}
        {section.openings.map((opening) => (
          <polygon
            key={opening.id}
            points={polygon(opening.points)}
            className="doc-roof-opening"
          />
        ))}
      </svg>
      <p className="doc-note">{m.diagramNote}</p>
    </>
  );
}

function SectionBody({
  section,
  m,
  unit,
  locale,
}: {
  section: ExecutionSection;
  m: Copy;
  unit: LengthUnit;
  locale: string;
}) {
  const { t } = useTranslation();
  const length = (mm: number) => `${formatLength(mm, unit, locale)} ${unit}`;
  const area = (mm2: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(mm2 / 1_000_000)} m²`;
  const sectionSize = (width?: number, depth?: number) =>
    width !== undefined && depth !== undefined
      ? `${length(width)} × ${length(depth)}`
      : '—';
  switch (section.kind) {
    case 'project-summary':
      return (
        <>
          <div className="doc-summary-grid">
            <div>
              <span>{m.roof}</span>
              <strong>{m[section.roofType]}</strong>
            </div>
            <div>
              <span>{m.length}</span>
              <strong>{length(section.buildingLengthMm)}</strong>
            </div>
            <div>
              <span>{m.structure}</span>
              <strong>
                {section.structuralSystem === 'rafter-collar-tie'
                  ? m.structureCollarTie
                  : m.structureRafter}
              </strong>
            </div>
            <div>
              <span>{m.halfRun}</span>
              <strong>{length(section.halfRunMm)}</strong>
            </div>
            <div>
              <span>{m.pitch}</span>
              <strong>{section.pitchDeg}°</strong>
            </div>
            <div>
              <span>{m.netArea}</span>
              <strong>
                {section.netRoofAreaMm2 === undefined
                  ? '—'
                  : area(section.netRoofAreaMm2)}
              </strong>
            </div>
            <div>
              <span>{m.openings}</span>
              <strong>{section.openingCount}</strong>
            </div>
            <div>
              <span>{m.layersCount}</span>
              <strong>{section.enabledLayerCount}</strong>
            </div>
            <div>
              <span>{m.coveringsCount}</span>
              <strong>
                {section.coveringCount} / {section.resolvedCoveringCount}{' '}
                {m.resolved}
              </strong>
            </div>
          </div>
          <h3>{m.timber}</h3>
          <div className="doc-family-chips">
            {section.timberFamilies.map((row) => (
              <span key={row.code}>
                <b>{row.code}</b> × {row.count}
              </span>
            ))}
          </div>
        </>
      );
    case 'roof-overview':
      return <RoofDiagram section={section} m={m} />;
    case 'member-schedule':
      return (
        <>
          <table>
            <thead>
              <tr>
                <th>{m.family}</th>
                <th>{m.count}</th>
                <th>{m.section}</th>
                <th>{m.lengthRange}</th>
                <th>{m.basis}</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => (
                <tr key={`${row.code}-${index}`}>
                  <th>{row.code}</th>
                  <td>{row.count}</td>
                  <td>{sectionSize(row.widthMm, row.depthMm)}</td>
                  <td>
                    {length(row.minLengthMm)}
                    {row.maxLengthMm !== row.minLengthMm
                      ? ` – ${length(row.maxLengthMm)}`
                      : ''}
                  </td>
                  <td>{row.basis === 'axis-geometric' ? m.axis : m.visible}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="doc-note">{m.blankNote}</p>
        </>
      );
    case 'member-fabrication':
      return (
        <>
          <div className="doc-k1-hero">
            <div>
              <span>
                {section.code} × {section.count} ·{' '}
                {sectionSize(section.section.widthMm, section.section.depthMm)}
              </span>
              <strong>
                {m.blank}: {length(section.requiredBlankLengthMm)}
              </strong>
            </div>
            <small>{m.blankNote}</small>
          </div>
          <p className="doc-note">{m.datum}</p>
          <Diagram model={section.drawing} label="K1" height={185} />
          <div className="doc-detail-grid">
            {section.details.map((detail, index) => (
              <article key={`${detail.type}-${index}`}>
                <h3>
                  {detail.type === 'birdsmouth-detail'
                    ? m.birdsmouth
                    : m.ridgeCut}
                </h3>
                <Diagram
                  model={detail.drawing}
                  label={detail.type}
                  height={145}
                />
                <h4>{m.dimensions}</h4>
                <dl>
                  {detail.dimensions.map((dimension, i) => (
                    <div key={i}>
                      <dt>{t(`assembly.${dimension.labelKey}`)}</dt>
                      <dd>
                        {dimension.unit === 'length'
                          ? length(dimension.value)
                          : `${dimension.value}${dimension.unit === 'angle' ? '°' : ''}`}
                      </dd>
                    </div>
                  ))}
                </dl>
                <h4>{m.marking}</h4>
                <ol>
                  {detail.steps.map((step) => (
                    <li key={step.id}>
                      {detailStepText(
                        step,
                        t,
                        (value) => formatLength(value, unit, locale),
                        (value) => String(value),
                        unit,
                      )}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
          <p className="doc-warning">
            {section.ridgeConnection === 'direct-meeting'
              ? m.ridgeNoteDirect
              : m.ridgeNote}
          </p>
        </>
      );
    case 'cutting-plan':
      return (
        <>
          <div className="doc-metrics">
            <span>
              {m.assigned}:{' '}
              <b>
                {section.assignedCount}/{section.requiredCount}
              </b>
            </span>
            <span>
              {m.unassigned}: <b>{section.unassignedCount}</b>
            </span>
            <span>
              {m.kerf}: <b>{length(section.kerfMm)}</b>
            </span>
            <span>
              {m.endTrim}: <b>{length(section.endTrimMm)}</b>
            </span>
            <span>
              {m.kerfLoss}: <b>{length(section.kerfLossMm)}</b>
            </span>
            <span>
              {m.minimumRemnant}:{' '}
              <b>{length(section.minimumReusableRemnantMm)}</b>
            </span>
            <span>
              {m.waste}: <b>{length(section.wasteLengthMm)}</b>
            </span>
            <span>
              {m.remnant}: <b>{length(section.reusableRemnantLengthMm)}</b>
            </span>
          </div>
          <h3>{m.stock}</h3>
          <table>
            <thead>
              <tr>
                <th>{m.stock}</th>
                <th>{m.stockCount}</th>
              </tr>
            </thead>
            <tbody>
              {section.stock.map((row) => (
                <tr key={row.lengthMm}>
                  <td>{length(row.lengthMm)}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>{m.layout}</h3>
          <div className="doc-stock-list">
            {section.usages.map((usage, index) => (
              <div className="doc-stock" key={usage.id}>
                <strong>
                  {index + 1}. {length(usage.lengthMm)} · {usage.cuts.length} K1
                </strong>
                <div className="doc-stock-bar">
                  {usage.cuts.map((cut) => (
                    <span
                      key={cut.pieceId}
                      style={{
                        left: `${(cut.fromMm / usage.lengthMm) * 100}%`,
                        width: `${(cut.blankLengthMm / usage.lengthMm) * 100}%`,
                      }}
                      title={length(cut.blankLengthMm)}
                    >
                      {cut.label}
                    </span>
                  ))}
                </div>
                <small>
                  {m.remainder}: {length(usage.remainingLengthMm)} ·{' '}
                  {usage.remnantClassification === 'reusable-remnant'
                    ? m.reusable
                    : m.noReuse}
                </small>
              </div>
            ))}
          </div>
        </>
      );
    case 'layers':
      return (
        <table>
          <thead>
            <tr>
              <th>{m.family}</th>
              <th>{m.count}</th>
              <th>{m.lengthRange}</th>
              <th>{m.basis}</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={`${row.code}-${i}`}>
                <th>{row.code}</th>
                <td>{row.count ?? '—'}</td>
                <td>
                  {row.areaMm2 !== undefined
                    ? area(row.areaMm2)
                    : row.lengthMm !== undefined
                      ? length(row.lengthMm)
                      : '—'}
                </td>
                <td>
                  {row.basis === 'net-geometric'
                    ? m.netGeometric
                    : row.basis === 'axis-geometric'
                      ? m.axis
                      : m.visible}
                  {row.layoutFacts && (
                    <small className="doc-layer-facts">
                      {row.layoutFacts.mode
                        ? row.layoutFacts.mode === 'auto-from-covering'
                          ? m.automatic
                          : m.manual
                        : ''}
                      {row.layoutFacts.actualGaugeMm !== undefined
                        ? ` · ${m.actualGauge}: ${length(row.layoutFacts.actualGaugeMm)}`
                        : ''}
                      {row.layoutFacts.minimumGaugeMm !== undefined &&
                      row.layoutFacts.maximumGaugeMm !== undefined
                        ? ` · ${m.allowedGauge}: ${length(row.layoutFacts.minimumGaugeMm)}–${length(row.layoutFacts.maximumGaugeMm)}`
                        : ''}
                      {row.layoutFacts.courseCount !== undefined
                        ? ` · ${m.courses}: ${row.layoutFacts.courseCount}`
                        : ''}
                      {row.layoutFacts.axisCount !== undefined
                        ? ` · ${m.axesSegments}: ${row.layoutFacts.axisCount} / ${row.layoutFacts.segmentCount ?? 0}`
                        : ''}
                      {row.layoutFacts.status === 'partial'
                        ? ` · ${m.partial}`
                        : ''}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'covering':
      return (
        <>
          {section.rows.map((row, index) => (
            <article className="doc-covering-row" key={index}>
              <h3>{row.name}</h3>
              <p>
                {row.family === 'roof-tile'
                  ? m.tile
                  : row.family === 'modular-sheet'
                    ? m.modular
                    : row.family === 'modular-sheet-cut-to-length'
                      ? m.cutSheet
                      : m.seam}{' '}
                · {m.planes}:{' '}
                {row.planeIds
                  .map((id) => t(roofPlaneShortLabelKey(id), { id }))
                  .join(', ')}
              </p>
              {row.status === 'resolved' && row.measure ? (
                <strong>
                  {row.measure.count}{' '}
                  {row.measure.kind === 'coverage-position'
                    ? m.positions
                    : m.runs}
                </strong>
              ) : (
                <p className="doc-warning">{m.unresolved}</p>
              )}
              {row.warnings.length > 0 && (
                <small>
                  {row.warnings
                    .map((code) =>
                      t(`assembly.coveringIssue.${code}`, {
                        defaultValue: m.warning,
                      }),
                    )
                    .join(' · ')}
                </small>
              )}
            </article>
          ))}
          <p className="doc-note">{m.notPurchase}</p>
        </>
      );
    case 'assumptions':
      return (
        <ol className="doc-assumptions">
          {section.codes.map((code) => (
            <li key={code}>{m.assumptionsText[code]}</li>
          ))}
        </ol>
      );
  }
}

function DocumentPreview({
  execution,
  unit,
  onBack,
  onClose,
}: {
  execution: ExecutionDocument;
  unit: LengthUnit;
  onBack: () => void;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const printButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = documentBodyOverflow();
    const previousTitle = document.title;
    const safeName =
      execution.source.projectName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 70) || 'projekt';
    document.title = `CieslaCalc_${safeName}_pakiet_wykonawczy`;
    const previousFocus = document.activeElement as HTMLElement | null;
    printButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.body.style.overflow = previous;
      document.title = previousTitle;
      previousFocus?.focus();
    };
  }, [execution.source.projectName, onBack]);
  const date = (raw: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(raw));
  return createPortal(
    <div className="doc-preview" data-testid="execution-preview">
      <header className="doc-preview-toolbar">
        <div>
          <span>{m.export}</span>
          <strong>{m.title}</strong>
          <small>{execution.source.projectName}</small>
        </div>
        <div>
          <button type="button" onClick={onBack}>
            {m.back}
          </button>
          <button
            ref={printButton}
            type="button"
            className="doc-print-button"
            data-testid="execution-print"
            onClick={() => window.print()}
          >
            {m.print}
          </button>
          <button type="button" onClick={onClose}>
            {m.close}
          </button>
        </div>
      </header>
      <main className="doc-preview-pages">
        {execution.sections.map((section, index) => (
          <article
            className="doc-page"
            key={section.kind}
            data-section={section.kind}
          >
            <header className="doc-page-header">
              <span>
                {m.title} / {String(index + 1).padStart(2, '0')}
              </span>
              <h1>{m[section.kind]}</h1>
              <p>{execution.source.projectName}</p>
            </header>
            <div className="doc-page-content">
              <SectionBody
                section={section}
                m={m}
                unit={unit}
                locale={i18n.language}
              />
            </div>
            <footer className="doc-page-footer">
              <span>
                {m.source}: {date(execution.source.projectUpdatedAt)} ·{' '}
                {m.schema} {execution.source.projectSchemaVersion}
              </span>
              <span>
                {m.generated}: {date(execution.generatedAt)}
              </span>
            </footer>
          </article>
        ))}
      </main>
    </div>,
    document.body,
  );
}

function documentBodyOverflow() {
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return previous;
}

export function ExecutionExport({
  source,
  facts,
  unit,
  mobile,
  onClose,
  onPlanK1,
}: {
  source: DocumentSource;
  facts: ExportFacts;
  unit: LengthUnit;
  mobile: boolean;
  onClose: () => void;
  onPlanK1: () => void;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [candidates] = useState<SectionCandidate[]>(() =>
    createExportCandidates(facts),
  );
  const [selected, setSelected] = useState<SectionKind[]>(() =>
    defaultSectionSelection(candidates),
  );
  const [preview, setPreview] = useState<ExecutionDocument>();
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [mobile]);
  const readyCount = selected.filter((kind) =>
    candidates.some(
      (candidate) =>
        candidate.kind === kind && candidate.readiness !== 'unavailable',
    ),
  ).length;
  const content = (
    <div className="doc-config" data-testid="execution-config">
      <p>{m.title}</p>
      <h3>{m.sections}</h3>
      <div className="doc-section-list">
        {sectionOrder.map((kind) => {
          const candidate = candidates.find((row) => row.kind === kind);
          const unavailable =
            candidate?.readiness === 'unavailable' || !candidate?.section;
          return (
            <label
              key={kind}
              data-readiness={candidate?.readiness ?? 'unavailable'}
            >
              <input
                type="checkbox"
                disabled={unavailable}
                checked={!unavailable && selected.includes(kind)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, kind]
                      : current.filter((value) => value !== kind),
                  )
                }
              />
              <span>
                <strong>{m[kind]}</strong>
                <small>
                  {candidate?.reason
                    ? (m.reason[candidate.reason as keyof typeof m.reason] ??
                      candidate.reason)
                    : m[candidate?.readiness ?? 'unavailable']}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      {candidates.find((row) => row.kind === 'cutting-plan')?.readiness ===
        'unavailable' &&
        candidates.find((row) => row.kind === 'member-fabrication')
          ?.readiness !== 'unavailable' && (
          <button type="button" className="doc-plan-link" onClick={onPlanK1}>
            {m.planAction} →
          </button>
        )}
      <button
        type="button"
        className="doc-preview-button"
        disabled={!readyCount}
        onClick={() =>
          setPreview(
            buildExecutionDocument({
              source,
              candidates,
              selected,
              generatedAt: new Date().toISOString(),
            }),
          )
        }
      >
        {m.preview}
      </button>
      {!readyCount && <small>{m.noSelection}</small>}
    </div>
  );
  return (
    <>
      {mobile ? (
        <MobileSheet title={m.export} onClose={onClose} expanded>
          {content}
        </MobileSheet>
      ) : (
        <div className="doc-config-layer">
          <button
            className="doc-config-backdrop"
            aria-label={m.close}
            onClick={onClose}
          />
          <section
            ref={dialog}
            tabIndex={-1}
            className="doc-config-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={m.export}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
              }
              if (event.key !== 'Tab') return;
              const focusable = [
                ...(dialog.current?.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled])',
                ) ?? []),
              ];
              if (!focusable.length) return;
              if (event.shiftKey && document.activeElement === focusable[0]) {
                event.preventDefault();
                focusable.at(-1)?.focus();
              } else if (
                !event.shiftKey &&
                document.activeElement === focusable.at(-1)
              ) {
                event.preventDefault();
                focusable[0]?.focus();
              }
            }}
          >
            <header>
              <h2>{m.export}</h2>
              <button type="button" onClick={onClose}>
                {m.close}
              </button>
            </header>
            {content}
          </section>
        </div>
      )}
      {preview && (
        <DocumentPreview
          execution={preview}
          unit={unit}
          onBack={() => setPreview(undefined)}
          onClose={onClose}
        />
      )}
    </>
  );
}
