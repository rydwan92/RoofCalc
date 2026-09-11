import type {
  Point3D,
  RoofSkeleton,
  SkeletonMember3D,
  SkeletonMemberKind,
  TimberSection,
} from '@cieslacalc/timber-model';

export type QuantityCategory = 'structural-timber' | 'roof-build-up';
export type QuantityUnit = 'pcs' | 'm' | 'm2' | 'm3';
export type QuantityLengthBasis =
  'axis-geometric' | 'resolved-visible' | 'limited';
export type QuantityVolumeStatus = 'complete' | 'partial' | 'unavailable';

export interface QuantitySection {
  widthMm?: number;
  depthMm?: number;
  completeness: 'complete' | 'partial' | 'unknown';
}

export type ScheduleMemberKind =
  SkeletonMemberKind | 'batten' | 'counter-batten';

export interface LinearBuildUpSource {
  id: string;
  familyKey: string;
  memberKind: 'batten' | 'counter-batten';
  lengthMm: number;
  section: TimberSection;
  segmentCount?: number;
  warningKeys?: string[];
}

export interface SurfaceBuildUpSource {
  id: string;
  familyKey: string;
  memberKind: 'membrane';
  areaMm2: number;
  roofPlaneId?: string;
  warningKeys?: string[];
}

export interface RoofSurfaceQuantityRow {
  id: string;
  category: 'roof-build-up';
  familyKey: string;
  memberKind: 'membrane';
  sourceIds: string[];
  roofPlaneIds: string[];
  areaMm2: number;
  unit: 'm2';
  basis: 'net-geometric';
  warningKeys: string[];
}

export interface RoofMemberScheduleRow {
  id: string;
  category: QuantityCategory;
  familyKey: string;
  memberKind: ScheduleMemberKind;
  role?: 'upper' | 'lower';
  prototypeId?: string;
  sourceFeatureId?: string;
  section: QuantitySection;
  lengthMm: number;
  quantity: number;
  sourceInstanceIds: string[];
  totalLengthMm: number;
  volumeMm3?: number;
  lengthBasis: QuantityLengthBasis;
  segmentCount?: number;
  warningKeys: string[];
}

export interface QuantitySectionGroup {
  id: string;
  section: QuantitySection;
  rowIds: string[];
  familyKeys: string[];
  quantity: number;
  totalLengthMm: number;
  volumeMm3?: number;
  volumeStatus: QuantityVolumeStatus;
}

export interface QuantitySummary {
  quantity: number;
  totalLengthMm: number;
  totalVolumeMm3?: number;
  volumeStatus: QuantityVolumeStatus;
  excludedVolumeQuantity: number;
}

export interface QuantityIssue {
  sourceId: string;
  code: 'invalid-axis' | 'invalid-length' | 'invalid-section' | 'invalid-area';
}

export interface RoofMemberSchedule {
  rows: RoofMemberScheduleRow[];
  timberRows: RoofMemberScheduleRow[];
  buildUpRows: RoofMemberScheduleRow[];
  surfaceBuildUpRows: RoofSurfaceQuantityRow[];
  sectionGroups: QuantitySectionGroup[];
  timberSummary: QuantitySummary;
  buildUpSummary: QuantitySummary;
  surfaceBuildUpSummary: { areaMm2: number };
  issues: QuantityIssue[];
}

export interface CreateRoofMemberScheduleInput {
  skeleton: RoofSkeleton;
  /** Exact canonical section facts keyed by prototype. Use partial for display-only skeleton sections. */
  sectionOverrides?: Readonly<Record<string, QuantitySection>>;
  buildUp?: readonly LinearBuildUpSource[];
  surfaceBuildUp?: readonly SurfaceBuildUpSource[];
  equalityToleranceMm?: number;
}

interface UngroupedMember {
  category: QuantityCategory;
  familyKey: string;
  memberKind: ScheduleMemberKind;
  role?: 'upper' | 'lower';
  prototypeId?: string;
  sourceFeatureId?: string;
  section: QuantitySection;
  lengthMm: number;
  sourceInstanceId: string;
  lengthBasis: QuantityLengthBasis;
  segmentCount?: number;
  warningKeys: string[];
}

const DEFAULT_EQUALITY_TOLERANCE_MM = 1e-7;

