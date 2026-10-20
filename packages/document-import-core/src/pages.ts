import type {
  DraftSegment,
  NumericRoofField,
  RecognitionResult,
  RecognizedMeasurement,
  SourceRegion,
} from './model';
import { assembleLines, regionOfRange, type TextLayerPage } from './text-layer';
import { normalizeForMatching } from './vocabulary';

/**
 * VNext-6 page roles of a multi-page building design.
 *
 * A design PDF mixes a roof plan, a framing plan, sections, floor plans,
 * elevations and schedules. Knowing which page is which lets the review
 * show where a value came from ("rzut dachu, str. 2") and lets the user set
 * aside a page whose numbers are irrelevant (a window schedule).
 *
 * A role is SUGGESTED only from a written title on the page ("RZUT DACHU",
 * "PRZEKRÓJ A-A"): the largest matching line wins, because a title is
 * printed bigger than a note that merely mentions another drawing. Without
 * such a title the page stays `unknown` — vectors or numbers alone never
 * name a role. The user can correct every suggestion; nothing here changes
 * a value.
 */
export type DocumentPageRole =
  | 'roof-plan'
  | 'framing-plan'
  | 'section'
  | 'floor-plan'
  | 'elevation'
  | 'schedule'
  | 'unknown';

export const DOCUMENT_PAGE_ROLES = [
  'roof-plan',
  'framing-plan',
  'section',
  'floor-plan',
  'elevation',
  'schedule',
  'unknown',
] as const satisfies readonly DocumentPageRole[];

/**
 * Patterns run on folded text (`normalizeForMatching`). Order breaks ties
 * between equally large titles: the more specific role first ("rzut więźby
 * dachowej" is a framing plan, not a roof plan).
 */
const ROLE_PATTERNS: readonly { role: DocumentPageRole; pattern: RegExp }[] = [
  {
    role: 'framing-plan',
    pattern:
      /\b(?:rzut|schemat|plan)\s+(?:konstrukcji\s+)?wiezby\b|\bwiezba\s+dachowa\b|\bkonstrukcja\s+dachu\b|\b(?:roof\s+)?framing\s+plan\b|\btruss\s+layout\b/,
  },
  {
    role: 'roof-plan',
    pattern: /\b(?:rzut|plan|widok)\s+(?:polaci\s+)?dachu\b|\broof\s+plan\b/,
  },
  {
    // A section is named by its cut ("przekrój A-A", "przekrój 1-1") or its
    // direction. "Przekrój krokwi 8×18" is a timber size, not a drawing.
    role: 'section',
    pattern:
      /\bprzekroj\s+(?:poprzeczny|podluzny|pionowy|[a-z0-9]{1,3}\s*[-–—]\s*[a-z0-9]{1,3}\b)|\bsection\s+[a-z0-9]{1,3}\s*[-–—]\s*[a-z0-9]{1,3}\b|\bcross[\s-]section\b/,
  },
  {
    role: 'floor-plan',
    pattern:
      /\brzut\s+(?:parteru|pietra|poddasza|piwnicy|kondygnacji|przyziemia|fundamentow)\b|\b(?:ground|first|upper|attic)\s+floor\s+plan\b|\bfloor\s+plan\b/,
  },
  { role: 'elevation', pattern: /\belewacj[aie]\b|\belevations?\b/ },
  {
    role: 'schedule',
    pattern:
      /\b(?:zestawienie|wykaz)\b|\btabela\s+(?:stolarki|materialow|elementow)\b|\bschedule\b|\bbill\s+of\s+materials\b/,
  },
];

export interface PageRoleEvidence {
  text: string;
  region: SourceRegion;
}

export interface PageRoleSuggestion {
  page: number;
  role: DocumentPageRole;
  /** `heading` = a written title names the role; `none` = no evidence. */
  basis: 'heading' | 'none';
  evidence?: PageRoleEvidence;
  /** The page carries a text layer (false for a scan or a photo). */
  hasText: boolean;
  /** A building outline was drawn on this page (vector geometry). */
  hasOutline: boolean;
  /** Readings located on this page (written or measured). */
  readings: number;
  /** Roof parameters a labelled reading on this page names. */
  fields: NumericRoofField[];
}

/** Suggests a role for every analysed page. Pure and deterministic. */
export function suggestPageRoles(input: {
  pages: readonly TextLayerPage[];
  results?: readonly RecognitionResult[];
}): PageRoleSuggestion[] {
  const measurements = (input.results ?? []).flatMap(
    (result) => result.measurements,
  );
  const segments = (input.results ?? []).flatMap(
    (result) => result.segments ?? [],
  );
  return input.pages.map((page) => {
    const facts = pageFacts(page.page, measurements, segments);
    const hasText = page.items.some((item) => item.text.trim().length > 0);
    const title = hasText ? largestTitle(page) : undefined;
    return {
      page: page.page,
      role: title?.role ?? 'unknown',
      basis: title ? 'heading' : 'none',
      ...(title ? { evidence: title.evidence } : {}),
      hasText,
      ...facts,
    };
  });
}

