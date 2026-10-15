/**
 * Deterministic generator of small, real PDF roof plans for the document
 * import tests. It writes a PDF 1.4 file by hand — Helvetica text with a
 * custom encoding for Polish letters, vector lines for the outline, ridge and
 * dimension lines — so the fixtures exercise a real PDF parser (pdf.js)
 * rather than a hand-built text list. The output is byte-for-byte stable.
 */

export interface PlanText {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  /** Counter-clockwise rotation in degrees (90 = vertical dimension). */
  rotate?: 0 | 90;
}

export interface PlanLine {
  from: [number, number];
  to: [number, number];
  width?: number;
}

export interface RoofPlanSpec {
  texts: PlanText[];
  lines: PlanLine[];
  /** Points; A4 landscape by default. */
  width?: number;
  height?: number;
}

/** Codes 128.. map to the glyph names listed in the font /Differences. */
const POLISH_CODES: Record<string, number> = {
  ą: 128,
  ć: 129,
  ę: 130,
  ł: 131,
  ń: 132,
  ś: 133,
  ź: 134,
  ż: 135,
  Ą: 136,
  Ć: 137,
  Ę: 138,
  Ł: 139,
  Ń: 140,
  Ś: 141,
  Ź: 142,
  Ż: 143,
};
const DIFFERENCES =
  '/aogonek /cacute /eogonek /lslash /nacute /sacute /zacute /zdotaccent /Aogonek /Cacute /Eogonek /Lslash /Nacute /Sacute /Zacute /Zdotaccent';
/** WinAnsiEncoding codes for the remaining non-ASCII characters used. */
const WIN_ANSI: Record<string, number> = {
  ó: 243,
  Ó: 211,
  '°': 176,
  '×': 215,
  '—': 151,
  '–': 150,
};

function encodeText(text: string): string {
  let result = '';
  for (const char of text) {
    const code = POLISH_CODES[char] ?? WIN_ANSI[char] ?? char.charCodeAt(0);
    if (code > 255) throw new Error(`Unsupported fixture character: ${char}`);
    if (char === '(' || char === ')' || char === '\\') result += `\\${char}`;
    else if (code >= 128 || code < 32)
      result += `\\${code.toString(8).padStart(3, '0')}`;
    else result += char;
  }
  return result;
}

const fixed = (value: number) => Number(value.toFixed(2)).toString();

function contentStream(spec: RoofPlanSpec): string {
  const operations: string[] = ['0 0 0 RG'];
  for (const line of spec.lines)
    operations.push(
      `${fixed(line.width ?? 0.6)} w ${fixed(line.from[0])} ${fixed(line.from[1])} m ${fixed(line.to[0])} ${fixed(line.to[1])} l S`,
    );
  operations.push('0 0 0 rg');
  for (const text of spec.texts) {
    const matrix =
      text.rotate === 90
        ? `0 1 -1 0 ${fixed(text.x)} ${fixed(text.y)}`
        : `1 0 0 1 ${fixed(text.x)} ${fixed(text.y)}`;
    operations.push(
      `BT /${text.bold ? 'F2' : 'F1'} ${fixed(text.size ?? 10)} Tf ${matrix} Tm (${encodeText(text.text)}) Tj ET`,
    );
  }
  return operations.join('\n');
}

export function createRoofPlanPdf(spec: RoofPlanSpec): Uint8Array {
  const width = spec.width ?? 842;
  const height = spec.height ?? 595;
  const content = contentStream(spec);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 7 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 6 0 R >>',
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${DIFFERENCES}] >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is a single byte (Latin-1 header comment only).
  return Uint8Array.from(body, (char) => char.charCodeAt(0));
}

/** 1 metre at 1:100 is 10 mm on paper = 28.3465 pt. */
const PT_PER_M_AT_1_100 = (10 / 25.4) * 72;

