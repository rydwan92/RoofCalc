import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import {
  createProjectStartTemplate,
  deriveProjectStartReadiness,
  projectStartValuesFromTemplate,
  validateProjectStart,
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
    expect(projectStartValuesFromTemplate(roof)).toMatchObject({
      roofType: 'hip',
      buildingLengthMm: 12_000,
      buildingWidthMm: 9_000,
      pitchDeg: 30,
      eaveOverhangMm: 450,
      rafterSpacingMm: 900,
    });
  });

  it('applies construction choices to the canonical template', () => {
    const roof = createProjectStartTemplate(
      {
        roofType: 'gable',
        buildingLengthMm: 10_000,
        buildingWidthMm: 8_000,
        pitchDeg: 40,
        eaveOverhangMm: 500,
        rafterSpacingMm: 900,
        rafterWidthMm: 80,
        rafterDepthMm: 180,
        structureSystem: 'rafter-collar-tie',
        ridgeConnection: 'direct-meeting',
      },
      base,
    );
    expect(roof.rafterSection).toEqual({ widthMm: 80, depthMm: 180 });
    expect(roof.ridge.connection).toBe('direct-meeting');
    expect(roof.type === 'gable' && roof.structure?.system).toBe(
      'rafter-collar-tie',
    );
    expect(
      roof.type === 'gable' &&
        roof.structure?.collarTie?.heightAboveWallPlateMm,
    ).toBeGreaterThan(0);
  });
});

describe('project start guidance', () => {
  const draft = {
    roofType: 'hip' as const,
    buildingLength: 8_000,
    buildingWidth: 9_000,
    pitch: 35,
    eave: 500,
    spacing: 800,
    rafterWidth: 80,
    rafterDepth: 200,
  };
  it('explains the hip length limit instead of a generic error', () => {
    expect(
      validateProjectStart(draft, ['buildingLength', 'buildingWidth']),
    ).toEqual([{ field: 'buildingLength', code: 'hip-length-below-width' }]);
  });
  it('reports missing and out-of-range values per field', () => {
    expect(
      validateProjectStart({ ...draft, pitch: 95, spacing: null }, [
        'pitch',
        'spacing',
      ]),
    ).toEqual([
      { field: 'pitch', code: 'range', min: 1, max: 80 },
      { field: 'spacing', code: 'required' },
    ]);
  });
  it('derives truthful readiness from the workbench resolver', () => {
    const ready = deriveProjectStartReadiness(base);
    expect(ready).toMatchObject({
      geometry: 'ready',
      construction: 'ready',
      k1Cutting: 'ready',
      notes: [],
    });
    const halfLap = deriveProjectStartReadiness({
      ...base,
      ridge: { ...base.ridge, connection: 'half-lap' },
    });
    expect(halfLap.k1Cutting).toBe('unavailable');
    expect(halfLap.notes).toContain('half-lap-unmodelled');
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
