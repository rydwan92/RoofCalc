import type {
  ConnectionTypeId,
  DetailingCheck,
  ModelledInterface,
  ReferenceSubject,
  RoofJunctionKind,
  RoofMemberRole,
  RoofNodeKind,
  StandardId,
} from '@cieslacalc/connection-core';

/**
 * Copy for the lazily loaded connection plan (PL/EN). Domain packages hold
 * codes only; every label, description and standard title is here.
 */
const pl = {
  title: 'Plan połączeń',
  subtitle:
    'Węzły więźby: jak łączysz elementy, z jakich łączników i na jakiej podstawie normowej.',
  boundary:
    'RoofCalc liczy geometrię i sprawdza rozstawy łączników. Nie wymiaruje połączeń — liczbę i nośność łączników ustala projektant konstrukcji wg PN-EN 1995-1-1.',
  summary: {
    nodeKinds: 'Rodzaje węzłów',
    occurrences: 'Węzłów w dachu',
    planned: 'Zaplanowane',
    checkDetailing: 'Do poprawy',
  },
  legend: 'Elementy',
  count: (count: number) =>
    `${count} ${count === 1 ? 'węzeł' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'węzły' : 'węzłów'}`,
  axes: (count: number) =>
    `${count} ${count === 1 ? 'oś' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'osie' : 'osi'}`,
  carpentry: 'Połączenie ciesielskie',
  carpentryNone: 'Brak połączenia ciesielskiego w modelu',
  changeInStructure: 'Zmień w konstrukcji',
  fastening: 'Łączniki trzpieniowe',
  connector: 'Łącznik stalowy',
  none: '— bez —',
  choose: '— wybierz —',
  diameter: 'Średnica d',
  perNode: 'Sztuk na węzeł',
  note: 'Uwagi (wyrób, odnośnik do projektu)',
  notePlaceholder: 'np. kotwa krokwiowa wg projektu, poz. 4.2',
  references: 'Podstawa normowa',
  edition: (edition?: string) =>
    edition ? edition : 'aktualne wydanie sprawdź w katalogu PKN',
  status: {
    planned: 'Zaplanowane',
    'not-planned': 'Do zaplanowania',
    'check-detailing': 'Rozstawy się nie mieszczą',
  },
  modelled: {
    resolved: 'Geometria obliczona',
    named: 'Wybrane — geometria nie jest modelowana',
    undecided: 'Do decyzji',
  } satisfies Record<ModelledInterface['status'], string>,
  plannedQuantity: (fasteners?: number, connectors?: number) =>
    [
      fasteners !== undefined
        ? `${fasteners} szt. łączników trzpieniowych`
        : '',
      connectors !== undefined ? `${connectors} szt. łączników stalowych` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  quantityNote: 'ilość z planu — orientacyjna, nie zamówienie',
  spacingTitle: (table: string) =>
    `Minimalne rozstawy wg PN-EN 1995-1-1 ${table} (obwiednia kierunków siły)`,
  spacingValues:
    'a1 wzdłuż włókien · a2 w poprzek · a3 od końca · a4 od krawędzi',
  rowFits: (
    count: number,
    d: number,
    member: string,
    required: number,
    available: number,
  ) =>
    `Szereg ${count} × Ø${d} w poprzek elementu „${member}”: potrzeba ${required} mm, jest ${available} mm.`,
  rowTooShallow: (
    count: number,
    d: number,
    member: string,
    required: number,
    available: number,
    max: number,
  ) =>
    `Szereg ${count} × Ø${d} nie mieści się w elemencie „${member}”: potrzeba ${required} mm, jest ${available} mm. Zmieść najwyżej ${max} szt. w jednym szeregu albo zmniejsz średnicę.`,
  detailingOnly: 'To sprawdzenie geometrii rozmieszczenia, nie nośności.',
  reason: {
    'nails-table-not-verified':
      'Rozstawy gwoździ wg PN-EN 1995-1-1 Tabl. 8.2 — RoofCalc jeszcze ich nie liczy (wartości tablicy są w weryfikacji).',
    'screws-product-specific':
      'Rozstawy wkrętów zależą od wyrobu (ETA) lub PN-EN 1995-1-1 8.7 — sprawdź deklarację producenta.',
    'manufacturer-declared':
      'Rozstawy, łączniki montażowe i nośność wg deklaracji producenta (ETA / DoP).',
    'diameter-missing':
      'Podaj średnicę śruby lub trzpienia (6–30 mm), aby sprawdzić rozstawy.',
    'section-unknown':
      'Brak przekroju jednego z elementów — uzupełnij go w konstrukcji.',
    'layout-specific':
      'Rozmieszczenie zależy od układu węzła — rozstawy wg tablic EC5 sprawdza projektant.',
  } satisfies Record<
    Extract<DetailingCheck, { kind: 'not-computed' }>['reason'],
    string
  >,
  basisTitle: 'Wspólna podstawa projektu konstrukcji dachu',
  basisHint:
    'Obciążenia i materiał, od których projektant zaczyna wymiarowanie każdego połączenia.',
  junctionsTitle: 'Łączenia dachów (dachy złożone) — w przygotowaniu',
  junctionsHint:
    'Projekt zawiera dziś jeden dach. Łączenie dwóch dachów zostanie dodane jako osobny węzeł ponad dachami — nigdy nie jest zgadywane z nakładającej się geometrii. Każdy rodzaj będzie wymagał jawnych danych:',
  junctions: {
    'valley-intersection': 'Przenikanie dachów z koszem',
    'ridge-into-roof-plane':
      'Kalenica dochodząca do połaci (rzut w kształcie T lub L)',
    'wall-abutment': 'Dach niższy przy ścianie wyższego budynku',
    'lean-to': 'Przybudówka z dachem pulpitowym',
    dormer: 'Lukarna',
  } satisfies Record<RoofJunctionKind, string>,
  junctionNeeds:
    'potrzebne: oba kąty, wysokości okapów, położenie w rzucie, podparcie kosza',
  roles: {
    'common-rafter': 'Krokiew K1',
    'hip-rafter': 'Krokiew narożna H1',
    'jack-rafter': 'Kulawka J1',
    'wall-plate': 'Murłata',
    'ridge-board': 'Kalenica',
    purlin: 'Płatew',
    'collar-tie': 'Jętka C1',
    'opening-header': 'Wymian',
    'counter-batten': 'Kontrłata',
    batten: 'Łata',
    substrate: 'Wieniec / mur',
  } satisfies Record<RoofMemberRole, string>,
  nodes: {
    'rafter-wall-plate': 'Krokiew — murłata',
    'rafter-ridge': 'Krokiew — kalenica',
    'rafter-purlin': 'Krokiew — płatew',
    'collar-tie-rafter': 'Jętka — krokiew',
    'hip-rafter-ridge': 'Krokiew narożna — kalenica',
    'hip-rafter-wall-plate': 'Krokiew narożna — naroże murłat',
    'jack-rafter-hip-rafter': 'Kulawka — krokiew narożna',
    'jack-rafter-wall-plate': 'Kulawka — murłata',
    'opening-header-rafter': 'Wymian — krokiew (otwór)',
    'wall-plate-anchorage': 'Murłata — wieniec (kotwienie)',
    'counter-batten-rafter': 'Kontrłata — krokiew',
    'batten-counter-batten': 'Łata — kontrłata',
  } satisfies Record<RoofNodeKind, string>,
  nodeHelp: {
    'rafter-wall-plate':
      'Dolne oparcie krokwi. Przenosi docisk na murłatę i musi zabezpieczać krokiew przed poderwaniem przez wiatr.',
    'rafter-ridge': 'Górny koniec krokwi w kalenicy.',
    'rafter-purlin': 'Pośrednie oparcie krokwi na płatwi.',
    'collar-tie-rafter':
      'Jętka spina przeciwległe krokwie i ogranicza ich ugięcie i rozpieranie.',
    'hip-rafter-ridge': 'Zbieg krokwi narożnych z kalenicą.',
    'hip-rafter-wall-plate': 'Oparcie krokwi narożnej na narożu murłat.',
    'jack-rafter-hip-rafter': 'Kulawka dochodzi do boku krokwi narożnej.',
    'jack-rafter-wall-plate': 'Dolne oparcie kulawki na murłacie.',
    'opening-header-rafter':
      'Wymian przy oknie dachowym przejmuje przeciętą krokiew i oddaje obciążenie na krokwie skrajne.',
    'wall-plate-anchorage':
      'Kotwienie murłaty w wieńcu przenosi siły poziome i ssanie wiatru na ściany.',
    'counter-batten-rafter': 'Mocowanie kontrłat do krokwi wzdłuż każdej osi.',
    'batten-counter-batten':
      'Mocowanie łat na każdym skrzyżowaniu z kontrłatą.',
  } satisfies Record<RoofNodeKind, string>,
  types: {
    'seat-notch': 'Zacios (siodełko) na podporze',
    'ridge-board-butt': 'Styk z deską kalenicową (cięcie pionowe)',
    'rafters-direct-butt': 'Styk krokwi w osi kalenicy',
    'ridge-half-lap': 'Nakładka w kalenicy',
    'ridge-bridle': 'Połączenie na czop i widlicę',
    'collar-lap': 'Jętka nakładana na krokwie',
    'hip-ridge-cheek-cut': 'Cięcie podwójne krokwi narożnej',
    'hip-face-butt': 'Styk kulawki z bokiem krokwi narożnej',
    nails: 'Gwoździe',
    screws: 'Wkręty konstrukcyjne',
    bolts: 'Śruby z nakrętką (sworznie)',
    dowels: 'Trzpienie stalowe',
    'angle-bracket': 'Kątownik ciesielski',
    'rafter-tie': 'Łącznik krokwiowy (kotwa krokwiowa)',
    'joist-hanger': 'Wieszak belki',
    'punched-metal-plate': 'Płytka kolczasta',
    'toothed-plate-connector': 'Pierścień / płytka zębata',
    'perforated-strap': 'Taśma perforowana',
    'anchor-rod': 'Kotwa (pręt gwintowany) w wieńcu',
  } satisfies Record<ConnectionTypeId, string>,
  standards: {
    'PN-EN 1990': 'Eurokod — Podstawy projektowania konstrukcji',
    'PN-EN 1991-1-1':
      'Eurokod 1 — Ciężar objętościowy, ciężar własny, obciążenia użytkowe',
    'PN-EN 1991-1-3': 'Eurokod 1 — Obciążenie śniegiem',
    'PN-EN 1991-1-4': 'Eurokod 1 — Oddziaływania wiatru',
    'PN-EN 1995-1-1': 'Eurokod 5 — Konstrukcje drewniane: reguły ogólne',
    'PN-EN 1995-1-2': 'Eurokod 5 — Konstrukcje drewniane: warunki pożarowe',
    'PN-EN 338': 'Drewno konstrukcyjne — Klasy wytrzymałości',
    'PN-EN 14081-1':
      'Drewno konstrukcyjne sortowane wytrzymałościowo — Wymagania ogólne',
    'PN-EN 14592': 'Konstrukcje drewniane — Łączniki trzpieniowe',
    'PN-EN 14545': 'Konstrukcje drewniane — Łączniki',
    'PN-EN 912': 'Łączniki do drewna — Pierścienie i płytki zębate',
    'PN-EN 1992-4': 'Eurokod 2 — Zamocowania w betonie',
  } satisfies Record<StandardId, string>,
  subjects: {
    'bearing-perpendicular-to-grain': 'docisk w poprzek włókien (oparcie)',
    'notched-member': 'elementy z wcięciami',
    'nailed-connection': 'połączenia na gwoździe',
    'screwed-connection': 'połączenia na wkręty',
    'bolted-connection': 'połączenia na śruby',
    'dowelled-connection': 'połączenia na trzpienie',
    'punched-metal-plate': 'płytki kolczaste',
    'toothed-plate-connector': 'pierścienie i płytki zębate',
    'multiple-fasteners': 'wiele łączników w szeregu',
    'spacing-nails': 'rozstawy gwoździ',
    'spacing-bolts': 'rozstawy śrub',
    'spacing-dowels': 'rozstawy trzpieni',
    'detailing-mechanical': 'wykonanie połączeń na łączniki',
    'fastener-product': 'wymagania dla wyrobu',
    'connector-product': 'wymagania dla wyrobu',
    'ring-connector-product': 'wymagania dla wyrobu',
    'anchorage-in-concrete': 'kotwienie w betonie',
    'strength-class': 'klasy wytrzymałości',
    'strength-grading': 'sortowanie wytrzymałościowe',
    'loads-snow': 'obciążenie śniegiem',
    'loads-wind': 'obciążenie wiatrem',
    'loads-self-weight': 'ciężar własny i obciążenia użytkowe',
    'design-basis': 'podstawy projektowania',
    fire: 'odporność ogniowa',
  } satisfies Record<ReferenceSubject, string>,
};

type ConnectionsCopy = typeof pl;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const en: ConnectionsCopy = {
  ...pl,
  title: 'Connection plan',
  subtitle:
    'Roof timber nodes: how members are joined, with which fasteners and on which standard.',
  boundary:
    'RoofCalc computes geometry and checks fastener spacing. It does not design connections — the number and capacity of fasteners are set by the structural designer to EN 1995-1-1.',
  summary: {
    nodeKinds: 'Node kinds',
    occurrences: 'Nodes in the roof',
    planned: 'Planned',
    checkDetailing: 'To fix',
  },
  legend: 'Members',
  count: (count) => plural(count, 'node', 'nodes'),
  axes: (count) => plural(count, 'axis', 'axes'),
  carpentry: 'Carpentry joint',
  carpentryNone: 'No carpentry joint in the model',
  changeInStructure: 'Change in the structure',
  fastening: 'Dowel-type fasteners',
  connector: 'Steel connector',
  none: '— none —',
  choose: '— choose —',
  diameter: 'Diameter d',
  perNode: 'Pieces per node',
  note: 'Notes (product, design reference)',
  notePlaceholder: 'e.g. rafter tie per design, item 4.2',
  references: 'Standards',
  edition: (edition) =>
    edition ?? 'check the current edition in the PKN catalogue',
  status: {
    planned: 'Planned',
    'not-planned': 'To plan',
    'check-detailing': 'Spacing does not fit',
  },
  modelled: {
    resolved: 'Geometry computed',
    named: 'Chosen — geometry not modelled',
    undecided: 'To decide',
  },
  plannedQuantity: (fasteners, connectors) =>
    [
      fasteners !== undefined ? `${fasteners} dowel-type fasteners` : '',
      connectors !== undefined ? `${connectors} steel connectors` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  quantityNote: 'planned quantity — approximate, not an order',
  spacingTitle: (table) =>
    `Minimum spacing to EN 1995-1-1 ${table.replace('Tablica', 'Table')} (envelope over force directions)`,
  spacingValues:
    'a1 along the grain · a2 across · a3 to the end · a4 to the edge',
  rowFits: (count, d, member, required, available) =>
    `A row of ${count} × Ø${d} across “${member}”: needs ${required} mm, has ${available} mm.`,
  rowTooShallow: (count, d, member, required, available, max) =>
    `A row of ${count} × Ø${d} does not fit in “${member}”: needs ${required} mm, has ${available} mm. Fit at most ${max} in one row or use a smaller diameter.`,
  detailingOnly: 'This checks placement geometry, not capacity.',
  reason: {
    'nails-table-not-verified':
      'Nail spacing to EN 1995-1-1 Table 8.2 — RoofCalc does not compute it yet (the table values are being verified).',
    'screws-product-specific':
      'Screw spacing depends on the product (ETA) or EN 1995-1-1 8.7 — check the manufacturer’s declaration.',
    'manufacturer-declared':
      'Spacing, fixing nails and capacity per the manufacturer’s declaration (ETA / DoP).',
    'diameter-missing':
      'Enter the bolt or dowel diameter (6–30 mm) to check the spacing.',
    'section-unknown':
      'A member section is missing — complete it in the structure.',
    'layout-specific':
      'Placement depends on the node layout — the designer checks spacing to the EC5 tables.',
  },
  basisTitle: 'Common design basis of the roof structure',
  basisHint:
    'Loads and material the designer starts from for every connection.',
  junctionsTitle: 'Roof junctions (compound roofs) — in preparation',
  junctionsHint:
    'The project holds one roof today. Joining two roofs will be added as a separate node above the roofs — never guessed from overlapping geometry. Each kind will need explicit data:',
  junctions: {
    'valley-intersection': 'Intersecting roofs with a valley',
    'ridge-into-roof-plane': 'Ridge running into a roof plane (T or L plan)',
    'wall-abutment': 'Lower roof against a higher wall',
    'lean-to': 'Lean-to with a mono-pitch roof',
    dormer: 'Dormer',
  },
  junctionNeeds:
    'needs: both pitches, eave heights, plan position, valley support',
  roles: {
    'common-rafter': 'Rafter K1',
    'hip-rafter': 'Hip rafter H1',
    'jack-rafter': 'Jack rafter J1',
    'wall-plate': 'Wall plate',
    'ridge-board': 'Ridge',
    purlin: 'Purlin',
    'collar-tie': 'Collar tie C1',
    'opening-header': 'Header',
    'counter-batten': 'Counter-batten',
    batten: 'Batten',
    substrate: 'Ring beam / wall',
  },
  nodes: {
    'rafter-wall-plate': 'Rafter — wall plate',
    'rafter-ridge': 'Rafter — ridge',
    'rafter-purlin': 'Rafter — purlin',
    'collar-tie-rafter': 'Collar tie — rafter',
    'hip-rafter-ridge': 'Hip rafter — ridge',
    'hip-rafter-wall-plate': 'Hip rafter — wall-plate corner',
    'jack-rafter-hip-rafter': 'Jack rafter — hip rafter',
    'jack-rafter-wall-plate': 'Jack rafter — wall plate',
    'opening-header-rafter': 'Header — rafter (opening)',
    'wall-plate-anchorage': 'Wall plate — ring beam (anchorage)',
    'counter-batten-rafter': 'Counter-batten — rafter',
    'batten-counter-batten': 'Batten — counter-batten',
  },
  nodeHelp: {
    'rafter-wall-plate':
      'Lower bearing of the rafter. Transfers bearing to the wall plate and must hold the rafter down against wind uplift.',
    'rafter-ridge': 'Upper end of the rafter at the ridge.',
    'rafter-purlin': 'Intermediate bearing of the rafter on a purlin.',
    'collar-tie-rafter':
      'The collar tie joins opposite rafters and limits their deflection and spread.',
    'hip-rafter-ridge': 'Where the hip rafters meet the ridge.',
    'hip-rafter-wall-plate':
      'Bearing of the hip rafter on the wall-plate corner.',
    'jack-rafter-hip-rafter':
      'The jack rafter meets the side of the hip rafter.',
    'jack-rafter-wall-plate': 'Lower bearing of the jack rafter.',
    'opening-header-rafter':
      'The header at a roof window carries the cut rafter onto the trimmer rafters.',
    'wall-plate-anchorage':
      'Anchoring the wall plate to the ring beam transfers horizontal forces and wind suction to the walls.',
    'counter-batten-rafter': 'Fixing counter-battens to every rafter axis.',
    'batten-counter-batten': 'Fixing battens at every counter-batten crossing.',
  },
  types: {
    'seat-notch': 'Birdsmouth seat notch',
    'ridge-board-butt': 'Plumb butt against the ridge board',
    'rafters-direct-butt': 'Rafters meeting on the ridge axis',
    'ridge-half-lap': 'Half-lap at the ridge',
    'ridge-bridle': 'Bridle (open mortise and tenon)',
    'collar-lap': 'Collar tie lapped onto the rafters',
    'hip-ridge-cheek-cut': 'Hip rafter double cheek cut',
    'hip-face-butt': 'Jack butted to the hip side face',
    nails: 'Nails',
    screws: 'Structural screws',
    bolts: 'Bolts with nuts',
    dowels: 'Steel dowels',
    'angle-bracket': 'Angle bracket',
    'rafter-tie': 'Rafter tie',
    'joist-hanger': 'Joist hanger',
    'punched-metal-plate': 'Punched metal plate',
    'toothed-plate-connector': 'Toothed-plate connector',
    'perforated-strap': 'Perforated strap',
    'anchor-rod': 'Anchor rod in the ring beam',
  },
  standards: {
    'PN-EN 1990': 'Eurocode — Basis of structural design',
    'PN-EN 1991-1-1': 'Eurocode 1 — Densities, self-weight, imposed loads',
    'PN-EN 1991-1-3': 'Eurocode 1 — Snow loads',
    'PN-EN 1991-1-4': 'Eurocode 1 — Wind actions',
    'PN-EN 1995-1-1': 'Eurocode 5 — Timber structures: general rules',
    'PN-EN 1995-1-2': 'Eurocode 5 — Timber structures: fire design',
    'PN-EN 338': 'Structural timber — Strength classes',
    'PN-EN 14081-1': 'Strength-graded structural timber — General requirements',
    'PN-EN 14592': 'Timber structures — Dowel-type fasteners',
    'PN-EN 14545': 'Timber structures — Connectors',
    'PN-EN 912': 'Timber fasteners — Connectors for timbers',
    'PN-EN 1992-4': 'Eurocode 2 — Fastenings for use in concrete',
  },
  subjects: {
    'bearing-perpendicular-to-grain': 'compression perpendicular to the grain',
    'notched-member': 'members with notches',
    'nailed-connection': 'nailed connections',
    'screwed-connection': 'screwed connections',
    'bolted-connection': 'bolted connections',
    'dowelled-connection': 'dowelled connections',
    'punched-metal-plate': 'punched metal plates',
    'toothed-plate-connector': 'toothed-plate connectors',
    'multiple-fasteners': 'multiple fasteners in a row',
    'spacing-nails': 'nail spacing',
    'spacing-bolts': 'bolt spacing',
    'spacing-dowels': 'dowel spacing',
    'detailing-mechanical': 'detailing of fastened connections',
    'fastener-product': 'product requirements',
    'connector-product': 'product requirements',
    'ring-connector-product': 'product requirements',
    'anchorage-in-concrete': 'anchorage in concrete',
    'strength-class': 'strength classes',
    'strength-grading': 'strength grading',
    'loads-snow': 'snow loads',
    'loads-wind': 'wind actions',
    'loads-self-weight': 'self-weight and imposed loads',
    'design-basis': 'basis of design',
    fire: 'fire resistance',
  },
};

export function connectionsCopy(language: string): ConnectionsCopy {
  return language.startsWith('pl') ? pl : en;
}

export type { ConnectionsCopy };