/** Rectangle outline, ridge and dimension chains for a gable plan. */
function planGeometry(lengthM: number, widthM: number, hip: boolean) {
  const x0 = 60;
  const y0 = 150;
  const w = lengthM * PT_PER_M_AT_1_100;
  const h = widthM * PT_PER_M_AT_1_100;
  const lines: PlanLine[] = [
    { from: [x0, y0], to: [x0 + w, y0], width: 1.2 },
    { from: [x0 + w, y0], to: [x0 + w, y0 + h], width: 1.2 },
    { from: [x0 + w, y0 + h], to: [x0, y0 + h], width: 1.2 },
    { from: [x0, y0 + h], to: [x0, y0], width: 1.2 },
    // Horizontal dimension line below, vertical one on the left.
    { from: [x0, y0 - 20], to: [x0 + w, y0 - 20], width: 0.4 },
    { from: [x0, y0 - 25], to: [x0, y0 - 15], width: 0.4 },
    { from: [x0 + w, y0 - 25], to: [x0 + w, y0 - 15], width: 0.4 },
    { from: [x0 - 20, y0], to: [x0 - 20, y0 + h], width: 0.4 },
    { from: [x0 - 25, y0], to: [x0 - 15, y0], width: 0.4 },
    { from: [x0 - 25, y0 + h], to: [x0 - 15, y0 + h], width: 0.4 },
  ];
  const ridgeInset = hip ? h / 2 : 0;
  lines.push({
    from: [x0 + ridgeInset, y0 + h / 2],
    to: [x0 + w - ridgeInset, y0 + h / 2],
    width: 0.8,
  });
  if (hip)
    lines.push(
      { from: [x0, y0], to: [x0 + ridgeInset, y0 + h / 2], width: 0.8 },
      { from: [x0, y0 + h], to: [x0 + ridgeInset, y0 + h / 2], width: 0.8 },
      { from: [x0 + w, y0], to: [x0 + w - ridgeInset, y0 + h / 2], width: 0.8 },
      {
        from: [x0 + w, y0 + h],
        to: [x0 + w - ridgeInset, y0 + h / 2],
        width: 0.8,
      },
    );
  return { lines, x0, y0, w, h };
}

/** Fixture 1: a gable plan with a complete Polish title block. */
export function gableRoofPlanSpec(): RoofPlanSpec {
  const { lines, x0, y0, w, h } = planGeometry(12.4, 9.6, false);
  return {
    lines,
    texts: [
      {
        text: 'RZUT DACHU — DOM JEDNORODZINNY',
        x: 60,
        y: 555,
        size: 14,
        bold: true,
      },
      { text: '1240', x: x0 + w / 2 - 11, y: y0 - 32, size: 9 },
      { text: '960', x: x0 - 30, y: y0 + h / 2 - 8, size: 9, rotate: 90 },
      { text: 'Dach dwuspadowy', x: 500, y: 500, size: 11, bold: true },
      { text: 'Długość budynku:', x: 500, y: 478 },
      { text: '12,40 m', x: 650, y: 478 },
      { text: 'Szerokość budynku:', x: 500, y: 462 },
      { text: '9,60 m', x: 650, y: 462 },
      { text: 'Kąt nachylenia dachu:', x: 500, y: 446 },
      { text: '35°', x: 650, y: 446 },
      { text: 'Okap:', x: 500, y: 430 },
      { text: '50 cm', x: 650, y: 430 },
      { text: 'Krokwie 8×18 cm co 90 cm', x: 500, y: 414 },
      { text: 'Wszystkie wymiary podano w cm', x: 500, y: 120, size: 8 },
      { text: 'Skala 1:100', x: 500, y: 104, size: 8 },
    ],
  };
}

/** Fixture 2: a hip plan with unitless values and a slope in percent. */
export function hipRoofPlanSpec(): RoofPlanSpec {
  const { lines, x0, y0, w } = planGeometry(14, 10, true);
  return {
    lines,
    texts: [
      { text: 'Dach kopertowy — rzut', x: 60, y: 555, size: 14, bold: true },
      { text: '1400', x: x0 + w / 2 - 11, y: y0 - 32, size: 9 },
      { text: 'Długość budynku 1400', x: 520, y: 478 },
      { text: 'Szerokość budynku 1000', x: 520, y: 462 },
      { text: 'Spadek dachu 70%', x: 520, y: 446 },
    ],
  };
}
