import type {
  AnchorageChoice,
  JoiningStyle,
  PracticeRationale,
} from '@cieslacalc/connection-core';

/** Copy for the VNext-4 connection practice assistant (PL/EN). */
const pl = {
  open: 'Zaproponuj połączenia',
  title: 'Połączenia wg praktyki ciesielskiej',
  intro:
    'Odpowiedz na dwa pytania — RoofCalc zaproponuje rodzaj połączenia dla każdego węzła tego dachu. Ty decydujesz, co przyjąć.',
  boundary:
    'To praktyka wykonawcza, nie obliczenia. Liczbę, średnicę i rozstaw łączników oraz nośność połączeń ustala projektant (PN-EN 1995-1-1).',
  styleQuestion: 'Jak łączysz elementy więźby?',
  style: {
    carpentry: {
      title: 'Ciesielsko',
      help: 'Zaciosy i nakładki, łączone gwoździami, wkrętami lub śrubami.',
    },
    connectors: {
      title: 'Łącznikami stalowymi',
      help: 'Łączniki krokwiowe, kątowniki i wieszaki tam, gdzie zwykle się je stosuje.',
    },
  } satisfies Record<JoiningStyle, { title: string; help: string }>,
  anchorageQuestion: 'Czym kotwisz murłatę do wieńca?',
  anchorage: {
    'anchor-rod': 'Kotwy (pręty gwintowane) w wieńcu',
    'perforated-strap': 'Taśmy perforowane',
    undecided: 'Jeszcze nie wiem — zdecyduje projektant',
  } satisfies Record<AnchorageChoice, string>,
  pickStyle: 'Wybierz sposób łączenia, aby zobaczyć propozycję.',
  proposalTitle: 'Propozycja dla tego dachu',
  include: 'Przyjmij',
  yourDecision: (text: string) => `Masz już: ${text}. Zostanie, jeśli nie zaznaczysz.`,
  noProposal: 'Bez propozycji — szczegół ustala projektant.',
  change: 'Inny rodzaj',
  proposed: 'proponowane',
  apply: (count: number) => `Zastosuj (${count})`,
  cancel: 'Anuluj',
  applied:
    'Zastosowano propozycję połączeń. Cofniesz ją przyciskiem Cofnij (Ctrl+Z).',
  sourcesTitle: 'Źródła praktyki',
  rationale: {
    'notch-and-nails':
      'Krokiew oparta zaciosem na podporze i przybita gwoździami (zwykle wbijanymi ukośnie).',
    'notch-and-rafter-tie':
      'Zacios na podporze i stalowy łącznik krokwiowy przybity gwoździami do krokwi i podpory.',
    'hip-bearing-bracket':
      'Krokiew narożna oparta na narożu murłat i spięta kątownikiem ciesielskim.',
    'lapped-collar-bolts':
      'Jętka nakładana z boku krokwi i łączona śrubami w wierconych otworach.',
    'lapped-collar-screws':
      'Jętka nakładana z boku krokwi i łączona wkrętami ciesielskimi — szybki montaż.',
    'ridge-nailed':
      'Krokwie dosunięte do deski kalenicowej (lub do siebie) i przybite gwoździami.',
    'ridge-screwed': 'Krokwie w kalenicy skręcone wkrętami konstrukcyjnymi.',
    'header-nailed':
      'Wymian przybity gwoździami do krokwi; przerwana krokiew oparta na wymianie.',
    'header-hanger':
      'Wymian i przerwane krokwie zawieszone na stalowych wieszakach belek.',
    'jack-to-hip-nailed':
      'Kulawka docięta skośnie do boku krokwi narożnej i przybita gwoździami.',
    'jack-to-hip-hanger':
      'Kulawka na wieszaku z kątem pochylenia i skosu, przy boku krokwi narożnej.',
    'cast-in-anchors':
      'Murłata na kotwach (prętach gwintowanych) osadzonych w wieńcu, na izolacji przeciwwilgociowej.',
    'anchorage-straps':
      'Murłata przytrzymana taśmami perforowanymi zakotwionymi w ścianie lub wieńcu.',
    'layer-nails': 'Łaty i kontrłaty przybite gwoździami na każdym skrzyżowaniu.',
    'designer-detail':
      'Brak jednego typowego rozwiązania — ten węzeł szczegółowo rozwiązuje projektant.',
  } satisfies Record<PracticeRationale, string>,
};

type PracticeCopy = typeof pl;

const en: PracticeCopy = {
  open: 'Suggest connections',
  title: 'Connections from carpentry practice',
  intro:
    'Answer two questions and RoofCalc suggests a connection type for every node of this roof. You decide what to accept.',
  boundary:
    'This is site practice, not a calculation. The number, diameter and spacing of fasteners and the capacity of a joint are set by the structural designer (EN 1995-1-1).',
  styleQuestion: 'How do you join the roof timber?',
  style: {
    carpentry: {
      title: 'Carpentry joints',
      help: 'Notches and laps fixed with nails, screws or bolts.',
    },
    connectors: {
      title: 'Steel connectors',
      help: 'Rafter ties, angle brackets and hangers where they are usually used.',
    },
  },
  anchorageQuestion: 'How is the wall plate anchored to the ring beam?',
  anchorage: {
    'anchor-rod': 'Anchor rods (threaded bars) in the ring beam',
    'perforated-strap': 'Perforated straps',
    undecided: 'Not decided yet — the designer decides',
  },
  pickStyle: 'Choose how you join the timber to see the suggestion.',
  proposalTitle: 'Suggestion for this roof',
  include: 'Accept',
  yourDecision: (text: string) =>
    `You already chose: ${text}. It stays unless you tick this.`,
  noProposal: 'No suggestion — the designer details this node.',
  change: 'Another type',
  proposed: 'suggested',
  apply: (count: number) => `Apply (${count})`,
  cancel: 'Cancel',
  applied: 'Connection suggestion applied. Undo (Ctrl+Z) reverts it.',
  sourcesTitle: 'Practice sources',
  rationale: {
    'notch-and-nails':
      'Rafter seated with a birdsmouth on the support and nailed (usually skew-nailed).',
    'notch-and-rafter-tie':
      'Birdsmouth seat plus a steel rafter tie nailed to the rafter and the support.',
    'hip-bearing-bracket':
      'Hip rafter bearing on the wall-plate corner and tied with an angle bracket.',
    'lapped-collar-bolts':
      'Collar tie lapped onto the rafter side and bolted through drilled holes.',
    'lapped-collar-screws':
      'Collar tie lapped onto the rafter side and fixed with timber screws — quick to install.',
    'ridge-nailed':
      'Rafters butted to the ridge board (or to each other) and nailed.',
    'ridge-screwed': 'Rafters at the ridge fixed with structural screws.',
    'header-nailed':
      'Header nailed to the rafters; the interrupted rafter bears on the header.',
    'header-hanger':
      'Header and interrupted rafters hung on steel joist hangers.',
    'jack-to-hip-nailed':
      'Jack rafter cut on the skew to the hip side face and nailed.',
    'jack-to-hip-hanger':
      'Jack rafter on a sloped and skewed hanger at the hip side face.',
    'cast-in-anchors':
      'Wall plate on anchor rods cast into the ring beam, over a damp-proof layer.',
    'anchorage-straps':
      'Wall plate held down by perforated straps anchored to the wall or ring beam.',
    'layer-nails': 'Battens and counter-battens nailed at every crossing.',
    'designer-detail':
      'No single common detail — the designer details this node.',
  },
};

export function practiceCopy(language: string): PracticeCopy {
  return language.startsWith('pl') ? pl : en;
}

export type { PracticeCopy };
