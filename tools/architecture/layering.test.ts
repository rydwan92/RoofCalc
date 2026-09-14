import { describe, expect, it } from 'vitest';
import {
  forbiddenImports,
  forbiddenText,
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

  it('procurement-core depends on no workspace package at all', () => {
    expect(
      forbiddenImports('packages/procurement-core', [/^@cieslacalc\//]),
    ).toEqual([]);
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
   * ADR-005: geometry, quantity and procurement stay free of commerce. A Cost
   * Engine, when it exists, gets its own package; these layers keep producing
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
      'packages/catalog-core',
      'packages/timber-model',
    ])
      expect({
        directory,
        matches: forbiddenText(directory, PRICING),
      }).toEqual({ directory, matches: [] });
  });

  it('the catalogue database schema stores no prices', () => {
    expect(forbiddenText('apps/api/src/db', PRICING)).toEqual([]);
  });
});
