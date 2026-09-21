export type SeedCategory = 'catalogue' | 'pricing' | 'business';

export interface ExpectedSeed {
  file: string;
  category: SeedCategory;
  sourceId: string;
  checksum: string;
}

export interface ObservedSeed {
  category: SeedCategory;
  sourceId: string;
  checksum: string;
}

export type SeedState = 'current' | 'missing' | 'outdated';

/** Pure read-only projection used by the CLI and its empty/partial/full tests. */
export function classifySeedStatus(
  expected: readonly ExpectedSeed[],
  observed: readonly ObservedSeed[],
): Array<ExpectedSeed & { state: SeedState }> {
  return expected.map((seed) => {
    const matches = observed.filter(
      (item) =>
        item.category === seed.category && item.sourceId === seed.sourceId,
    );
    return {
      ...seed,
      state: matches.some((item) => item.checksum === seed.checksum)
        ? 'current'
        : matches.length
          ? 'outdated'
          : 'missing',
    };
  });
}
