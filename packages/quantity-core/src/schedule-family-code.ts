/**
 * Human-facing schedule family codes (`O1`, `P2`, …).
 *
 * These codes are the ONLY place in this package that reads the shape of a
 * generated ID, and they produce a display label, never a calculation result.
 * They exist because the current single-roof skeleton carries no separate
 * ordinal for openings and purlins.
 *
 * Known limitation (ADR-007, docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md):
 * in a future multi-structure document two structures can each own
 * `feature:roof-window-1`, and these codes would then collide in a
 * project-wide schedule. The dedicated ProjectDocument V2 iteration must
 * replace this with an explicit ordinal carried on the member, scoped by
 * structure. Do not add new ID parsing here; add a structured field instead.
 */

/** Display code for members generated for a roof opening. */
export function openingFamilyCode(memberId: string): string {
  const number = /feature:roof-window-(\d+)/.exec(memberId)?.[1];
  return number ? `O${number}` : 'O';
}

/** Display code for a purlin, taken from its template support ID. */
export function purlinFamilyCode(prototypeId: string): string {
  const number = /purlin-(\d+)$/.exec(prototypeId)?.[1];
  return number ? `P${number}` : 'P';
}
