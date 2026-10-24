import { describe, expect, it } from 'vitest';
import { recognizeDocumentStructures } from './structures';
import type { TextLayerItem, TextLayerPage } from './text-layer';

/** One text item per line; y grows downwards like a rendered page. */
function page(lines: readonly string[], pageNumber = 1): TextLayerPage {
  return {
    page: pageNumber,
    width: 842,
    height: 595,
    unit: 'pt',
    items: lines.map((text, index): TextLayerItem => ({
      text,
      box: { x: 500, y: 40 + index * 18, width: text.length * 5, height: 10 },
    })),
  };
}

const kinds = (pages: TextLayerPage[]) =>
  recognizeDocumentStructures(pages)?.structures.map((structure) => [
    structure.kind,
    structure.label,
  ]);

describe('structures of a design (VNext-10C)', () => {
  it('splits a design at the structures it names', () => {
    expect(
      kinds([
        page([
          'Budynek mieszkalny — dach dwuspadowy',
          'Długość budynku: 12,00 m',
          'Garaż — dach jednospadowy',
          'Długość budynku: 6,00 m',
          'Wiata — dach jednospadowy',
          'Spadek dachu 8°',
        ]),
      ]),
    ).toEqual([
      ['house', 'Budynek mieszkalny'],
      ['garage', 'Garaż'],
      ['carport', 'Wiata'],
    ]);
  });

  it('takes a sheet title and numbering before the name', () => {
    expect(
      kinds([
        page(['Rzut dachu — budynek gospodarczy', 'Kąt dachu 30°']),
        page(['2. GARAŻ', 'Spadek dachu 12°'], 2),
      ]),
    ).toEqual([
      ['outbuilding', 'Budynek gospodarczy'],
      ['garage', 'Garaż'],
    ]);
  });

  it('keeps two numbered garages apart and joins one structure across pages', () => {
    expect(
      kinds([
        page(['Garaż 1', 'Spadek dachu 10°', 'Garaż 2', 'Spadek dachu 12°']),
      ]),
    ).toEqual([
      ['garage', 'Garaż 1'],
      ['garage', 'Garaż 2'],
    ]);
    expect(
      kinds([
        page(['Dom — dach kopertowy', 'Kąt dachu 25°']),
        page(['Dom', 'Długość budynku: 14,00 m'], 2),
        page(['Garaż', 'Spadek dachu 10°'], 3),
      ]),
    ).toEqual([
      ['house', 'Dom'],
      ['garage', 'Garaż'],
    ]);
  });

  it('never reads prose, a wind board or one structure as several', () => {
    // Prose names a garage but is not a heading.
    expect(
      kinds([
        page([
          'Dom jednorodzinny — dach dwuspadowy',
          'Kąt dachu 35°',
          'Dojazd do garażu od strony ulicy.',
          'Deska wiatrowa 25 mm',
        ]),
      ]),
    ).toBeUndefined();
    // A structure without roof data does not make a document multi-roof.
    expect(
      kinds([
        page([
          'Dom — dach dwuspadowy',
          'Kąt dachu 35°',
          'Garaż',
          'Brama segmentowa',
        ]),
      ]),
    ).toBeUndefined();
  });
});
