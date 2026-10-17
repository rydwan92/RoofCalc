/**
 * Normative references for roof timber connections (VNext-2).
 *
 * RoofCalc resolves geometry and detailing; it does NOT verify load-bearing
 * capacity. Every reference here says *which rule a structural designer
 * applies*, so the plan a carpenter makes is traceable to the standard —
 * never that the app has checked it. See
 * `docs/domain/ROOF_TIMBER_CONNECTIONS_AND_STANDARDS.md`.
 *
 * Editions are recorded only where the Polish adoption is certain; the rest
 * carry `verifyEdition` so the UI can tell the user to check the current
 * edition in the PKN catalogue rather than show a guess. The second
 * generation of Eurocodes is being published by CEN; until PKN adopts it and
 * withdraws the current parts, the PN-EN editions below remain in force.
 */

export type StandardId =
  | 'PN-EN 1990'
  | 'PN-EN 1991-1-1'
  | 'PN-EN 1991-1-3'
  | 'PN-EN 1991-1-4'
  | 'PN-EN 1995-1-1'
  | 'PN-EN 1995-1-2'
  | 'PN-EN 338'
  | 'PN-EN 14081-1'
  | 'PN-EN 14592'
  | 'PN-EN 14545'
  | 'PN-EN 912'
  | 'PN-EN 1992-4';

/** What a standard governs, for grouping and plain-language labels. */
export type StandardRole =
  | 'design-basis'
  | 'actions'
  | 'timber-design'
  | 'timber-material'
  | 'fastener-product'
  | 'anchorage';

export interface StandardInfo {
  id: StandardId;
  role: StandardRole;
  /** The adopted Polish edition, only where it is certain. */
  edition?: string;
  /** True when the current edition must be checked in the PKN catalogue. */
  verifyEdition: boolean;
}

export const STANDARDS: Record<StandardId, StandardInfo> = {
  'PN-EN 1990': {
    id: 'PN-EN 1990',
    role: 'design-basis',
    edition: 'PN-EN 1990:2004',
    verifyEdition: false,
  },
  'PN-EN 1991-1-1': {
    id: 'PN-EN 1991-1-1',
    role: 'actions',
    edition: 'PN-EN 1991-1-1:2004',
    verifyEdition: false,
  },
  'PN-EN 1991-1-3': {
    id: 'PN-EN 1991-1-3',
    role: 'actions',
    edition: 'PN-EN 1991-1-3:2005',
    verifyEdition: false,
  },
  'PN-EN 1991-1-4': {
    id: 'PN-EN 1991-1-4',
    role: 'actions',
    edition: 'PN-EN 1991-1-4:2008',
    verifyEdition: false,
  },
  'PN-EN 1995-1-1': {
    id: 'PN-EN 1995-1-1',
    role: 'timber-design',
    edition: 'PN-EN 1995-1-1:2010',
    verifyEdition: false,
  },
  'PN-EN 1995-1-2': {
    id: 'PN-EN 1995-1-2',
    role: 'timber-design',
    verifyEdition: true,
  },
  'PN-EN 338': {
    id: 'PN-EN 338',
    role: 'timber-material',
    verifyEdition: true,
  },
  'PN-EN 14081-1': {
    id: 'PN-EN 14081-1',
    role: 'timber-material',
    verifyEdition: true,
  },
  'PN-EN 14592': {
    id: 'PN-EN 14592',
    role: 'fastener-product',
    verifyEdition: true,
  },
  'PN-EN 14545': {
    id: 'PN-EN 14545',
    role: 'fastener-product',
    verifyEdition: true,
  },
  'PN-EN 912': {
    id: 'PN-EN 912',
    role: 'fastener-product',
    verifyEdition: true,
  },
  'PN-EN 1992-4': {
    id: 'PN-EN 1992-4',
    role: 'anchorage',
    verifyEdition: true,
  },
};

/**
 * A pointer into a standard. `clause` uses the standard's own numbering
 * (e.g. "8.5", "Tablica 8.4"); `subject` is a stable code the UI translates.
 */
export interface StandardReference {
  standard: StandardId;
  clause?: string;
  subject: ReferenceSubject;
}

export type ReferenceSubject =
  | 'bearing-perpendicular-to-grain'
  | 'notched-member'
  | 'nailed-connection'
  | 'screwed-connection'
  | 'bolted-connection'
  | 'dowelled-connection'
  | 'punched-metal-plate'
  | 'toothed-plate-connector'
  | 'multiple-fasteners'
  | 'spacing-nails'
  | 'spacing-bolts'
  | 'spacing-dowels'
  | 'detailing-mechanical'
  | 'fastener-product'
  | 'connector-product'
  | 'ring-connector-product'
  | 'anchorage-in-concrete'
  | 'strength-class'
  | 'strength-grading'
  | 'loads-snow'
  | 'loads-wind'
  | 'loads-self-weight'
  | 'design-basis'
  | 'fire';

/** References every roof connection design starts from (loads + material). */
export const DESIGN_BASIS_REFERENCES: readonly StandardReference[] = [
  { standard: 'PN-EN 1990', subject: 'design-basis' },
  { standard: 'PN-EN 1991-1-1', subject: 'loads-self-weight' },
  { standard: 'PN-EN 1991-1-3', subject: 'loads-snow' },
  { standard: 'PN-EN 1991-1-4', subject: 'loads-wind' },
  { standard: 'PN-EN 338', subject: 'strength-class' },
  { standard: 'PN-EN 14081-1', subject: 'strength-grading' },
];

/** Stable key for de-duplicating references. */
export function referenceKey(reference: StandardReference): string {
  return `${reference.standard}|${reference.clause ?? ''}|${reference.subject}`;
}
