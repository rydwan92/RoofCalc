export type SpacingDimensionLevel = 'minimal' | 'working' | 'full';

export interface SpacingPresentationStation {
  id: string;
  alongBuildingMm: number;
}

export interface SpacingDimensionGroup {
  id: string;
  count: number;
  spacingMm: number;
  fromStationIndex: number;
  toStationIndex: number;
  lane: number;
  representative: boolean;
}

/** Groups exact consecutive bay lengths without changing or rounding geometry. */
export function createSpacingDimensionPresentation(
  stations: readonly SpacingPresentationStation[],
  level: SpacingDimensionLevel,
  equalityToleranceMm = 1e-7,
): SpacingDimensionGroup[] {
  if (!Number.isFinite(equalityToleranceMm) || equalityToleranceMm < 0)
    throw new RangeError('invalid_spacing_presentation_tolerance');
  if (level === 'minimal' || stations.length < 2) return [];
  stations.forEach((station, index) => {
    if (!Number.isFinite(station.alongBuildingMm))
      throw new RangeError('invalid_spacing_station');
    if (
      index > 0 &&
      station.alongBuildingMm <= stations[index - 1]!.alongBuildingMm
    )
      throw new RangeError('unordered_spacing_stations');
  });
  const bays = stations.slice(1).map((station, index) => ({
    fromStationIndex: index,
    toStationIndex: index + 1,
    spacingMm: station.alongBuildingMm - stations[index]!.alongBuildingMm,
  }));
  if (level === 'full')
    return bays.map((bay, index) => ({
      id: `spacing-bay:${index + 1}`,
      count: 1,
      ...bay,
      lane: index % 2,
      representative: false,
    }));
  const groups: SpacingDimensionGroup[] = [];
  for (const bay of bays) {
    const previous = groups.at(-1);
    if (
      previous &&
      Math.abs(previous.spacingMm - bay.spacingMm) <= equalityToleranceMm
    ) {
      previous.count += 1;
      previous.toStationIndex = bay.toStationIndex;
      continue;
    }
    groups.push({
      id: `spacing-group:${groups.length + 1}`,
      count: 1,
      ...bay,
      lane: groups.length % 2,
      representative: true,
    });
  }
  return groups;
}

export interface PriorityLabelCandidate {
  id: string;
  priority: number;
  protected?: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

function overlaps(
  a: PriorityLabelCandidate['bounds'],
  b: PriorityLabelCandidate['bounds'],
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/** Selected/edit/warning labels can be protected; lower priorities hide deterministically. */
export function visiblePriorityLabelIds(
  candidates: readonly PriorityLabelCandidate[],
): Set<string> {
  const visible: PriorityLabelCandidate[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) =>
      Number(b.protected) - Number(a.protected) ||
      b.priority - a.priority ||
      a.id.localeCompare(b.id),
  )) {
    if (
      candidate.protected ||
      visible.every((accepted) => !overlaps(candidate.bounds, accepted.bounds))
    )
      visible.push(candidate);
  }
  return new Set(visible.map((candidate) => candidate.id));
}
