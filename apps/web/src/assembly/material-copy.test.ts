import { describe, expect, it } from 'vitest';
import { materialRowLabel } from './material-copy';

/**
 * VNext-11: one label rule for a material row in the plan, the CSV, the
 * quote and the execution document — a timber member by its name, never a
 * bare family code such as "M" or "R".
 */
describe('material row label', () => {
  it('names a timber member by its kind, code, section and pieces', () => {
    const label = materialRowLabel(
      {
        labelKey: 'timberEvidence',
        description: 'M',
        timberMember: {
          memberKind: 'wall-plate',
          familyKey: 'M',
          pieceCount: 2,
          pieceLengthMm: 10_000,
          widthMm: 140,
          depthMm: 140,
        },
      },
      'pl',
    );
    expect(label).toBe('Murłata M 140×140 · 2 szt. × 10,00 m');
    expect(label).not.toContain('zestawienie geometryczne');
  });

  it('reads any other row as its name and description', () => {
    expect(
      materialRowLabel(
        { labelKey: 'battens', description: '40 × 60 mm' },
        'pl',
      ),
    ).toBe('Łaty · 40 × 60 mm');
    expect(materialRowLabel({ labelKey: 'membrane' }, 'en')).toBe('Membrane');
  });
});
