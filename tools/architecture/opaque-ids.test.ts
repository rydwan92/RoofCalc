import { describe, expect, it } from 'vitest';
import { forbiddenText, productionSources } from './module-graph';

/**
 * ADR-007: geometry IDs are opaque. Domain code must not recover roof type,
 * side, plane role or member provenance by parsing an ID string, because a
 * future compound project (house + garage, see
 * docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md) reuses the same local IDs
 * inside different structures.
 *
 * These rules target DOMAIN logic. Presentation helpers that map a stable ID to
 * a label are allowed, but must go through one explicit lookup table with a
 * generic fallback rather than slicing the ID into a translation key.
 */

/**
 * `roof-math` both generates and interprets roof-plane IDs for one roof
 * template, so it is the single owner allowed to hold that lookup table.
 * Nothing may be added here without an ADR change.
 */
const PLANE_ID_OWNERS = [
  'packages/roof-math/src/roof-surface.ts',
  'packages/roof-math/src/roof-features.ts',
];

/**
 * The one documented exception: `quantity-core` still derives the human-facing
 * schedule codes `O<n>` / `P<n>` from generated IDs because the single-roof
 * skeleton carries no ordinal. It is isolated in its own module and listed in
 * docs/ARCHITECTURE_INDEX.md as a ProjectDocument V2 migration item.
 */
const DISPLAY_CODE_EXCEPTIONS = [
  'packages/quantity-core/src/schedule-family-code.ts',
];

/**
 * ID namespace OWNERS. The rule forbids *consumers* from inferring behaviour
 * from an ID's text. A module that mints IDs in a namespace it owns may read
 * that namespace to allocate the next free ordinal — `addPurlin` scanning
 * `support:purlin-<n>` before creating `support:purlin-<n+1>` is generation,
 * not inference. Adding a file here requires showing it owns the format.
 */
const ID_NAMESPACE_OWNERS = ['packages/roof-math/src/assembly.ts'];

/**
 * String surgery on a SINGULAR ID identifier. Plural forms such as
 * `planeIds.includes(...)` are set membership over an explicitly supplied list,
 * which is the correct opaque-ID usage and stays allowed.
 */
