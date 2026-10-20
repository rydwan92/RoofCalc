/**
 * VNext-4 DXF reader — the common CAD exchange format (AutoCAD, BricsCAD,
 * ArchiCAD, Revit exports). Reads an ASCII DXF into plain 2D model-space
 * geometry: line pieces, polylines, texts and dimension values. Pure, no
 * dependencies, no network; bounded by `DXF_LIMITS` so a huge or hostile
 * file cannot freeze the browser.
 *
 * The file is data, never code: nothing is evaluated, names are not
 * trusted, and paper-space entities (sheet frames, title blocks) are
 * skipped. Blocks are expanded a bounded number of levels deep.
 */

export const DXF_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxEntities: 200_000,
  maxVertices: 400_000,
  maxTextLength: 2_000,
  maxBlockDepth: 3,
  maxInserts: 20_000,
} as const;

export type DxfUnit = 'unitless' | 'in' | 'ft' | 'mm' | 'cm' | 'dm' | 'm';

/** $INSUNITS codes RoofCalc understands (AutoCAD DXF reference). */
const INSUNITS: Record<number, DxfUnit> = {
  0: 'unitless',
  1: 'in',
  2: 'ft',
  4: 'mm',
  5: 'cm',
  6: 'm',
  14: 'dm',
};

/** Millimetres per drawing unit. */
export const DXF_UNIT_MM: Record<Exclude<DxfUnit, 'unitless'>, number> = {
  in: 25.4,
  ft: 304.8,
  mm: 1,
  cm: 10,
  dm: 100,
  m: 1000,
};

export type Vec2 = readonly [number, number];

export interface DxfSegment {
  from: Vec2;
  to: Vec2;
  layer: string;
}

export interface DxfPolyline {
  points: Vec2[];
  closed: boolean;
  layer: string;
}

export interface DxfText {
  text: string;
  at: Vec2;
  height?: number;
  layer: string;
}

export interface DxfDimension {
  kind: 'linear' | 'angular' | 'other';
  /** Measured value in drawing units (degrees for angular, if given). */
  measurement?: number;
  text?: string;
  layer: string;
}

export type DxfWarning =
  | 'arcs-ignored'
  | 'bulges-ignored'
  | 'entity-limit'
  | 'vertex-limit'
  | 'nested-blocks-ignored'
  | 'non-2d-polylines-ignored';

export interface DxfDocument {
  unit: DxfUnit;
  /** True when the file declares $INSUNITS. */
  unitDeclared: boolean;
  lines: DxfSegment[];
  polylines: DxfPolyline[];
  texts: DxfText[];
  dimensions: DxfDimension[];
  warnings: DxfWarning[];
}

export type DxfReadResult =
  | { status: 'ok'; document: DxfDocument }
  | {
      status: 'rejected';
      reason: 'empty' | 'too-large' | 'binary-dxf' | 'not-dxf' | 'no-geometry';
    };

/** True when the first bytes look like an ASCII DXF (group code 0 SECTION). */
export function looksLikeAsciiDxf(head: string): boolean {
  const lines = head.replace(/^﻿/, '').split(/\r?\n/);
  // Optional leading comments (999) before the first section.
  for (let index = 0; index + 1 < lines.length && index < 40; index += 2) {
    const code = lines[index]!.trim();
    const value = lines[index + 1]!.trim();
    if (code === '999') continue;
    return code === '0' && value === 'SECTION';
  }
  return false;
}

export const BINARY_DXF_SENTINEL = 'AutoCAD Binary DXF';

interface Pair {
  code: number;
  value: string;
}

interface RawEntity {
  type: string;
  pairs: Pair[];
}

function num(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** AutoCAD control codes and MTEXT formatting → plain text. */
export function cleanDxfText(text: string): string {
  return text
    .replace(/%%[dD]/g, '°')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[pP]/g, '±')
    .replace(/%%%/g, '%')
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\~/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DXF_LIMITS.maxTextLength);
}

function first(pairs: Pair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value;
}

function firstNumber(pairs: Pair[], code: number): number | undefined {
  const value = first(pairs, code);
  if (value === undefined) return undefined;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Entities of one block definition or of model space. */
interface EntityList {
  entities: RawEntity[];
  /** A block's base point: placed at the INSERT point. */
  base?: Vec2;
}

function tokenize(text: string): Pair[] | undefined {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index]!.trim());
    if (!Number.isInteger(code)) return undefined;
    pairs.push({ code, value: lines[index + 1]! });
  }
  return pairs;
}

