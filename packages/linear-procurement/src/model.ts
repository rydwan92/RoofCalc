/**
 * Contracts for turning a *resolved linear installation run* into the
 * indivisible physical pieces a stock-length procurement plan may buy.
 *
 * This package sits between roof geometry and `procurement-core` (V48 §2).
 * It never computes geometry: a run arrives already resolved, already split
 * by openings, with its supporting axes already known. It decides only how
 * that run may legally be assembled from several commercial pieces.
 *
 * All lengths are canonical millimetres. Nothing here knows about roofs,
 * catalogues, prices or the UI — a run is a supported line of a given length.
 */

/**
 * How a geometric run may be built from commercial pieces.
 *
 * Evidence and classification: `docs/domain/BATTEN_STOCK_AND_JOINING_RESEARCH.md`.
 */
export type LinearJoinPolicy =
  /** One piece per run. A run longer than the longest stock stays unresolved. */
  | 'continuous-piece-required'
  /** Butt joints only over a resolved support — tile battens (research §2.1). */
  | 'joint-at-support'
  /** Continuously supported along its own axis — counter-battens (research §2.4). */
  | 'joint-along-supporting-member'
  /** The policy is a user decision this project has not made. */
  | 'manual-required';

/** How a run terminates. An angled end has no proven fabrication blank (research §2.6). */
export type LinearEndKind = 'square' | 'angled' | 'unknown';

/** A resolved supporting axis crossing the run, measured along the run. */
export interface LinearSupport {
  /** Distance from the run start, in millimetres. */
  atMm: number;
  /** Opaque upstream identity of the supporting member. Never parsed. */
  supportId: string;
}

/**
 * One resolved, physically continuous installation run.
 *
 * `sequenceId` groups the runs that "consecutive battens" means for the
 * stagger rule (research §2.3) — in practice one roof plane. `sequenceIndex`
 * orders them, so stagger is deterministic and reproducible.
 */
export interface LinearRun {
  id: string;
  sequenceId: string;
  sequenceIndex: number;
  lengthMm: number;
  supports: readonly LinearSupport[];
  startEnd: LinearEndKind;
  endEnd: LinearEndKind;
}

/**
 * Stagger limit: at most `joints` joints over the same support within any
 * `consecutiveRuns` consecutive runs of a sequence (research §2.3).
 */
export interface LinearStaggerRule {
  joints: number;
  consecutiveRuns: number;
}

export interface LinearAssemblySettings {
  policy: LinearJoinPolicy;
  /** The longest commercial piece obtainable, before procurement end trims. */
  maximumPieceLengthMm: number;
  /** Shortest piece the planner may *create* by splitting (research §2.2). */
  minimumPieceLengthMm: number;
  /** Supports a created piece must rest on, inclusive of both ends (research §2.2). */
  minimumSupportsPerPiece: number;
  stagger?: LinearStaggerRule;
  /**
   * Explicit fabrication allowance added to a blank whose end is angled.
   * Undefined means the project has not decided one, and such runs stay
   * unresolved rather than receiving a hidden guess (V48 §8, §9).
   */
  angledEndAllowanceMm?: number;
}

export type LinearUnresolvedReason =
  /** Longer than the longest stock and the policy forbids a joint. */
  | 'run-longer-than-available-piece'
  /** A joint is needed but no support sequence produces legal pieces. */
  | 'no-legal-joint-position'
  /** An angled end without an explicit allowance (research §2.6). */
  | 'angled-end-allowance-required'
  /** The run's end geometry is not resolved at all. */
  | 'unknown-end-geometry'
  /** The project has not chosen a join policy. */
  | 'manual-decision-required'
  | 'invalid-run';

export interface LinearUnresolvedRun {
  runId: string;
  sequenceId: string;
  lengthMm: number;
  reason: LinearUnresolvedReason;
}

/**
 * One indivisible physical piece: exactly what one commercial stock item must
 * yield. `requiredBlankLengthMm` already contains any angled-end allowance,
 * because a fabrication allowance belongs upstream of procurement (V48 §9).
 */
export interface InstallablePiece {
  id: string;
  runId: string;
  sequenceId: string;
  sequenceIndex: number;
  /** Position of this piece inside its run. */
  fromMm: number;
  toMm: number;
  /** Installed length: `toMm - fromMm`. */
  installedLengthMm: number;
  /** What procurement must obtain from one stock item. */
  requiredBlankLengthMm: number;
  /** Allowance included in the blank, if any. Zero when the ends are square. */
  fabricationAllowanceMm: number;
  startEnd: LinearEndKind;
  endEnd: LinearEndKind;
  /** Support the piece is jointed over at each end, when that end is a joint. */
  startJointSupportId?: string;
  endJointSupportId?: string;
}

export interface LinearAssemblySummary {
  runCount: number;
  resolvedRunCount: number;
  pieceCount: number;
  jointCount: number;
  /** Sum of installed lengths of resolved runs — the installation requirement. */
  installedLengthMm: number;
  /** Sum of required blanks, i.e. installed length plus allowances. */
  requiredBlankLengthMm: number;
  fabricationAllowanceMm: number;
  /** Stagger limit could not be met somewhere; the plan is still legal. */
  staggerRelaxed: boolean;
}

export interface LinearAssemblyResult {
  status: 'resolved' | 'partial' | 'unresolved';
  policy: LinearJoinPolicy;
  pieces: InstallablePiece[];
  unresolved: LinearUnresolvedRun[];
  summary: LinearAssemblySummary;
}
