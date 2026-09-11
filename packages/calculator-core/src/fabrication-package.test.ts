import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import {
  createRoofFabricationPackage,
  detailPreviewsFromFabricationPackage,
} from './fabrication-package';

describe('roof fabrication package', () => {
  it('maps K1 joints and ridge cut to deterministic operations', () => {
    const resolved = resolveRoofTemplate(
      gableTemplateFromAssembly(assemblyDefaults),
    );
    const roofPackage = createRoofFabricationPackage(resolved);
    expect(roofPackage.families.map((family) => family.code)).toEqual(['K1']);
    expect(
      roofPackage.families[0]!.operations.map((operation) => operation.code),
    ).toEqual(['Z1', 'K1']);
    expect(detailPreviewsFromFabricationPackage(roofPackage)).toHaveLength(2);
  });

  it('groups equal J1 lengths and keeps K1/H1/J1 order', () => {
    const hip = convertRoofTemplate(
      gableTemplateFromAssembly(assemblyDefaults),
      'hip',
    );
    const resolved = resolveRoofTemplate(hip);
    if (!('jackRafters' in resolved)) throw new Error('hip result expected');
    const roofPackage = createRoofFabricationPackage(resolved);
    expect(roofPackage.families.map((family) => family.code)).toEqual([
      'K1',
      'H1',
      'J1',
    ]);
    const j1 = roofPackage.families[2]!;
    const h1 = roofPackage.families[1]!;
    expect(h1.quantity).toBe(
      resolved.memberPrototypes.find((prototype) => prototype.code === 'H1')!
        .count,
    );
    expect(h1.operations).toHaveLength(1);
    expect(h1.operations[0]).toMatchObject({
      code: 'H1',
      type: 'hip-cut',
      status: 'limited',
    });
    expect(h1.operations[0]!.detailPreview?.subjectCode).toBe('H1');
    expect(j1.quantity).toBe(resolved.jackRafters.length);
    expect(
      j1.lengthGroups.reduce((sum, group) => sum + group.quantity, 0),
    ).toBe(j1.quantity);
    expect(j1.lengthGroups.every((group) => group.quantity === 8)).toBe(true);
    expect(j1.warningKeys).toContain('hipFaceDeductionNote');
    const hipMeeting = j1.operations.find(
      (operation) => operation.type === 'jack-cut',
    );
    expect(hipMeeting).toMatchObject({ status: 'limited' });
    expect(hipMeeting?.detailPreview).toBeUndefined();
  });

  it('returns stable package ordering and values for identical input', () => {
    const resolved = resolveRoofTemplate(
      convertRoofTemplate(gableTemplateFromAssembly(assemblyDefaults), 'hip'),
    );
    expect(createRoofFabricationPackage(resolved)).toEqual(
      createRoofFabricationPackage(resolved),
    );
  });
});
