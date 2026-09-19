import type {
  DrainageComponentRole,
  DrainageComponentSnapshot,
  DrainageIntent,
  DrainageSystemSnapshot,
} from './drainage-spec';
import { planCommercialSections, type SectionAssembly } from './sections';
import { distributeAlongLength } from './spacing';

/**
 * V51 drainage planner: "for THIS selected system and THIS chosen layout,
 * which components are needed?"
 *
 * Inputs are canonical roof eaves and eave corners (structural copies of the
 * resolved roof topology) plus the persisted user intent. Gutter length comes
 * from the eaves — never from a building perimeter. Counts follow the resolved
 * drainage topology: sections and connectors from each run's actual
 * commercial assembly, end caps from open run ends, corners from connected
 * corners, hooks from an even distribution under the allowed spacing.
 *
 * Hydraulic adequacy (gutter size, number and diameter of outlets) is NOT
 * assessed. Nothing here selects a system size from rainfall.
 */
export interface DrainageEaveInput {
  id: string;
  ordinal: number;
  lengthMm: number;
}

export interface DrainageCornerInput {
  id: string;
  endingEaveId: string;
  startingEaveId: string;
  kind: 'external' | 'internal';
}

export type DrainageQuantityRule =
  | 'commercial-assembly'
  | 'one-per-joint'
  | 'one-per-feature-end'
  | 'spacing-along-feature'
  | 'one-per-outlet'
  | 'manual';

export type DrainageIssueCode =
  | 'system-missing'
  | 'no-guttered-eaves'
  | 'stale-eave-reference'
  | 'corner-undecided'
  | 'outlets-unconfirmed'
  | 'outlet-outside-run'
  | 'downpipe-height-missing'
  | 'elbows-unconfirmed'
  | 'clamps-unresolved'
  | 'hook-spacing-missing'
  | 'hook-spacing-exceeds-maximum'
  | 'gutter-length-missing'
  | 'downpipe-length-missing'
  | 'component-missing';

export interface DrainageIssue {
  code: DrainageIssueCode;
  eaveId?: string;
  outletId?: string;
  runId?: string;
  role?: DrainageComponentRole;
}

export interface GutterSegment {
  eaveId: string;
  lengthMm: number;
  /** Distance of this segment's start from the run start. */
  offsetMm: number;
  assembly?: SectionAssembly;
  hookPositionsMm: number[];
}

export interface GutterRun {
  id: string;
  ordinal: number;
  segments: GutterSegment[];
  lengthMm: number;
  /** A closed loop around the roof has no open end. */
  closed: boolean;
  openEnds: number;
  cornerIds: string[];
}

export type CornerState = 'connected' | 'separate' | 'undecided';

export interface ResolvedDrainageCorner extends DrainageCornerInput {
  /** Only corners between two guttered eaves are drainage corners. */
  state: CornerState;
  source: 'proposed' | 'user' | 'none';
}

export interface ResolvedDownpipe {
  heightMm?: number;
  assembly?: SectionAssembly;
  elbows?: number;
  clamps?: number;
  clampSource?: 'spacing' | 'user';
}

export interface ResolvedOutlet {
  id: string;
  eaveId: string;
  runId: string;
  station: number;
  /** Distance from the eave start, mm. */
  positionMm: number;
  downpipe: ResolvedDownpipe;
}

export interface ProposedOutlet {
  eaveId: string;
  runId: string;
  station: number;
}

export type DrainageBomStatus =
  'resolved' | 'requires-decision' | 'incompatible';

export interface DrainageBomRow {
  /** Deterministic row key: role plus its distinguishing fact. */
  key: string;
  role: DrainageComponentRole;
  rule: DrainageQuantityRule;
  status: DrainageBomStatus;
  quantity?: number;
  lengthMm?: number;
  hand?: 'left' | 'right' | 'universal';
  component?: DrainageComponentSnapshot;
  reason?: DrainageIssueCode;
}

export interface HookPlan {
  mode: 'auto' | 'manual';
  /** Source-backed maximum from the selected system, if it states one. */
  maxSpacingMm?: number;
  /** The spacing limit actually applied (manual value or the maximum). */
  appliedSpacingMm?: number;
  /** The largest actual interval RoofCalc produced. */
  actualIntervalMm?: number;
  count?: number;
  status: 'resolved' | 'incompatible' | 'requires-decision';
}

