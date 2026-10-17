import { deflateSync } from 'node:zlib';

/**
 * A deterministic "photo of a plan" for the dimension-first import tests: a
 * white page with a dark building outline and dimension lines, and no text
 * layer — exactly what a scan or a phone photo gives the importer. The
 * numbers are not drawn: the test plays the user who reads them off the
 * drawing and types them in. Generated, never committed as a binary.
 */
export function createPlanPhotoPng(width = 1200, height = 900): Uint8Array {
  const ink = (x: number, y: number) =>
    // building outline 200..1000 × 250..700, 6 px thick
    (x >= 200 &&
      x <= 1000 &&
      ((y >= 250 && y < 256) || (y > 694 && y <= 700))) ||
    (y >= 250 &&
      y <= 700 &&
      ((x >= 200 && x < 206) || (x > 994 && x <= 1000))) ||
    // dimension lines above and left of the outline
    (y >= 179 && y <= 181 && x >= 200 && x <= 1000) ||
    (x >= 129 && x <= 131 && y >= 250 && y <= 700);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3, 255);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x += 1)
      if (ink(x, y)) row.fill(40, 1 + x * 3, 4 + x * 3);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
