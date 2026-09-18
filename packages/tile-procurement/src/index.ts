/**
 * V50 roof-tile procurement: ROOF TILE LAYOUT → PHYSICAL TILE REQUIREMENT →
 * PURCHASE POLICY → COMMERCIAL PACKAGING → PURCHASE QUANTITY.
 *
 * Pure and price-free (ADR-005). It consumes the already-resolved
 * `RoofTileLayoutResult` from `covering-core` and never places a tile, clips a
 * polygon or re-derives a course: the layout's `TilePosition` classification
 * is the only geometric authority. Every count it returns says how it was
 * obtained, so a conservative number is never presented as exact.
 */
export * from './requirement';
export * from './packaging';
export * from './accessories';
