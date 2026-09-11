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
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: 1,
      project: { roof },
    });
    expect(serialized).not.toMatch(
      /selected|hover|camera|drawer|toolbox|viewport|dimensionLevel/,
    );
  });

  it('rejects unknown document versions and invalid roof input', () => {
    expect(() =>
      parseRoofProjectDocument(
        JSON.stringify({ schemaVersion: 2, project: { roof: {} } }),
      ),
    ).toThrow();
  });
});
