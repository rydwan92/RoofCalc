import { beforeEach, describe, expect, it } from 'vitest';
import type { BattenLayoutSpec } from '@cieslacalc/timber-model';
import {
  resolveBattenLayout,
  resolveCounterBattenLayout,
} from '@cieslacalc/roof-math';
import { useAssembly } from './store';
import { workbenchProjectResolver } from './workbench-project';
import {
  battenRequirement,
  counterBattenRequirement,
  planLinearPurchase,
  type LinearStockLength,
} from './linear-material-plan';

/**
 * V48 reference fixtures. These lock the behaviour the UI promises: a gable
 * roof reaches an exact purchase plan, a roof window really breaks the runs,
 * and a raking end or an undecided hip stays honestly unplanned.
 */

const BATTENS: BattenLayoutSpec = {
  enabled: true,
  mode: 'manual',
  gaugeMm: 350,
  battenWidthMm: 60,
  battenHeightMm: 40,
  eaveOffsetMm: 250,
  ridgeOffsetMm: 40,
};

const CUTTING = { kerfMm: 3, endTrimMm: 0, minimumReusableRemnantMm: 300 };
const STOCK: LinearStockLength[] = [
  { id: 'l3', lengthMm: 3000 },
  { id: 'l4', lengthMm: 4000 },
  { id: 'l5', lengthMm: 5000 },
];

beforeEach(() => {
  useAssembly.getState().reset();
});

function battens() {
  const state = useAssembly.getState();
  return battenRequirement({
    template: state.template,
    skeleton: workbenchProjectResolver.resolve(state.template).skeleton,
    result: resolveBattenLayout({
      template: state.template,
      layout: BATTENS,
      features: state.projectDocument.project.features,
    }),
    section: { widthMm: 60, depthMm: 40 },
  });
}

function counterBattens(hipDetail?: 'paired-plane-runs') {
  const state = useAssembly.getState();
  return counterBattenRequirement({
    template: state.template,
    result: resolveCounterBattenLayout({
      template: state.template,
      skeleton: workbenchProjectResolver.resolve(state.template).skeleton,
      layout: {
        enabled: true,
        widthMm: 40,
        heightMm: 60,
        ...(hipDetail ? { hipBoundaryDetail: hipDetail } : {}),
      },
      features: state.projectDocument.project.features,
    }),
  });
}

