import {
  BINARY_DXF_SENTINEL,
  DXF_LIMITS,
  looksLikeAsciiDxf,
  MAX_IFC_FILE_BYTES,
} from '@cieslacalc/bim-import-core';
import {
  classifyDocumentBytes,
  DOCUMENT_IMPORT_LIMITS,
} from '@cieslacalc/document-import-core';

/**
 * VNext-4 universal file opening: one entry point decides, from the first
 * bytes only, which importer a file belongs to. The name, extension and
 * browser MIME type are metadata and never trusted (ADR-012 §4).
 */
export type ProjectFileKind = 'roofcalc-project' | 'document' | 'ifc' | 'dxf';

export type ProjectFileRejection =
  | 'empty'
  | 'too-large'
  | 'dwg-drawing'
  | 'binary-dxf'
  | 'heic-photo'
  | 'unsupported-format';

export type ProjectFileClassification =
  | { status: 'accepted'; kind: ProjectFileKind }
  | { status: 'rejected'; reason: ProjectFileRejection };

/** Saved projects are small JSON documents. */
export const MAX_PROJECT_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const HEADER_BYTES = 4096;

const IFC_SIGNATURE = 'ISO-10303-21';

export function classifyProjectFileBytes(input: {
  byteLength: number;
  header: Uint8Array;
}): ProjectFileClassification {
  if (input.byteLength <= 0 || input.header.length === 0)
    return { status: 'rejected', reason: 'empty' };
  // Latin-1 keeps every byte as one character: safe for signatures.
  const text = Array.from(input.header.slice(0, HEADER_BYTES), (byte) =>
    String.fromCharCode(byte),
  ).join('');
  const start = text.replace(/^﻿|^ï»¿/, '').trimStart();
  const within = (limit: number, kind: ProjectFileKind) =>
    input.byteLength > limit
      ? ({ status: 'rejected', reason: 'too-large' } as const)
      : ({ status: 'accepted', kind } as const);
  if (start.startsWith(IFC_SIGNATURE)) return within(MAX_IFC_FILE_BYTES, 'ifc');
  if (text.startsWith(BINARY_DXF_SENTINEL))
    return { status: 'rejected', reason: 'binary-dxf' };
  if (looksLikeAsciiDxf(text)) return within(DXF_LIMITS.maxBytes, 'dxf');
  if (start.startsWith('{'))
    return within(MAX_PROJECT_ARCHIVE_BYTES, 'roofcalc-project');
  const document = classifyDocumentBytes({
    byteLength: input.byteLength,
    header: input.header.slice(0, DOCUMENT_IMPORT_LIMITS.headerBytes),
  });
  if (document.status === 'accepted')
    return { status: 'accepted', kind: 'document' };
  return {
    status: 'rejected',
    reason:
      document.reason === 'too-large'
        ? 'too-large'
        : document.reason === 'dwg-drawing'
          ? 'dwg-drawing'
          : document.reason === 'heic-photo'
            ? 'heic-photo'
            : document.reason === 'empty'
              ? 'empty'
              : 'unsupported-format',
  };
}

/** Reads only the header of a file, then classifies it. */
export async function classifyProjectFile(
  file: Blob,
): Promise<ProjectFileClassification> {
  const header = new Uint8Array(
    await file.slice(0, HEADER_BYTES).arrayBuffer(),
  );
  return classifyProjectFileBytes({ byteLength: file.size, header });
}