export interface DrainagePlan {
  status: 'disabled' | 'system-missing' | 'incomplete' | 'complete';
  mode: 'auto' | 'manual';
  gutteredEaveIds: string[];
  runs: GutterRun[];
  corners: ResolvedDrainageCorner[];
  outlets: ResolvedOutlet[];
  proposedOutlets: ProposedOutlet[];
  hooks: HookPlan;
  bom: DrainageBomRow[];
  issues: DrainageIssue[];
  totalGutterLengthMm: number;
  purchasedGutterLengthMm?: number;
}

const PROPOSED_OUTLET_END_DISTANCE_MM = 300;

function components(
  system: DrainageSystemSnapshot | undefined,
  role: DrainageComponentRole,
) {
  return (system?.components ?? []).filter((item) => item.spec.role === role);
}

function emptyPlan(
  intent: DrainageIntent | undefined,
  status: DrainagePlan['status'],
): DrainagePlan {
  return {
    status,
    mode: intent?.mode ?? 'auto',
    gutteredEaveIds: [],
    runs: [],
    corners: [],
    outlets: [],
    proposedOutlets: [],
    hooks: { mode: 'auto', status: 'requires-decision' },
    bom: [],
    issues: [],
    totalGutterLengthMm: 0,
  };
}

export function resolveDrainagePlan(args: {
  eaves: readonly DrainageEaveInput[];
  corners: readonly DrainageCornerInput[];
  intent: DrainageIntent | undefined;
}): DrainagePlan {
  const { intent } = args;
  if (!intent?.enabled) return emptyPlan(intent, 'disabled');
  const issues: DrainageIssue[] = [];
  const eaveById = new Map(args.eaves.map((eave) => [eave.id, eave]));
  const auto = intent.mode === 'auto';
  // 1. Which eaves carry a gutter.
  const requested = auto
    ? args.eaves.map((eave) => eave.id)
    : (intent.gutteredEaveIds ?? []);
  for (const id of requested)
    if (!eaveById.has(id))
      issues.push({ code: 'stale-eave-reference', eaveId: id });
  const guttered = args.eaves
    .filter((eave) => requested.includes(eave.id))
    .map((eave) => eave.id);
  const gutteredSet = new Set(guttered);
  // 2. Corner topology — only between two guttered eaves.
  const corners: ResolvedDrainageCorner[] = args.corners.map((corner) => {
    if (
      !gutteredSet.has(corner.endingEaveId) ||
      !gutteredSet.has(corner.startingEaveId)
    )
      return { ...corner, state: 'separate', source: 'none' };
    const decision = intent.corners?.find(
      (item) =>
        item.endingEaveId === corner.endingEaveId &&
        item.startingEaveId === corner.startingEaveId,
    );
    if (decision)
      return { ...corner, state: decision.connection, source: 'user' };
    if (auto) return { ...corner, state: 'connected', source: 'proposed' };
    issues.push({ code: 'corner-undecided', eaveId: corner.endingEaveId });
    return { ...corner, state: 'undecided', source: 'none' };
  });
  const connectedAfter = new Map<string, ResolvedDrainageCorner>();
  const connectedBefore = new Map<string, ResolvedDrainageCorner>();
  for (const corner of corners)
    if (corner.state === 'connected') {
      connectedAfter.set(corner.endingEaveId, corner);
      connectedBefore.set(corner.startingEaveId, corner);
    }
  // 3. Runs: chains of guttered eaves through connected corners.
  const system = intent.system;
  const gutterLengths = components(system, 'gutter-section').flatMap((item) =>
    item.spec.lengthMm ? [item.spec.lengthMm] : [],
  );
  const runs: GutterRun[] = [];
  const visited = new Set<string>();
  const buildRun = (startId: string) => {
    const chain: string[] = [];
    const cornerIds: string[] = [];
    let current: string | undefined = startId;
    let closed = false;
    while (current && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      const next = connectedAfter.get(current);
      if (!next) break;
      cornerIds.push(next.id);
      if (next.startingEaveId === startId) {
        closed = true;
        break;
      }
      current = next.startingEaveId;
    }
    let offset = 0;
    const segments = chain.map((eaveId) => {
      const lengthMm = eaveById.get(eaveId)!.lengthMm;
      const segment: GutterSegment = {
        eaveId,
        lengthMm,
        offsetMm: offset,
        ...(gutterLengths.length
          ? { assembly: planCommercialSections(lengthMm, gutterLengths) }
          : {}),
        hookPositionsMm: [],
      };
      offset += lengthMm;
      return segment;
    });
    runs.push({
      id: `gutter-run:${runs.length + 1}`,
      ordinal: runs.length + 1,
      segments,
      lengthMm: offset,
      closed,
      openEnds: closed ? 0 : 2,
      cornerIds,
    });
  };
  for (const id of guttered) if (!connectedBefore.has(id)) buildRun(id);
  for (const id of guttered) if (!visited.has(id)) buildRun(id);
  if (!guttered.length) issues.push({ code: 'no-guttered-eaves' });
  const runOfEave = new Map(
    runs.flatMap((run) =>
      run.segments.map((segment) => [segment.eaveId, run] as const),
    ),
  );
  // 4. Hooks: every interval ≤ the allowed spacing, per eave segment.
  const hookComponent = components(system, 'gutter-hook')[0];
  const maxSpacingMm = hookComponent?.spec.maxSpacingMm;
  const manual =
    intent.hookSpacing?.mode === 'manual'
      ? intent.hookSpacing.spacingMm
      : undefined;
  const appliedSpacingMm = manual ?? maxSpacingMm;
  const hookStatus: HookPlan['status'] =
    appliedSpacingMm === undefined
      ? 'requires-decision'
      : manual !== undefined &&
          maxSpacingMm !== undefined &&
          manual > maxSpacingMm + 1e-6
        ? 'incompatible'
        : 'resolved';
  let actualIntervalMm = 0;
  if (appliedSpacingMm !== undefined)
    for (const run of runs)
      for (const segment of run.segments) {
        const plan = distributeAlongLength({
          lengthMm: segment.lengthMm,
          maxSpacingMm: appliedSpacingMm,
          endOffsetMm: hookComponent?.spec.maxEndDistanceMm,
        });
        segment.hookPositionsMm = plan.positionsMm;
        actualIntervalMm = Math.max(actualIntervalMm, plan.intervalMm);
      }
  if (guttered.length && appliedSpacingMm === undefined && system)
    issues.push({ code: 'hook-spacing-missing', role: 'gutter-hook' });
  if (hookStatus === 'incompatible')
    issues.push({ code: 'hook-spacing-exceeds-maximum', role: 'gutter-hook' });
  const hookCount = runs.reduce(
    (sum, run) =>
      sum +
      run.segments.reduce(
        (total, seg) => total + seg.hookPositionsMm.length,
        0,
      ),
    0,
  );
  const hooks: HookPlan = {
    mode: manual !== undefined ? 'manual' : 'auto',
    ...(maxSpacingMm !== undefined ? { maxSpacingMm } : {}),
    ...(appliedSpacingMm !== undefined ? { appliedSpacingMm } : {}),
    ...(appliedSpacingMm !== undefined
      ? { actualIntervalMm, count: hookCount }
      : {}),
    status: guttered.length ? hookStatus : 'requires-decision',
  };
  // 5. Outlets: explicit only; proposals are shown, never counted.
  const downpipeLengths = components(system, 'downpipe').flatMap((item) =>
    item.spec.lengthMm ? [item.spec.lengthMm] : [],
  );
  const clampSpacing = components(system, 'downpipe-clamp')[0]?.spec
    .maxSpacingMm;
  const outlets: ResolvedOutlet[] = [];
  for (const outlet of intent.outlets ?? []) {
    const run = runOfEave.get(outlet.eaveId);
    const eave = eaveById.get(outlet.eaveId);
    if (!run || !eave) {
      issues.push({ code: 'outlet-outside-run', outletId: outlet.id });
      continue;
    }
    const heightMm = outlet.downpipeHeightMm;
    if (heightMm === undefined)
      issues.push({ code: 'downpipe-height-missing', outletId: outlet.id });
    if (outlet.elbowCount === undefined)
      issues.push({ code: 'elbows-unconfirmed', outletId: outlet.id });
    const clamps =
      outlet.clampCount ??
      (heightMm !== undefined && clampSpacing
        ? distributeAlongLength({
            lengthMm: heightMm,
            maxSpacingMm: clampSpacing,
          }).count
        : undefined);
    if (heightMm !== undefined && clamps === undefined)
      issues.push({ code: 'clamps-unresolved', outletId: outlet.id });
    outlets.push({
      id: outlet.id,
      eaveId: outlet.eaveId,
      runId: run.id,
      station: outlet.station,
      positionMm: outlet.station * eave.lengthMm,
      downpipe: {
        ...(heightMm !== undefined ? { heightMm } : {}),
        ...(heightMm !== undefined && downpipeLengths.length
          ? { assembly: planCommercialSections(heightMm, downpipeLengths) }
          : {}),
        ...(outlet.elbowCount !== undefined
          ? { elbows: outlet.elbowCount }
          : {}),
        ...(clamps !== undefined
          ? {
              clamps,
              clampSource: outlet.clampCount !== undefined ? 'user' : 'spacing',
            }
          : {}),
      },
    });
  }
  const proposedOutlets: ProposedOutlet[] = [];
  for (const run of runs) {
    if (outlets.some((outlet) => outlet.runId === run.id)) continue;
    issues.push({ code: 'outlets-unconfirmed', runId: run.id });
    const near = (segment: GutterSegment, atEnd: boolean): ProposedOutlet => {
      const distance = Math.min(
        PROPOSED_OUTLET_END_DISTANCE_MM,
        segment.lengthMm / 2,
      );
      return {
        eaveId: segment.eaveId,
        runId: run.id,
        station: atEnd
          ? (segment.lengthMm - distance) / segment.lengthMm
          : distance / segment.lengthMm,
      };
    };
    if (run.closed) {
      proposedOutlets.push(near(run.segments[0]!, false));
      if (run.segments.length > 1)
        proposedOutlets.push(
          near(run.segments[Math.floor(run.segments.length / 2)]!, false),
        );
    } else proposedOutlets.push(near(run.segments.at(-1)!, true));
  }
  // 6. Bill of materials from the resolved topology.
  const bom: DrainageBomRow[] = [];
  if (!system) {
    issues.unshift({ code: 'system-missing' });
  } else if (guttered.length) {
    const find = (role: DrainageComponentRole) => components(system, role)[0];
    const row = (
      role: DrainageComponentRole,
      rule: DrainageQuantityRule,
      quantity: number | undefined,
      extra: Partial<DrainageBomRow> = {},
    ) => {
      const component = extra.component ?? find(role);
      const reason: DrainageIssueCode | undefined =
        extra.reason ?? (component ? undefined : 'component-missing');
      if (reason === 'component-missing')
        issues.push({ code: 'component-missing', role });
      bom.push({
        key: role,
        role,
        rule,
        status: reason ? 'requires-decision' : 'resolved',
        ...(quantity !== undefined ? { quantity } : {}),
        ...(component ? { component } : {}),
        ...extra,
        ...(reason ? { reason } : {}),
      });
    };
    // Gutter sections per commercial length.
    if (!gutterLengths.length) {
      issues.push({ code: 'gutter-length-missing', role: 'gutter-section' });
      row('gutter-section', 'commercial-assembly', undefined, {
        reason: 'gutter-length-missing',
      });
    } else {
      const byLength = new Map<number, number>();
      for (const run of runs)
        for (const segment of run.segments)
          for (const section of segment.assembly!.sectionsMm)
            byLength.set(section, (byLength.get(section) ?? 0) + 1);
      for (const [lengthMm, quantity] of [...byLength].sort(
        ([a], [b]) => b - a,
      ))
        row('gutter-section', 'commercial-assembly', quantity, {
          key: `gutter-section:${lengthMm}`,
          lengthMm,
          component: components(system, 'gutter-section').find(
            (item) => item.spec.lengthMm === lengthMm,
          ),
        });
      const gutterJoint = components(system, 'gutter-section')[0]?.spec.joint;
      if (gutterJoint !== 'integrated') {
        const joints = runs.reduce(
          (sum, run) =>
            sum +
            run.segments.reduce(
              (total, segment) => total + (segment.assembly?.joints ?? 0),
              0,
            ),
          0,
        );
        if (joints > 0) row('gutter-connector', 'one-per-joint', joints);
      }
    }
    for (const kind of ['external', 'internal'] as const) {
      const quantity = corners.filter(
        (corner) => corner.state === 'connected' && corner.kind === kind,
      ).length;
      if (quantity > 0) row(`gutter-corner-${kind}`, 'one-per-joint', quantity);
    }
    const openEnds = runs.reduce((sum, run) => sum + run.openEnds, 0);
    if (openEnds > 0) {
      const caps = components(system, 'gutter-end-cap');
      const left = caps.find((item) => item.spec.hand === 'left');
      const right = caps.find((item) => item.spec.hand === 'right');
      // A straight or cornered open run always has one left and one right end.
      if (left && right) {
        row('gutter-end-cap', 'one-per-feature-end', openEnds / 2, {
          key: 'gutter-end-cap:left',
          hand: 'left',
          component: left,
        });
        row('gutter-end-cap', 'one-per-feature-end', openEnds / 2, {
          key: 'gutter-end-cap:right',
          hand: 'right',
          component: right,
        });
      } else
        row('gutter-end-cap', 'one-per-feature-end', openEnds, {
          hand: 'universal',
          ...(caps[0] ? { component: caps[0] } : {}),
        });
    }
    if (hooks.status === 'requires-decision')
      row('gutter-hook', 'spacing-along-feature', undefined, {
        reason: 'hook-spacing-missing',
      });
    else
      row('gutter-hook', 'spacing-along-feature', hookCount, {
        ...(hooks.status === 'incompatible'
          ? { reason: 'hook-spacing-exceeds-maximum' }
          : {}),
      });
    if (outlets.length) {
      row('gutter-outlet', 'one-per-outlet', outlets.length);
      const heights = outlets.map((outlet) => outlet.downpipe);
      const allHeights = heights.every((item) => item.heightMm !== undefined);
      if (!downpipeLengths.length) {
        issues.push({ code: 'downpipe-length-missing', role: 'downpipe' });
        row('downpipe', 'commercial-assembly', undefined, {
          reason: 'downpipe-length-missing',
        });
      } else if (!allHeights)
        row('downpipe', 'commercial-assembly', undefined, {
          reason: 'downpipe-height-missing',
        });
      else {
        const byLength = new Map<number, number>();
        for (const item of heights)
          for (const section of item.assembly!.sectionsMm)
            byLength.set(section, (byLength.get(section) ?? 0) + 1);
        for (const [lengthMm, quantity] of [...byLength].sort(
          ([a], [b]) => b - a,
        ))
          row('downpipe', 'commercial-assembly', quantity, {
            key: `downpipe:${lengthMm}`,
            lengthMm,
            component: components(system, 'downpipe').find(
              (item) => item.spec.lengthMm === lengthMm,
            ),
          });
        const pipeJoint = components(system, 'downpipe')[0]?.spec.joint;
        const joints = heights.reduce(
          (sum, item) => sum + (item.assembly?.joints ?? 0),
          0,
        );
        if (pipeJoint !== 'integrated' && joints > 0)
          row('downpipe-connector', 'one-per-joint', joints);
      }
      const elbowsKnown = heights.every((item) => item.elbows !== undefined);
      const elbows = heights.reduce((sum, item) => sum + (item.elbows ?? 0), 0);
      if (!elbowsKnown)
        row('downpipe-elbow', 'manual', undefined, {
          reason: 'elbows-unconfirmed',
        });
      else if (elbows > 0) row('downpipe-elbow', 'manual', elbows);
      const clampsKnown = heights.every((item) => item.clamps !== undefined);
      row(
        'downpipe-clamp',
        heights.some((item) => item.clampSource === 'user')
          ? 'manual'
          : 'spacing-along-feature',
        clampsKnown
          ? heights.reduce((sum, item) => sum + (item.clamps ?? 0), 0)
          : undefined,
        clampsKnown
          ? {}
          : {
              reason: allHeights
                ? 'clamps-unresolved'
                : 'downpipe-height-missing',
            },
      );
    }
  }
  // Incompatibility is visible on the row, never silently corrected.
  for (const item of bom)
    if (item.reason === 'hook-spacing-exceeds-maximum')
      item.status = 'incompatible';
  const blocking = issues.filter(
    (issue) => issue.code !== 'stale-eave-reference',
  );
  const totalGutterLengthMm = runs.reduce((sum, run) => sum + run.lengthMm, 0);
  const purchased = runs.every((run) =>
    run.segments.every((segment) => segment.assembly),
  )
    ? runs.reduce(
        (sum, run) =>
          sum +
          run.segments.reduce(
            (total, segment) => total + segment.assembly!.purchasedLengthMm,
            0,
          ),
        0,
      )
    : undefined;
  return {
    status: !system
      ? 'system-missing'
      : blocking.length || !outlets.length
        ? 'incomplete'
        : 'complete',
    mode: intent.mode,
    gutteredEaveIds: guttered,
    runs,
    corners,
    outlets,
    proposedOutlets,
    hooks,
    bom,
    issues,
    totalGutterLengthMm,
    ...(purchased !== undefined && runs.length
      ? { purchasedGutterLengthMm: purchased }
      : {}),
  };
}