describe('gable roof reaches an exact purchase plan (V48 §10)', () => {
  it('every batten run has square ends and real rafter supports', () => {
    const requirement = battens();
    expect(requirement.status).toBe('ready');
    expect(requirement.angledRunCount).toBe(0);
    expect(requirement.runs.length).toBeGreaterThan(0);
    for (const run of requirement.runs) {
      expect(run.startEnd).toBe('square');
      expect(run.endEnd).toBe('square');
      // Supports come from resolved members, not a nominal spacing.
      expect(run.supports.length).toBeGreaterThan(2);
      for (const support of run.supports) {
        expect(support.atMm).toBeGreaterThanOrEqual(0);
        expect(support.atMm).toBeLessThanOrEqual(run.lengthMm);
        expect(support.supportId).toBeTruthy();
      }
    }
  });

  it('the installation requirement equals the resolved geometry, not a purchase length', () => {
    const state = useAssembly.getState();
    const layout = resolveBattenLayout({
      template: state.template,
      layout: BATTENS,
    });
    expect(battens().installedLengthMm).toBeCloseTo(layout.totalLengthMm, 6);
  });

  it('produces a complete plan that buys at least the installed length', () => {
    const requirement = battens();
    const plan = planLinearPurchase(requirement, {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    expect(plan.status).toBe('complete');
    expect(plan.assembly.status).toBe('resolved');
    expect(plan.plan.unassignedPieces).toEqual([]);
    expect(plan.purchasedLengthMm).toBeGreaterThanOrEqual(
      plan.installedLengthMm,
    );
    expect(plan.utilizationRatio).toBeGreaterThan(0.5);
    expect(plan.utilizationRatio).toBeLessThanOrEqual(1);
    expect(
      plan.stock.reduce((sum, item) => sum + item.quantity, 0),
    ).toBeGreaterThan(0);
  });

  it('conserves every stock item: blanks + kerf + trim + remainder = length', () => {
    const plan = planLinearPurchase(battens(), {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    for (const usage of plan.plan.stockUsages) {
      expect(
        usage.assignedBlankLengthMm +
          usage.kerfTotalMm +
          usage.endTrimLossMm +
          usage.remainingLengthMm,
      ).toBeCloseTo(usage.originalLengthMm, 6);
      expect(usage.remainingLengthMm).toBeGreaterThanOrEqual(0);
    }
  });

  it('assigns every required piece exactly once', () => {
    const plan = planLinearPurchase(battens(), {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    const assigned = plan.plan.stockUsages.flatMap((usage) =>
      usage.cuts.map((cut) => cut.requiredPieceId),
    );
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(assigned.length).toBe(plan.assembly.pieces.length);
  });

  it('a spread of commercial lengths beats a single length (V48 §33)', () => {
    const requirement = battens();
    const only4 = planLinearPurchase(requirement, {
      stockLengths: [{ id: 'l4', lengthMm: 4000 }],
      cutting: CUTTING,
    })!;
    const spread = planLinearPurchase(requirement, {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    expect(spread.purchasedLengthMm).toBeLessThanOrEqual(
      only4.purchasedLengthMm,
    );
  });
});

describe('finite availability is respected (V48 §34)', () => {
  it('reports unassigned pieces instead of inventing stock', () => {
    const plan = planLinearPurchase(battens(), {
      stockLengths: [{ id: 'l5', lengthMm: 5000, availability: 2 }],
      cutting: CUTTING,
    })!;
    expect(plan.status).toBe('partial');
    expect(plan.plan.unassignedPieces.length).toBeGreaterThan(0);
    expect(
      plan.plan.unassignedPieces.every(
        (piece) => piece.reason === 'availability-exhausted',
      ),
    ).toBe(true);
  });
});

describe('a roof window really breaks the runs (V48 §7)', () => {
  it('adds runs and never joints across the opening', () => {
    const plain = battens().runs.length;
    useAssembly.getState().addRoofWindow();
    const withWindow = battens();
    expect(withWindow.runs.length).toBeGreaterThan(plain);
    // Each run is a contiguous physical line; the opening produced separate
    // runs, so no piece can bridge it by construction.
    const plan = planLinearPurchase(withWindow, {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    for (const piece of plan.assembly.pieces) {
      const run = withWindow.runs.find((item) => item.id === piece.runId)!;
      expect(piece.toMm).toBeLessThanOrEqual(run.lengthMm);
      expect(piece.fromMm).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('hip roof stays truthful (V48 §8, §10)', () => {
  beforeEach(() => {
    useAssembly.getState().setRoofType('hip');
  });

  it('raking batten ends are detected', () => {
    const requirement = battens();
    expect(requirement.angledRunCount).toBeGreaterThan(0);
  });

  it('without an explicit allowance the raking runs are left unplanned', () => {
    const plan = planLinearPurchase(battens(), {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    expect(plan.assembly.status).not.toBe('resolved');
    expect(
      plan.assembly.unresolved.every(
        (run) => run.reason === 'angled-end-allowance-required',
      ),
    ).toBe(true);
  });

  it('an explicit allowance is added to the blank and never hidden', () => {
    const plan = planLinearPurchase(battens(), {
      stockLengths: STOCK,
      cutting: CUTTING,
      angledEndAllowanceMm: 50,
    })!;
    expect(plan.assembly.status).toBe('resolved');
    expect(plan.assembly.summary.fabricationAllowanceMm).toBeGreaterThan(0);
    expect(plan.assembly.summary.requiredBlankLengthMm).toBe(
      plan.assembly.summary.installedLengthMm +
        plan.assembly.summary.fabricationAllowanceMm,
    );
  });
});

describe('counter-battens follow the resolved rows (V48 §11)', () => {
  it('a gable roof plans them along the rafter', () => {
    const requirement = counterBattens();
    expect(requirement.status).toBe('ready');
    expect(requirement.policy).toBe('joint-along-supporting-member');
    expect(requirement.runs.every((run) => run.supports.length === 0)).toBe(
      true,
    );
    const plan = planLinearPurchase(requirement, {
      stockLengths: STOCK,
      cutting: CUTTING,
    })!;
    expect(plan.status).toBe('complete');
  });

  it('an undecided hip boundary blocks the purchase plan', () => {
    useAssembly.getState().setRoofType('hip');
    const requirement = counterBattens();
    expect(requirement.status).toBe('blocked');
    expect(requirement.blockers).toContain('hip-detail-unresolved');
    expect(
      planLinearPurchase(requirement, {
        stockLengths: STOCK,
        cutting: CUTTING,
      }),
    ).toBeUndefined();
  });

  it('deciding the hip detail unblocks the requirement', () => {
    useAssembly.getState().setRoofType('hip');
    const requirement = counterBattens('paired-plane-runs');
    expect(requirement.blockers).not.toContain('hip-detail-unresolved');
    expect(requirement.status).toBe('ready');
  });
});

describe('nothing to plan is said plainly, never as a number', () => {
  it('a disabled counter-batten layer is blocked, not zero metres', () => {
    const state = useAssembly.getState();
    const requirement = counterBattenRequirement({
      template: state.template,
      result: resolveCounterBattenLayout({
        template: state.template,
        skeleton: workbenchProjectResolver.resolve(state.template).skeleton,
        layout: { enabled: false, widthMm: 40, heightMm: 60 },
      }),
    });
    expect(requirement.status).toBe('blocked');
    expect(requirement.blockers).toContain('layer-off');
    expect(requirement.installedLengthMm).toBe(0);
  });

  it('no stock lengths means no plan at all', () => {
    expect(
      planLinearPurchase(battens(), { stockLengths: [], cutting: CUTTING }),
    ).toBeUndefined();
  });
});