/** Exact Euclidean length of a physical world-space member axis. */
export function physicalAxisLengthMm(from: Point3D, to: Point3D): number {
  const coordinates = [from.x, from.y, from.z, to.x, to.y, to.z];
  if (coordinates.some((value) => !Number.isFinite(value)))
    throw new RangeError('invalid_member_axis');
  const result = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (!Number.isFinite(result) || result <= 0)
    throw new RangeError('invalid_member_axis');
  return result;
}

function openingFeatureId(id: string) {
  return /feature:roof-window-\d+/.exec(id)?.[0];
}

function openingFamily(id: string) {
  const number = /feature:roof-window-(\d+)/.exec(id)?.[1];
  return number ? `O${number}` : 'O';
}

function purlinFamily(prototypeId: string) {
  const number = /purlin-(\d+)$/.exec(prototypeId)?.[1];
  return number ? `P${number}` : 'P';
}

function familyFor(member: SkeletonMember3D) {
  switch (member.kind) {
    case 'rafter':
      return 'K1';
    case 'hip-rafter':
      return 'H1';
    case 'jack-rafter':
      return 'J1';
    case 'wall-plate':
      return 'M';
    case 'ridge':
      return 'R';
    case 'purlin':
      return purlinFamily(member.prototypeId);
    case 'opening-header':
    case 'rafter-segment':
      return openingFamily(member.id);
  }
}

function roleFor(member: SkeletonMember3D): 'upper' | 'lower' | undefined {
  if (member.kind !== 'opening-header' && member.kind !== 'rafter-segment')
    return undefined;
  if (member.id.endsWith(':upper')) return 'upper';
  if (member.id.endsWith(':lower')) return 'lower';
  return undefined;
}

function defaultSection(member: SkeletonMember3D): QuantitySection {
  if (member.kind === 'ridge')
    return { widthMm: member.section.widthMm, completeness: 'partial' };
  return {
    widthMm: member.section.widthMm,
    depthMm: member.section.depthMm,
    completeness: 'complete',
  };
}

function sectionIsValid(section: QuantitySection) {
  if (
    section.completeness === 'complete' &&
    (section.widthMm === undefined || section.depthMm === undefined)
  )
    return false;
  const values = [section.widthMm, section.depthMm].filter(
    (value): value is number => value !== undefined,
  );
  return values.every((value) => Number.isFinite(value) && value > 0);
}

function sectionKey(section: QuantitySection) {
  return `${section.completeness}:${section.widthMm ?? 'unknown'}x${section.depthMm ?? 'unknown'}`;
}

function sourceKey(source: UngroupedMember) {
  return [
    source.category,
    source.familyKey,
    source.memberKind,
    source.role ?? '',
    source.prototypeId ?? '',
    sectionKey(source.section),
    source.lengthBasis,
  ].join('|');
}

function rowId(source: UngroupedMember, ordinal: number) {
  const role = source.role ? `:${source.role}` : '';
  return `quantity:${source.category}:${source.familyKey}:${source.memberKind}${role}:${ordinal}`;
}

function volumeFor(section: QuantitySection, lengthMm: number) {
  return section.completeness === 'complete' &&
    section.widthMm !== undefined &&
    section.depthMm !== undefined
    ? section.widthMm * section.depthMm * lengthMm
    : undefined;
}

