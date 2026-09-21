import {
  describeDatabaseTarget,
  isLoopbackHost,
  parseDatabaseUrl,
} from './config';

export interface VerifiedSetupTarget {
  environment: 'local' | 'shared-dev';
  description: string;
}

function required(databaseUrl: string | undefined): string {
  if (!databaseUrl?.trim())
    throw new Error('DATABASE_URL is required for database setup.');
  return databaseUrl;
}

/** Guards the convenience command against ever mutating a remote database. */
export function assertLocalSetupTarget(
  databaseUrl: string | undefined,
): VerifiedSetupTarget {
  const options = parseDatabaseUrl(required(databaseUrl));
  if (!isLoopbackHost(options.host))
    throw new Error(
      'Local database setup requires a loopback DATABASE_URL (localhost, 127.0.0.1 or ::1).',
    );
  return {
    environment: 'local',
    description: describeDatabaseTarget(options),
  };
}

/**
 * Remote mutation is deliberately specific to shared DEV. There is no generic
 * "apply this DATABASE_URL" escape hatch: production needs a separately
 * designed and authenticated operation.
 */
export function assertSharedDevSetupTarget(input: {
  databaseUrl: string | undefined;
  environment: string | undefined;
  apply: boolean;
  confirmation: string | undefined;
}): VerifiedSetupTarget {
  const options = parseDatabaseUrl(required(input.databaseUrl));
  if (isLoopbackHost(options.host))
    throw new Error('Shared DEV setup requires a non-loopback DATABASE_URL.');
  if (input.environment !== 'shared-dev')
    throw new Error('ROOFCALC_DB_ENV must equal shared-dev.');
  if (!input.apply || input.confirmation !== 'shared-dev')
    throw new Error('Shared DEV setup requires --apply --confirm shared-dev.');
  return {
    environment: 'shared-dev',
    description: describeDatabaseTarget(options),
  };
}
