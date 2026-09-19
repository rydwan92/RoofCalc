import {
  resolveRoofFeatureTopology,
  resolveRoofLineEnds,
  resolveRoofOpenings,
  type ResolvedRoofFeature,
  type ResolvedRoofOpening,
  type RoofFeatureTopology,
  type RoofLineEnd,
  type RoofLineFeatureKind,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  createManualDrainageSystem,
  resolveDrainagePlan,
  resolveOpeningSystems,
  resolveRoofLineComponents,
  type DrainageIntent,
  type DrainagePlan,
  type ResolvedOpeningSystem,
  type RoofLineComponentIntent,
  type RoofLineComponentRequirement,
  type RoofOpeningIntent,
  type RoofSystemIntent,
} from '@cieslacalc/roof-system-core';
import type { RoofLineLengths } from '@cieslacalc/tile-procurement';
import type { TilePurchasePlan } from './tile-purchase';

/**
 * V51 application boundary for the complete roof system.
 *
 * One resolved topology (from `roof-math`) feeds the covering drawing, the V50
 * tile accessories, line components and drainage. Material Plan, cost,
 * readiness and documents read the `RoofSystemFacts` produced here; none of
 * them re-derives an edge, a run or a count.
 */
export interface RoofSystemFacts {
  topology: RoofFeatureTopology;
  eaves: ResolvedRoofFeature[];
  intent?: RoofSystemIntent;
  drainage: DrainagePlan;
  lineComponents: RoofLineComponentRequirement[];
  /** V52: ends of the ridge/hip network (open = needs a closure). */
  lineEnds: RoofLineEnd[];
  /** V52: every roof opening as a physical perimeter in its plane. */
  openings: ResolvedRoofOpening[];
  /** V52: window identity and flashing per opening. */
  openingSystems: ResolvedOpeningSystem[];
  /** V52: resolved ridge + hip tiles from the tile plan, if known. */
  ridgeTileCount?: number;
}

/**
 * V52: resolved ridge + hip tile count across tile purchase plans. Unknown
 * (undefined) as soon as any ridge/hip line still needs a decision — a clip
 * rule never counts from a partial number.
 */
