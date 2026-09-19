import type {
  RoofLineComponentIntent,
  RoofLineComponentRule,
} from './system-component-spec';
import {
  LINE_ROLE_FEATURE_KINDS,
  LINE_ROLE_RULES,
  type RoofLineComponentRole,
  type RoofLineKind,
} from './roles';

/**
 * Line-bound roof-system components (V51, extended in V52).
 *
 * Requirement comes only from canonical features: the selected ridges/hips,
 * eaves or verges (true 3D lengths), the open ends of the ridge/hip network
 * and, for clips, the already-resolved ridge-tile count. Purchase quantity is
 * a separate fact: pieces per feature for `linear-effective-cover` (a piece
 * never continues from one feature onto another), whole rolls for
 * `roll-length` (a roll does continue — it is cut, not jointed). No hidden
 * percentage: an allowance exists only when the user entered it.
 */
export interface RoofLineFeatureInput {
  id: string;
  kind: RoofLineKind;
  lengthMm: number;
}

/** A ridge/hip end from the resolved topology (open = needs a closure). */
export interface RoofLineEndInput {
  featureId: string;
  open: boolean;
}

export type RoofLineComponentReason =
  'rule-not-allowed' | 'no-features-selected' | 'ridge-tiles-unresolved';

export interface RoofLineComponentRequirement {
  componentId: string;
  role: RoofLineComponentRole;
  name: string;
  rule: RoofLineComponentRule['kind'];
  source: 'catalog' | 'manual';
  status: 'resolved' | 'not-applicable' | 'requires-decision';
  reason?: RoofLineComponentReason;
  quantity?: number;
  /** Purchase unit of `quantity`. */
  unit: 'piece' | 'roll';
  /** Total true length of the selected lines. */
  lineLengthMm: number;
  allowanceMm: number;
  /** Installation requirement: selected line length + explicit allowance. */
  requirementMm: number;
  /** Length bought (rolls × roll, or pieces × cover) when defined. */
  purchasedLengthMm?: number;
  /** Bought beyond the requirement because of the sale unit. Not waste. */
  commercialSurplusMm?: number;
  /** One-per-feature-end: open ends counted on the selected lines. */
  openEnds?: number;
  featureIds: string[];
}

const ceil = (value: number) => Math.ceil(value - 1e-9);

export function resolveRoofLineComponents(args: {
  features: readonly RoofLineFeatureInput[];
  components: readonly RoofLineComponentIntent[];
  lineEnds?: readonly RoofLineEndInput[];
  /** Resolved ridge + hip tiles, when the tile plan has them. */
  ridgeTileCount?: number;
}): RoofLineComponentRequirement[] {
  return args.components.map((component) => {
    const role = component.role as RoofLineComponentRole;
    const kinds: readonly RoofLineKind[] = LINE_ROLE_FEATURE_KINDS[role];
    const candidates = args.features.filter((feature) =>
      kinds.includes(feature.kind),
    );
    const lines = component.featureIds
      ? candidates.filter((feature) =>
          component.featureIds!.includes(feature.id),
        )
      : candidates;
    const lineLengthMm = lines.reduce((sum, line) => sum + line.lengthMm, 0);
    const allowanceMm = component.allowanceMm ?? 0;
    const requirementMm = lineLengthMm + allowanceMm;
    const rule = component.rule;
    const base = {
      componentId: component.id,
      role,
      name: component.name,
      rule: rule.kind,
      source: component.source ?? ('manual' as const),
      unit:
        rule.kind === 'roll-length' ? ('roll' as const) : ('piece' as const),
      lineLengthMm,
      allowanceMm,
      requirementMm,
      featureIds: lines.map((line) => line.id),
    };
    if (!LINE_ROLE_RULES[role].includes(rule.kind))
      return {
        ...base,
        status: 'requires-decision' as const,
        reason: 'rule-not-allowed' as const,
      };
    if (!candidates.length)
      return { ...base, status: 'not-applicable' as const };
    if (!lines.length)
      return {
        ...base,
        status: 'requires-decision' as const,
        reason: 'no-features-selected' as const,
      };
    switch (rule.kind) {
      case 'manual':
        return {
          ...base,
          status: 'resolved' as const,
          quantity: rule.quantity,
        };
      case 'roll-length': {
        const quantity = Math.max(1, ceil(requirementMm / rule.rollLengthMm));
        const purchasedLengthMm = quantity * rule.rollLengthMm;
        return {
          ...base,
          status: 'resolved' as const,
          quantity,
          purchasedLengthMm,
          commercialSurplusMm: purchasedLengthMm - requirementMm,
        };
      }
      case 'linear-effective-cover': {
        const cover = rule.effectiveCoverLengthMm;
        const quantity =
          lines.reduce((sum, line) => sum + ceil(line.lengthMm / cover), 0) +
          (allowanceMm > 0 ? ceil(allowanceMm / cover) : 0);
        const purchasedLengthMm = quantity * cover;
        return {
          ...base,
          status: 'resolved' as const,
          quantity,
          purchasedLengthMm,
          commercialSurplusMm: Math.max(0, purchasedLengthMm - requirementMm),
        };
      }
      case 'one-per-feature-end': {
        const selected = new Set(lines.map((line) => line.id));
        const openEnds = (args.lineEnds ?? []).filter(
          (end) => end.open && selected.has(end.featureId),
        ).length;
        return {
          ...base,
          status: 'resolved' as const,
          quantity: openEnds,
          openEnds,
        };
      }
      case 'one-per-ridge-tile':
        return args.ridgeTileCount === undefined
          ? {
              ...base,
              status: 'requires-decision' as const,
              reason: 'ridge-tiles-unresolved' as const,
            }
          : {
              ...base,
              status: 'resolved' as const,
              quantity: args.ridgeTileCount,
            };
    }
  });
}
