import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
} from './project-start';

const base = gableTemplateFromAssembly(assemblyDefaults);

describe('project start mapping', () => {
  it('maps full building width to the existing symmetric half run', () => {
    const roof = createProjectStartTemplate(
      {
        roofType: 'gable',
        buildingLengthMm: 12_000,
        buildingWidthMm: 9_000,
        pitchDeg: 35,
        eaveOverhangMm: 500,
        rafterSpacingMm: 800,
      },
      base,
    );
    expect(roof).toMatchObject({
      type: 'gable',
      buildingLengthMm: 12_000,
      halfRunMm: 4_500,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacing: { spacingMm: 800 },
    });
    expect('buildingWidthMm' in roof).toBe(false);
  });

  it('creates a valid hip template and round-trips friendly values', () => {
    const roof = createProjectStartTemplate(
      {
        roofType: 'hip',
        buildingLengthMm: 12_000,
        buildingWidthMm: 9_000,
        pitchDeg: 30,
        eaveOverhangMm: 450,
        rafterSpacingMm: 900,
      },
      base,
    );
    expect(roof.type).toBe('hip');
    expect(projectStartValuesFromTemplate(roof)).toEqual({
      roofType: 'hip',
      buildingLengthMm: 12_000,
      buildingWidthMm: 9_000,
      pitchDeg: 30,
      eaveOverhangMm: 450,
      rafterSpacingMm: 900,
    });
  });

  it('rejects a hip building shorter than its width', () => {
    expect(() =>
      createProjectStartTemplate(
        {
          roofType: 'hip',
          buildingLengthMm: 8_000,
          buildingWidthMm: 9_000,
          pitchDeg: 35,
          eaveOverhangMm: 500,
          rafterSpacingMm: 800,
        },
        base,
      ),
    ).toThrow();
  });
});
