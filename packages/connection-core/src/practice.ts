import {
  CONNECTION_TYPES,
  type ConnectionTypeId,
  type ConnectorTypeId,
  type FastenerTypeId,
  type RoofNodeKind,
} from './catalogue';
import type { PlannedNodeConnection, RoofConnectionPlan } from './plan';
import { withPlannedConnection } from './plan';

/**
 * VNext-4 carpentry practice: a *proposal* of connection types for the node
 * kinds a roof actually has, from two answers the carpenter gives — how the
 * timber is joined (carpentry cuts with dowel-type fasteners, or steel
 * connectors) and how the wall plate is anchored.
 *
 * It proposes TYPES only. No diameter, no count, no spacing and no capacity
 * is ever proposed (ADR-014): those are the designer's. A proposal becomes
 * project intent only when the user applies it, and it never overwrites a
 * decision the user already made unless asked to.
 *
 * Every rule names its rationale and the practice sources behind it
 * (docs/domain/CARPENTRY_CONNECTION_PRACTICE.md). Codes only — the web layer
 * translates them.
 */

/** How the carpenter joins the roof timber. */
export type JoiningStyle =
  /** Cuts (seat notch, lap) plus nails, screws or bolts. */
  | 'carpentry'
  /** Steel carpentry connectors where they are commonly used. */
  | 'connectors';

/** How the wall plate is held down to the ring beam / wall. */
export type AnchorageChoice = 'anchor-rod' | 'perforated-strap' | 'undecided';

export interface PracticeAnswers {
  style: JoiningStyle;
  anchorage: AnchorageChoice;
}

/** Why a type is proposed at a node; translated by the presentation. */
export type PracticeRationale =
  | 'notch-and-nails'
  | 'notch-and-rafter-tie'
  | 'hip-bearing-bracket'
  | 'lapped-collar-bolts'
  | 'lapped-collar-screws'
  | 'ridge-nailed'
  | 'ridge-screwed'
  | 'header-nailed'
  | 'header-hanger'
  | 'jack-to-hip-nailed'
  | 'jack-to-hip-hanger'
  | 'cast-in-anchors'
  | 'anchorage-straps'
  | 'layer-nails'
  /** Practice gives no common answer: the designer details this node. */
  | 'designer-detail';

/** Practice sources (docs/domain/CARPENTRY_CONNECTION_PRACTICE.md). */
export type PracticeSourceId =
  | 'murator-laczniki'
  | 'kb-murlata'
  | 'ib-jetka-krokiew'
  | 'murator-okna-wymiany'
  | 'simpson-lssj'
  | 'awc-ridge-board'
  | 'pn-en-1995-1-1';

export interface PracticeProposal {
  kind: RoofNodeKind;
  /** Undefined when practice has no common answer (`designer-detail`). */
  planned?: PlannedNodeConnection;
  rationale: PracticeRationale;
  sources: readonly PracticeSourceId[];
  /** Other types the catalogue offers here, for the user to choose. */
  alternatives: readonly ConnectionTypeId[];
}

interface Rule {
  fastening?: FastenerTypeId;
  connector?: ConnectorTypeId;
  rationale: PracticeRationale;
  sources: readonly PracticeSourceId[];
}

const NOTCH_NAILS: Rule = {
  fastening: 'nails',
  rationale: 'notch-and-nails',
  sources: ['kb-murlata', 'murator-laczniki'],
};
const NOTCH_TIE: Rule = {
  connector: 'rafter-tie',
  fastening: 'nails',
  rationale: 'notch-and-rafter-tie',
  sources: ['murator-laczniki', 'kb-murlata'],
};
const DESIGNER: Rule = {
  rationale: 'designer-detail',
  sources: ['pn-en-1995-1-1'],
};
const LAYER_NAILS: Rule = {
  fastening: 'nails',
  rationale: 'layer-nails',
  sources: ['pn-en-1995-1-1'],
};

/**
 * The practice table. Each entry must be a type the catalogue offers at
 * that node (tested), so a proposal can never break the plan schema.
 */
const RULES: Record<
  JoiningStyle,
  Partial<Record<Exclude<RoofNodeKind, 'wall-plate-anchorage'>, Rule>>
