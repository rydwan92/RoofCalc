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
import { materialCopy, materialText } from './material-copy';
import type { DocumentStatus } from '@cieslacalc/document-core';
import type { ReadinessDocumentKind } from './project-readiness';
import { readinessIssueText } from './readiness-copy';

type Params = Record<string, string | number | undefined>;
/** The document follows the application language (set on <html lang>). */
const documentLocale = () =>
  (typeof document !== 'undefined' && document.documentElement.lang) || 'pl';
const num = (value: string | number | undefined) =>
  typeof value === 'number'
    ? new Intl.NumberFormat(documentLocale(), {
        maximumFractionDigits: 2,
      }).format(value)
    : (value ?? '—');
const metres = (mm: string | number | undefined) =>
  typeof mm === 'number' ? num(mm / 1000) : '—';
/** Membrane net → gross with both lap axes, only the parts that exist. */
const membraneSentence = (
  p: Params,
  l: Record<
    | 'lead'
    | 'net'
    | 'gross'
    | 'courses'
    | 'ends'
    | 'ridge'
    | 'plan'
    | 'courseUnit'
    | 'rollUnit',
    string
  >,
) => {
  const parts = [
    p.overlapAreaM2 !== undefined
      ? `${l.courses} +${num(p.overlapAreaM2)} m²`
      : '',
    p.endOverlapAreaM2 ? `${l.ends} +${num(p.endOverlapAreaM2)} m²` : '',
    p.ridgeOverrunAreaM2 ? `${l.ridge} +${num(p.ridgeOverrunAreaM2)} m²` : '',
  ].filter(Boolean);
  return `${l.lead}: ${num(p.netAreaM2)} m² ${l.net} → ${num(p.grossAreaM2)} m² ${l.gross}${
    parts.length ? ` (${parts.join(', ')})` : ''
  }${
    p.rollCount !== undefined
      ? `; ${l.plan}: ${p.courseCount ?? '—'} ${l.courseUnit}, ${p.rollCount} ${l.rollUnit}`
      : ''
  }.`;
};

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
    hip: 'kopertowy',
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
    'cost-estimate': 'Kosztorys',
    'material-list': 'Lista materiałów',
    'no-materials': 'Brak materiałów',
    cost: {
      net: 'Netto',
      tax: 'VAT',
      gross: 'Brutto',
      noVat: 'VAT nie ustawiono',
      incomplete:
        'Kosztorys niekompletny - część pozycji wymaga ceny lub ilości.',
      item: 'Pozycja',
      quantity: 'Ilość',
      unitPrice: 'Cena jedn.',
      category: {
        material: 'Materiał',
        labour: 'Robocizna',
        transport: 'Transport',
        equipment: 'Sprzęt',
        other: 'Inne',
      },
      basis: {
        'procurement-stock': 'Plan zakupu',
        'fabrication-requirement': 'Wymóg przygotowania',
        'geometric-length': 'Geometria',
        'net-area': 'Powierzchnia netto',
        'gross-area': 'Powierzchnia brutto (z zakładami)',
        'effective-coverage': 'Pozycje krycia',
        manual: 'Ręcznie',
      },
      unitLabel: {
        piece: 'szt.',
        m: 'm',
        m2: 'm²',
        m3: 'm³',
        kg: 'kg',
        hour: 'godz.',
        flat: 'kpl.',
      },
    },
    assumptionsHeading: {
      scope: 'Zakres dokumentu',
      limitations: 'Ograniczenia tego projektu',
      notModelled: 'Poza zakresem RoofCalc',
      noLimitations: 'Brak nierozstrzygniętych ograniczeń w tym projekcie.',
    },
    scopeText: {
      'roof-geometry': (p: Params) =>
        `Geometria dachu ${p.roofType === 'hip' ? 'kopertowego' : 'dwuspadowego'}, nachylenie ${num(p.pitchDeg)}°.`,
      'k1-ridge-board': (p: Params) =>
        `K1 (${p.count} szt.): przygotowanie i trasowanie z centralną deską kalenicową.`,
      'k1-direct-meeting': (p: Params) =>
        `K1 (${p.count} szt.): bezpośredni styk przeciwległych krokwi w osi kalenicy.`,
      'k1-cutting-plan': (p: Params) =>
        `Rozkrój K1 na ${p.stockCount} sztukach długości handlowych.`,
      'covering-layout': (p: Params) =>
        `Pokrycie: ${p.count} pozycji krycia w efektywnym układzie.`,
      'battens-layout': (p: Params) =>
        `Łaty: ${p.rows} rzędów, ${metres(p.lengthMm)} m długości montażowej.`,
      'counter-battens-layout': (p: Params) =>
        `Kontrłaty: ${metres(p.lengthMm)} m długości montażowej.`,
      'membrane-roll-plan': (p: Params) =>
        membraneSentence(p, {
          lead: 'Membrana',
          net: 'netto',
          gross: 'z zakładami',
          courses: 'zakłady między pasami',
          ends: 'zakłady na łączeniach rolek',
          ridge: 'nadmiar przy kalenicy',
          plan: 'plan',
          courseUnit: 'pasów',
          rollUnit: 'rol.',
        }),
    },
    limitationText: {
      'membrane-net-only': (p: Params) =>
        `Membrana: znana tylko powierzchnia netto ${num(p.netAreaM2)} m² — bez produktu rolkowego zakłady i plan rolek nie są policzone.`,
      'hip-detail-not-decided': (p: Params) =>
        `Kontrłaty: detal ${p.count} grzbietów H1 nierozstrzygnięty — długość bez przebiegów przy grzbietach.`,
      'batten-gauge-manual-unverified': () =>
        'Łaty: ręczny rozstaw nie został sprawdzony z danymi pokrycia.',
      'batten-no-stock-lengths': () =>
        'Łaty i kontrłaty: długości montażowe, bez podziału na długości handlowe.',
      'covering-coverage-positions': () =>
        'Pokrycie: pozycje krycia to wynik geometryczny, nie liczba do zakupu.',
      'covering-declared-consumption': () =>
        'Pokrycie: ilość wg deklarowanego zużycia producenta — szacunek, nie plan zakupu.',
      'hip-execution-reference-only': () =>
        'Dach kopertowy: H1 i J1 mają geometrię referencyjną; instrukcje cięcia obejmują tylko opracowane elementy.',
      'ridge-half-lap-unresolved': () =>
        'K1: połączenie na nakładkę w kalenicy nie jest jeszcze opracowane, więc przygotowanie elementu i rozkrój K1 są niedostępne.',
      'collar-tie-geometric': () =>
        'Jętka: długość i położenie to wynik geometryczny względem osi krokwi, bez cięć wykonawczych i doboru przekroju.',
      'cost-incomplete': (p: Params) =>
        `Kosztorys: ${p.missingPrices} pozycji bez ceny nie wchodzi do sumy.`,
    },
    notModelledText: {
      'structural-check': 'Weryfikacja nośności, ugięć i stateczności',
      'connector-sizing': 'Dobór łączników i mocowań',
      'waste-and-stock': 'Zapas, odpad i długości handlowe poza rozkrojem K1',
    },
    status: {
      ready: 'Gotowy dokument',
      warning: 'Dokument roboczy',
      blocked: 'Wymaga poprawy — nie do wykonania',
      warningIntro: 'Dokument zawiera ograniczenia opisane poniżej.',
      blockedIntro:
        'Część wyników byłaby myląca. Popraw poniższe problemy przed użyciem dokumentu na budowie.',
    },
    printAnyway: 'Drukuj wersję roboczą',
    fixProblems: 'Napraw problemy',
    documentTitle: {
      execution: 'Pakiet wykonawczy',
      materials: 'Lista materiałów',
      cost: 'Kosztorys',
    },
    reason: {
      'plan-k1-first': 'Najpierw zaplanuj rozkrój K1.',
      'k1-unresolved': 'Brak dowiedzionego blanku K1.',
      'no-layers': 'Nie włączono warstw.',
      'no-covering': 'Nie dodano pokrycia.',
      'no-members': 'Brak elementów.',
      'invalid-roof-surface': 'Sprawdź otwory i powierzchnię dachu.',
      'cutting-incomplete': 'Część blanków pozostaje nieprzypisana.',
      'no-cost-lines': 'Nie dodano żadnej pozycji kosztorysu.',
      'cost-incomplete': 'Część pozycji wymaga jeszcze ceny lub ilości.',
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
    'cost-estimate': 'Cost estimate',
    'material-list': 'Material list',
    'no-materials': 'No materials',
    cost: {
      net: 'Net',
      tax: 'VAT',
      gross: 'Gross',
      noVat: 'VAT not configured',
      incomplete:
        'The estimate is incomplete - some lines need a price or quantity.',
      item: 'Item',
      quantity: 'Quantity',
      unitPrice: 'Unit price',
      category: {
        material: 'Material',
        labour: 'Labour',
        transport: 'Transport',
        equipment: 'Equipment',
        other: 'Other',
      },
      basis: {
        'procurement-stock': 'Purchase plan',
        'fabrication-requirement': 'Fabrication requirement',
        'geometric-length': 'Geometry',
        'net-area': 'Net area',
        'gross-area': 'Gross area (laps included)',
        'effective-coverage': 'Coverage positions',
        manual: 'Manual',
      },
      unitLabel: {
        piece: 'pc',
        m: 'm',
        m2: 'm²',
        m3: 'm³',
        kg: 'kg',
        hour: 'hr',
        flat: 'set',
      },
    },
    assumptionsHeading: {
      scope: 'Document scope',
      limitations: 'Limitations of this project',
      notModelled: 'Outside RoofCalc scope',
      noLimitations: 'No unresolved limitations in this project.',
    },
    scopeText: {
      'roof-geometry': (p: Params) =>
        `${p.roofType === 'hip' ? 'Hip' : 'Gable'} roof geometry, pitch ${num(p.pitchDeg)}°.`,
      'k1-ridge-board': (p: Params) =>
        `K1 (${p.count} pcs): preparation and marking against a centred ridge board.`,
      'k1-direct-meeting': (p: Params) =>
        `K1 (${p.count} pcs): direct meeting of opposing rafters on the ridge axis.`,
      'k1-cutting-plan': (p: Params) =>
        `K1 cutting plan on ${p.stockCount} commercial lengths.`,
      'covering-layout': (p: Params) =>
        `Covering: ${p.count} coverage positions in the effective layout.`,
      'battens-layout': (p: Params) =>
        `Battens: ${p.rows} rows, ${metres(p.lengthMm)} m installation length.`,
      'counter-battens-layout': (p: Params) =>
        `Counter-battens: ${metres(p.lengthMm)} m installation length.`,
      'membrane-roll-plan': (p: Params) =>
        membraneSentence(p, {
          lead: 'Membrane',
          net: 'net',
          gross: 'including laps',
          courses: 'laps between courses',
          ends: 'laps at roll joins',
          ridge: 'ridge overrun',
          plan: 'plan',
          courseUnit: 'courses',
          rollUnit: 'rolls',
        }),
    },
    limitationText: {
      'membrane-net-only': (p: Params) =>
        `Membrane: only the net area ${num(p.netAreaM2)} m² is known — without a roll product laps and a roll plan are not calculated.`,
      'hip-detail-not-decided': (p: Params) =>
        `Counter-battens: the detail at ${p.count} H1 hips is undecided — length excludes runs at hips.`,
      'batten-gauge-manual-unverified': () =>
        'Battens: the manual gauge was not verified against covering data.',
      'batten-no-stock-lengths': () =>
        'Battens and counter-battens: installation lengths, not split into commercial lengths.',
      'covering-coverage-positions': () =>
        'Covering: coverage positions are a geometric result, not a purchase count.',
      'covering-declared-consumption': () =>
        "Covering: quantity from the manufacturer's declared consumption — an estimate, not a purchase plan.",
      'hip-execution-reference-only': () =>
        'Hip roof: H1 and J1 are reference geometry; cutting instructions cover only resolved members.',
      'ridge-half-lap-unresolved': () =>
        'K1: the half-lap ridge connection is not modelled yet, so K1 preparation and cutting are unavailable.',
      'collar-tie-geometric': () =>
        'Collar tie: length and position are geometric, referenced to the rafter axis, without fabrication cuts or section sizing.',
      'cost-incomplete': (p: Params) =>
        `Cost estimate: ${p.missingPrices} items without a price are excluded from the total.`,
    },
    notModelledText: {
      'structural-check':
        'Structural capacity, deflection and stability checks',
      'connector-sizing': 'Connector and fixing sizing',
      'waste-and-stock':
        'Allowance, waste and commercial lengths beyond K1 cutting',
    },
    status: {
      ready: 'Final document',
      warning: 'Working document',
      blocked: 'Needs fixing — not for execution',
      warningIntro: 'This document carries the limitations listed below.',
      blockedIntro:
        'Some results would be misleading. Fix the problems below before using this document on site.',
    },
    printAnyway: 'Print working copy',
    fixProblems: 'Fix problems',
    documentTitle: {
      execution: 'Execution package',
      materials: 'Material list',
      cost: 'Cost estimate',
    },
    reason: {
      'plan-k1-first': 'Plan K1 cutting first.',
      'k1-unresolved': 'K1 blank is not proved.',
      'no-layers': 'No enabled layers.',
      'no-covering': 'No covering assigned.',
      'no-members': 'No members.',
      'invalid-roof-surface': 'Review openings and roof surface.',
      'cutting-incomplete': 'Some blanks are unassigned.',
      'no-cost-lines': 'No estimate lines added yet.',
      'cost-incomplete': 'Some lines still need a price or quantity.',
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
                      {row.layoutFacts.coveringProduct && (
                        <span data-export-fact="covering-product">
                          {' · '}
                          {t('assembly.install.product')}:{' '}
                          {row.layoutFacts.coveringProduct}
                          {row.layoutFacts.installationModeId
                            ? ` (${t('assembly.install.installationMode')}: ${
                                row.layoutFacts.installationModeId ===
                                  'standard' ||
                                row.layoutFacts.installationModeId ===
                                  'manual-standard'
                                  ? t('assembly.install.modeStandard')
                                  : row.layoutFacts.installationModeId
                              })`
                            : ''}
                        </span>
                      )}
                      {row.layoutFacts.mode && row.code === 'L' && (
                        <span data-export-fact="batten-owner">
                          {' · '}
                          {t('assembly.install.regularGauge')}:{' '}
                          {t(
                            `assembly.install.owner.${row.layoutFacts.mode === 'auto-from-covering' ? 'auto' : 'manual'}`,
                          )}
                        </span>
                      )}
                      {row.layoutFacts.workflowState && row.code === 'L' && (
                        <span data-export-fact="batten-state">
                          {' · '}
                          {t(
                            `assembly.install.state.${row.layoutFacts.workflowState}`,
                          )}
                        </span>
                      )}
                      {row.layoutFacts.hipDetail && (
                        <span data-export-fact="hip-detail">
                          {' · '}
                          {t('assembly.hipBoundary.title')}:{' '}
                          {row.layoutFacts.hipDetail === 'not-decided'
                            ? t('assembly.hipBoundary.needsChoice', {
                                count:
                                  row.layoutFacts.unresolvedHipBoundaryCount ??
                                  0,
                              })
                            : t(
                                `assembly.hipBoundary.option.${row.layoutFacts.hipDetail}.label`,
                              )}
                        </span>
                      )}
                      {row.layoutFacts.decisionStatus && (
                        <span>
                          {' · '}
                          {t(
                            `assembly.installationStatus.${row.layoutFacts.decisionStatus}`,
                          )}
                        </span>
                      )}
                      {row.layoutFacts.gaugeSource && (
                        <span>
                          {' · '}
                          {t(
                            `assembly.decisionSource.${row.layoutFacts.gaugeSource}`,
                          )}
                        </span>
                      )}
                      {row.layoutFacts.decisionIssueCodes?.map((code) => (
                        <span key={code}>
                          {' · '}
                          {t(`assembly.installationIssue.${code}`)}
                        </span>
                      ))}
                      {row.layoutFacts.eaveOffsetMm !== undefined && (
                        <span>
                          {' · '}
                          {t('assembly.battenEaveOffset')}:{' '}
                          {length(row.layoutFacts.eaveOffsetMm)} ({m.manual})
                        </span>
                      )}
                      {row.layoutFacts.ridgeOffsetMm !== undefined && (
                        <span>
                          {' · '}
                          {t('assembly.battenRidgeOffset')}:{' '}
                          {length(row.layoutFacts.ridgeOffsetMm)} ({m.manual})
                        </span>
                      )}
                      {row.layoutFacts.autoPlans?.map((plan) => (
                        <span key={plan.planeId}>
                          {' · '}
                          {t(roofPlaneShortLabelKey(plan.planeId))}:{' '}
                          {plan.intervalCount} / {plan.courseCount} {m.courses},{' '}
                          {length(plan.actualGaugeMm)},{' '}
                          {t('assembly.regularBattenSpan')}:{' '}
                          {length(plan.regularSpanMm)}
                        </span>
                      ))}
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
    case 'assumptions': {
      const membraneText = (code: string) =>
        materialText(locale, code) !== code
          ? materialText(locale, code)
          : undefined;
      const limitationLine = (code: string, params?: Params) =>
        (m.limitationText as Record<string, (p: Params) => string>)[code]?.(
          params ?? {},
        ) ??
        (membraneText(code)
          ? `${locale.startsWith('pl') ? 'Membrana' : 'Membrane'}: ${membraneText(code)}`
          : code);
      return (
        <div className="doc-assumptions" data-testid="doc-assumptions">
          <section data-group="scope">
            <h3>{m.assumptionsHeading.scope}</h3>
            <ul>
              {section.scope.map((fact) => (
                <li key={fact.code} data-fact={fact.code}>
                  <span aria-hidden="true">✓</span>
                  {(m.scopeText as Record<string, (p: Params) => string>)[
                    fact.code
                  ]?.(fact.params ?? {}) ?? fact.code}
                </li>
              ))}
            </ul>
          </section>
          <section data-group="limitations">
            <h3>{m.assumptionsHeading.limitations}</h3>
            {section.limitations.length ? (
              <ul>
                {section.limitations.map((fact) => (
                  <li key={fact.code} data-fact={fact.code}>
                    <span aria-hidden="true">⚠</span>
                    {limitationLine(fact.code, fact.params)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{m.assumptionsHeading.noLimitations}</p>
            )}
          </section>
          <section data-group="not-modelled">
            <h3>{m.assumptionsHeading.notModelled}</h3>
            <ul>
              {section.notModelled.map((fact) => (
                <li key={fact.code} data-fact={fact.code}>
                  <span aria-hidden="true">—</span>
                  {(m.notModelledText as Record<string, string>)[fact.code] ??
                    fact.code}
                </li>
              ))}
            </ul>
          </section>
        </div>
      );
    }
    case 'material-list': {
      const mc = materialCopy(locale);
      const unit = (value: string) =>
        ({
          piece: locale.startsWith('pl') ? 'szt.' : 'pcs',
          m2: 'm²',
          roll: locale.startsWith('pl') ? 'rol.' : 'rolls',
          course: locale.startsWith('pl') ? 'pas.' : 'courses',
          'piece/m2': locale.startsWith('pl') ? 'szt./m²' : 'pcs/m²',
        })[value] ?? value;
      const number = (value: number) =>
        new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
          value,
        );
      return (
        <>
          {(['timber', 'layers', 'covering', 'other'] as const).map(
            (category) => (
              <div key={category}>
                <h3>{mc[category]}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>{mc.title}</th>
                      <th>{m.basis}</th>
                      <th>{mc.value}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows
                      .filter((row) => row.category === category)
                      .map((row, index) => {
                        const money = (value: number) =>
                          new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: row.currencyCode ?? 'PLN',
                          }).format(value / 100);
                        return (
                          <tr key={index}>
                            <td>
                              {materialText(locale, row.labelKey)}{' '}
                              {row.description}
                              <p>{row.product}</p>
                              {row.metrics.map((metric) => (
                                <p key={metric.labelKey}>
                                  {materialText(locale, metric.labelKey)}:{' '}
                                  {number(metric.value)}
                                  {metric.maxValue !== undefined
                                    ? `–${number(metric.maxValue)}`
                                    : ''}{' '}
                                  {unit(metric.unit)}
                                </p>
                              ))}
                              {row.warnings.map((warning) => (
                                <p key={warning}>
                                  {materialText(locale, warning)}
                                </p>
                              ))}
                            </td>
                            <td>
                              {row.basis === 'procurement-stock'
                                ? mc.procurement
                                : row.basis === 'fabrication-requirement'
                                  ? mc.fabrication
                                  : row.basis === 'manufacturer'
                                    ? mc.manufacturer
                                    : mc.geometry}
                              <p>
                                {row.minimumQuantity !== undefined &&
                                row.maximumQuantity !== undefined
                                  ? `${number(row.minimumQuantity)}–${number(row.maximumQuantity)}`
                                  : row.quantity !== undefined
                                    ? number(row.quantity)
                                    : '—'}{' '}
                                {unit(row.unit)}
                              </p>
                              {row.partial && <strong>{mc.partial}</strong>}
                            </td>
                            <td>
                              {row.minimumValueMinor !== undefined &&
                              row.maximumValueMinor !== undefined
                                ? `${money(row.minimumValueMinor)}${row.minimumValueMinor !== row.maximumValueMinor ? `–${money(row.maximumValueMinor)}` : ''}`
                                : '—'}
                              <p>
                                {row.priceProvenance === 'manual'
                                  ? mc.manual
                                  : row.priceProvenance}
                              </p>
                              {row.unitPriceMinor !== undefined && (
                                <p>
                                  {mc.price}: {money(row.unitPriceMinor)}/
                                  {unit(row.unit)}
                                </p>
                              )}
                              {row.priceProvenance &&
                                row.priceProvenance !== mc.manual &&
                                row.priceProvenance !== 'manual' && (
                                  <small>{mc.verify}</small>
                                )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ),
          )}
        </>
      );
    }
    case 'cost-estimate': {
      const money = (minor: number) =>
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: section.currencyCode,
        }).format(minor / 100);
      return (
        <>
          {!section.complete && (
            <p className="doc-warning">{m.cost.incomplete}</p>
          )}
          <table className="doc-cost-table">
            <thead>
              <tr>
                <th>{m.cost.item}</th>
                <th>{m.basis}</th>
                <th>{m.cost.quantity}</th>
                <th>{m.cost.unitPrice}</th>
                <th>{m.cost.net}</th>
              </tr>
            </thead>
            <tbody>
              {section.lines.map((row, index) => (
                <tr key={index}>
                  <td>
                    {row.label}
                    <small> · {m.cost.category[row.category]}</small>
                  </td>
                  <td>{m.cost.basis[row.basis]}</td>
                  <td>
                    {new Intl.NumberFormat(locale, {
                      maximumFractionDigits: 2,
                    }).format(row.quantityValue)}{' '}
                    {m.cost.unitLabel[row.quantityUnit]}
                  </td>
                  <td>
                    {row.unitPriceMinor !== undefined
                      ? money(row.unitPriceMinor)
                      : '—'}
                  </td>
                  <td>
                    {row.netMinor !== undefined ? money(row.netMinor) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="doc-cost-totals">
            <span>
              {m.cost.net}: <strong>{money(section.netMinor)}</strong>
            </span>
            {section.taxRateBps !== undefined &&
            section.taxMinor !== undefined ? (
              <>
                <span>
                  {m.cost.tax} ({(section.taxRateBps / 100).toFixed(0)}%):{' '}
                  <strong>{money(section.taxMinor)}</strong>
                </span>
                <span>
                  {m.cost.gross}:{' '}
                  <strong>
                    {money(section.grossMinor ?? section.netMinor)}
                  </strong>
                </span>
              </>
            ) : (
              <span>{m.cost.noVat}</span>
            )}
          </div>
        </>
      );
    }
  }
}

/** V47: the document's readiness, printed on its first page. */
function DocumentStatusBanner({
  status,
  m,
  unit,
}: {
  status: DocumentStatus;
  m: Copy;
  unit: LengthUnit;
}) {
  const { t, i18n } = useTranslation();
  if (status.state === 'ready') return null;
  return (
    <section
      className="doc-status-banner"
      data-state={status.state}
      data-testid="document-status-banner"
      role="note"
    >
      <strong>
        {status.state === 'blocked' ? '✕ ' : '⚠ '}
        {m.status[status.state]}
      </strong>
      <p>
        {status.state === 'blocked'
          ? m.status.blockedIntro
          : m.status.warningIntro}
      </p>
      <ul>
        {status.issues.map((issue) => {
          const text = readinessIssueText(t, issue, unit, i18n.language);
          return (
            <li
              key={`${issue.severity}:${issue.code}`}
              data-severity={issue.severity}
            >
              <b>{text.title}</b> — {text.description}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DocumentPreview({
  execution,
  unit,
  onBack,
  onClose,
  onFixProblems,
  backLabel,
  documentKind = 'execution',
}: {
  backLabel?: string;
  execution: ExecutionDocument;
  unit: LengthUnit;
  onBack: () => void;
  onClose: () => void;
  onFixProblems?: () => void;
  documentKind?: ReadinessDocumentKind;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const state = execution.status?.state ?? 'ready';
  const title = m.documentTitle[documentKind];
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
    document.title = `CieslaCalc_${safeName}_${documentKind === 'execution' ? 'pakiet_wykonawczy' : documentKind === 'materials' ? 'lista_materialow' : 'kosztorys'}${state === 'ready' ? '' : '_roboczy'}`;
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
  }, [documentKind, execution.source.projectName, onBack, state]);
  const date = (raw: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(raw));
  return createPortal(
    <div
      className="doc-preview"
      data-testid="execution-preview"
      data-document-state={state}
    >
      <header className="doc-preview-toolbar">
        <div>
          <span>{m.export}</span>
          <strong>{title}</strong>
          <small>
            {execution.source.projectName}
            <em
              className="doc-state-pill"
              data-state={state}
              data-testid="document-state"
            >
              {state === 'ready' ? '✓ ' : state === 'blocked' ? '✕ ' : '⚠ '}
              {m.status[state]}
            </em>
          </small>
        </div>
        <div>
          <button
            type="button"
            data-testid="document-preview-back"
            onClick={onBack}
          >
            ← {backLabel ?? m.back}
          </button>
          {state === 'blocked' && onFixProblems && (
            <button
              type="button"
              className="doc-print-button"
              data-testid="document-fix-problems"
              onClick={onFixProblems}
            >
              {m.fixProblems}
            </button>
          )}
          <button
            ref={printButton}
            type="button"
            className={
              state === 'blocked' ? 'doc-secondary-print' : 'doc-print-button'
            }
            data-testid="execution-print"
            onClick={() => window.print()}
          >
            {state === 'blocked' ? m.printAnyway : m.print}
          </button>
          <button type="button" onClick={onClose}>
            {m.close}
          </button>
        </div>
      </header>
      <main className="doc-preview-pages">
        {execution.sections.map((section, index) => (
          <article
            className={`doc-page${section.kind === 'assumptions' ? ' is-compact' : ''}`}
            key={section.kind}
            data-section={section.kind}
            data-document-state={state}
          >
            <header className="doc-page-header">
              <span>
                {title} / {String(index + 1).padStart(2, '0')}
                {state !== 'ready' && (
                  <b className="doc-page-state"> · {m.status[state]}</b>
                )}
              </span>
              <h1>{m[section.kind]}</h1>
              <p>{execution.source.projectName}</p>
            </header>
            <div className="doc-page-content">
              {index === 0 && execution.status && (
                <DocumentStatusBanner
                  status={execution.status}
                  m={m}
                  unit={unit}
                />
              )}
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
  initialSelection,
  startInPreview = false,
  backLabel,
  documentKind = 'execution',
  documentStatus,
  onFixProblems,
}: {
  source: DocumentSource;
  facts: ExportFacts;
  /** V47: which Document Hub document this preview represents. */
  documentKind?: ReadinessDocumentKind;
  /** V47: readiness of that document, printed with it. */
  documentStatus?: DocumentStatus;
  onFixProblems?: () => void;
  unit: LengthUnit;
  mobile: boolean;
  onClose: () => void;
  onPlanK1: () => void;
  /** V37 Document Hub: preselected sections for one document type. */
  initialSelection?: readonly SectionKind[];
  /** V37 Document Hub: open the preview directly; Back returns to the hub. */
  startInPreview?: boolean;
  backLabel?: string;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [candidates] = useState<SectionCandidate[]>(() =>
    createExportCandidates(facts),
  );
  const [selected, setSelected] = useState<SectionKind[]>(() =>
    initialSelection
      ? initialSelection.filter((kind) =>
          candidates.some(
            (candidate) =>
              candidate.kind === kind &&
              candidate.readiness !== 'unavailable' &&
              !!candidate.section,
          ),
        )
      : defaultSectionSelection(candidates),
  );
  const [preview, setPreview] = useState<ExecutionDocument | undefined>(() =>
    startInPreview
      ? buildExecutionDocument({
          source,
          candidates,
          selected: initialSelection
            ? initialSelection.filter((kind) =>
                candidates.some(
                  (candidate) =>
                    candidate.kind === kind &&
                    candidate.readiness !== 'unavailable' &&
                    !!candidate.section,
                ),
              )
            : defaultSectionSelection(candidates),
          generatedAt: new Date().toISOString(),
          status: documentStatus,
        })
      : undefined,
  );
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
              status: documentStatus,
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
      {startInPreview ? null : mobile ? (
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
          onBack={() => (startInPreview ? onClose() : setPreview(undefined))}
          onClose={onClose}
          onFixProblems={onFixProblems}
          documentKind={documentKind}
          backLabel={startInPreview ? backLabel : undefined}
        />
      )}
    </>
  );
}
