import { describe, expect, it } from 'vitest';
import {
  assertLocalSetupTarget,
  assertSharedDevSetupTarget,
} from './setup-target';

const local = (host: string) =>
  `mysql://catalog_user:local-secret@${host}:3306/cieslacalc`;
const remote =
  'mysql://dev_user:remote-secret@mysql-example.alwaysdata.net:3306/roofcalc_dev';

describe('database setup target safety', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'accepts %s for local setup',
    (host) => {
      expect(assertLocalSetupTarget(local(host))).toMatchObject({
        environment: 'local',
        description: expect.not.stringContaining('local-secret'),
      });
    },
  );

  it('refuses a remote database from the local setup command', () => {
    expect(() => assertLocalSetupTarget(remote)).toThrow(/loopback/i);
  });

  it('accepts remote shared DEV only with the exact environment and confirmation', () => {
    expect(
      assertSharedDevSetupTarget({
        databaseUrl: remote,
        environment: 'shared-dev',
        apply: true,
        confirmation: 'shared-dev',
      }),
    ).toMatchObject({
      environment: 'shared-dev',
      description: expect.stringContaining('mysql-example.alwaysdata.net'),
    });
  });

  it.each([
    { environment: undefined, apply: true, confirmation: 'shared-dev' },
    { environment: 'production', apply: true, confirmation: 'shared-dev' },
    { environment: 'shared-dev', apply: false, confirmation: 'shared-dev' },
    { environment: 'shared-dev', apply: true, confirmation: undefined },
    { environment: 'shared-dev', apply: true, confirmation: 'production' },
  ])('refuses an incomplete shared DEV acknowledgement %#', (input) => {
    expect(() =>
      assertSharedDevSetupTarget({
        databaseUrl: remote,
        ...input,
      }),
    ).toThrow();
  });

  it('refuses loopback from the shared DEV command', () => {
    expect(() =>
      assertSharedDevSetupTarget({
        databaseUrl: local('127.0.0.1'),
        environment: 'shared-dev',
        apply: true,
        confirmation: 'shared-dev',
      }),
    ).toThrow(/non-loopback/i);
  });

  it('never leaks credentials in target errors', () => {
    let message = '';
    try {
      assertLocalSetupTarget(remote);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain('dev_user');
    expect(message).not.toContain('remote-secret');
    expect(message).not.toContain(remote);
  });
});
