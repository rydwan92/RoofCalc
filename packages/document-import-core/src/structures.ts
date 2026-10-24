import { engineRef, TEXT_LAYER_ENGINE } from './engines';
import type {
  NumericRoofField,
  RecognitionResult,
  SourceRegion,
} from './model';
import {
  assembleLines,
  recognizeTextLayer,
  regionOfRange,
  type TextLayerItem,
  type TextLayerPage,
} from './text-layer';
import { normalizeForMatching } from './vocabulary';

/**
 * VNext-10C (ADR-017): a design that describes several roof structures —
 * a house and a garage, a carport, an outbuilding — read as one reading
 * per structure. Each part of the text belongs to the structure whose
 * heading stands above it; a document with fewer than two structures that
 * each carry roof data is a single-roof document and is read exactly as
 * before (this returns undefined).
 */
export type DocumentStructureKind =
  'house' | 'garage' | 'carport' | 'outbuilding' | 'extension' | 'porch';

export interface DocumentStructure {
  /** Opaque, in document order. */
  id: string;
  kind: DocumentStructureKind;
  /** As the document names it, e.g. "Garaż". */
  label: string;
  /** The heading that names it. */
  region: SourceRegion;
  /** This structure's own reading (its part of the text only). */
  result: RecognitionResult;
}

export interface DocumentStructuresReading {
  structures: DocumentStructure[];
  /**
   * What the document states once for every structure — the unit of
   * unitless numbers and the drawing scale — with no measurement and no
   * roof type of its own.
   */
  shared: RecognitionResult;
}

/** Structure names, most specific first (diacritics folded). */
const STRUCTURE_TERMS: readonly {
  kind: DocumentStructureKind;
  pattern: RegExp;
}[] = [
  {
    kind: 'outbuilding',
    pattern:
      /budyn\w*\s+gospodarcz\w*|komork\w*\s+gospodarcz\w*|szop[ay]|outbuilding|shed/,
  },
  {
    kind: 'house',
    pattern:
      /budyn\w*\s+mieszkaln\w*|budyn\w*\s+glown\w*|bryl\w*\s+glown\w*|dom(?:\s+jednorodzinn\w*)?\b|main\s+building|house/,
  },
  { kind: 'garage', pattern: /garaz\w*|garage/ },
  // "wiata", not "wiatr" (wind): the forms of the noun only.
  { kind: 'carport', pattern: /wiat(?:a|y|e|om|ach|ami)\b|wiacie|carport/ },
  {
    kind: 'extension',
    pattern: /dobudow\w*|przybudow\w*|extension|annex/,
  },
  { kind: 'porch', pattern: /ganek|ganku|zadaszeni\w*\s+wejscia|porch/ },
];

/**
 * A heading names a structure at the start of its line — optionally after
 * a numbering ("1.", "A)") or a sheet title ("Rzut dachu —", "Bryła 2:") —
 * never inside prose ("dojazd do garażu").
 */
const HEADING_PREFIX =
  /^\s*(?:(?:\d+|[a-z])[.)]\s*)?(?:(?:rzut(?:\s+dachu)?|dach|bryla(?:\s+\d+)?|czesc(?:\s+\w+)?|obiekt(?:\s+\d+)?)\s*[—–:-]\s*)?/;

function headingOf(
  text: string,
): { kind: DocumentStructureKind; start: number; end: number } | undefined {
  const normalized = normalizeForMatching(text);
  const prefix = HEADING_PREFIX.exec(normalized);
  const offset = prefix ? prefix[0].length : 0;
  const rest = normalized.slice(offset);
  for (const term of STRUCTURE_TERMS) {
    const match = term.pattern.exec(rest);
    if (match && match.index === 0)
      return {
        kind: term.kind,
        start: offset,
        end: offset + match[0].length,
      };
  }
  return undefined;
}

