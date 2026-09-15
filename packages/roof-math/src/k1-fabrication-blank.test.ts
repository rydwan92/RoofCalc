import { describe, expect, it } from 'vitest';
import { assemblyDefaults, calculateAssembly } from './assembly';
import { resolveK1FabricationBlank } from './k1-fabrication-blank';

describe('K1 ridge connection variants', () => {
  it('resolves a direct-opposing-rafter meeting with a longer blank than the board case', () => {
    const boardCalculation = calculateAssembly(assemblyDefaults);
    const boardResult = resolveK1FabricationBlank(
      boardCalculation.assembly,
      assemblyDefaults.ridge.thicknessMm,
      'ridge-board',
    );
    const directSpec = structuredClone(assemblyDefaults);
    directSpec.ridge.connection = 'direct-meeting';
    const directCalculation = calculateAssembly(directSpec);
    const directResult = resolveK1FabricationBlank(
      directCalculation.assembly,
      directSpec.ridge.thicknessMm,
      'direct-meeting',
    );
    expect(boardResult.status).toBe('resolved');
    expect(directResult.status).toBe('resolved');
    if (boardResult.status !== 'resolved' || directResult.status !== 'resolved')
      return;
    expect(directResult.ridgeConnection).toBe(
      'direct-opposing-rafter-plumb-meeting',
    );
    expect(directResult.requiredBlankLengthMm).toBeGreaterThan(
      boardResult.requiredBlankLengthMm,
    );
  });

  it('never resolves a half-lap blank, regardless of thickness', () => {
    const calculation = calculateAssembly(assemblyDefaults);
    expect(
      resolveK1FabricationBlank(
        calculation.assembly,
        assemblyDefaults.ridge.thicknessMm,
        'half-lap',
      ),
    ).toEqual({ status: 'unresolved', reason: 'ridge-connection-not-modeled' });
  });
});

describe('K1 physical blank proof', () => {
  const calculation = calculateAssembly(assemblyDefaults);

  it('encloses every modeled finished and removed-cut vertex without allowance', () => {
    const result = resolveK1FabricationBlank(
      calculation.assembly,
      assemblyDefaults.ridge.thicknessMm,
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    const points = [
      ...calculation.assembly.member.profile,
      ...calculation.assembly.endCuts.flatMap((cut) => cut.line),
      ...calculation.assembly.joints.flatMap((joint) => joint.removedProfile),
    ];
    expect(result.requiredBlankLengthMm).toBeCloseTo(
      Math.max(...points.map((point) => point.x)),
      6,
    );
    expect(result.requiredBlankLengthMm).toBeCloseTo(
      calculation.plan.minimumStockLengthMm,
      6,
    );
    expect(result.fabricationAllowanceMm).toBe(0);
    expect(result.finishedGeometryReference).toEqual({
      memberPrototypeId: calculation.assembly.member.id,
      endCutIds: calculation.assembly.endCuts.map((cut) => cut.id),
      jointIds: calculation.assembly.joints.map((joint) => joint.id),
    });
  });

  it('refuses a missing physical ridge board or a cut outside the envelope', () => {
    expect(resolveK1FabricationBlank(calculation.assembly, 0)).toEqual({
      status: 'unresolved',
      reason: 'ridge-board-not-modeled',
    });
    const changed = structuredClone(calculation.assembly);
    changed.endCuts[1]!.line[0]!.x = -1;
    expect(
      resolveK1FabricationBlank(changed, assemblyDefaults.ridge.thicknessMm),
    ).toEqual({ status: 'unresolved', reason: 'geometry-outside-blank' });
  });
});
