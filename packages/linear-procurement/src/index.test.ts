import { describe, expect, it } from 'vitest';
import {
  installablePiecesToRequiredPieces,
  planLinearAssembly,
  type LinearAssemblySettings,
  type LinearRun,
} from './index';

/**
 * V48 invariants. The rules under test are cited in
 * `docs/domain/BATTEN_STOCK_AND_JOINING_RESEARCH.md`; a failure here means the
 * planner started claiming something the research does not support.
 */

const battenSettings: LinearAssemblySettings = {
  policy: 'joint-at-support',
  maximumPieceLengthMm: 5000,
  minimumPieceLengthMm: 1200,
  minimumSupportsPerPiece: 3,
  stagger: { joints: 1, consecutiveRuns: 4 },
};

/** Supports every `spacing` mm from 0 up to and including `length`. */
function supportsEvery(spacing: number, lengthMm: number) {
  const supports = [];
  for (let at = 0; at <= lengthMm + 0.001; at += spacing)
    supports.push({
      atMm: Math.round(at),
      supportId: `rafter-${Math.round(at)}`,
    });
  return supports;
}

function run(overrides: Partial<LinearRun> & { id: string }): LinearRun {
  return {
    sequenceId: 'plane-a',
    sequenceIndex: 0,
    lengthMm: 8000,
    supports: supportsEvery(800, overrides.lengthMm ?? 8000),
    startEnd: 'square',
    endEnd: 'square',
    ...overrides,
  };
}

describe('single piece when the run fits', () => {
  it('a run no longer than the stock is one piece with no joint', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'r1', lengthMm: 4800 })],
      settings: battenSettings,
    });
    expect(result.status).toBe('resolved');
    expect(result.pieces).toHaveLength(1);
    expect(result.summary.jointCount).toBe(0);
    expect(result.pieces[0]!.requiredBlankLengthMm).toBe(4800);
  });

  it('a run shorter than the minimum piece is still planned — that is geometry', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'short', lengthMm: 700, supports: supportsEvery(800, 700) }),
      ],
      settings: battenSettings,
    });
    expect(result.status).toBe('resolved');
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]!.installedLengthMm).toBe(700);
  });
});

describe('no unsupported joint (research §2.1)', () => {
  const settings = battenSettings;

  it('every created joint sits exactly on a support station', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      run({
        id: `row-${index}`,
        sequenceIndex: index,
        lengthMm: 12000,
        supports: supportsEvery(800, 12000),
      }),
    );
    const result = planLinearAssembly({ runs: rows, settings });
    expect(result.status).toBe('resolved');
    const stations = new Set(supportsEvery(800, 12000).map((s) => s.atMm));
    for (const piece of result.pieces) {
      if (piece.fromMm !== 0) expect(stations.has(piece.fromMm)).toBe(true);
      if (piece.toMm !== 12000) expect(stations.has(piece.toMm)).toBe(true);
    }
  });

  it('records the support each joint is made over', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'r1', lengthMm: 9600, supports: supportsEvery(800, 9600) }),
      ],
      settings,
    });
    const joints = result.pieces.filter((piece) => piece.toMm !== 9600);
    expect(joints.length).toBeGreaterThan(0);
    for (const piece of joints)
      expect(piece.endJointSupportId).toMatch(/^rafter-/);
  });

  it('a run with no interior support cannot be jointed', () => {
    const result = planLinearAssembly({
      runs: [
        run({
          id: 'unsupported',
          lengthMm: 9000,
          supports: [
            { atMm: 0, supportId: 'a' },
            { atMm: 9000, supportId: 'b' },
          ],
        }),
      ],
      settings,
    });
    expect(result.status).toBe('unresolved');
    expect(result.unresolved[0]!.reason).toBe('no-legal-joint-position');
    expect(result.pieces).toHaveLength(0);
  });
});

