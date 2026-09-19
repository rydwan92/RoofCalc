import {
  ROOF_SYSTEM_ROLE_GROUP,
  type RoofLineComponentRequirement,
} from '@cieslacalc/roof-system-core';
import type { ExportFacts } from './export-adapter';

/**
 * V52 roof-system checklist — "what does this whole roof still need?".
 *
 * A pure projection of already-resolved facts (tile plans, line components,
 * openings, drainage). It never counts anything itself and never produces a
 * percentage: an area is READY, NEEDS A DECISION, NOT CONFIGURED (optional)
 * or NOT APPLICABLE (the roof has no such feature).
 */
export type RoofSystemAreaKey =
  'covering' | 'ridge' | 'verge' | 'eave' | 'openings' | 'drainage';

export type RoofSystemAreaState =
  'ready' | 'needs-decision' | 'not-configured' | 'not-applicable';

export type ChecklistItemState = 'done' | 'attention' | 'open';

export type ChecklistItemKey =
  | 'base-covering'
  | 'tile-plan'
  | 'ridge-tiles'
  | 'ridge-tape'
  | 'ridge-end'
  | 'ridge-clip'
  | 'verge-tiles'
  | 'verge-flashing'
  | 'eave-elements'
  | 'opening-flashing'
  | 'drainage';

export interface ChecklistItem {
  key: ChecklistItemKey;
  area: RoofSystemAreaKey;
  state: ChecklistItemState;
  /**
   * An optional element (tape, ends, eave elements …) left open never makes
   * its area "needs a decision"; a required one (ridge tiles for a tile
   * roof, a window's flashing) does once the area has started.
   */
  optional?: boolean;
  /** Opening ordinal for `opening-flashing`. */
  ordinal?: number;
  featureId?: string;
  /** Resolved quantity text inputs, when there is one. */
  quantity?: number;
  unit?: 'piece' | 'roll';
}

export interface RoofSystemArea {
  key: RoofSystemAreaKey;
  state: RoofSystemAreaState;
  items: ChecklistItem[];
}

export interface RoofSystemChecklist {
  areas: RoofSystemArea[];
  counts: { ready: number; attention: number; optional: number };
  /** A base covering exists, so completing the system makes sense. */
  hasBaseCovering: boolean;
}

const AREA_ORDER: RoofSystemAreaKey[] = [
  'covering',
  'ridge',
  'verge',
  'eave',
  'openings',
  'drainage',
];

function componentItem(
  area: RoofSystemAreaKey,
  key: ChecklistItemKey,
  components: readonly RoofLineComponentRequirement[],
): ChecklistItem {
  const resolved = components.filter(
    (item) => item.status === 'resolved' && item.quantity !== undefined,
  );
  const state: ChecklistItemState = components.some(
    (item) => item.status === 'requires-decision',
  )
    ? 'attention'
    : resolved.length
      ? 'done'
      : 'open';
  const first = resolved[0];
  return {
    key,
    area,
    state,
    optional: true,
    ...(first && resolved.length === 1
      ? { quantity: first.quantity, unit: first.unit }
      : {}),
  };
}

