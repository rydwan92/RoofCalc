import { describe, expect, it } from 'vitest';
import {
  forbiddenImports,
  forbiddenText,
  productionSources,
  workspacePackageDirectories,
} from './module-graph';

/**
 * Executable form of the dependency rules in docs/ARCHITECTURE_INDEX.md and
 * docs/adr/. A failure here is an architecture regression, not a style problem:
 * fix the import, or change the ADR first and then this test.
 */

const REACT = [/^react(-dom|-i18next)?(\/|$)/, /^@cieslacalc\/ui(\/|$)/];
const DOM_RUNTIME = [/^jsdom$/, /^@testing-library\//];
const SERVER = [/^express$/, /^supertest$/];
const DATABASE = [/^drizzle-orm(\/|$)/, /^drizzle-kit$/, /^mysql2(\/|$)/];
const I18N = [/^i18next$/, /^react-i18next$/];
const APPS = [/(^|\/)apps\//, /^@cieslacalc\/(web|api)$/];
const CLIENT_STATE = [/^zustand(\/|$)/, /^@tanstack\//];
const CATALOGUE = [/^@cieslacalc\/catalog-core$/];
/** V38: renderer libraries belong above the scene contract, never inside it. */
const RENDERERS = [/^three(\/|$)/, /^@react-three\//, /^@types\/three$/];

const PURE_DOMAIN = [
  ...REACT,
  ...DOM_RUNTIME,
  ...SERVER,
  ...DATABASE,
  ...I18N,
  ...APPS,
  ...CLIENT_STATE,
];

/**
 * Browser-only globals, matched narrowly. `window` and `document` are also
 * ordinary domain words here (a roof window, a project document), so only real
 * browser APIs are listed.
 */
const BROWSER_GLOBALS =
  /(?:\bglobalThis\.(?:window|document|localStorage)|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bnavigator\.\w|\bwindow\.(?:document|location|addEventListener|removeEventListener|matchMedia|innerWidth|innerHeight|devicePixelRatio|requestAnimationFrame|getComputedStyle)\b|\bdocument\.(?:createElement|querySelector|querySelectorAll|getElementById|addEventListener|body|head|documentElement)\b)/;

describe('package dependency direction', () => {
  it('roof-math stays free of React, DOM, server, database and app code', () => {
    expect(forbiddenImports('packages/roof-math', PURE_DOMAIN)).toEqual([]);
  });

  it('roof-math does not depend on covering, catalogue, quantity or procurement', () => {
    expect(
      forbiddenImports('packages/roof-math', [
        /^@cieslacalc\/(covering-core|catalog-core|quantity-core|procurement-core|project-core|calculator-core|drawing-engine)$/,
      ]),
    ).toEqual([]);
  });

  it('covering-core stays free of UI, database, server and app code', () => {
    expect(forbiddenImports('packages/covering-core', PURE_DOMAIN)).toEqual([]);
  });

  it('quantity-core stays free of UI, database and catalogue', () => {
    expect(
      forbiddenImports('packages/quantity-core', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
  });

  it('catalog-core may reuse technical covering schemas but not Drizzle, Express, React or UI', () => {
    expect(forbiddenImports('packages/catalog-core', PURE_DOMAIN)).toEqual([]);
    expect(
      forbiddenImports('packages/catalog-core', [
        /^@cieslacalc\/covering-core$/,
      ]).length,
    ).toBeGreaterThan(0);
  });

  it('project-core stays free of i18n, React and browser persistence', () => {
    expect(forbiddenImports('packages/project-core', PURE_DOMAIN)).toEqual([]);
    expect(forbiddenText('packages/project-core', BROWSER_GLOBALS)).toEqual([]);
  });

  /**
   * V26: procurement is the narrowest layer in the repository. It receives
   * explicit required blanks and stock options and returns a plan. It must not
   * reach sideways into geometry, catalogue or commerce (ADR-009, ADR-010).
   */
  it('procurement-core stays free of React, DOM, apps, catalogue, API and database', () => {
    expect(
      forbiddenImports('packages/procurement-core', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
    expect(forbiddenText('packages/procurement-core', BROWSER_GLOBALS)).toEqual(
      [],
    );
  });

  /**
   * V48: `linear-procurement` is the layer that turns a resolved installation
   * run into indivisible pieces. It sits directly above `procurement-core` and
   * below the application. If geometry, catalogue or UI ever enters it, the
   * commercial planner has started to become a second geometry engine.
   */
  it('linear-procurement stays free of React, DOM, apps, catalogue, API and database', () => {
    expect(
      forbiddenImports('packages/linear-procurement', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
    expect(
      forbiddenText('packages/linear-procurement', BROWSER_GLOBALS),
    ).toEqual([]);
  });

  it('linear-procurement depends on procurement-core and nothing else in the workspace', () => {
    expect(
      forbiddenImports('packages/linear-procurement', [
        /^@cieslacalc\/(?!procurement-core$)/,
      ]),
    ).toEqual([]);
  });

  /**
   * V50: `tile-procurement` turns a resolved tile layout into a physical and
   * commercial requirement. It reads `covering-core` results and nothing else:
   * no roof geometry solver, no catalogue, no price.
   */
  it('tile-procurement stays free of React, DOM, apps, catalogue, API and database', () => {
    expect(
      forbiddenImports('packages/tile-procurement', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
    expect(forbiddenText('packages/tile-procurement', BROWSER_GLOBALS)).toEqual(
      [],
    );
  });

  it('tile-procurement depends on covering-core and nothing else in the workspace', () => {
    expect(
      forbiddenImports('packages/tile-procurement', [
        /^@cieslacalc\/(?!covering-core$)/,
      ]),
    ).toEqual([]);
  });

  /**
   * V51: `roof-system-core` turns canonical roof features plus a selected
   * system and user intent into physical roof-system requirements (drainage,
   * line components). Features arrive as structural inputs: it imports no
   * geometry solver, no catalogue, no UI and no price.
   */
  it('roof-system-core stays free of React, DOM, apps, catalogue, API and database', () => {
    expect(
      forbiddenImports('packages/roof-system-core', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
    expect(forbiddenText('packages/roof-system-core', BROWSER_GLOBALS)).toEqual(
      [],
    );
  });

  /**
   * V52: gutter purchase with reuse of straight remainders sends installed
   * pieces (already-resolved blanks, ADR-010) to the existing stock-length
   * engine instead of growing a second cutting engine. `procurement-core` is
   * the one workspace package allowed; it infers nothing (ADR-009).
   */
  it('roof-system-core depends on procurement-core and no other workspace package', () => {
    expect(
      forbiddenImports('packages/roof-system-core', [
        /^@cieslacalc\/(?!procurement-core$)/,
      ]),
    ).toEqual([]);
  });

  /**
   * V54: `business-core` is the organization-owned commercial layer. Its whole
   * purpose is to sit *above* the commercial variant without owning technical
   * truth, so importing `catalog-core` would collapse the boundary the
   * iteration exists to draw — a wholesaler would be able to redefine what a
   * tile is. It references a catalogue item only by opaque ID, exactly as
   * `pricing-core` does.
   */
  it('business-core stays free of React, DOM, apps, catalogue, API and database', () => {
    expect(
      forbiddenImports('packages/business-core', [
        ...PURE_DOMAIN,
        ...CATALOGUE,
      ]),
    ).toEqual([]);
    expect(forbiddenText('packages/business-core', BROWSER_GLOBALS)).toEqual(
      [],
    );
  });

  it('business-core depends on pricing-core and no other workspace package', () => {
    expect(
      forbiddenImports('packages/business-core', [
        /^@cieslacalc\/(?!pricing-core$)/,
      ]),
    ).toEqual([]);
  });

  it('business-core knows no roof, geometry or covering concept', () => {
    expect(
      forbiddenText(
        'packages/business-core',
        /\b(?:roofPlane|rafter|batten|pitchDeg|coverWidthMm|gaugeRangeMm|technicalSpec|installationMode)\b/,
      ),
    ).toEqual([]);
  });

  it('quote-core is a pure downstream snapshot and depends on no workspace package', () => {
    expect(forbiddenImports('packages/quote-core', PURE_DOMAIN)).toEqual([]);
    expect(forbiddenImports('packages/quote-core', [/^@cieslacalc\//])).toEqual(
      [],
    );
    expect(forbiddenText('packages/quote-core', BROWSER_GLOBALS)).toEqual([]);
  });

  it('procurement-core depends on no workspace package at all', () => {
    expect(
      forbiddenImports('packages/procurement-core', [/^@cieslacalc\//]),
    ).toEqual([]);
  });

  /**
   * V38: `technical-scene` is the renderer-neutral boundary between resolved
   * roof geometry and any viewer. If Three.js, React or the DOM ever enters
   * it, the 3D view has started to become a second geometry engine.
   */
  it('technical-scene stays free of renderers, React, DOM, server and app code', () => {
    expect(
      forbiddenImports('packages/technical-scene', [
        ...PURE_DOMAIN,
        ...RENDERERS,
      ]),
    ).toEqual([]);
    expect(forbiddenText('packages/technical-scene', BROWSER_GLOBALS)).toEqual(
      [],
    );
  });

  it('technical-scene consumes resolved geometry and no solver', () => {
    expect(
      forbiddenImports('packages/technical-scene', [
        /^@cieslacalc\/(roof-math|calculator-core|covering-core|quantity-core|procurement-core|catalog-core|cost-core|pricing-core|project-core)$/,
      ]),
    ).toEqual([]);
  });

  it('no renderer library reaches a package', () => {
    for (const name of workspacePackageDirectories())
      expect({
        package: name,
        matches: forbiddenImports(`packages/${name}`, RENDERERS),
      }).toEqual({ package: name, matches: [] });
  });

  /**
   * V38: Three.js is allowed in exactly one web folder. Anywhere else it would
   * mean renderer code leaking into the workbench, or a second scene adapter.
   */
  it('Three.js stays inside the web 3D viewport folder', () => {
    const offenders = forbiddenImports('apps/web', RENDERERS).filter(
      (entry) => !entry.file.startsWith('apps/web/src/assembly/scene3d/'),
    );
    expect(offenders).toEqual([]);
  });

  it('pure domain packages never touch browser globals', () => {
    for (const directory of [
      'packages/roof-math',
      'packages/covering-core',
      'packages/quantity-core',
      'packages/catalog-core',
      'packages/calculator-core',
      'packages/procurement-core',
      'packages/timber-model',
      'packages/drawing-engine',
      'packages/technical-scene',
      'packages/quote-core',
    ])
      expect({
        directory,
        matches: forbiddenText(directory, BROWSER_GLOBALS),
      }).toEqual({ directory, matches: [] });
  });

  it('no package imports an application', () => {
    for (const name of workspacePackageDirectories())
      expect({
        package: name,
        matches: forbiddenImports(`packages/${name}`, APPS),
      }).toEqual({ package: name, matches: [] });
  });

  it('the API never imports web application code or client state libraries', () => {
    expect(
      forbiddenImports('apps/api', [
        ...REACT,
        ...CLIENT_STATE,
        ...I18N,
        /(^|\/)apps\/web\//,
        /^@cieslacalc\/web$/,
      ]),
    ).toEqual([]);
  });

  it('the web application never imports the API, Express, Drizzle or mysql2', () => {
    expect(
      forbiddenImports('apps/web', [
        ...SERVER,
        ...DATABASE,
        /(^|\/)apps\/api\//,
        /^@cieslacalc\/api$/,
      ]),
    ).toEqual([]);
  });
});

describe('commercial boundary', () => {
  /**
   * ADR-005: geometry, quantity and procurement stay free of commerce.
   * `cost-core` (V34B) and `pricing-core` (V34C) are the two packages this
   * boundary was drawn for — everything below the boundary keeps producing
   * physical facts only.
   */
  const PRICING =
    /\b(?:priceList|priceListEntry|netAmount|grossAmount|unitPrice|vatRate|discountRate|currencyCode)\b/i;

  it('geometry, quantity, procurement and catalogue technical packages contain no pricing concepts', () => {
    for (const directory of [
      'packages/roof-math',
      'packages/covering-core',
      'packages/quantity-core',
      'packages/procurement-core',
      'packages/tile-procurement',
      'packages/roof-system-core',
      'packages/catalog-core',
      'packages/timber-model',
    ])
      expect({
        directory,
        matches: forbiddenText(directory, PRICING),
      }).toEqual({ directory, matches: [] });
  });

  it('the catalogue technical schema stores no prices', () => {
    // V34C: apps/api/src/db also holds pricing-schema.ts/pricing-repository.ts
    // (the PriceList/PriceListEntry tables ADR-005 always reserved) — those
    // are the legitimate home for these words, not a boundary loosening.
    // V54 adds two more commercial-layer files: business-schema.ts (the
    // organization's own currency) and business-repository.ts, which reads
    // those same price tables on behalf of an organization. schema.ts and
    // catalog-repository.ts, the catalogue-technical tables, stay exactly as
    // forbidden as before — no price or currency may reach a technical table.
    expect(
      forbiddenText('apps/api/src/db', PRICING, {
        allow: [
          'apps/api/src/db/pricing-schema.ts',
          'apps/api/src/db/pricing-repository.ts',
          'apps/api/src/db/business-schema.ts',
          'apps/api/src/db/business-repository.ts',
          'apps/api/src/db/workspace-schema.ts',
        ],
      }),
    ).toEqual([]);
  });

  /**
   * V54 tenant isolation, checked statically: the business SQL adapter must
   * never read the assortment or price tables without naming an organization.
   * A query that forgets the scope is how one wholesaler's commercial data
   * reaches another (§58).
   */
  it('every business assortment query is organization-scoped', () => {
    const source = productionSources('apps/api/src/db').find(
      (file) => file.path === 'apps/api/src/db/business-repository.ts',
    );
    expect(source).toBeDefined();
    const statements = source!.text.split(/\n\s*\n/);
    const unscoped = statements.filter(
      (block) =>
        /\.from\(\s*organizationAssortmentItems/.test(block) &&
        !/organizationAssortmentItems\.organizationId/.test(block),
    );
    expect(unscoped).toEqual([]);
  });

  it('the business read service never exposes a cross-tenant list method', () => {
    expect(
      forbiddenText(
        'apps/api/src/business',
        /\b(?:listAllAssortment|allAssortmentItems|assortmentForAllOrganizations)\b/,
      ),
    ).toEqual([]);
  });

  it('pricing concepts stay confined to pricing-core, its DB tables, cost-core and apps/web', () => {
    for (const directory of [
      'packages/roof-math',
      'packages/covering-core',
      'packages/quantity-core',
      'packages/procurement-core',
      'packages/catalog-core',
      'packages/timber-model',
      'packages/project-core',
      'packages/drawing-engine',
      'packages/technical-scene',
      'apps/api/src/catalog',
    ])
      expect({
        directory,
        matches: forbiddenText(directory, PRICING),
      }).toEqual({ directory, matches: [] });
  });
});
