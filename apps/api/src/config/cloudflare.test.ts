import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeDeployment,
  analyzeWranglerConfig,
  hyperdriveCachingDisabled,
  hyperdrivePasswordUpdateArgs,
  hyperdriveSslMode,
  isDeployedOrigin,
  missingWorkerSecrets,
  parseJsonc,
  parseHyperdriveOrigin,
  parseLoggedIn,
  parseSecretNames,
  summarizeWrangler,
} from './cloudflare';

const tracked = resolve(__dirname, '../../../../wrangler.jsonc');

describe('wrangler.jsonc checks', () => {
  it('accepts the tracked Worker configuration', () => {
    const config = parseJsonc(readFileSync(tracked, 'utf8'));
    expect(analyzeWranglerConfig(config)).toEqual([]);
    expect(summarizeWrangler(config)).toMatchObject({
      name: 'roofcalc',
      hyperdriveId: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it('reads comments and trailing commas but keeps // inside strings', () => {
    expect(
      parseJsonc(
        '{\n  // note\n  "url": "https://a.dev", /* block */\n  "list": [1, 2,],\n}',
      ),
    ).toEqual({ url: 'https://a.dev', list: [1, 2] });
    expect(parseJsonc('{ broken')).toBeUndefined();
  });

  it('refuses secrets in tracked vars and an incomplete binding', () => {
    const issues = analyzeWranglerConfig({
      main: './apps/api/src/edge/worker.ts',
      compatibility_flags: [],
      vars: {
        BETTER_AUTH_URL: 'https://roofcalc.example.dev/api',
        BETTER_AUTH_SECRET: 'x',
        DATABASE_URL: 'mysql://u:p@h/db',
      },
      assets: { not_found_handling: 'single-page-application' },
      hyperdrive: [{ binding: 'HYPERDRIVE', id: 'not-an-id' }],
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      'secret-in-config',
      'secret-in-config',
      'nodejs-compat-missing',
      'api-not-worker-first',
      'auth-url-invalid',
      'hyperdrive-id-invalid',
    ]);
    expect(analyzeWranglerConfig(undefined)).toEqual([
      { code: 'config-unreadable' },
    ]);
  });

  it('accepts only an HTTPS origin as BETTER_AUTH_URL', () => {
    expect(isDeployedOrigin('https://roofcalc.example.workers.dev')).toBe(true);
    expect(isDeployedOrigin('https://roofcalc.example.workers.dev/')).toBe(
      false,
    );
    expect(isDeployedOrigin('http://roofcalc.example.dev')).toBe(false);
    expect(isDeployedOrigin('https://user:pw@roofcalc.example.dev')).toBe(
      false,
    );
  });
});

describe('wrangler output', () => {
  it('reads secret NAMES after a banner and reports the missing ones', () => {
    const output =
      ' ⛅️ wrangler 4.132.0\n─────\n[{"name":"BETTER_AUTH_SECRET","type":"secret_text"}]\n';
    const names = parseSecretNames(output);
    expect(names).toEqual(['BETTER_AUTH_SECRET']);
    expect(missingWorkerSecrets(names!)).toEqual(['ROOFCALC_BOOTSTRAP_TOKEN']);
    expect(parseSecretNames('Not logged in.')).toBeUndefined();
  });

  it('reads the login state, which wrangler reports with exit code 0', () => {
    expect(parseLoggedIn('{"loggedIn":false}')).toBe(false);
    expect(parseLoggedIn('{"loggedIn":true,"authType":"OAuth Token"}')).toBe(
      true,
    );
    expect(parseLoggedIn('')).toBe(false);
  });

  it('reads the Hyperdrive origin without any password', () => {
    const output = `{
      "id": "2d7f0a9beaee47219f9e7a6a0aeabeaf",
      "name": "roofcalc-dev",
      "origin": { "host": "mysql-example.alwaysdata.net", "port": 3306,
        "database": "example_roofcalc_dev", "scheme": "mysql", "user": "example" },
      "caching": { "disabled": false }
    }`;
    expect(parseHyperdriveOrigin(output)).toEqual({
      host: 'mysql-example.alwaysdata.net',
      port: 3306,
      database: 'example_roofcalc_dev',
      user: 'example',
    });
    expect(parseHyperdriveOrigin('{"origin":{"host":"h"}}')).toBeUndefined();
    expect(parseHyperdriveOrigin('Not logged in')).toBeUndefined();
  });

  it('VNext-6.1: a password update keeps the rest of the origin and TLS mode', () => {
    const output = `{ "origin": { "host": "h.example", "port": 3306,
      "database": "d_dev", "scheme": "mysql", "user": "u" },
      "mtls": { "sslmode": "REQUIRED" } }`;
    const origin = parseHyperdriveOrigin(output)!;
    expect(hyperdriveSslMode(output)).toBe('REQUIRED');
    expect(hyperdriveSslMode('{"origin":{}}')).toBeUndefined();
    const args = hyperdrivePasswordUpdateArgs({
      id: 'abc',
      origin,
      password: 'p@ss word',
      sslmode: 'REQUIRED',
    });
    expect(args).toEqual([
      'hyperdrive',
      'update',
      'abc',
      '--origin-scheme',
      'mysql',
      '--origin-host',
      'h.example',
      '--origin-port',
      '3306',
      '--database',
      'd_dev',
      '--origin-user',
      'u',
      '--origin-password',
      'p@ss word',
      '--sslmode',
      'REQUIRED',
    ]);
    // The password is one argument, never split or joined into another.
    expect(args.filter((arg) => arg.includes('p@ss'))).toEqual(['p@ss word']);
  });

  it('VNext-6.1: the Worker reports why the database is unavailable', () => {
    expect(
      analyzeDeployment({
        health: {
          status: 200,
          body: {
            runtime: 'cloudflare-worker',
            database: 'unavailable',
            databaseReason: 'access-denied',
            auth: 'configured',
          },
        },
        readiness: { status: 200, body: { schema: 'unavailable' } },
      }),
    ).toContainEqual({
      code: 'database-not-connected',
      reason: 'access-denied',
    });
  });

  it('reads the Hyperdrive caching flag', () => {
    expect(
      hyperdriveCachingDisabled('{"id":"x","caching":{"disabled":true}}'),
    ).toBe(true);
    expect(
      hyperdriveCachingDisabled('{"id":"x","caching":{"disabled":false}}'),
    ).toBe(false);
    expect(hyperdriveCachingDisabled('{"id":"x"}')).toBe(false);
    expect(hyperdriveCachingDisabled('error')).toBeUndefined();
  });
});

describe('deployed Worker probes', () => {
  it('explains an older deployment without secrets (2026-10-18 state)', () => {
    expect(
      analyzeDeployment({
        health: {
          status: 200,
          body: {
            runtime: 'cloudflare-worker',
            database: 'connected',
            auth: 'unconfigured',
          },
        },
        readiness: { status: 404, body: { error: { code: 'not-found' } } },
        setup: {
          status: 200,
          body: { firstOwner: 'unknown', bootstrap: 'unavailable' },
        },
      }).map((issue) => issue.code),
    ).toEqual(['readiness-missing', 'auth-unconfigured']);
  });

  it('is clean for a ready deployment and stops at an unreachable one', () => {
    expect(
      analyzeDeployment({
        health: {
          status: 200,
          body: {
            runtime: 'cloudflare-worker',
            database: 'connected',
            auth: 'configured',
          },
        },
        readiness: { status: 200, body: { schema: 'current' } },
        setup: {
          status: 200,
          body: { firstOwner: 'configured', bootstrap: 'unavailable' },
        },
      }),
    ).toEqual([]);
    expect(analyzeDeployment({})).toEqual([
      { code: 'unreachable', path: '/api/health' },
    ]);
  });
});