export function ridgeTileCount(
  plans: readonly TilePurchasePlan[],
): number | undefined {
  const rows = plans.flatMap((plan) =>
    plan.accessories.filter(
      (item) => item.role === 'ridge' || item.role === 'hip-ridge',
    ),
  );
  if (!rows.length || rows.some((item) => item.quantity === undefined))
    return undefined;
  return rows.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

export function resolveRoofSystemFacts(args: {
  surface: RoofSurfaceGeometryResult;
  intent: RoofSystemIntent | undefined;
  topology?: RoofFeatureTopology;
  ridgeTileCount?: number;
}): RoofSystemFacts {
  const topology = args.topology ?? resolveRoofFeatureTopology(args.surface);
  const eaves = topology.features.filter((feature) => feature.kind === 'eave');
  const lineEnds = resolveRoofLineEnds(topology);
  const openings = resolveRoofOpenings(args.surface, topology);
  return {
    topology,
    eaves,
    lineEnds,
    openings,
    openingSystems: resolveOpeningSystems({
      openings: openings.map((opening) => ({
        featureId: opening.featureId,
        ordinal: opening.ordinal,
        widthMm: opening.widthMm,
        heightMm: opening.heightMm,
        pitchDeg: opening.pitchDeg,
        rectangular: opening.rectangular,
      })),
      intents: args.intent?.openings,
    }),
    ...(args.ridgeTileCount !== undefined
      ? { ridgeTileCount: args.ridgeTileCount }
      : {}),
    ...(args.intent ? { intent: args.intent } : {}),
    drainage: resolveDrainagePlan({
      eaves: eaves.map((eave) => ({
        id: eave.id,
        ordinal: eave.ordinal,
        lengthMm: eave.lengthMm,
      })),
      corners: topology.eaveCorners.map((corner) => ({
        id: corner.id,
        endingEaveId: corner.endingEaveId,
        startingEaveId: corner.startingEaveId,
        kind: corner.kind,
      })),
      intent: args.intent?.drainage,
    }),
    lineComponents: resolveRoofLineComponents({
      features: topology.features,
      components: args.intent?.lineComponents ?? [],
      lineEnds,
      ...(args.ridgeTileCount !== undefined
        ? { ridgeTileCount: args.ridgeTileCount }
        : {}),
    }),
  };
}

/**
 * V50 ridge/hip line lengths, now read from canonical features: one physical
 * line counted once. A line is owned by a covering assignment only when all
 * its incident planes are inside that assignment.
 */
export function roofLineLengthsFromFeatures(
  topology: RoofFeatureTopology,
  roofPlaneIds: readonly string[],
): RoofLineLengths {
  const touched = topology.features.filter(
    (feature) =>
      (feature.kind === 'ridge' || feature.kind === 'hip') &&
      feature.incidentPlaneIds.some((id) => roofPlaneIds.includes(id)),
  );
  const sum = (kind: 'ridge' | 'hip') =>
    touched
      .filter((feature) => feature.kind === kind)
      .reduce((total, feature) => total + feature.lengthMm, 0);
  const planeIds = new Set(
    topology.planeEdges.map((plane) => plane.roofPlaneId),
  );
  return {
    ridgeMm: sum('ridge'),
    hipMm: sum('hip'),
    complete:
      planeIds.size > 0 &&
      [...planeIds].every((id) => roofPlaneIds.includes(id)) &&
      touched.every((feature) =>
        feature.incidentPlaneIds.every((id) => roofPlaneIds.includes(id)),
      ),
  };
}

/** Generated display label for a canonical eave: O1, O2 … (never parsed). */
export function eaveLabel(feature: Pick<ResolvedRoofFeature, 'ordinal'>) {
  return `O${feature.ordinal}`;
}

/** The first-run drainage intent: enabled, AUTO layout, no system yet. */
export function initialDrainageIntent(): DrainageIntent {
  return { enabled: true, mode: 'auto' };
}

/** An intent with nothing left in it is stored as absent. */
function compact(next: RoofSystemIntent): RoofSystemIntent | undefined {
  if (!next.lineComponents?.length) delete next.lineComponents;
  if (!next.openings?.length) delete next.openings;
  return next.drainage || next.lineComponents || next.openings
    ? next
    : undefined;
}

export function withDrainage(
  intent: RoofSystemIntent | undefined,
  drainage: DrainageIntent | undefined,
): RoofSystemIntent | undefined {
  const next: RoofSystemIntent = { ...intent };
  if (drainage) next.drainage = drainage;
  else delete next.drainage;
  return compact(next);
}

/** V52: add or replace one line component (one history entry upstream). */
export function withLineComponent(
  intent: RoofSystemIntent | undefined,
  component: RoofLineComponentIntent,
): RoofSystemIntent | undefined {
  const list = intent?.lineComponents ?? [];
  return compact({
    ...intent,
    lineComponents: list.some((item) => item.id === component.id)
      ? list.map((item) => (item.id === component.id ? component : item))
      : [...list, component],
  });
}

export function withoutLineComponent(
  intent: RoofSystemIntent | undefined,
  id: string,
): RoofSystemIntent | undefined {
  return compact({
    ...intent,
    lineComponents: (intent?.lineComponents ?? []).filter(
      (item) => item.id !== id,
    ),
  });
}

export function nextLineComponentId(intent: RoofSystemIntent | undefined) {
  const used = new Set((intent?.lineComponents ?? []).map((item) => item.id));
  let ordinal = used.size + 1;
  while (used.has(`line-component-${ordinal}`)) ordinal += 1;
  return `line-component-${ordinal}`;
}

/** V52: replace the decisions for one opening; an empty decision is removed. */
export function withOpening(
  intent: RoofSystemIntent | undefined,
  opening: RoofOpeningIntent,
): RoofSystemIntent | undefined {
  const rest = (intent?.openings ?? []).filter(
    (item) => item.featureId !== opening.featureId,
  );
  const empty = !opening.window && !opening.flashing && !opening.coveringClass;
  return compact({
    ...intent,
    openings: empty ? rest : [...rest, opening],
  });
}

/**
 * V52 generated display labels for canonical features. Words, not codes:
 * K1/H1 already name rafter families and O1 names eaves.
 */
const FEATURE_WORD: Record<
  RoofLineFeatureKind | 'opening',
  { pl: string; en: string }
> = {
  eave: { pl: 'Okap', en: 'Eave' },
  ridge: { pl: 'Kalenica', en: 'Ridge' },
  hip: { pl: 'Grzbiet', en: 'Hip' },
  valley: { pl: 'Kosz', en: 'Valley' },
  verge: { pl: 'Skraj', en: 'Verge' },
  opening: { pl: 'Okno', en: 'Window' },
};

export function featureLabel(
  kind: RoofLineFeatureKind | 'opening',
  ordinal: number,
  locale: string,
  countOfKind = 2,
): string {
  const word = FEATURE_WORD[kind][locale.startsWith('pl') ? 'pl' : 'en'];
  if (kind === 'eave') return `${word} O${ordinal}`;
  return countOfKind === 1 && kind === 'ridge' ? word : `${word} ${ordinal}`;
}

/**
 * "Applies to" text for a set of features, grouped by kind with ordinal
 * ranges ("Kalenica, Grzbiety 1–4"). Presentation only.
 */
export function featureScopeLabel(
  topology: RoofFeatureTopology,
  featureIds: readonly string[],
  locale: string,
): string {
  const pl = locale.startsWith('pl');
  const plural: Record<RoofLineFeatureKind, string> = pl
    ? {
        eave: 'Okapy',
        ridge: 'Kalenice',
        hip: 'Grzbiety',
        valley: 'Kosze',
        verge: 'Skraje',
      }
    : {
        eave: 'Eaves',
        ridge: 'Ridges',
        hip: 'Hips',
        valley: 'Valleys',
        verge: 'Verges',
      };
  const parts: string[] = [];
  for (const kind of ['ridge', 'hip', 'eave', 'verge', 'valley'] as const) {
    const all = topology.features.filter((feature) => feature.kind === kind);
    const chosen = all.filter((feature) => featureIds.includes(feature.id));
    if (!chosen.length) continue;
    if (chosen.length === 1) {
      parts.push(featureLabel(kind, chosen[0]!.ordinal, locale, all.length));
      continue;
    }
    const ordinals = chosen.map((feature) => feature.ordinal);
    const contiguous =
      Math.max(...ordinals) - Math.min(...ordinals) + 1 === ordinals.length;
    const prefix = kind === 'eave' ? 'O' : '';
    parts.push(
      `${plural[kind]} ${
        contiguous
          ? `${prefix}${Math.min(...ordinals)}–${prefix}${Math.max(...ordinals)}`
          : ordinals.map((value) => `${prefix}${value}`).join(', ')
      }`,
    );
  }
  return parts.join(', ');
}

/**
 * Switching from AUTO to manual freezes what AUTO proposed — every eave and
 * the proposed corner connections become explicit decisions — so the user
 * edits from what they saw, never from an empty layout.
 */
export function freezeAutoLayout(
  drainage: DrainageIntent,
  plan: DrainagePlan,
): DrainageIntent {
  if (drainage.mode === 'manual') return drainage;
  return {
    ...drainage,
    mode: 'manual',
    gutteredEaveIds: [...plan.gutteredEaveIds],
    corners: plan.corners
      .filter((corner) => corner.source !== 'none')
      .map((corner) => ({
        endingEaveId: corner.endingEaveId,
        startingEaveId: corner.startingEaveId,
        connection: corner.state === 'connected' ? 'connected' : 'separate',
      })),
  };
}

export { createManualDrainageSystem };
