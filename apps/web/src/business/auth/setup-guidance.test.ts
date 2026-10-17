import { expect, it } from 'vitest';
import {
  isLocalHost,
  setupGuidance,
  type SetupProblem,
} from './setup-guidance';

const problems: SetupProblem[] = [
  'static-build',
  'server-unreachable',
  'database-unavailable',
  'auth-unconfigured',
  'schema-unknown',
];

it('points a local developer to one command and a host to its operator', () => {
  expect(setupGuidance('database-unavailable', true, true)).toContain(
    'pnpm check:local',
  );
  expect(setupGuidance('auth-unconfigured', true, true)).toContain(
    'pnpm configure:local',
  );
  // On Cloudflare there is no .env: never send a visitor there.
  for (const problem of problems.filter((p) => p !== 'static-build'))
    for (const pl of [true, false])
      expect(setupGuidance(problem, false, pl)).not.toMatch(/\.env|XAMPP/);
  expect(setupGuidance('auth-unconfigured', false, false)).toContain(
    'pnpm configure:cloudflare',
  );
});

it('has both languages for every problem', () => {
  for (const problem of problems)
    for (const local of [true, false])
      expect(setupGuidance(problem, local, true)).not.toBe(
        setupGuidance(problem, local, false),
      );
});

it('treats only loopback names as the local machine', () => {
  expect(isLocalHost('127.0.0.1')).toBe(true);
  expect(isLocalHost('localhost')).toBe(true);
  expect(isLocalHost('roofcalc.example.workers.dev')).toBe(false);
});
