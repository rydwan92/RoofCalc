import type { CoveringTechnicalSpec } from './index';

/**
 * V43B presentation capability: what kind of support workflow a covering
 * snapshot can honestly drive. Derived on demand from the stored technical
 * snapshot and never persisted.
 *
 * - `roof-tile`: every installation mode carries a trusted `gaugeRangeMm`, so
 *   the regular batten gauge can be fitted automatically.
 * - `modular-sheet`: the snapshot states one fixed support spacing
 *   (`battenGaugeMm`, or `moduleLengthMm` for V1 snapshots, per the schema).
 *   That is a fixed module, not a range, so the whole-interval tile solver
 *   does not apply; the user sets battens manually and RoofCalc validates.
 * - `standing-seam`: the snapshot has no support/deck model. RoofCalc must
 *   not suggest tile-style battens at all.
 */
export interface CoveringSupportCapability {
  kind: CoveringTechnicalSpec['kind'];
  requiresBattens: boolean;
  supportsAutoBattenGauge: boolean;
  /**
   * Counter-battens follow the structure (rafter axes), never the product.
   * True only where a battened, ventilated build-up is the represented model.
   */
  usesStructureDerivedCounterBattens: boolean;
  supportModelKnown: boolean;
  /** Fixed support spacing stated by a modular-sheet snapshot. */
  fixedSupportGaugeMm?: number;
}

export function deriveCoveringSupportCapability(
  spec: CoveringTechnicalSpec,
): CoveringSupportCapability {
  if (spec.kind === 'roof-tile')
    return {
      kind: spec.kind,
      requiresBattens: true,
      supportsAutoBattenGauge: spec.installationModes.some(
        (mode) => mode.gaugeRangeMm !== undefined,
      ),
      usesStructureDerivedCounterBattens: true,
      supportModelKnown: true,
    };
  if (spec.kind === 'modular-sheet')
    return {
      kind: spec.kind,
      requiresBattens: true,
      supportsAutoBattenGauge: false,
      usesStructureDerivedCounterBattens: true,
      supportModelKnown: true,
      fixedSupportGaugeMm: spec.battenGaugeMm ?? spec.moduleLengthMm,
    };
  return {
    kind: spec.kind,
    requiresBattens: false,
    supportsAutoBattenGauge: false,
    usesStructureDerivedCounterBattens: false,
    supportModelKnown: false,
  };
}
