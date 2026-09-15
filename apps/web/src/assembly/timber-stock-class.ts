/**
 * The one `stockClassId` fingerprint every timber-buying adapter in
 * `apps/web` must derive identically, so a catalogue-picked `StockOption`
 * (`timber-stock-adapter.ts`) is actually usable by the cutting plan a
 * required-piece adapter (`k1-cutting-adapter.ts`) already produced.
 *
 * Section-only by design: `timber-model` tracks a structural member's
 * cross-section but no grade/species/treatment, so a `RequiredPiece` can
 * never state a grade requirement today. Including grade/treatment here
 * would make every catalogue pick permanently incompatible with every
 * required piece, not safer — the real safeguard against buying the wrong
 * grade is that a catalogue pick is always one explicit, human choice (the
 * picker shows grade/treatment in its facts) never an automatic
 * substitution, so `createCuttingPlan` never chooses between grades itself.
 */
export function timberSectionStockClassId(
  widthMm: number,
  depthMm: number,
): string {
  return JSON.stringify(['timber-section', widthMm, depthMm]);
}
