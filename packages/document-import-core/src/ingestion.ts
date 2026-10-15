import type { DocumentSourceKind } from './model';

/**
 * Processing limits for one import. They bound memory and CPU on an ordinary
 * site laptop and keep a malicious or accidental huge file from freezing the
 * browser. Exceeding a page or text limit degrades to a partial, clearly
 * reported analysis; exceeding the byte limit rejects the file.
 */
export const DOCUMENT_IMPORT_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxPdfPages: 30,
  maxTextItemsPerPage: 25_000,
  maxSegmentsPerPage: 40_000,
  maxImagePixels: 40_000_000,
  maxImageEdgePx: 12_000,
  /** Bytes the classifier needs; callers read only this much up front. */
  headerBytes: 1024,
} as const;

export type IngestionRejection =
  'empty' | 'too-large' | 'unsupported-format' | 'heic-photo' | 'dwg-drawing';

export type IngestionResult =
  | { status: 'accepted'; kind: DocumentSourceKind }
  | { status: 'rejected'; reason: IngestionRejection };

function startsWith(header: Uint8Array, signature: readonly number[], at = 0) {
  if (header.length < at + signature.length) return false;
  return signature.every((byte, index) => header[at + index] === byte);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const PDF = ascii('%PDF-');
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
const FTYP = ascii('ftyp');
const DWG = ascii('AC10');

/** ISO-BMFF brands used by HEIF/HEIC phone photos. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];

function findPdfHeader(header: Uint8Array): boolean {
  // The PDF specification tolerates bytes before the header; real-world
  // exporters sometimes emit a BOM or whitespace. Search a bounded prefix.
  const limit = Math.min(header.length - PDF.length, 1019);
  for (let offset = 0; offset <= limit; offset += 1)
    if (startsWith(header, PDF, offset)) return true;
  return false;
}

/**
 * Decides what a file *is* from its first bytes only. The file name,
 * extension and browser-reported MIME type are metadata and never trusted:
 * a renamed executable is rejected even when it is called `plan.pdf`.
 */
export function classifyDocumentBytes(input: {
  byteLength: number;
  header: Uint8Array;
}): IngestionResult {
  if (input.byteLength <= 0 || input.header.length === 0)
    return { status: 'rejected', reason: 'empty' };
  if (input.byteLength > DOCUMENT_IMPORT_LIMITS.maxFileBytes)
    return { status: 'rejected', reason: 'too-large' };
  const { header } = input;
  if (findPdfHeader(header)) return { status: 'accepted', kind: 'pdf' };
  if (startsWith(header, PNG)) return { status: 'accepted', kind: 'png' };
  if (startsWith(header, JPEG)) return { status: 'accepted', kind: 'jpeg' };
  if (startsWith(header, RIFF) && startsWith(header, WEBP, 8))
    return { status: 'accepted', kind: 'webp' };
  if (startsWith(header, FTYP, 4)) {
    const brand = String.fromCharCode(...header.slice(8, 12));
    if (HEIF_BRANDS.includes(brand))
      return { status: 'rejected', reason: 'heic-photo' };
  }
  if (startsWith(header, DWG))
    return { status: 'rejected', reason: 'dwg-drawing' };
  return { status: 'rejected', reason: 'unsupported-format' };
}

/** Raster dimensions are checked after decoding, before any pixel work. */
export function checkImageDimensions(
  width: number,
  height: number,
): { status: 'accepted' } | { status: 'rejected'; reason: 'image-too-large' } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > DOCUMENT_IMPORT_LIMITS.maxImageEdgePx ||
    height > DOCUMENT_IMPORT_LIMITS.maxImageEdgePx ||
    width * height > DOCUMENT_IMPORT_LIMITS.maxImagePixels
  )
    return { status: 'rejected', reason: 'image-too-large' };
  return { status: 'accepted' };
}
