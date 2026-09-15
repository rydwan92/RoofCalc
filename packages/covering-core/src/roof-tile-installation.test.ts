import { describe, expect, it } from 'vitest';
import {
  checkCoveringCompatibility,
  evaluateRoofTileInstallation,
  resolveInstallationMode,
  type RoofTileTechnicalSpec,
} from './index';

const tile = (): RoofTileTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 330,
  physicalLengthMm: 420,
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 300,
      gaugeRangeMm: { min: 330, max: 360 },
      minPitchDeg: 19,
    },
  ],
});
const evaluate = (
  productSpec = tile(),
  roofPitchDeg = 35,
  selectedInstallationModeId?: string,
) =>
  evaluateRoofTileInstallation({
    productSpec,
    roofPitchDeg,
    selectedInstallationModeId,
    source: 'manufacturer-product-data',
  });

describe('tile installation authority and capability', () => {
  it('uses only one unambiguous stored mode and keeps unavailable edges manual', () => {
    const result = evaluate();
    expect(result).toMatchObject({
      source: 'manufacturer-product-data',
      modeSelection: 'sole-mode',
      dataQuality: 'partial',
      capability: {
        regularGauge: 'available',
        pitchCompatibility: 'available',
        eaveReference: 'manual-required',
        ridgeReference: 'manual-required',
      },
      issues: [],
    });
    expect(result.mode?.gaugeRangeMm).toEqual({ min: 330, max: 360 });
    expect(
      checkCoveringCompatibility({
        productSpec: tile(),
        roofPitchDeg: 35,
        battenGaugeMm: 345,
      }).status,
    ).toBe('compatible');
  });

  it('requires selection for several modes and never rescues a nonexistent selection', () => {
    const product = tile();
    product.installationModes.push({
      ...product.installationModes[0]!,
      id: 'alternative',
      gaugeRangeMm: { min: 300, max: 320 },
    });
    expect(evaluate(product)).toMatchObject({
      mode: undefined,
      modeSelection: 'required',
      capability: { regularGauge: 'unavailable' },
      issues: [
        { code: 'installation-mode-required', category: 'hard-constraint' },
      ],
    });
    expect(evaluate(product, 35, 'alternative').mode?.gaugeRangeMm.min).toBe(
      300,
    );
    expect(
      resolveInstallationMode(tile().installationModes, 'missing'),
    ).toBeUndefined();
    expect(evaluate(tile(), 35, 'missing').issues[0]?.code).toBe(
      'installation-mode-not-found',
    );
  });

  it('treats declared minimum pitch as hard and absent pitch as unknown', () => {
    expect(evaluate(tile(), 18).issues).toEqual([
      {
        code: 'below-minimum-pitch',
        category: 'hard-constraint',
        source: 'manufacturer-product-data',
        actual: 18,
        required: 19,
      },
    ]);
    const product = tile();
    delete product.installationModes[0]!.minPitchDeg;
    expect(evaluate(product)).toMatchObject({
      capability: {
        regularGauge: 'available',
        pitchCompatibility: 'unavailable',
      },
      issues: [{ code: 'pitch-data-missing', category: 'information' }],
    });
  });

  it('does not claim manufacturer authority for a manually edited product', () => {
    expect(
      evaluateRoofTileInstallation({ productSpec: tile(), roofPitchDeg: 35 }),
    ).toMatchObject({
      source: 'project-user-input',
      dataQuality: 'manual-unverified',
    });
  });
  it('exposes a declared technical condition without treating it as verified', () => {
    const product = tile();
    product.installationModes[0]!.technicalConditionId = 'underlay-required';
    expect(evaluate(product).issues).toEqual([
      {
        code: 'installation-condition-unverified',
        category: 'information',
        source: 'manufacturer-product-data',
      },
    ]);
  });

  it('returns unavailable rather than crashing when gauge data is absent at runtime', () => {
    const product = tile();
    delete (
      product.installationModes[0] as Partial<
        (typeof product.installationModes)[0]
      >
    ).gaugeRangeMm;
    expect(evaluate(product)).toMatchObject({
      capability: { regularGauge: 'unavailable' },
      issues: [{ code: 'gauge-data-missing', category: 'hard-constraint' }],
    });
  });

  it.each([
    { min: 360, max: 330 },
    { min: 0, max: 360 },
    { min: -1, max: 360 },
    { min: Number.NaN, max: 360 },
    { min: 330, max: Number.POSITIVE_INFINITY },
  ])(
    'rejects invalid permitted gauge $min..$max without a plausible result',
    (range) => {
      const product = tile();
      product.installationModes[0]!.gaugeRangeMm = range;
      expect(evaluate(product)).toMatchObject({
        mode: undefined,
        capability: { regularGauge: 'unavailable' },
        issues: [{ code: 'invalid-product-data', category: 'hard-constraint' }],
      });
      expect(
        checkCoveringCompatibility({
          productSpec: product,
          roofPitchDeg: 35,
          battenGaugeMm: 345,
        }).status,
      ).toBe('incompatible');
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -10, 0, 90, 100])(
    'fails safe for pitch %s',
    (pitch) => {
      expect(evaluate(tile(), pitch).issues[0]?.code).toBe(
        'invalid-roof-pitch',
      );
      expect(
        checkCoveringCompatibility({ productSpec: tile(), roofPitchDeg: pitch })
          .status,
      ).toBe('incompatible');
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])(
    'does not approve nonsense manual gauge %s',
    (gauge) => {
      expect(
        checkCoveringCompatibility({
          productSpec: tile(),
          roofPitchDeg: 35,
          battenGaugeMm: gauge,
        }),
      ).toMatchObject({
        status: 'incompatible',
        issues: [{ code: 'invalid-batten-gauge' }],
      });
    },
  );

  it('keeps unproven physical/effective relationships advisory', () => {
    const product = tile();
    product.physicalWidthMm = 290;
    expect(evaluate(product).issues).toEqual([
      {
        code: 'product-dimensions-review',
        category: 'information',
        source: 'manufacturer-product-data',
      },
    ]);
    expect(evaluate(product).capability.regularGauge).toBe('available');
  });
});