function largestTitle(
  page: TextLayerPage,
): { role: DocumentPageRole; evidence: PageRoleEvidence } | undefined {
  let best:
    | { role: DocumentPageRole; evidence: PageRoleEvidence; size: number }
    | undefined;
  const lines = assembleLines(page).filter((line) => !line.rotated);
  const heights = lines.map((line) => line.box.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 0;
  for (const line of lines) {
    const normalized = normalizeForMatching(line.text);
    for (const { role, pattern } of ROLE_PATTERNS) {
      const match = pattern.exec(normalized);
      if (!match) continue;
      const start = match.index;
      const end = start + match[0].length;
      const region = regionOfRange(line, start, end);
      const size = region.box.height;
      // A title is printed larger than the page's ordinary text, or it is
      // most of a normal-size line (a title-block cell). A drawing list on
      // a title sheet ("Spis rysunków: rzut dachu, przekrój…") or a note
      // ("patrz przekrój A-A") names another sheet, not this one.
      const larger = size >= median * 1.25;
      const titleLike =
        size >= median * 0.95 &&
        match[0].length >= line.text.trim().length * 0.6;
      if (!larger && !titleLike) continue;
      // Strictly larger wins; equal size keeps the earlier (more specific)
      // pattern or the earlier line.
      if (!best || size > best.size * 1.05)
        best = {
          role,
          size,
          evidence: { text: line.text.slice(start, end), region },
        };
      break;
    }
  }
  return best && { role: best.role, evidence: best.evidence };
}

function pageFacts(
  page: number,
  measurements: readonly RecognizedMeasurement[],
  segments: readonly DraftSegment[],
): Pick<PageRoleSuggestion, 'hasOutline' | 'readings' | 'fields'> {
  const here = measurements.filter((item) => item.region?.page === page);
  const fields = [
    ...new Set(
      here.flatMap((item) =>
        item.field && item.mode !== 'vector-geometry' ? [item.field] : [],
      ),
    ),
  ];
  return {
    hasOutline: segments.some(
      (segment) => segment.page === page && segment.role === 'outline',
    ),
    readings: here.filter((item) => item.mode !== 'vector-geometry').length,
    fields,
  };
}

/** The role in force: the user's correction, else the suggestion. */
export function effectivePageRole(
  suggestion: PageRoleSuggestion,
  corrections: Readonly<Partial<Record<number, DocumentPageRole>>> | undefined,
): DocumentPageRole {
  return corrections?.[suggestion.page] ?? suggestion.role;
}

/**
 * Removes everything read on pages the user set aside: readings, located
 * statements, drawn segments and the relations that point at them. The
 * draft is then derived as if those pages were not in the document.
 */
export function withoutPages(
  results: readonly RecognitionResult[],
  excluded: readonly number[] | undefined,
): RecognitionResult[] {
  if (!excluded?.length) return [...results];
  const skip = new Set(excluded);
  const onSkipped = (region: SourceRegion | undefined) =>
    !!region && skip.has(region.page);
  return results.map((result) => {
    const measurements = result.measurements.filter(
      (item) => !onSkipped(item.region),
    );
    const kept = new Set(measurements.map((item) => item.id));
    const segments = result.segments?.filter(
      (segment) => !skip.has(segment.page),
    );
    const segmentIds = new Set(segments?.map((segment) => segment.id));
    const relations = result.relations?.filter((relation) => {
      if (relation.kind === 'outline')
        return relation.segmentIds.every((id) => segmentIds.has(id));
      if (relation.kind === 'dimension-chain')
        return (
          kept.has(relation.totalMeasurementId) &&
          relation.partMeasurementIds.every((id) => kept.has(id))
        );
      return (
        kept.has(relation.measurementId) && segmentIds.has(relation.segmentId)
      );
    });
    const { roofType, documentUnit, scale, ...rest } = result;
    return {
      ...rest,
      measurements,
      ...(segments ? { segments } : {}),
      ...(result.points
        ? { points: result.points.filter((point) => !skip.has(point.page)) }
        : {}),
      ...(relations ? { relations } : {}),
      ...(roofType && !onSkipped(roofType.region) ? { roofType } : {}),
      ...(documentUnit && !onSkipped(documentUnit.region)
        ? { documentUnit }
        : {}),
      ...(scale && !onSkipped(scale.region) ? { scale } : {}),
      warnings: result.warnings.filter(
        (warning) =>
          !(
            (warning.code === 'unsupported-roof-type' &&
              onSkipped(warning.region)) ||
            (warning.code === 'text-limit-reached' && skip.has(warning.page))
          ),
      ),
    };
  });
}
