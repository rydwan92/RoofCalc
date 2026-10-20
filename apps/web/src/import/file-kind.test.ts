import { describe, expect, it } from 'vitest';
import { classifyProjectFile, classifyProjectFileBytes } from './file-kind';

const bytes = (text: string) =>
  Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
const classify = (text: string, byteLength = text.length) =>
  classifyProjectFileBytes({ byteLength, header: bytes(text) });

describe('universal file classification (bytes, never names)', () => {
  it('routes each supported format to its importer', () => {
    expect(classify('ISO-10303-21;\nHEADER;')).toEqual({
      status: 'accepted',
      kind: 'ifc',
    });
    expect(classify('  0\nSECTION\n  2\nHEADER\n')).toEqual({
      status: 'accepted',
      kind: 'dxf',
    });
    expect(classify('999\nexported\n0\nSECTION\n2\nENTITIES\n')).toEqual({
      status: 'accepted',
      kind: 'dxf',
    });
    // A UTF-8 BOM (EF BB BF) before the JSON.
    expect(classify('ï»¿{"schemaVersion":1}')).toEqual({
      status: 'accepted',
      kind: 'roofcalc-project',
    });
    expect(classify('%PDF-1.7\n')).toEqual({
      status: 'accepted',
      kind: 'document',
    });
    expect(
      classifyProjectFileBytes({
        byteLength: 100,
        header: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ).toEqual({ status: 'accepted', kind: 'document' });
  });

  it('explains files it cannot open', () => {
    expect(classify('')).toEqual({ status: 'rejected', reason: 'empty' });
    expect(classify('AutoCAD Binary DXF\r\n\u001a\u0000')).toEqual({
      status: 'rejected',
      reason: 'binary-dxf',
    });
    expect(classify('AC1032 drawing')).toEqual({
      status: 'rejected',
      reason: 'dwg-drawing',
    });
    expect(classify('MZ executable')).toEqual({
      status: 'rejected',
      reason: 'unsupported-format',
    });
    // Size limits per kind: a 30 MB DXF is refused, a 30 MB IFC is not.
    expect(classify('0\nSECTION\n', 30 * 1024 * 1024)).toEqual({
      status: 'rejected',
      reason: 'too-large',
    });
    expect(classify('ISO-10303-21;', 30 * 1024 * 1024)).toEqual({
      status: 'accepted',
      kind: 'ifc',
    });
  });

  it('a renamed file is classified by its content', async () => {
    const pdfNamedDxf = new File(['%PDF-1.4\n...'], 'plan.dxf');
    expect(await classifyProjectFile(pdfNamedDxf)).toEqual({
      status: 'accepted',
      kind: 'document',
    });
  });
});
