import type { RoofLineComponentIntent } from './drainage-spec';
import {
  LINE_ROLE_FEATURE_KINDS,
  type RoofLineComponentRole,
  type RoofLineKind,
} from './roles';

/**
 * Linear roof-system components installed along roof lines (ridge tape along
 * ridges and hips, eave strips and combs along eaves). The line lengths are
 * the canonical feature lengths; a piece never continues from one physical
 * feature onto another, so `linear-effective-cover` rounds up per feature.
 */
export interface RoofLineFeatureInput {
  id: string;
  kind: RoofLineKind;
  lengthMm: number;
}

export interface RoofLineComponentRequirement {
  componentId: string;
  role: RoofLineComponentRole;
  name: string;
  rule: RoofLineComponentIntent['rule']['kind'];
  status: 'resolved' | 'not-applicable';
  quantity?: number;
  /** Total true length of the lines this component follows. */
  lineLengthMm: number;
  featureIds: string[];
}

export function resolveRoofLineComponents(args: {
  features: readonly RoofLineFeatureInput[];
  components: readonly RoofLineComponentIntent[];
}): RoofLineComponentRequirement[] {
  return args.components.map((component) => {
    const role = component.role as RoofLineComponentRole;
    const kinds: readonly RoofLineKind[] = LINE_ROLE_FEATURE_KINDS[role];
    const lines = args.features.filter((feature) =>
      kinds.includes(feature.kind),
    );
    const lineLengthMm = lines.reduce((sum, line) => sum + line.lengthMm, 0);
    const base = {
      componentId: component.id,
      role,
      name: component.name,
      rule: component.rule.kind,
      lineLengthMm,
      featureIds: lines.map((line) => line.id),
    };
    if (!lines.length) return { ...base, status: 'not-applicable' as const };
    const quantity =
      component.rule.kind === 'manual'
        ? component.rule.quantity
        : lines.reduce(
            (sum, line) =>
              sum +
              Math.ceil(
                line.lengthMm /
                  (component.rule as { effectiveCoverLengthMm: number })
                    .effectiveCoverLengthMm -
                  1e-9,
              ),
            0,
          );
    return { ...base, status: 'resolved' as const, quantity };
  });
}