export function readDxf(text: string): DxfReadResult {
  if (!text.trim()) return { status: 'rejected', reason: 'empty' };
  if (text.length > DXF_LIMITS.maxBytes)
    return { status: 'rejected', reason: 'too-large' };
  if (text.startsWith(BINARY_DXF_SENTINEL))
    return { status: 'rejected', reason: 'binary-dxf' };
  if (!looksLikeAsciiDxf(text.slice(0, 2_000)))
    return { status: 'rejected', reason: 'not-dxf' };
  const pairs = tokenize(text);
  if (!pairs) return { status: 'rejected', reason: 'not-dxf' };

  const warnings = new Set<DxfWarning>();
  let unit: DxfUnit = 'unitless';
  let unitDeclared = false;
  const blocks = new Map<string, EntityList>();
  const model: EntityList = { entities: [] };
  let entityCount = 0;

  let section = '';
  let currentBlock: EntityList | undefined;
  let entity: RawEntity | undefined;
  const flush = (target: EntityList | undefined) => {
    if (entity && target) {
      if (entityCount < DXF_LIMITS.maxEntities) target.entities.push(entity);
      else warnings.add('entity-limit');
      entityCount += 1;
    }
    entity = undefined;
  };

  for (let index = 0; index < pairs.length; index += 1) {
    const { code, value } = pairs[index]!;
    const trimmed = value.trim();
    if (code === 0 && trimmed === 'SECTION') {
      section = pairs[index + 1]?.code === 2 ? pairs[index + 1]!.value.trim() : '';
      index += 1;
      continue;
    }
    if (code === 0 && trimmed === 'ENDSEC') {
      flush(section === 'BLOCKS' ? currentBlock : model);
      section = '';
      continue;
    }
    if (section === 'HEADER') {
      if (code === 9 && trimmed === '$INSUNITS') {
        const next = pairs[index + 1];
        if (next && next.code === 70) {
          const known = INSUNITS[num(next.value)];
          if (known) {
            unit = known;
            unitDeclared = known !== 'unitless';
          }
          index += 1;
        }
      }
      continue;
    }
    if (section === 'BLOCKS') {
      if (code === 0 && trimmed === 'BLOCK') {
        flush(currentBlock);
        // The block name follows as group code 2 within the BLOCK header.
        let name = '';
        let baseX = 0;
        let baseY = 0;
        let cursor = index + 1;
        while (cursor < pairs.length && pairs[cursor]!.code !== 0) {
          const header = pairs[cursor]!;
          if (header.code === 2) name = header.value.trim();
          else if (header.code === 10) baseX = num(header.value) || 0;
          else if (header.code === 20) baseY = num(header.value) || 0;
          cursor += 1;
        }
        currentBlock = { entities: [], base: [baseX, baseY] };
        if (name) blocks.set(name, currentBlock);
        index = cursor - 1;
        continue;
      }
      if (code === 0 && trimmed === 'ENDBLK') {
        flush(currentBlock);
        currentBlock = undefined;
        continue;
      }
      if (code === 0) {
        flush(currentBlock);
        entity = { type: trimmed, pairs: [] };
        continue;
      }
      entity?.pairs.push({ code, value });
      continue;
    }
    if (section === 'ENTITIES') {
      if (code === 0) {
        flush(model);
        entity = { type: trimmed, pairs: [] };
        continue;
      }
      entity?.pairs.push({ code, value });
    }
  }
  flush(model);

  const document: DxfDocument = {
    unit,
    unitDeclared,
    lines: [],
    polylines: [],
    texts: [],
    dimensions: [],
    warnings: [],
  };
  let vertices = 0;
  let inserts = 0;
  const addPolyline = (polyline: DxfPolyline) => {
    vertices += polyline.points.length;
    if (vertices > DXF_LIMITS.maxVertices) {
      warnings.add('vertex-limit');
      return;
    }
    document.polylines.push(polyline);
  };

  type Transform = (point: Vec2) => Vec2;
  const identity: Transform = (point) => point;

  const emit = (
    list: readonly RawEntity[],
    transform: Transform,
    depth: number,
  ) => {
    let pendingPolyline: DxfPolyline | undefined;
    for (const raw of list) {
      const p = raw.pairs;
      // Paper space (sheet frames, title blocks) is never the roof.
      if (firstNumber(p, 67) === 1) continue;
      const layer = (first(p, 8) ?? '0').trim();
      switch (raw.type) {
        case 'LINE': {
          const x1 = firstNumber(p, 10),
            y1 = firstNumber(p, 20),
            x2 = firstNumber(p, 11),
            y2 = firstNumber(p, 21);
          if ([x1, y1, x2, y2].every((v) => v !== undefined))
            document.lines.push({
              from: transform([x1!, y1!]),
              to: transform([x2!, y2!]),
              layer,
            });
          break;
        }
        case 'LWPOLYLINE': {
          const points: Vec2[] = [];
          let x: number | undefined;
          for (const pair of p) {
            if (pair.code === 10) x = num(pair.value);
            else if (pair.code === 20 && x !== undefined) {
              const y = num(pair.value);
              if (Number.isFinite(x) && Number.isFinite(y))
                points.push(transform([x, y]));
              x = undefined;
            } else if (pair.code === 42 && num(pair.value) !== 0)
              warnings.add('bulges-ignored');
          }
          const flags = firstNumber(p, 70) ?? 0;
          if (points.length >= 2)
            addPolyline({ points, closed: (flags & 1) === 1, layer });
          break;
        }
        case 'POLYLINE': {
          const flags = firstNumber(p, 70) ?? 0;
          // 3D polylines, meshes and polyface meshes are not plan geometry.
          if (flags & (8 | 16 | 64)) {
            warnings.add('non-2d-polylines-ignored');
            pendingPolyline = undefined;
            break;
          }
          pendingPolyline = { points: [], closed: (flags & 1) === 1, layer };
          break;
        }
        case 'VERTEX': {
          if (!pendingPolyline) break;
          const x = firstNumber(p, 10),
            y = firstNumber(p, 20);
          if (x !== undefined && y !== undefined)
            pendingPolyline.points.push(transform([x, y]));
          if ((firstNumber(p, 42) ?? 0) !== 0) warnings.add('bulges-ignored');
          break;
        }
        case 'SEQEND': {
          if (pendingPolyline && pendingPolyline.points.length >= 2)
            addPolyline(pendingPolyline);
          pendingPolyline = undefined;
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          const chunks = p
            .filter((pair) => pair.code === 3 || pair.code === 1)
            .map((pair) => pair.value);
          const cleaned = cleanDxfText(chunks.join(''));
          const x = firstNumber(p, 10),
            y = firstNumber(p, 20);
          if (cleaned && x !== undefined && y !== undefined)
            document.texts.push({
              text: cleaned,
              at: transform([x, y]),
              height: firstNumber(p, 40),
              layer,
            });
          break;
        }
        case 'DIMENSION': {
          const type = (firstNumber(p, 70) ?? 0) & 7;
          const override = first(p, 1);
          document.dimensions.push({
            kind:
              type === 0 || type === 1
                ? 'linear'
                : type === 2 || type === 5
                  ? 'angular'
                  : 'other',
            ...(firstNumber(p, 42) !== undefined
              ? { measurement: firstNumber(p, 42) }
              : {}),
            ...(override?.trim()
              ? { text: cleanDxfText(override) }
              : {}),
            layer,
          });
          break;
        }
        case 'ARC':
        case 'CIRCLE':
        case 'ELLIPSE':
        case 'SPLINE':
          warnings.add('arcs-ignored');
          break;
        case 'INSERT': {
          const name = (first(p, 2) ?? '').trim();
          const block = blocks.get(name);
          if (!block) break;
          if (depth >= DXF_LIMITS.maxBlockDepth) {
            warnings.add('nested-blocks-ignored');
            break;
          }
          inserts += 1;
          if (inserts > DXF_LIMITS.maxInserts) {
            warnings.add('entity-limit');
            break;
          }
          const ix = firstNumber(p, 10) ?? 0,
            iy = firstNumber(p, 20) ?? 0,
            sx = firstNumber(p, 41) ?? 1,
            sy = firstNumber(p, 42) ?? 1,
            angle = ((firstNumber(p, 50) ?? 0) * Math.PI) / 180;
          const cos = Math.cos(angle),
            sin = Math.sin(angle);
          const [bx, by] = block.base ?? [0, 0];
          const local: Transform = ([x, y]) => {
            const px = (x - bx) * sx,
              py = (y - by) * sy;
            return transform([
              ix + px * cos - py * sin,
              iy + px * sin + py * cos,
            ]);
          };
          emit(block.entities, local, depth + 1);
          break;
        }
        default:
          break;
      }
    }
  };
  emit(model.entities, identity, 0);
  document.warnings = [...warnings];
  if (!document.lines.length && !document.polylines.length)
    return { status: 'rejected', reason: 'no-geometry' };
  return { status: 'ok', document };
}