describe('conservation (V48 §36, §37)', () => {
  it('pieces tile each run exactly: no gap, no overlap, no duplicate', () => {
    const rows = [
      run({ id: 'a', lengthMm: 12000, supports: supportsEvery(800, 12000) }),
      run({
        id: 'b',
        sequenceIndex: 1,
        lengthMm: 15400,
        supports: supportsEvery(700, 15400),
      }),
      run({
        id: 'c',
        sequenceIndex: 2,
        lengthMm: 4000,
        supports: supportsEvery(800, 4000),
      }),
    ];
    const result = planLinearAssembly({ runs: rows, settings: battenSettings });
    expect(result.status).toBe('resolved');
    for (const source of rows) {
      const pieces = result.pieces
        .filter((piece) => piece.runId === source.id)
        .sort((x, y) => x.fromMm - y.fromMm);
      expect(pieces[0]!.fromMm).toBe(0);
      expect(pieces[pieces.length - 1]!.toMm).toBe(source.lengthMm);
      for (let index = 1; index < pieces.length; index += 1)
        expect(pieces[index]!.fromMm).toBe(pieces[index - 1]!.toMm);
      const installed = pieces.reduce(
        (sum, piece) => sum + piece.installedLengthMm,
        0,
      );
      expect(installed).toBe(source.lengthMm);
    }
    expect(new Set(result.pieces.map((piece) => piece.id)).size).toBe(
      result.pieces.length,
    );
  });

  it('summary totals equal the sum of the pieces', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'a', lengthMm: 12000, supports: supportsEvery(800, 12000) }),
        run({
          id: 'b',
          sequenceIndex: 1,
          lengthMm: 9600,
          supports: supportsEvery(800, 9600),
        }),
      ],
      settings: battenSettings,
    });
    expect(result.summary.installedLengthMm).toBe(21600);
    expect(result.summary.requiredBlankLengthMm).toBe(
      result.summary.installedLengthMm + result.summary.fabricationAllowanceMm,
    );
    expect(result.summary.pieceCount).toBe(result.pieces.length);
    expect(result.summary.jointCount).toBe(
      result.pieces.length - result.summary.resolvedRunCount,
    );
  });

  it('is deterministic', () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      run({
        id: `row-${index}`,
        sequenceIndex: index,
        lengthMm: 13600,
        supports: supportsEvery(800, 13600),
      }),
    );
    const first = planLinearAssembly({ runs: rows, settings: battenSettings });
    const second = planLinearAssembly({
      runs: rows.slice().reverse(),
      settings: battenSettings,
    });
    expect(second.pieces).toEqual(first.pieces);
  });
});

describe('created pieces respect the stated minimums (research §2.2)', () => {
  it('never creates a piece below the minimum length', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'r', lengthMm: 10400, supports: supportsEvery(800, 10400) }),
      ],
      settings: battenSettings,
    });
    const created = result.pieces.filter(
      (piece) => piece.fromMm !== 0 || piece.toMm !== 10400,
    );
    for (const piece of created)
      expect(piece.installedLengthMm).toBeGreaterThanOrEqual(1200);
  });

  it('every created piece rests on at least the required number of supports', () => {
    const stations = supportsEvery(800, 10400).map((s) => s.atMm);
    const result = planLinearAssembly({
      runs: [
        run({ id: 'r', lengthMm: 10400, supports: supportsEvery(800, 10400) }),
      ],
      settings: battenSettings,
    });
    for (const piece of result.pieces) {
      const resting = stations.filter(
        (at) => at >= piece.fromMm && at <= piece.toMm,
      ).length;
      expect(resting).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('stagger (research §2.3)', () => {
  it('consecutive courses do not all joint over the same rafter', () => {
    // 12 m over 800 mm supports leaves several minimum-piece-count splits, so
    // the 1-in-4 rule can actually be satisfied.
    const rows = Array.from({ length: 4 }, (_, index) =>
      run({
        id: `row-${index}`,
        sequenceIndex: index,
        lengthMm: 12000,
        supports: supportsEvery(800, 12000),
      }),
    );
    const result = planLinearAssembly({ runs: rows, settings: battenSettings });
    const firstJointPerRow = rows.map(
      (source) =>
        result.pieces
          .filter((piece) => piece.runId === source.id)
          .sort((x, y) => x.fromMm - y.fromMm)[0]!.endJointSupportId,
    );
    expect(new Set(firstJointPerRow).size).toBe(4);
  });

  /**
   * The honest limit of the rule. A 9,6 m run on 800 mm supports has exactly
   * one two-piece split (4800), so staggering would cost an extra piece on
   * every course. The planner keeps the material minimal and reports that the
   * stagger rule was relaxed instead of silently buying more timber or
   * silently breaking the rule.
   */
  it('reports a relaxed stagger rather than inflating the material', () => {
    const rows = Array.from({ length: 4 }, (_, index) =>
      run({
        id: `row-${index}`,
        sequenceIndex: index,
        lengthMm: 9600,
        supports: supportsEvery(800, 9600),
      }),
    );
    const result = planLinearAssembly({ runs: rows, settings: battenSettings });
    const jointSupports = result.pieces
      .map((piece) => piece.endJointSupportId)
      .filter((id): id is string => id !== undefined);
    expect(jointSupports).toEqual(Array(4).fill('rafter-4800'));
    expect(result.summary.staggerRelaxed).toBe(true);
    expect(result.summary.pieceCount).toBe(8);
  });
});

describe('angled ends are never guessed (research §2.6, V48 §8)', () => {
  it('an angled end without an explicit allowance leaves the run unresolved', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'hip', lengthMm: 4000, endEnd: 'angled' })],
      settings: battenSettings,
    });
    expect(result.status).toBe('unresolved');
    expect(result.unresolved[0]!.reason).toBe('angled-end-allowance-required');
  });

  it('an explicit allowance is added to the blank and stays visible', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'hip', lengthMm: 4000, endEnd: 'angled' })],
      settings: { ...battenSettings, angledEndAllowanceMm: 60 },
    });
    expect(result.status).toBe('resolved');
    const piece = result.pieces[0]!;
    expect(piece.installedLengthMm).toBe(4000);
    expect(piece.fabricationAllowanceMm).toBe(60);
    expect(piece.requiredBlankLengthMm).toBe(4060);
  });

  it('an unknown end is never planned', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'x', lengthMm: 4000, endEnd: 'unknown' })],
      settings: { ...battenSettings, angledEndAllowanceMm: 60 },
    });
    expect(result.unresolved[0]!.reason).toBe('unknown-end-geometry');
  });
});

