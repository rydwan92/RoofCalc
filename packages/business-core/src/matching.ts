import type {
  AssortmentImportRow,
  AssortmentMatchCandidate,
  AssortmentMatchResult,
  OrganizationAssortmentItem,
} from './model';

/**
 * Deterministic, conservative matching (§27, §28).
 *
 * The engine answers *"which global commercial variant is this wholesale
 * row?"* using only verifiable evidence, in a fixed priority order. Anything
 * weaker than exact evidence produces a **suggestion** the admin must confirm;
 * nothing is ever auto-linked on a fuzzy resemblance, because a wrong link
 * silently assigns the wrong tile dimensions to a roof.
 *
 * Priority:
 *
 * 1. an existing mapping for this organization's own `externalKey` — the
 *    admin already decided, and a re-import must not undo that (§29);
 * 2. an exact commercial-variant SKU;
 * 3. an exact EAN, where the global catalogue actually carries one;
 * 4. a normalized manufacturer + name equality → `suggested`, never applied.
 *
 * Two or more candidates at the same level is `ambiguous`, never a coin flip.
 */

/** Case/whitespace/separator-insensitive comparison key. */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function indexBy(
  candidates: readonly AssortmentMatchCandidate[],
  key: (candidate: AssortmentMatchCandidate) => string | undefined,
): Map<string, AssortmentMatchCandidate[]> {
  const index = new Map<string, AssortmentMatchCandidate[]>();
  for (const candidate of candidates) {
    const value = key(candidate);
    if (!value) continue;
    const bucket = index.get(value);
    if (bucket) bucket.push(candidate);
    else index.set(value, [candidate]);
  }
  return index;
}

export interface AssortmentMatchIndex {
  bySku: Map<string, AssortmentMatchCandidate[]>;
  byEan: Map<string, AssortmentMatchCandidate[]>;
  byName: Map<string, AssortmentMatchCandidate[]>;
}

/** Built once per import run, so a 4 000-row file stays a linear pass. */
export function createMatchIndex(
  candidates: readonly AssortmentMatchCandidate[],
): AssortmentMatchIndex {
  return {
    bySku: indexBy(candidates, (candidate) =>
      candidate.sku ? normalizeKey(candidate.sku) : undefined,
    ),
    byEan: indexBy(candidates, (candidate) => candidate.ean?.trim()),
    byName: indexBy(candidates, (candidate) => {
      if (!candidate.productName) return undefined;
      return normalizeKey(
        [
          candidate.manufacturerName ?? '',
          candidate.productName,
          candidate.variantName ?? '',
        ].join(' '),
      );
    }),
  };
}

function decide(
  bucket: AssortmentMatchCandidate[] | undefined,
  reason: AssortmentMatchResult['reason'],
  exact: boolean,
): AssortmentMatchResult | undefined {
  if (!bucket?.length) return undefined;
  if (bucket.length > 1)
    return {
      state: 'ambiguous',
      candidateIds: bucket.map((candidate) => candidate.commercialVariantId),
      reason,
    };
  const only = bucket[0]!;
  return exact
    ? {
        state: 'matched',
        commercialVariantId: only.commercialVariantId,
        reason,
      }
    : {
        state: 'suggested',
        candidateIds: [only.commercialVariantId],
        reason,
      };
}

export function matchAssortmentRow(
  row: AssortmentImportRow,
  index: AssortmentMatchIndex,
  existing: ReadonlyMap<string, OrganizationAssortmentItem>,
): AssortmentMatchResult {
  const previous = existing.get(row.externalKey);
  if (previous?.commercialVariantId)
    return {
      state: 'matched',
      commercialVariantId: previous.commercialVariantId,
      reason: 'existing-mapping',
    };

  const bySku = decide(
    index.bySku.get(normalizeKey(row.externalKey)),
    'variant-sku',
    true,
  );
  if (bySku) return bySku;

  if (row.ean) {
    const byEan = decide(index.byEan.get(row.ean.trim()), 'ean', true);
    if (byEan) return byEan;
  }

  const nameKey = normalizeKey(
    [row.manufacturerName ?? '', row.sourceName].join(' '),
  );
  const byName = decide(index.byName.get(nameKey), 'normalized-name', false);
  if (byName) return byName;

  return { state: 'no-match' };
}
