import { describe, expect, it } from 'vitest';
import { analyzeCadRoofPlan, pitchCandidatesFromTexts } from './cad-plan';
import { cleanDxfText, readDxf, type DxfDocument } from './dxf';

/** Minimal ASCII DXF writer for hand-checked fixtures. */
type Entity = (string | number)[];
const line = (x1: number, y1: number, x2: number, y2: number, layer = '0') =>
  [0, 'LINE', 8, layer, 10, x1, 20, y1, 11, x2, 21, y2] as Entity;
const rect = (x: number, y: number, w: number, h: number, layer = '0') =>
  [
    0,
    'LWPOLYLINE',
    8,
    layer,
    90,
    4,
    70,
    1,
    10,
    x,
    20,
    y,
    10,
    x + w,
    20,
    y,
    10,
    x + w,
    20,
    y + h,
    10,
    x,
    20,
    y + h,
  ] as Entity;
const text = (value: string, x = 0, y = 0) =>
  [0, 'TEXT', 8, 'OPIS', 10, x, 20, y, 40, 250, 1, value] as Entity;
function dxf(entities: Entity[], insunits?: number, extra: Entity[] = []) {
  const pairs: (string | number)[] = [
    999,
    'RoofCalc test',
    0,
    'SECTION',
    2,
    'HEADER',
    ...(insunits === undefined ? [] : [9, '$INSUNITS', 70, insunits]),
    0,
    'ENDSEC',
    ...extra.flat(),
    0,
    'SECTION',
    2,
    'ENTITIES',
    ...entities.flat(),
    0,
    'ENDSEC',
    0,
    'EOF',
  ];
  return pairs.map(String).join('\n');
}
function read(source: string): DxfDocument {
  const result = readDxf(source);
  if (result.status !== 'ok') throw new Error(result.reason);
  return result.document;
}

describe('DXF reader', () => {
  it('rejects binary DXF, other formats and empty files without throwing', () => {
    expect(readDxf('AutoCAD Binary DXF\r\n\u001a\u0000')).toEqual({
      status: 'rejected',
      reason: 'binary-dxf',
    });
    expect(readDxf('%PDF-1.7')).toEqual({
      status: 'rejected',
      reason: 'not-dxf',
    });
    expect(readDxf('   ')).toEqual({ status: 'rejected', reason: 'empty' });
    expect(readDxf(dxf([text('tylko opis')], 4))).toEqual({
      status: 'rejected',
      reason: 'no-geometry',
    });
  });

  it('reads units, lines, closed polylines, texts and dimension values; skips paper space', () => {
    const document = read(
      dxf(
        [
          rect(0, 0, 12000, 8000, 'DACH'),
          line(0, 4000, 12000, 4000, 'KALENICA'),
          text('Kąt nachylenia 35%%d', 100, 100),
          [0, 'DIMENSION', 8, 'WYM', 70, 0, 42, 12000],
          // A sheet frame in paper space never becomes a roof outline.
          [...rect(0, 0, 420, 297, 'RAMKA'), 67, 1],
        ],
        4,
      ),
    );
    expect(document.unit).toBe('mm');
    expect(document.unitDeclared).toBe(true);
    expect(document.polylines).toHaveLength(1);
    expect(document.polylines[0]!.closed).toBe(true);
    expect(document.lines).toHaveLength(1);
    expect(document.texts[0]!.text).toBe('Kąt nachylenia 35°');
    expect(document.dimensions[0]).toMatchObject({
      kind: 'linear',
      measurement: 12000,
    });
  });

  it('expands block inserts with base point, scale and rotation', () => {
    const blocks: Entity = [
      0,
      'SECTION',
      2,
      'BLOCKS',
      0,
      'BLOCK',
      8,
      '0',
      2,
      'OBRYS',
      70,
      0,
      10,
      100,
      20,
      100,
      ...rect(100, 100, 1200, 800),
      0,
      'ENDBLK',
      0,
      'ENDSEC',
    ];
    const document = read(
      dxf(
        [
          [
            0,
            'INSERT',
            8,
            '0',
            2,
            'OBRYS',
            10,
            0,
            20,
            0,
            41,
            10,
            42,
            10,
            50,
            90,
          ],
        ],
        4,
        [blocks],
      ),
    );
    const points = document.polylines[0]!.points;
    expect(points[0]![0]).toBeCloseTo(0);
    expect(points[0]![1]).toBeCloseTo(0);
    // 1200 × 10 along x, rotated 90° → along +y.
    expect(points[1]![0]).toBeCloseTo(0);
    expect(points[1]![1]).toBeCloseTo(12000);
  });

  it('cleans AutoCAD control codes and MTEXT formatting', () => {
    expect(cleanDxfText('{\\fArial|b1;Dach}\\Pkopertowy 40%%d')).toBe(
      'Dach kopertowy 40°',
    );
    expect(cleanDxfText('\\U+03B1=35\\U+00B0')).toBe('α=35°');
  });
});

