import type {
  BattenLayoutSpec,
  CounterBattenLayoutSpec,
} from '@cieslacalc/timber-model';

/**
 * V43B: the only place build-up layer starting values live.
 *
 * Four kinds of value must never be confused:
 *
 * - DISPLAY FALLBACK — `disabledBattenLayer` / `disabledCounterBattenLayer`
 *   describe an absent layer so resolvers can run. They are disabled, produce
 *   no rows and are never shown as a gauge.
 * - PROJECT DEFAULT — `newBattenLayer` is written only by an explicit user
 *   action (switching the layer on, "Rozmieść łaty automatycznie"). Its gauge
 *   is AUTO: without a covering it resolves to "choose a covering" and no rows.
 *   Section and edge references become user-owned project values that the UI
 *   labels as manual.
 * - MANUAL USER VALUE — `gaugeMm` is shown and validated only in Manual mode.
 * - AUTO DERIVED VALUE — the solver's actual gauge, never written back unless
 *   the user switches Auto → Manual (V33B seeding).
 */

const BATTEN_SECTION = { battenWidthMm: 60, battenHeightMm: 40 } as const;
/** Retained manual seed only; never displayed or used while the mode is Auto. */
const RETAINED_MANUAL_GAUGE_MM = 350;
const EAVE_REFERENCE_MM = 250;
const RIDGE_REFERENCE_MM = 0;

export function newBattenLayer(): BattenLayoutSpec {
  return {
    enabled: true,
    mode: 'auto-from-covering',
    ...BATTEN_SECTION,
    gaugeMm: RETAINED_MANUAL_GAUGE_MM,
    eaveOffsetMm: EAVE_REFERENCE_MM,
    ridgeOffsetMm: RIDGE_REFERENCE_MM,
  };
}

export function disabledBattenLayer(): BattenLayoutSpec {
  return { ...newBattenLayer(), enabled: false };
}

export function newCounterBattenLayer(): CounterBattenLayoutSpec {
  return { enabled: true, widthMm: 40, heightMm: 60 };
}

export function disabledCounterBattenLayer(): CounterBattenLayoutSpec {
  return { ...newCounterBattenLayer(), enabled: false };
}

/** Removes an explicit plane narrowing so the layer follows the whole roof. */
export function battenLayerForWholeRoof(
  layout: BattenLayoutSpec,
): BattenLayoutSpec {
  const wholeRoof = { ...layout };
  delete wholeRoof.roofPlaneIds;
  return wholeRoof;
}