/** "GARAŻ" → "Garaż": the document's own word, sentence case. */
function labelOf(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** The number right after a structure's name: "Garaż 2". */
function numberAfter(line: string, end: number): string | undefined {
  return /^\s*(\d+)\b/.exec(line.slice(end))?.[1];
}

/** "Garaż 2" stays apart from "Garaż 1"; "Dom" and "Budynek mieszkalny" meet. */
function keyOf(kind: DocumentStructureKind, number?: string): string {
  return number ? `${kind}:${number}` : kind;
}

const ROOF_FIELDS: ReadonlySet<NumericRoofField> = new Set([
  'buildingLength',
  'buildingWidth',
  'pitch',
  'rightPitch',
]);

const hasRoofData = (result: RecognitionResult) =>
  !!result.roofType ||
  result.measurements.some(
    (measurement) => measurement.field && ROOF_FIELDS.has(measurement.field),
  );

const center = (item: TextLayerItem) => item.box.y + item.box.height / 2;

/** How far left of its heading a description line may start (page units). */
const COLUMN_SLACK_PT = 24;

export function recognizeDocumentStructures(
  pages: readonly TextLayerPage[],
): DocumentStructuresReading | undefined {
  interface Part {
    key: string;
    kind: DocumentStructureKind;
    label: string;
    region: SourceRegion;
    pages: Map<number, TextLayerItem[]>;
  }
  const parts = new Map<string, Part>();
  let carried: Part | undefined;

  for (const page of pages) {
    const headings = assembleLines(page)
      .filter((line) => !line.rotated)
      .flatMap((line) => {
        const heading = headingOf(line.text);
        if (!heading) return [];
        const number = numberAfter(line.text, heading.end);
        const key = keyOf(heading.kind, number);
        const part =
          parts.get(key) ??
          ({
            key,
            kind: heading.kind,
            label: [
              labelOf(line.text.slice(heading.start, heading.end)),
              number,
            ]
              .filter(Boolean)
              .join(' '),
            region: regionOfRange(line, heading.start, heading.end),
            pages: new Map(),
          } satisfies Part);
        parts.set(key, part);
        return [{ top: line.box.y, left: line.box.x, part }];
      })
      .sort((a, b) => a.top - b.top);
    // Headings stand in a column (a sheet's description beside its
    // drawing): text left of every heading — the drawing, its dimensions —
    // belongs to no structure; only the shared unit and scale read it.
    const column = headings.length
      ? Math.min(...headings.map((heading) => heading.left)) - COLUMN_SLACK_PT
      : -Infinity;
    for (const item of page.items) {
      if (item.box.x < column) continue;
      // The nearest heading above the item on this page, else the one
      // carried over from the previous page; text before any heading is
      // shared (title, unit, scale).
      const above = headings.filter(
        (heading) => heading.top <= center(item) + 0.5,
      );
      const owner = above.at(-1)?.part ?? carried;
      if (!owner) continue;
      const list = owner.pages.get(page.page) ?? [];
      list.push(item);
      owner.pages.set(page.page, list);
    }
    carried = headings.at(-1)?.part ?? carried;
  }

  const shared = recognizeTextLayer(pages);
  const structures = [...parts.values()]
    .map((part) => ({
      part,
      result: recognizeTextLayer(
        pages
          .filter((page) => part.pages.has(page.page))
          .map((page) => ({ ...page, items: part.pages.get(page.page)! })),
      ),
    }))
    .filter(({ result }) => hasRoofData(result));
  if (structures.length < 2) return undefined;
  return {
    structures: structures.map(({ part, result }, index) => ({
      id: `structure-reading:${index + 1}`,
      kind: part.kind,
      label: part.label,
      region: part.region,
      result,
    })),
    shared: {
      engine: engineRef(TEXT_LAYER_ENGINE),
      measurements: [],
      ...(shared.documentUnit ? { documentUnit: shared.documentUnit } : {}),
      ...(shared.scale ? { scale: shared.scale } : {}),
      warnings: [],
    },
  };
}