> = {
  carpentry: {
    'rafter-wall-plate': NOTCH_NAILS,
    'jack-rafter-wall-plate': NOTCH_NAILS,
    'hip-rafter-wall-plate': NOTCH_NAILS,
    'rafter-purlin': NOTCH_NAILS,
    'jack-rafter-purlin': NOTCH_NAILS,
    'purlin-hip-rafter': DESIGNER,
    'collar-tie-rafter': {
      fastening: 'bolts',
      rationale: 'lapped-collar-bolts',
      sources: ['ib-jetka-krokiew'],
    },
    'rafter-ridge': {
      fastening: 'nails',
      rationale: 'ridge-nailed',
      sources: ['awc-ridge-board', 'murator-laczniki'],
    },
    'hip-rafter-ridge': {
      fastening: 'nails',
      rationale: 'ridge-nailed',
      sources: ['awc-ridge-board'],
    },
    'jack-rafter-hip-rafter': {
      fastening: 'nails',
      rationale: 'jack-to-hip-nailed',
      sources: ['simpson-lssj'],
    },
    'opening-header-rafter': {
      fastening: 'nails',
      rationale: 'header-nailed',
      sources: ['murator-okna-wymiany'],
    },
    'interrupted-rafter-header': {
      fastening: 'nails',
      rationale: 'header-nailed',
      sources: ['murator-okna-wymiany'],
    },
    'counter-batten-rafter': LAYER_NAILS,
    'batten-counter-batten': LAYER_NAILS,
  },
  connectors: {
    'rafter-wall-plate': NOTCH_TIE,
    'jack-rafter-wall-plate': NOTCH_TIE,
    'hip-rafter-wall-plate': {
      connector: 'angle-bracket',
      fastening: 'nails',
      rationale: 'hip-bearing-bracket',
      sources: ['murator-laczniki'],
    },
    'rafter-purlin': NOTCH_TIE,
    'jack-rafter-purlin': NOTCH_TIE,
    'purlin-hip-rafter': DESIGNER,
    'collar-tie-rafter': {
      fastening: 'screws',
      rationale: 'lapped-collar-screws',
      sources: ['ib-jetka-krokiew'],
    },
    'rafter-ridge': {
      fastening: 'screws',
      rationale: 'ridge-screwed',
      sources: ['murator-laczniki'],
    },
    'hip-rafter-ridge': {
      fastening: 'screws',
      rationale: 'ridge-screwed',
      sources: ['murator-laczniki'],
    },
    'jack-rafter-hip-rafter': {
      connector: 'joist-hanger',
      fastening: 'nails',
      rationale: 'jack-to-hip-hanger',
      sources: ['simpson-lssj'],
    },
    'opening-header-rafter': {
      connector: 'joist-hanger',
      fastening: 'nails',
      rationale: 'header-hanger',
      sources: ['murator-laczniki', 'murator-okna-wymiany'],
    },
    'interrupted-rafter-header': {
      connector: 'joist-hanger',
      fastening: 'nails',
      rationale: 'header-hanger',
      sources: ['murator-laczniki', 'murator-okna-wymiany'],
    },
    'counter-batten-rafter': LAYER_NAILS,
    'batten-counter-batten': LAYER_NAILS,
  },
};

function anchorageRule(choice: AnchorageChoice): Rule {
  if (choice === 'anchor-rod')
    return {
      connector: 'anchor-rod',
      rationale: 'cast-in-anchors',
      sources: ['kb-murlata', 'murator-laczniki'],
    };
  if (choice === 'perforated-strap')
    return {
      connector: 'perforated-strap',
      rationale: 'anchorage-straps',
      sources: ['murator-laczniki'],
    };
  return DESIGNER;
}

function toPlanned(rule: Rule): PlannedNodeConnection | undefined {
  if (!rule.fastening && !rule.connector) return undefined;
  return {
    // A type only: no diameter, no count (ADR-014).
    ...(rule.fastening ? { fastening: { type: rule.fastening } } : {}),
    ...(rule.connector ? { connector: rule.connector } : {}),
  };
}

/**
 * The proposal for the node kinds present in this roof, in the order given.
 * Pure and deterministic.
 */