export function resolveRoofSystemChecklist(
  facts: ExportFacts,
): RoofSystemChecklist {
  const system = facts.roofSystem;
  const features = system?.topology.features ?? [];
  const has = (kind: string) => features.some((item) => item.kind === kind);
  const plans = facts.tilePurchasePlans ?? [];
  const components = system?.lineComponents ?? [];
  const byRole = (role: string) =>
    components.filter(
      (item) => item.role === role && item.status !== 'not-applicable',
    );
  const accessoryItem = (
    key: ChecklistItemKey,
    area: RoofSystemAreaKey,
    roles: readonly string[],
  ): ChecklistItem | undefined => {
    const rows = plans.flatMap((plan) =>
      plan.accessories.filter((item) => roles.includes(item.role)),
    );
    if (!rows.length) return undefined;
    const done = rows.every((item) => item.quantity !== undefined);
    return {
      key,
      area,
      state: done
        ? 'done'
        : rows.some((item) => item.selection)
          ? 'attention'
          : 'open',
      ...(done
        ? {
            quantity: rows.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
            unit: 'piece' as const,
          }
        : {}),
    };
  };
  const areas: RoofSystemArea[] = [];
  const push = (
    key: RoofSystemAreaKey,
    applicable: boolean,
    items: (ChecklistItem | undefined)[],
  ) => {
    const list = items.filter((item): item is ChecklistItem => !!item);
    const started = list.some((item) => item.state === 'done');
    const state: RoofSystemAreaState = !applicable
      ? 'not-applicable'
      : list.some((item) => item.state === 'attention') ||
          (started &&
            list.some((item) => item.state === 'open' && !item.optional))
        ? 'needs-decision'
        : started
          ? 'ready'
          : 'not-configured';
    areas.push({ key, state, items: applicable ? list : [] });
  };

  // Covering: the base product and, for tiles, the purchase plan.
  const coveringRows = (facts.coverings ?? []).length;
  const coveringResolved =
    coveringRows > 0 &&
    (facts.coveringStatuses ?? []).every(
      (status) => status.status === 'resolved',
    );
  const tileAssignments = (facts.coverings ?? []).filter(
    (item) => item.product.technicalSpecSnapshot.kind === 'roof-tile',
  );
  push('covering', true, [
    {
      key: 'base-covering',
      area: 'covering',
      state: !coveringRows ? 'open' : coveringResolved ? 'done' : 'attention',
    },
    tileAssignments.length
      ? {
          key: 'tile-plan',
          area: 'covering',
          state:
            plans.length >= tileAssignments.length
              ? plans.every((plan) => plan.requirement.status !== 'unresolved')
                ? 'done'
                : 'attention'
              : 'open',
        }
      : undefined,
  ]);

  const ridgeLines = has('ridge') || has('hip');
  push('ridge', ridgeLines, [
    tileAssignments.length
      ? (accessoryItem('ridge-tiles', 'ridge', ['ridge', 'hip-ridge']) ?? {
          key: 'ridge-tiles',
          area: 'ridge',
          state: 'open',
        })
      : undefined,
    componentItem('ridge', 'ridge-tape', byRole('ridge-tape')),
    byRole('ridge-end').length
      ? componentItem('ridge', 'ridge-end', byRole('ridge-end'))
      : undefined,
    byRole('ridge-clip').length
      ? componentItem('ridge', 'ridge-clip', byRole('ridge-clip'))
      : undefined,
  ]);

  const vergeComponents = components.filter(
    (item) =>
      ROOF_SYSTEM_ROLE_GROUP[item.role] === 'verge' &&
      item.status !== 'not-applicable',
  );
  push('verge', has('verge'), [
    tileAssignments.length
      ? (accessoryItem('verge-tiles', 'verge', [
          'verge-left',
          'verge-right',
        ]) ?? {
          key: 'verge-tiles',
          area: 'verge',
          state: 'open',
        })
      : undefined,
    vergeComponents.length || !tileAssignments.length
      ? componentItem('verge', 'verge-flashing', vergeComponents)
      : undefined,
  ]);

  const eaveComponents = components.filter(
    (item) =>
      ROOF_SYSTEM_ROLE_GROUP[item.role] === 'eave' &&
      item.status !== 'not-applicable',
  );
  push('eave', has('eave'), [
    componentItem('eave', 'eave-elements', eaveComponents),
  ]);

  const openings = system?.openingSystems ?? [];
  push(
    'openings',
    openings.length > 0,
    openings.map((opening) => ({
      key: 'opening-flashing' as const,
      area: 'openings' as const,
      ordinal: opening.ordinal,
      featureId: opening.featureId,
      // A window without a flashing is a real gap in the roof: a decision.
      state:
        opening.flashing.status === 'resolved'
          ? ('done' as const)
          : ('attention' as const),
      ...(opening.flashing.quantity !== undefined
        ? { quantity: opening.flashing.quantity, unit: 'piece' as const }
        : {}),
    })),
  );

  const drainage = system?.drainage;
  push('drainage', has('eave'), [
    {
      key: 'drainage',
      area: 'drainage',
      state:
        !drainage || drainage.status === 'disabled'
          ? 'open'
          : drainage.status === 'complete'
            ? 'done'
            : 'attention',
    },
  ]);

  areas.sort((a, b) => AREA_ORDER.indexOf(a.key) - AREA_ORDER.indexOf(b.key));
  return {
    areas,
    counts: {
      ready: areas.filter((area) => area.state === 'ready').length,
      attention: areas.filter((area) => area.state === 'needs-decision').length,
      optional: areas.filter((area) => area.state === 'not-configured').length,
    },
    hasBaseCovering: coveringRows > 0,
  };
}

/**
 * Transient navigation hint: which area (and opening) the "System dachu"
 * workspace should open with. View state only — never persisted, never in
 * history; consumed once by the workspace on mount.
 */
export interface RoofSystemFocus {
  area?: RoofSystemAreaKey;
  featureId?: string;
  /** Open the "Uzupełnij system dachu" checklist. */
  checklist?: boolean;
}
let pendingFocus: RoofSystemFocus | undefined;
export function requestRoofSystemFocus(focus: RoofSystemFocus | undefined) {
  pendingFocus = focus;
}
export function takeRoofSystemFocus() {
  const focus = pendingFocus;
  pendingFocus = undefined;
  return focus;
}