describe('roof plan from CAD geometry', () => {
  it('a gable: ridge along the full length, pitch from the text, dims in mm', () => {
    const analysis = analyzeCadRoofPlan(
      read(
        dxf(
          [
            rect(0, 0, 12000, 8000),
            line(0, 4000, 12000, 4000),
            text('Dach dwuspadowy, kąt 38°'),
          ],
          4,
        ),
      ),
    );
    expect(analysis).toMatchObject({
      status: 'supported',
      unit: { unit: 'mm', basis: 'declared' },
      proposed: {
        roofType: 'gable',
        buildingLengthMm: 12000,
        buildingWidthMm: 8000,
        pitchDeg: 38,
      },
    });
    if (analysis.status !== 'supported') return;
    expect(analysis.evidence).toContain('ridge-full-length');
    expect(analysis.warnings).toContain('single-outline-meaning');
  });

  it('a hip: four corner diagonals and a shortened ridge (L − W), consistent', () => {
    // 12 × 8 m: hips at 45° meet the ridge 4 m in from each end.
    const analysis = analyzeCadRoofPlan(
      read(
        dxf(
          [
            rect(0, 0, 12000, 8000),
            line(0, 0, 4000, 4000),
            line(0, 8000, 4000, 4000),
            line(12000, 0, 8000, 4000),
            line(12000, 8000, 8000, 4000),
            line(4000, 4000, 8000, 4000),
          ],
          4,
        ),
      ),
    );
    expect(analysis).toMatchObject({
      status: 'supported',
      proposed: { roofType: 'hip' },
    });
    if (analysis.status !== 'supported') return;
    expect(analysis.evidence).toEqual(
      expect.arrayContaining([
        'hip-diagonals',
        'hip-geometry-consistent',
        'ridge-shortened',
      ]),
    );
    expect(analysis.warnings).toContain('pitch-not-found');
  });

  it('two nested outlines give the walls and a uniform eave overhang', () => {
    // Walls 10 × 7 m, eave line 50 cm outside on every side, drawn in cm.
    const analysis = analyzeCadRoofPlan(
      read(
        dxf(
          [
            rect(0, 0, 1000, 700, 'SCIANY'),
            rect(-50, -50, 1100, 800, 'OKAP'),
            line(-50, 350, 1050, 350, 'KALENICA'),
          ],
          5,
        ),
      ),
    );
    expect(analysis).toMatchObject({
      status: 'supported',
      unit: { unit: 'cm' },
      proposed: {
        roofType: 'gable',
        buildingLengthMm: 10000,
        buildingWidthMm: 7000,
        eaveOverhangMm: 500,
      },
    });
    if (analysis.status !== 'supported') return;
    expect(analysis.evidence).toContain('nested-outlines');
    expect(analysis.warnings).not.toContain('single-outline-meaning');
  });

  it('infers a missing unit from a plausible size, and asks when none fits', () => {
    const metres = analyzeCadRoofPlan(read(dxf([rect(0, 0, 12, 8)])));
    expect(metres).toMatchObject({
      status: 'supported',
      unit: { unit: 'm', basis: 'inferred' },
      proposed: { buildingLengthMm: 12000, buildingWidthMm: 8000 },
    });
    if (metres.status === 'supported')
      expect(metres.warnings).toContain('unit-inferred');
    // 120 drawing units: 12 cm, 1.2 m or 120 m — no plausible building.
    const unknown = analyzeCadRoofPlan(read(dxf([rect(0, 0, 120, 80)])));
    expect(unknown).toEqual({
      status: 'unsupported',
      reason: 'unit-unknown',
      longestSide: 120,
    });
    // The user's unit decides.
    expect(
      analyzeCadRoofPlan(read(dxf([rect(0, 0, 1200, 800)])), { unit: 'cm' }),
    ).toMatchObject({
      status: 'supported',
      unit: { unit: 'cm', basis: 'user' },
      proposed: { buildingLengthMm: 12000 },
    });
  });

  it('a rotated building drawn with loose lines is still a rectangle', () => {
    const angle = (30 * Math.PI) / 180;
    const rotate = (x: number, y: number) =>
      [
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle),
      ] as const;
    const corners = [
      rotate(0, 0),
      rotate(11000, 0),
      rotate(11000, 7500),
      rotate(0, 7500),
    ];
    const lines = corners.map((corner, index) => {
      const next = corners[(index + 1) % 4]!;
      return line(corner[0], corner[1], next[0], next[1]);
    });
    const analysis = analyzeCadRoofPlan(read(dxf(lines, 4)));
    expect(analysis).toMatchObject({ status: 'supported' });
    if (analysis.status !== 'supported') return;
    expect(analysis.proposed.buildingLengthMm).toBeCloseTo(11000, 0);
    expect(analysis.proposed.buildingWidthMm).toBeCloseTo(7500, 0);
  });

  it('prefers the outline that holds roof lines over a bigger frame in model space', () => {
    const source = dxf(
      [
        rect(-5000, -5000, 40000, 28000, 'RAMKA'),
        rect(0, 0, 12000, 8000, 'DACH'),
        line(0, 4000, 12000, 4000, 'DACH'),
      ],
      4,
    );
    const analysis = analyzeCadRoofPlan(read(source));
    expect(analysis).toMatchObject({
      status: 'supported',
      proposed: { buildingLengthMm: 12000, roofType: 'gable' },
    });
    if (analysis.status !== 'supported') return;
    expect(analysis.warnings).toContain('several-outlines');
    // The user can pick the other outline.
    expect(
      analyzeCadRoofPlan(read(source), { outlineIndex: 1 }),
    ).toMatchObject({ proposed: { buildingLengthMm: 40000 } });
  });

  it('reads the roof type from text when no roof lines are drawn', () => {
    const analysis = analyzeCadRoofPlan(
      read(dxf([rect(0, 0, 12000, 8000), text('DACH KOPERTOWY 30°')], 4)),
    );
    expect(analysis).toMatchObject({
      proposed: { roofType: 'hip', pitchDeg: 30 },
    });
  });
});

describe('pitch candidates', () => {
  it('prefers labelled angles and converts a labelled percent slope', () => {
    const { candidates, percent } = pitchCandidatesFromTexts([
      { text: 'Okno 78x118' },
      { text: 'Rzut 1:100, kąt 15°' },
      { text: 'Nachylenie połaci 40°' },
      { text: 'Spadek 100%' },
    ]);
    expect(candidates.map((item) => item.valueDeg)).toEqual([15, 40, 45]);
    expect(percent).toBe(true);
  });
});