describe('policies', () => {
  it('continuous-piece-required refuses to splice a long run', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'r', lengthMm: 9000 })],
      settings: { ...battenSettings, policy: 'continuous-piece-required' },
    });
    expect(result.unresolved[0]!.reason).toBe(
      'run-longer-than-available-piece',
    );
  });

  it('manual-required plans nothing and says so', () => {
    const result = planLinearAssembly({
      runs: [run({ id: 'r', lengthMm: 4000 })],
      settings: { ...battenSettings, policy: 'manual-required' },
    });
    expect(result.status).toBe('unresolved');
    expect(result.unresolved[0]!.reason).toBe('manual-decision-required');
  });

  it('joint-along-supporting-member splits a counter-batten evenly without supports', () => {
    const result = planLinearAssembly({
      runs: [
        {
          id: 'cb',
          sequenceId: 'plane-a',
          sequenceIndex: 0,
          lengthMm: 9000,
          supports: [],
          startEnd: 'square',
          endEnd: 'square',
        },
      ],
      settings: {
        ...battenSettings,
        policy: 'joint-along-supporting-member',
        maximumPieceLengthMm: 5000,
      },
    });
    expect(result.status).toBe('resolved');
    expect(result.pieces.map((piece) => piece.installedLengthMm)).toEqual([
      4500, 4500,
    ]);
    expect(result.summary.jointCount).toBe(1);
  });

  it('an even split never leaves an offcut-sized last piece', () => {
    const result = planLinearAssembly({
      runs: [
        {
          id: 'cb',
          sequenceId: 'p',
          sequenceIndex: 0,
          lengthMm: 10200,
          supports: [],
          startEnd: 'square',
          endEnd: 'square',
        },
      ],
      settings: {
        ...battenSettings,
        policy: 'joint-along-supporting-member',
        maximumPieceLengthMm: 5000,
      },
    });
    expect(result.pieces.map((piece) => piece.installedLengthMm)).toEqual([
      3400, 3400, 3400,
    ]);
  });
});

describe('partial results stay partial', () => {
  it('one unplannable run does not discard the rest', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'good', lengthMm: 4000 }),
        run({ id: 'bad', sequenceIndex: 1, lengthMm: 4000, endEnd: 'angled' }),
      ],
      settings: battenSettings,
    });
    expect(result.status).toBe('partial');
    expect(result.pieces.map((piece) => piece.runId)).toEqual(['good']);
    expect(result.unresolved.map((item) => item.runId)).toEqual(['bad']);
    expect(result.summary.resolvedRunCount).toBe(1);
  });
});

describe('bridge into procurement-core', () => {
  it('maps every piece once, carrying the blank length unchanged', () => {
    const result = planLinearAssembly({
      runs: [
        run({ id: 'r', lengthMm: 12000, supports: supportsEvery(800, 12000) }),
      ],
      settings: battenSettings,
    });
    const required = installablePiecesToRequiredPieces(
      result.pieces,
      'class-a',
    );
    expect(required).toHaveLength(result.pieces.length);
    expect(required.map((piece) => piece.requiredBlankLengthMm)).toEqual(
      result.pieces.map((piece) => piece.requiredBlankLengthMm),
    );
    expect(new Set(required.map((piece) => piece.id)).size).toBe(
      required.length,
    );
    expect(required.every((piece) => piece.stockClassId === 'class-a')).toBe(
      true,
    );
  });
});
