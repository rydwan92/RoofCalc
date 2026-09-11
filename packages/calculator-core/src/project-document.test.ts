import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import {
  createRoofProjectDocument,
  parseRoofProjectDocument,
  serializeRoofProjectDocument,
} from './project-document';

describe('RoofProjectDocumentV1', () => {
  it('round-trips canonical roof input without transient workbench state', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof);
    const serialized = serializeRoofProjectDocument(document);

    expect(parseRoofProjectDocument(serialized)).toEqual(document);
    expect(JSON.parse(serialized)).toEqual({ schemaVersion: 1, project: { roof, features: [], buildUp: {} } });
    expect(serialized).not.toMatch(
      /selected|hover|camera|drawer|toolbox|viewport|dimensionLevel/,
    );
  });

  it('round-trips roof windows and batten settings while accepting earlier V1 documents', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      features: [{ id: 'feature:roof-window-1', kind: 'roof-window', roofPlaneId: 'roof-plane:left', widthMm: 780, heightMm: 1180, position: { uMm: 900, vMm: 1200 } }],
      buildUp: { battenLayout: { enabled: true, battenHeightMm: 40, battenWidthMm: 60, gaugeMm: 350, eaveOffsetMm: 250 } },
    });
    expect(parseRoofProjectDocument(serializeRoofProjectDocument(document))).toEqual(document);
    expect(parseRoofProjectDocument(JSON.stringify({ schemaVersion: 1, project: { roof } })).project).toMatchObject({ features: [], buildUp: {} });
  });

  it('rejects unknown document versions and invalid roof input', () => {
    expect(() =>
      parseRoofProjectDocument(
        JSON.stringify({ schemaVersion: 2, project: { roof: {} } }),
      ),
    ).toThrow();
  });
});
