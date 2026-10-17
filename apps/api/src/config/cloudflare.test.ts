import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeDeployment,
  analyzeWranglerConfig,
  hyperdriveCachingDisabled,
  isDeployedOrigin,
  missingWorkerSecrets,
  parseJsonc,
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