const ID_STRING_SURGERY =
  /\b(?:roofPlaneId|planeId|memberId|instanceId|prototypeId|sourceMemberId|sourceFeatureId|selectionId|assignmentId|featureId|eaveId|endingEaveId|startingEaveId|outletId|runId|revisionId|productId|variantId|stockClassId|stockOptionId|requiredPieceId|referenceId)\b\s*\.\s*(?:includes|startsWith|endsWith|split|slice|substring|match|replace|indexOf|lastIndexOf|charAt)\s*\(/;

const PLANE_ID_LITERAL = /['"`]roof-plane:/;

const ID_REGEX_LITERAL =
  /\/[^/\n]*(?:roof-plane|instance:|member:|prototype:|feature:|covering:|purlin-)[^/\n]*\/[gimsuy]*\s*\.\s*(?:exec|test)\s*\(|\.\s*(?:match|matchAll)\s*\(\s*\//;

const DOMAIN_DIRECTORIES = [
  'packages/roof-math',
  'packages/covering-core',
  'packages/quantity-core',
  'packages/catalog-core',
  'packages/calculator-core',
  'packages/procurement-core',
  'packages/project-core',
  'packages/timber-model',
  'packages/technical-scene',
  'packages/roof-system-core',
  'packages/tile-procurement',
  'apps/api/src',
];

describe('domain logic treats geometry IDs as opaque', () => {
  it('no domain module derives a decision by slicing an ID string', () => {
    for (const directory of DOMAIN_DIRECTORIES)
      expect({
        directory,
        matches: forbiddenText(directory, ID_STRING_SURGERY, {
          allow: DISPLAY_CODE_EXCEPTIONS,
        }),
      }).toEqual({ directory, matches: [] });
  });

  it('no domain module matches an ID with a regular expression', () => {
    for (const directory of DOMAIN_DIRECTORIES)
      expect({
        directory,
        matches: forbiddenText(directory, ID_REGEX_LITERAL, {
          allow: [...DISPLAY_CODE_EXCEPTIONS, ...ID_NAMESPACE_OWNERS],
        }),
      }).toEqual({ directory, matches: [] });
  });

  it('only roof-math holds the roof-plane ID vocabulary', () => {
    for (const directory of DOMAIN_DIRECTORIES)
      expect({
        directory,
        matches: forbiddenText(directory, PLANE_ID_LITERAL, {
          allow: PLANE_ID_OWNERS,
        }),
      }).toEqual({ directory, matches: [] });
  });

  it('derived skeleton members carry structured provenance instead of composite IDs', () => {
    const openingFraming = productionSources('packages/roof-math').find(
      (file) => file.path.endsWith('opening-framing.ts'),
    );
    expect(openingFraming?.text).toContain('sourceMemberId');
    expect(openingFraming?.text).toContain('sourceFeatureId');
    expect(openingFraming?.text).toContain('openingRole');
  });
});

describe('V51 roof features are structured, never parsed', () => {
  /**
   * Feature, eave-corner, opening-edge and gutter-run IDs are minted by their
   * resolvers. Only the minting module may spell their namespace; everything
   * else reads `kind`, `incidentPlaneIds`, `ordinal` or topology fields.
   */
  const FEATURE_ID_LITERAL =
    /['"`](?:roof-line:|eave-corner:|opening-edge:|gutter-run:)/;

  it('only the minting modules spell a roof-feature ID namespace', () => {
    for (const directory of [
      ...DOMAIN_DIRECTORIES,
      'apps/web/src',
      'packages/document-core',
    ])
      expect({
        directory,
        matches: forbiddenText(directory, FEATURE_ID_LITERAL, {
          allow: [
            'packages/roof-math/src/roof-topology.ts',
            'packages/roof-system-core/src/drainage-planner.ts',
          ],
        }),
      }).toEqual({ directory, matches: [] });
  });
});

describe('quantity schedule reads structured provenance', () => {
  it('opening role and source feature come from member fields, not ID suffixes', () => {
    const schedule = productionSources('packages/quantity-core').find((file) =>
      file.path.endsWith('src/index.ts'),
    );
    expect(schedule?.text).toContain('member.openingRole');
    expect(schedule?.text).toContain('member.sourceFeatureId');
    expect(schedule?.text).not.toContain("endsWith(':upper')");
  });
});

describe('procurement keeps upstream references opaque', () => {
  /**
   * ADR-010: procurement receives required physical fabrication blanks. It must
   * never infer installation or fabrication rules from an upstream reference.
   */
  it('procurement-core never parses a required-piece source reference', () => {
    expect(
      forbiddenText('packages/procurement-core', ID_STRING_SURGERY),
    ).toEqual([]);
  });

  it('the required-piece contract names a fabrication blank, not an ambiguous length', () => {
    const model = productionSources('packages/procurement-core').find((file) =>
      file.path.endsWith('model.ts'),
    );
    expect(model?.text).toContain('requiredBlankLengthMm');
    expect(model?.text).not.toMatch(/\n\s{2}lengthMm: number;\s*\n\s*source\?/);
  });
});

describe('web presentation keeps one roof-plane label boundary', () => {
  /**
   * A translation key built by slicing an ID renders the raw key for any plane
   * the UI has not seen before. Plane labels go through `roofPlaneShortLabelKey`
   * / `roofPlaneLabelKey`, which fall back to a translated generic.
   */
  const KEY_FROM_PLANE_ID =
    /`[^`]*assembly\.\$\{[^}]*(?:roofPlaneId|planeId)\b[^}]*\}/;

  it('no component builds a translation key out of a roof-plane ID', () => {
    expect(forbiddenText('apps/web/src', KEY_FROM_PLANE_ID)).toEqual([]);
  });

  it('the plane label helper keeps a generic fallback', () => {
    const helper = productionSources('apps/web/src/assembly').find((file) =>
      file.path.endsWith('covering-presentation.ts'),
    );
    expect(helper?.text).toContain('assembly.roofPlaneName.generic');
  });

  it('roof-plane lists come from the template resolver, not hardcoded arrays', () => {
    const HARDCODED_PLANE_LIST =
      /\[\s*'roof-plane:left'\s*,\s*'roof-plane:right'/;
    expect(
      forbiddenText('apps/web/src', HARDCODED_PLANE_LIST, {
        allow: ['apps/web/src/assembly/covering-presentation.ts'],
      }),
    ).toEqual([]);
  });
});