function groupSources(
  sources: UngroupedMember[],
  toleranceMm: number,
): RoofMemberScheduleRow[] {
  const groupedByIdentity = new Map<string, UngroupedMember[]>();
  for (const source of sources) {
    const key = sourceKey(source);
    groupedByIdentity.set(key, [...(groupedByIdentity.get(key) ?? []), source]);
  }
  const rows: RoofMemberScheduleRow[] = [];
  for (const identitySources of [...groupedByIdentity.values()].sort((a, b) =>
    sourceKey(a[0]!).localeCompare(sourceKey(b[0]!)),
  )) {
    const lengthGroups: UngroupedMember[][] = [];
    for (const source of [...identitySources].sort(
      (a, b) =>
        a.lengthMm - b.lengthMm ||
        a.sourceInstanceId.localeCompare(b.sourceInstanceId),
    )) {
      const group = lengthGroups.find(
        (candidate) =>
          Math.abs(candidate[0]!.lengthMm - source.lengthMm) <= toleranceMm,
      );
      if (group) group.push(source);
      else lengthGroups.push([source]);
    }
    lengthGroups.forEach((group, index) => {
      const first = group[0]!;
      const sourceInstanceIds = group
        .map((source) => source.sourceInstanceId)
        .sort();
      const totalLengthMm = group.reduce(
        (total, source) => total + source.lengthMm,
        0,
      );
      const volumeMm3 = volumeFor(first.section, totalLengthMm);
      rows.push({
        id: rowId(first, index + 1),
        category: first.category,
        familyKey: first.familyKey,
        memberKind: first.memberKind,
        role: first.role,
        prototypeId: first.prototypeId,
        sourceFeatureId: first.sourceFeatureId,
        section: first.section,
        lengthMm: first.lengthMm,
        quantity: group.length,
        sourceInstanceIds,
        totalLengthMm,
        volumeMm3,
        lengthBasis: first.lengthBasis,
        segmentCount:
          group.reduce(
            (total, source) => total + (source.segmentCount ?? 0),
            0,
          ) || undefined,
        warningKeys: [
          ...new Set([
            ...group.flatMap((source) => source.warningKeys),
            ...(volumeMm3 === undefined &&
            first.category === 'structural-timber'
              ? ['incomplete-section-volume-excluded']
              : []),
          ]),
        ].sort(),
      });
    });
  }
  return rows.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.familyKey.localeCompare(b.familyKey, undefined, { numeric: true }) ||
      sectionKey(a.section).localeCompare(sectionKey(b.section)) ||
      a.memberKind.localeCompare(b.memberKind) ||
      (a.role ?? '').localeCompare(b.role ?? '') ||
      a.lengthMm - b.lengthMm ||
      a.id.localeCompare(b.id),
  );
}

function summary(rows: RoofMemberScheduleRow[]): QuantitySummary {
  const quantity = rows.reduce((total, row) => total + row.quantity, 0);
  const totalLengthMm = rows.reduce(
    (total, row) => total + row.totalLengthMm,
    0,
  );
  const volumetricRows = rows.filter((row) => row.volumeMm3 !== undefined);
  const totalVolumeMm3 = volumetricRows.length
    ? volumetricRows.reduce((total, row) => total + row.volumeMm3!, 0)
    : undefined;
  const excludedVolumeQuantity = rows
    .filter((row) => row.volumeMm3 === undefined)
    .reduce((total, row) => total + row.quantity, 0);
  return {
    quantity,
    totalLengthMm,
    totalVolumeMm3,
    volumeStatus:
      excludedVolumeQuantity === 0
        ? 'complete'
        : totalVolumeMm3 === undefined
          ? 'unavailable'
          : 'partial',
    excludedVolumeQuantity,
  };
}

function createSectionGroups(
  rows: RoofMemberScheduleRow[],
): QuantitySectionGroup[] {
  const groups = new Map<string, RoofMemberScheduleRow[]>();
  for (const row of rows) {
    const key = sectionKey(row.section);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, sectionRows]) => {
      const section = sectionRows[0]!.section;
      const totalLengthMm = sectionRows.reduce(
        (total, row) => total + row.totalLengthMm,
        0,
      );
      const quantity = sectionRows.reduce(
        (total, row) => total + row.quantity,
        0,
      );
      const volumeMm3 = volumeFor(section, totalLengthMm);
      return {
        id: `section:${key}`,
        section,
        rowIds: sectionRows.map((row) => row.id),
        familyKeys: [...new Set(sectionRows.map((row) => row.familyKey))].sort(
          (a, b) => a.localeCompare(b, undefined, { numeric: true }),
        ),
        quantity,
        totalLengthMm,
        volumeMm3,
        volumeStatus:
          volumeMm3 === undefined
            ? ('unavailable' as const)
            : ('complete' as const),
      };
    })
    .sort(
      (a, b) =>
        (a.section.widthMm ?? Number.POSITIVE_INFINITY) -
          (b.section.widthMm ?? Number.POSITIVE_INFINITY) ||
        (a.section.depthMm ?? Number.POSITIVE_INFINITY) -
          (b.section.depthMm ?? Number.POSITIVE_INFINITY) ||
        a.id.localeCompare(b.id),
    );
}