export function proposeConnectionPractice(
  kinds: readonly RoofNodeKind[],
  answers: PracticeAnswers,
): PracticeProposal[] {
  return [...new Set(kinds)].map((kind) => {
    const rule =
      kind === 'wall-plate-anchorage'
        ? anchorageRule(answers.anchorage)
        : (RULES[answers.style][kind] ?? DESIGNER);
    const planned = toPlanned(rule);
    const chosen = new Set<string>(
      [rule.fastening, rule.connector].filter(Boolean) as string[],
    );
    const alternatives = (Object.keys(CONNECTION_TYPES) as ConnectionTypeId[])
      .filter(
        (id) =>
          CONNECTION_TYPES[id].family !== 'carpentry' &&
          CONNECTION_TYPES[id].nodes.includes(kind) &&
          !chosen.has(id),
      )
      .sort();
    return {
      kind,
      ...(planned ? { planned } : {}),
      rationale: rule.rationale,
      sources: rule.sources,
      alternatives,
    };
  });
}

/** True when the user already decided something at this node. */
export function hasPlannedDecision(
  plan: RoofConnectionPlan | undefined,
  kind: RoofNodeKind,
): boolean {
  const planned = plan?.nodes[kind];
  return !!(planned?.fastening || planned?.connector);
}

/**
 * Applies the accepted proposals as ONE plan change. A node the user already
 * decided is kept unless `replaceDecided`; a note is always kept.
 */
export function applyConnectionPractice(
  plan: RoofConnectionPlan | undefined,
  accepted: readonly Pick<PracticeProposal, 'kind' | 'planned'>[],
  options: { replaceDecided?: boolean } = {},
): RoofConnectionPlan | undefined {
  let next = plan;
  for (const proposal of accepted) {
    if (!proposal.planned) continue;
    if (!options.replaceDecided && hasPlannedDecision(next, proposal.kind))
      continue;
    const current = next?.nodes[proposal.kind];
    next = withPlannedConnection(next, proposal.kind, {
      ...proposal.planned,
      ...(current?.note ? { note: current.note } : {}),
    });
  }
  return next;
}

/**
 * Where each practice statement comes from (retrieved 2026-10-19). Titles
 * are the publications' own names, not translatable copy. Popular and
 * manufacturer sources describe practice, never a design value.
 */
export const PRACTICE_SOURCES: Record<
  PracticeSourceId,
  { publisher: string; title: string; url?: string }
> = {
  'murator-laczniki': {
    publisher: 'Murator',
    title: 'Łączniki i okucia ciesielskie do więźby. Jak łączyć elementy więźby?',
    url: 'https://muratordom.pl/budowa/dach/laczniki-ciesielskie-okucia-ciesielskie-do-wiezby-jak-laczyc-elementy-wiezby-aa-ZzYd-k88V-Jv7U.html',
  },
  'kb-murlata': {
    publisher: 'KB.pl',
    title: 'Wybór murłaty krok po kroku: wymiary, mocowanie',
    url: 'https://kb.pl/dachy/wiezba-dachowa/wybor-murlaty-krok-po-kroku-wymiary-mocowanie-ceny-izolacja',
  },
  'ib-jetka-krokiew': {
    publisher: 'Inżynier Budownictwa (PIIB), 2021',
    title: 'Połączenie jętka-krokiew',
    url: 'https://inzynierbudownictwa.pl/polaczenie-jetka-krokiew/',
  },
  'murator-okna-wymiany': {
    publisher: 'Murator',
    title: 'Montaż okien połaciowych do konstrukcji dachu',
    url: 'https://muratordom.pl/budowa/okna/montaz-okien-polaciowych-do-konstrukcji-dachu-aa-APFE-jT9d-pxFU.html',
  },
  'simpson-lssj': {
    publisher: 'Simpson Strong-Tie',
    title: 'LSSJ installation guide (sloped/skewed jack hanger)',
    url: 'https://www.strongtie.com/resources/product-installers-guide/lssj-installation',
  },
  'awc-ridge-board': {
    publisher: 'American Wood Council',
    title: 'Lumber Ridge Boards',
    url: 'https://awc.org/resources/wood-products/roof/lumber-ridge-boards/',
  },
  'pn-en-1995-1-1': {
    publisher: 'PKN',
    title: 'PN-EN 1995-1-1 Eurokod 5 — połączenia (rozdz. 8, 10)',
  },
};