function createSurfaceBuildUpRows(
  sources: readonly SurfaceBuildUpSource[],
  issues: QuantityIssue[],
): RoofSurfaceQuantityRow[] {
  const groups = new Map<string, SurfaceBuildUpSource[]>();
  for (const source of sources) {
    if (!Number.isFinite(source.areaMm2) || source.areaMm2 < 0) {
      issues.push({ sourceId: source.id, code: 'invalid-area' });
      continue;
    }
    const key = `${source.familyKey}|${source.memberKind}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups.values()]
    .map((items) => {
      const first = items[0]!;
      return {
        id: `quantity:roof-build-up:${first.familyKey}:membrane`,
        category: 'roof-build-up' as const,
        familyKey: first.familyKey,
        memberKind: 'membrane' as const,
        sourceIds: items.map((item) => item.id).sort(),
        roofPlaneIds: items
          .flatMap((item) => (item.roofPlaneId ? [item.roofPlaneId] : []))
          .sort(),
        areaMm2: items.reduce((sum, item) => sum + item.areaMm2, 0),
        unit: 'm2' as const,
        basis: 'net-geometric' as const,
        warningKeys: [
          ...new Set(items.flatMap((item) => item.warningKeys ?? [])),
        ].sort(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Projects the accepted composed physical assembly into a deterministic geometric
 * schedule. It never calculates stock lengths, allowances, prices or cut geometry.
 */
export function createRoofMemberSchedule(
  input: CreateRoofMemberScheduleInput,
): RoofMemberSchedule {
  const toleranceMm =
    input.equalityToleranceMm ?? DEFAULT_EQUALITY_TOLERANCE_MM;
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0)
    throw new RangeError('invalid_length_equality_tolerance');
  const issues: QuantityIssue[] = [];
  const timberSources = input.skeleton.members.flatMap<UngroupedMember>(
    (member) => {
      let lengthMm: number;
      try {
        lengthMm = physicalAxisLengthMm(member.from, member.to);
      } catch {
        issues.push({ sourceId: member.id, code: 'invalid-axis' });
        return [];
      }
      const section =
        input.sectionOverrides?.[member.prototypeId] ?? defaultSection(member);
      if (!sectionIsValid(section)) {
        issues.push({ sourceId: member.id, code: 'invalid-section' });
        return [];
      }
      return [
        {
          category: 'structural-timber',
          familyKey: familyFor(member),
          memberKind: member.kind,
          role: roleFor(member),
          prototypeId: member.prototypeId,
          sourceFeatureId: openingFeatureId(member.id),
          section,
          lengthMm,
          sourceInstanceId: member.id,
          lengthBasis: 'axis-geometric',
          warningKeys: [],
        },
      ];
    },
  );
  const buildUpSources = (input.buildUp ?? []).flatMap<UngroupedMember>(
    (source) => {
      if (!Number.isFinite(source.lengthMm) || source.lengthMm <= 0) {
        issues.push({ sourceId: source.id, code: 'invalid-length' });
        return [];
      }
      const section: QuantitySection = {
        ...source.section,
        completeness: 'complete',
      };
      if (!sectionIsValid(section)) {
        issues.push({ sourceId: source.id, code: 'invalid-section' });
        return [];
      }
      return [
        {
          category: 'roof-build-up',
          familyKey: source.familyKey,
          memberKind: source.memberKind,
          section,
          lengthMm: source.lengthMm,
          sourceInstanceId: source.id,
          lengthBasis: 'resolved-visible',
          segmentCount: source.segmentCount,
          warningKeys: source.warningKeys ?? [],
        },
      ];
    },
  );
  const rows = groupSources([...timberSources, ...buildUpSources], toleranceMm);
  const timberRows = rows.filter((row) => row.category === 'structural-timber');
  const buildUpRows = rows.filter((row) => row.category === 'roof-build-up');
  const surfaceBuildUpRows = createSurfaceBuildUpRows(
    input.surfaceBuildUp ?? [],
    issues,
  );
  return {
    rows,
    timberRows,
    buildUpRows,
    surfaceBuildUpRows,
    sectionGroups: createSectionGroups(timberRows),
    timberSummary: summary(timberRows),
    buildUpSummary: summary(buildUpRows),
    surfaceBuildUpSummary: {
      areaMm2: surfaceBuildUpRows.reduce((sum, row) => sum + row.areaMm2, 0),
    },
    issues: issues.sort(
      (a, b) =>
        a.sourceId.localeCompare(b.sourceId) || a.code.localeCompare(b.code),
    ),
  };
}
